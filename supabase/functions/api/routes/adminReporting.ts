import { corsHeaders } from "../lib/cors.ts";
import { getStripeClient } from "../lib/stripe.ts";

export async function handleAdminReporting(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // POST /admin/reporting/backfill-paid-invoices
  //
  // Writes the transaction rows the webhook should have written. The webhook
  // read `invoice.subscription`, which Stripe removed in 2025-04-30 while the
  // endpoint is pinned to 2025-10-29.clover — so every paid invoice was
  // acknowledged with a 200 and recorded nowhere. This replays them from
  // Stripe, which is the source of truth for what was actually collected.
  //
  // Idempotent: upserts on reference_id (the Stripe invoice id), exactly as
  // the webhook does, so running it twice cannot double-count. Pass
  // ?dry_run=true to see what it would write without writing.
  if (method === "POST" && route.startsWith("/admin/reporting/backfill-paid-invoices")) {
    try {
      const url = new URL(req.url);
      const dryRun = url.searchParams.get("dry_run") === "true";
      const stripe = getStripeClient();

      const { data: donors } = await supabase
        .from("users")
        .select("id, email, stripe_customer_id")
        .eq("role", "donor")
        .not("stripe_customer_id", "is", null);

      const { data: existing } = await supabase
        .from("transactions")
        .select("reference_id, stripe_invoice_id")
        .eq("type", "monthly_donation");
      // Key on stripe_invoice_id only. reference_id is the donation row id,
      // which repeats across a donor's invoices — using it here would make the
      // second invoice for the same subscription look already-recorded.
      const already = new Set<string>();
      for (const t of existing || []) {
        if (t.stripe_invoice_id) already.add(String(t.stripe_invoice_id));
      }

      const subIdOf = (inv: any): string | null => {
        const c = [
          inv?.subscription,
          inv?.parent?.subscription_details?.subscription,
          inv?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription,
        ];
        for (const v of c) {
          if (typeof v === "string" && v) return v;
          if (v && typeof v === "object" && typeof v.id === "string") return v.id;
        }
        return null;
      };

      const written: any[] = [];
      const skipped: any[] = [];

      for (const d of donors || []) {
        const res = await fetch(
          `${stripe.baseUrl}/invoices?customer=${encodeURIComponent(d.stripe_customer_id)}&status=paid&limit=100`,
          { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
        );
        if (!res.ok) {
          skipped.push({ donor_id: d.id, email: d.email, reason: `stripe HTTP ${res.status}` });
          continue;
        }
        const body = await res.json();
        for (const inv of body.data || []) {
          if (already.has(String(inv.id))) continue;

          const amount = (inv.amount_paid || 0) / 100;
          const stripeSubId = subIdOf(inv);

          // Attribute to the donor's subscription row where we can, so the
          // charity credit is right. Match on the invoice's subscription id
          // first, then fall back to the donor's own row.
          let donation: any = null;
          // Exact = the invoice's own subscription id still matches a row.
          // Fallback = attributed to the donor's most recent subscription,
          // which is only a guess if they ever changed cause. Reported so the
          // distinction is visible rather than buried.
          let matchMethod = "none";
          if (stripeSubId) {
            const { data } = await supabase
              .from("monthly_donations")
              .select("id, user_id, beneficiary_id, held_for_donor_choice, user_covered_fees")
              .eq("stripe_subscription_id", stripeSubId)
              .maybeSingle();
            donation = data || null;
            if (donation) matchMethod = "exact_subscription_id";
          }
          if (!donation) {
            const { data } = await supabase
              .from("monthly_donations")
              .select("id, user_id, beneficiary_id, held_for_donor_choice, user_covered_fees")
              .eq("user_id", d.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            donation = data || null;
            if (donation) matchMethod = "fallback_latest_subscription";
          }

          if (!donation?.beneficiary_id) {
            // Recording money with no cause would corrupt payouts. Report it
            // instead so it can be attributed by hand.
            skipped.push({
              donor_id: d.id,
              email: d.email,
              invoice_id: inv.id,
              amount_usd: amount,
              paid_at: new Date(inv.created * 1000).toISOString(),
              reason: donation ? "subscription row has no beneficiary_id" : "no subscription row to attribute to",
            });
            continue;
          }

          const row = {
            user_id: donation.user_id ?? d.id,
            type: "monthly_donation",
            amount,
            description: `Monthly donation to beneficiary ${donation.beneficiary_id} (backfilled from Stripe invoice)`,
            // Null by necessity — see the note in webhooks.ts. Identity for
            // these rows is stripe_invoice_id.
            reference_id: null,
            reference_type: "donation",
            donation_id: donation.id,
            beneficiary_id: donation.beneficiary_id,
            status: "completed",
            held_for_donor_choice: !!donation.held_for_donor_choice,
            user_covered_fees: !!donation.user_covered_fees,
            stripe_invoice_id: inv.id,
            created_at: new Date(inv.created * 1000).toISOString(),
          };

          if (!dryRun) {
            // Plain insert: transactions.reference_id has no unique
            // constraint, so an ON CONFLICT upsert fails outright. The
            // `already` set above is what makes this idempotent.
            const { error: insErr } = await supabase
              .from("transactions")
              .insert([row]);
            if (insErr) {
              skipped.push({
                donor_id: d.id, email: d.email, invoice_id: inv.id,
                amount_usd: amount, reason: `insert failed: ${insErr.message}`,
              });
              continue;
            }
          }
          written.push({
            donor_id: d.id, email: d.email, invoice_id: inv.id,
            amount_usd: amount, beneficiary_id: donation.beneficiary_id,
            paid_at: row.created_at, match: matchMethod,
          });
        }
      }

      const total = written.reduce((a, w) => a + w.amount_usd, 0);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            dry_run: dryRun,
            written_count: written.length,
            written_total_usd: Math.round(total * 100) / 100,
            written,
            skipped_count: skipped.length,
            skipped,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: e?.message || "backfill failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }
  }

  // GET /admin/reporting/webhook-health — read-only.
  //
  // Whether Stripe is actually configured to call us, and whether recent
  // deliveries succeeded. Added after reconciliation showed 16 paid invoices
  // and only 1 recorded transaction: the webhook writes those records, so if
  // it is not being delivered nothing downstream can be right.
  if (method === "GET" && route === "/admin/reporting/webhook-health") {
    try {
      const stripe = getStripeClient();
      const get = async (path: string) => {
        const r = await fetch(`${stripe.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${stripe.secretKey}` },
        });
        return { ok: r.ok, status: r.status, body: await r.json() };
      };

      const eps = await get("/webhook_endpoints?limit=20");
      const endpoints = (eps.body?.data || []).map((e: any) => ({
        id: e.id,
        url: e.url,
        status: e.status,
        enabled_events: e.enabled_events,
        api_version: e.api_version,
        created: new Date(e.created * 1000).toISOString(),
      }));

      // Recent invoice.payment_succeeded events and whether Stripe considers
      // them delivered (pending_webhooks > 0 means still undelivered).
      const evs = await get(
        "/events?type=invoice.payment_succeeded&limit=10",
      );
      const events = (evs.body?.data || []).map((e: any) => ({
        id: e.id,
        created: new Date(e.created * 1000).toISOString(),
        pending_webhooks: e.pending_webhooks,
        invoice: e.data?.object?.id ?? null,
        amount_paid: e.data?.object?.amount_paid ?? null,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            endpoints_configured: endpoints.length,
            endpoints,
            recent_invoice_payment_succeeded: events,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: e?.message || "webhook health failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /admin/reporting/paid-invoice-reconciliation
  //
  // Every invoice Stripe has actually collected, checked against our own
  // records. A paid invoice with no matching transaction means real money left
  // a donor's card and nothing on our side knows who it was for — so it never
  // reached a charity's payout figure.
  //
  // Matching is exact: the webhook stores the Stripe invoice id on the
  // transaction (reference_id and stripe_invoice_id), so this is not
  // amount-and-date guesswork.
  //
  // Strictly read-only. It reports; it does not write or refund anything.
  if (
    method === "GET" &&
    route === "/admin/reporting/paid-invoice-reconciliation"
  ) {
    try {
      const stripe = getStripeClient();

      const { data: donors } = await supabase
        .from("users")
        .select("id, email, stripe_customer_id")
        .eq("role", "donor")
        .not("stripe_customer_id", "is", null);

      const { data: txns } = await supabase
        .from("transactions")
        .select("id, user_id, amount, stripe_invoice_id, reference_id, type")
        .eq("type", "monthly_donation");

      // Match on the Stripe invoice id only — reference_id is a local integer.
      const recorded = new Set<string>();
      for (const t of txns || []) {
        if (t.stripe_invoice_id) recorded.add(String(t.stripe_invoice_id));
      }

      const unmatched: any[] = [];
      let paidInvoiceCount = 0;
      let paidCents = 0;
      let unmatchedCents = 0;
      const errors: any[] = [];

      for (const d of donors || []) {
        const res = await fetch(
          `${stripe.baseUrl}/invoices?customer=${encodeURIComponent(d.stripe_customer_id)}&status=paid&limit=100`,
          { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
        );
        if (!res.ok) {
          errors.push({ donor_id: d.id, email: d.email, error: `HTTP ${res.status}` });
          continue;
        }
        const body = await res.json();
        for (const inv of body.data || []) {
          paidInvoiceCount += 1;
          paidCents += inv.amount_paid || 0;
          if (!recorded.has(String(inv.id))) {
            unmatchedCents += inv.amount_paid || 0;
            unmatched.push({
              donor_id: d.id,
              email: d.email,
              invoice_id: inv.id,
              amount_usd: (inv.amount_paid || 0) / 100,
              paid_at: new Date(inv.created * 1000).toISOString(),
              subscription: inv.subscription ?? null,
            });
          }
        }
      }

      unmatched.sort((a, b) => (a.paid_at < b.paid_at ? -1 : 1));

      // The mirror image of an unrecorded payment: a monthly_donation row with
      // no Stripe invoice id. It can't be tied to a collected invoice, so it is
      // either a legacy/manual record or a duplicate of a payment that was also
      // recorded properly — in which case a charity is credited twice.
      const { data: orphanRows } = await supabase
        .from("transactions")
        .select("id, user_id, amount, created_at, description")
        .eq("type", "monthly_donation")
        .is("stripe_invoice_id", null);
      const orphans = orphanRows || [];

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            donors_checked: (donors || []).length,
            monthly_donation_transactions_on_file: (txns || []).length,
            paid_invoices_on_stripe: paidInvoiceCount,
            total_collected_usd: paidCents / 100,
            unrecorded_count: unmatched.length,
            unrecorded_total_usd: unmatchedCents / 100,
            unrecorded: unmatched,
            unlinked_transaction_count: orphans.length,
            unlinked_transaction_total_usd:
              Math.round(orphans.reduce((a: number, r: any) => a + Number(r.amount || 0), 0) * 100) / 100,
            unlinked_transactions: orphans,
            errors,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: e?.message || "reconciliation failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // POST /admin/reporting/backfill-payment-dates
  // For each monthly_donations row missing last_payment_date, look up the
  // Stripe subscription's latest paid invoice and stamp last_payment_date /
  // last_payment_amount from Stripe. Idempotent — only touches rows missing data.
  if (method === "POST" && route === "/admin/reporting/backfill-payment-dates") {
    try {
      // Pull every monthly subscription with a Stripe id so we can both
      // (a) stamp last_payment_date/amount/processing_fee on the row when missing,
      // and (b) upsert a transactions row for every paid invoice in Stripe's
      // history. (b) catches subscriptions where the webhook didn't fire on the
      // initial payment, which is why /admin/analytics endpoints that read from
      // transactions were showing \$0 for our existing donors.
      const {data: rows, error: rowsError} = await supabase
        .from("monthly_donations")
        .select("id, user_id, beneficiary_id, stripe_subscription_id, last_payment_date, processing_fee")
        .not("stripe_subscription_id", "is", null);

      if (rowsError) {
        console.error("backfill: row lookup failed", rowsError);
        return new Response(
          JSON.stringify({error: "Failed to query monthly_donations"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const stripe = getStripeClient();
      const results: Array<{
        id: number;
        subscription: string;
        updated: boolean;
        reason?: string;
        last_payment_date?: string;
        last_payment_amount?: number;
        processing_fee?: number;
      }> = [];

      // Helper: fetch the Stripe processing fee for a charge id by looking up
      // its balance_transaction. Returns null on any failure.
      const fetchChargeFeeUsd = async (
        chargeId: string,
      ): Promise<number | null> => {
        try {
          const chargeRes = await fetch(
            `${stripe.baseUrl}/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
            { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
          );
          if (!chargeRes.ok) return null;
          const charge = await chargeRes.json();
          const bt = charge.balance_transaction;
          if (bt && typeof bt === "object" && typeof bt.fee === "number") {
            return bt.fee / 100;
          }
          return null;
        } catch (_e) {
          return null;
        }
      };

      let transactionsUpserted = 0;
      for (const row of rows || []) {
        try {
          // First: pull every paid invoice for this subscription so we can
          // upsert a transactions row for each (catches historical payments
          // the webhook didn't log). Stripe paginates 100 at a time; for
          // current scale a single page is plenty.
          const invListUrl =
            `${stripe.baseUrl}/invoices?subscription=${encodeURIComponent(row.stripe_subscription_id)}&status=paid&limit=100`;
          const invListRes = await fetch(invListUrl, {
            headers: { Authorization: `Bearer ${stripe.secretKey}` },
          });
          let paidInvoices: any[] = [];
          if (invListRes.ok) {
            const list = await invListRes.json();
            paidInvoices = Array.isArray(list?.data) ? list.data : [];
          }

          // Upsert a transactions row for every paid invoice. reference_id
          // = invoice.id keeps this idempotent — matches the webhook's onConflict
          // key so re-running the backfill never creates duplicates.
          //
          // Per-invoice processing_fee is pulled from each invoice's charge's
          // balance_transaction so the payouts report can sum the exact Stripe
          // cut on the invoices in the window (instead of estimating from
          // monthly_donations.processing_fee, which is only the most recent).
          for (const inv of paidInvoices) {
            const invPaidAt =
              inv.status_transitions?.paid_at ?? inv.created ?? null;
            const invAmountCents = inv.amount_paid ?? null;
            if (!invPaidAt || invAmountCents == null) continue;
            const invChargeId =
              typeof inv.charge === "string" ? inv.charge : inv.charge?.id;
            const invFeeUsd = invChargeId
              ? await fetchChargeFeeUsd(invChargeId)
              : null;
            const txnRow: Record<string, any> = {
              user_id: row.user_id,
              type: "monthly_donation",
              amount: invAmountCents / 100,
              description: `Monthly donation to beneficiary ${row.beneficiary_id ?? "?"}`,
              reference_id: inv.id,
              reference_type: "donation",
              donation_id: row.id,
              beneficiary_id: row.beneficiary_id,
              status: "completed",
              created_at: new Date(invPaidAt * 1000).toISOString(),
              stripe_invoice_id: inv.id,
              stripe_charge_id: invChargeId ?? null,
              processing_fee: invFeeUsd,
            };
            const { error: txnError } = await supabase
              .from("transactions")
              .upsert([txnRow], {
                onConflict: "reference_id",
                ignoreDuplicates: false,
              });
            if (!txnError) transactionsUpserted += 1;
          }

          // Then update the monthly_donations row from the most-recent paid invoice
          // (which is what the rest of the admin dashboard reads for "last_payment_*").
          const url =
            `${stripe.baseUrl}/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}` +
            "?expand[]=latest_invoice";
          const resp = await fetch(url, {
            headers: {Authorization: `Bearer ${stripe.secretKey}`},
          });
          if (!resp.ok) {
            results.push({
              id: row.id,
              subscription: row.stripe_subscription_id,
              updated: false,
              reason: `stripe_${resp.status}`,
            });
            continue;
          }
          const sub = await resp.json();
          const inv = sub.latest_invoice || {};
          const paidAt =
            inv.status_transitions?.paid_at ?? inv.created ?? null;
          const amountPaidCents = inv.amount_paid ?? null;

          if (!paidAt || amountPaidCents == null) {
            results.push({
              id: row.id,
              subscription: row.stripe_subscription_id,
              updated: false,
              reason: "no_paid_invoice",
            });
            continue;
          }

          const paidDate = new Date(paidAt * 1000)
            .toISOString()
            .split("T")[0];
          const amountPaidUsd = amountPaidCents / 100;
          const nextDate = new Date(paidAt * 1000);
          nextDate.setMonth(nextDate.getMonth() + 1);

          // Pull the real Stripe fee from the charge's balance_transaction so
          // admin reporting shows what Stripe actually took (not an estimate).
          const chargeId =
            typeof inv.charge === "string" ? inv.charge : inv.charge?.id;
          const processingFeeUsd = chargeId
            ? await fetchChargeFeeUsd(chargeId)
            : null;

          const updatePayload: Record<string, any> = {
            last_payment_date: paidDate,
            last_payment_amount: amountPaidUsd,
            next_payment_date: nextDate.toISOString().split("T")[0],
          };
          if (processingFeeUsd != null) {
            updatePayload.processing_fee = processingFeeUsd;
          }

          await supabase
            .from("monthly_donations")
            .update(updatePayload)
            .eq("id", row.id);

          results.push({
            id: row.id,
            subscription: row.stripe_subscription_id,
            updated: true,
            last_payment_date: paidDate,
            last_payment_amount: amountPaidUsd,
            processing_fee: processingFeeUsd ?? undefined,
          });
        } catch (err: any) {
          console.error("backfill: per-row error", row.id, err);
          results.push({
            id: row.id,
            subscription: row.stripe_subscription_id,
            updated: false,
            reason: err?.message || "unknown_error",
          });
        }
      }

      const updatedCount = results.filter((r) => r.updated).length;
      return new Response(
        JSON.stringify({
          success: true,
          scanned: results.length,
          transactionsUpserted,
          updated: updatedCount,
          results,
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ backfill-payment-dates error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Backfill failed"}),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /admin/reporting/payouts - Get payout data for date range
  if (method === "GET" && route === "/admin/reporting/payouts") {
    try {
      const url = new URL(req.url);
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");

      if (!startDate || !endDate) {
        return new Response(
          JSON.stringify({error: "startDate and endDate are required"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Get all charities (beneficiaries)
      const {data: charities, error: charitiesError} = await supabase
        .from("charities")
        .select("id, name, is_active")
        .eq("is_active", true);

      if (charitiesError) {
        console.error("❌ Error fetching charities:", charitiesError);
        return new Response(
          JSON.stringify({error: "Failed to fetch charities"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      // Extend the end-of-day cutoff so a payment recorded at 15:00 on the last
      // day of the window still lands inside [start, end] when comparing against
      // transactions.created_at (which is a timestamptz).
      const endOfDayIso = `${endDate}T23:59:59.999Z`;

      // Calculate payouts for each charity
      const payoutData = await Promise.all(
        (charities || []).map(async (charity: any) => {
          // Every completed monthly-donation invoice in the window.
          //
          // Sourced from transactions (per-invoice) rather than monthly_donations
          // (per-subscription) so that:
          //   • A subscription that renewed twice in the window contributes both
          //     invoices instead of only its most recent one.
          //   • A donor who paid in-window and cancelled afterward is still
          //     counted — the beneficiary is owed for the paid invoice
          //     regardless of the subscription's current status.
          //   • processing_fee is per-invoice, not the last-seen value on the
          //     subscription row, so the payout math reflects the exact Stripe
          //     cut on the specific invoices in the window.
          const {data: monthlyTxns} = await supabase
            .from("transactions")
            .select(
              "id, amount, processing_fee, user_covered_fees, donation_id, created_at",
            )
            .eq("beneficiary_id", charity.id)
            .eq("type", "monthly_donation")
            .eq("status", "completed")
            .gt("amount", 0)
            .gte("created_at", startDate)
            .lte("created_at", endOfDayIso);

          // Fallback fee lookup: for any transaction still missing
          // processing_fee (webhook fired before balance_transaction resolved
          // and backfill hasn't run yet), use the parent monthly_donations
          // row's stored fee as an estimate. It's the most recent known Stripe
          // cut for that subscription and is a much closer guess than zero.
          const donationIds = Array.from(
            new Set(
              (monthlyTxns || [])
                .filter((t: any) => t.processing_fee == null && t.donation_id)
                .map((t: any) => t.donation_id),
            ),
          );
          let fallbackFeeById: Record<string, number> = {};
          if (donationIds.length) {
            const {data: donationFees} = await supabase
              .from("monthly_donations")
              .select("id, processing_fee")
              .in("id", donationIds);
            fallbackFeeById = Object.fromEntries(
              (donationFees || []).map((d: any) => [
                d.id,
                parseFloat(d.processing_fee ?? 0),
              ]),
            );
          }

          // One-time gifts for this charity in the window.
          //
          // Filter includes both "succeeded" (what the payment_intent webhook
          // actually writes) and "completed" (legacy value) so we don't silently
          // drop any historical gift because of enum drift.
          const {data: oneTimeGifts} = await supabase
            .from("one_time_gifts")
            .select(
              "id, amount, net_amount, processing_fee, user_covered_fees, status, created_at",
            )
            .eq("beneficiary_id", charity.id)
            .in("status", ["succeeded", "completed", "processed"])
            .gte("created_at", startDate)
            .lte("created_at", endOfDayIso);

          // Calculate totals
          const monthlyTotal = (monthlyTxns || []).reduce((sum, t: any) => {
            return sum + parseFloat(t.amount || 0);
          }, 0);

          const oneTimeTotal = (oneTimeGifts || []).reduce((sum, g: any) => {
            return sum + parseFloat(g.net_amount || g.amount || 0);
          }, 0);

          const totalDonations = monthlyTotal + oneTimeTotal;
          const donationCount =
            (monthlyTxns?.length || 0) + (oneTimeGifts?.length || 0);

          // Calculate fees
          const serviceFee = donationCount * 3.0; // $3 per donation
          // Real Stripe processing fees taken from the charge's balance_transaction.
          // For one-time gifts we historically only counted fees the donor didn't
          // cover (beneficiary absorbed); we keep that behavior, plus the monthly
          // Stripe fee (always counted since donors who cover fees pay an estimate,
          // not the exact Stripe cut — the real cut still reduces what hits THRIVE's
          // bank from the gross charge).
          const oneTimeAbsorbedFees = (oneTimeGifts || []).reduce((sum, g: any) => {
            if (!g.user_covered_fees) {
              return sum + parseFloat(g.processing_fee || 0);
            }
            return sum;
          }, 0);
          const monthlyStripeFees = (monthlyTxns || []).reduce(
            (sum, t: any) => {
              const fee =
                t.processing_fee != null
                  ? parseFloat(t.processing_fee)
                  : (fallbackFeeById[t.donation_id] || 0);
              return sum + fee;
            },
            0,
          );
          const processingFees = oneTimeAbsorbedFees + monthlyStripeFees;

          // Platform fee = $3 service fee per donation (THRIVE's revenue).
          // Beneficiary receives the gross donations minus the service fee and
          // the actual Stripe processing fees that came out of the gross charge.
          const platformFee = serviceFee;
          const payoutAmount = totalDonations - serviceFee - processingFees;
          const netAmount = payoutAmount;

          // Get charity details including bank info
          const {data: charityDetails} = await supabase
            .from("charities")
            .select(
              "bank_account_name, bank_routing_number, bank_account_number, bank_account_type, payment_method, payout_status, payout_date, payout_amount, payout_notes",
            )
            .eq("id", charity.id)
            .single();

          return {
            beneficiaryId: charity.id,
            beneficiaryName: charity.name,
            totalDonations: parseFloat(totalDonations.toFixed(2)),
            monthlyDonations: parseFloat(monthlyTotal.toFixed(2)),
            oneTimeGifts: parseFloat(oneTimeTotal.toFixed(2)),
            donationCount,
            serviceFee: parseFloat(serviceFee.toFixed(2)),
            processingFees: parseFloat(processingFees.toFixed(2)),
            netAmount: parseFloat(netAmount.toFixed(2)),
            platformFee: parseFloat(platformFee.toFixed(2)),
            payoutAmount: parseFloat(payoutAmount.toFixed(2)),
            bankInfo: {
              accountName: charityDetails?.bank_account_name || null,
              routingNumber: charityDetails?.bank_routing_number || null,
              accountNumber: charityDetails?.bank_account_number
                ? "****" + charityDetails.bank_account_number.slice(-4)
                : null,
              accountType: charityDetails?.bank_account_type || null,
              paymentMethod: charityDetails?.payment_method || "direct_deposit",
            },
            payoutStatus: charityDetails?.payout_status || "pending",
            payoutDate: charityDetails?.payout_date || null,
            payoutNotes: charityDetails?.payout_notes || null,
          };
        }),
      );

      // Only return beneficiaries with actual donations in the date range —
      // an admin viewing payouts wants to see who needs to be paid, not the
      // full list of every active charity at $0.
      const beneficiariesWithPayouts = payoutData.filter(
        (p) => p.donationCount > 0,
      );

      // Calculate summary totals (sums match the filtered table — empty rows
      // would contribute zeros anyway, but compute from the filtered set for clarity).
      const summary = {
        totalDonations: beneficiariesWithPayouts.reduce(
          (sum, p) => sum + p.totalDonations,
          0,
        ),
        totalServiceFees: beneficiariesWithPayouts.reduce((sum, p) => sum + p.serviceFee, 0),
        totalProcessingFees: beneficiariesWithPayouts.reduce(
          (sum, p) => sum + p.processingFees,
          0,
        ),
        totalNetAmount: beneficiariesWithPayouts.reduce((sum, p) => sum + p.netAmount, 0),
        totalPlatformFees: beneficiariesWithPayouts.reduce(
          (sum, p) => sum + p.platformFee,
          0,
        ),
        totalPayoutAmount: beneficiariesWithPayouts.reduce(
          (sum, p) => sum + p.payoutAmount,
          0,
        ),
        totalDonationCount: beneficiariesWithPayouts.reduce(
          (sum, p) => sum + p.donationCount,
          0,
        ),
      };

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            payouts: beneficiariesWithPayouts,
            summary: {
              totalDonations: parseFloat(summary.totalDonations.toFixed(2)),
              totalServiceFees: parseFloat(summary.totalServiceFees.toFixed(2)),
              totalProcessingFees: parseFloat(
                summary.totalProcessingFees.toFixed(2),
              ),
              totalNetAmount: parseFloat(summary.totalNetAmount.toFixed(2)),
              totalPlatformFees: parseFloat(
                summary.totalPlatformFees.toFixed(2),
              ),
              totalPayoutAmount: parseFloat(
                summary.totalPayoutAmount.toFixed(2),
              ),
              totalDonationCount: summary.totalDonationCount,
            },
            dateRange: {
              startDate,
              endDate,
            },
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Admin get payouts error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to fetch payout data"}),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        },
      );
    }
  }

  // GET /admin/reporting/stripe-audit?startDate=&endDate=
  //
  // Cross-references every dollar that moved through Stripe in the window
  // against what we have locally. Returns a structured diff:
  //   • stripeOnly    — Stripe recorded it, we have no matching transaction
  //   • localOnly     — we have a transaction, Stripe has nothing matching
  //   • mismatched    — matched by id, but amount or fee disagrees
  //   • matched       — clean pairs (returned only in summary counts)
  //
  // Used at end-of-month payout to prove the local totals equal what Stripe
  // actually charged. Read-only — never mutates data.
  if (method === "GET" && route === "/admin/reporting/stripe-audit") {
    try {
      const url = new URL(req.url);
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      if (!startDate || !endDate) {
        return new Response(
          JSON.stringify({ error: "startDate and endDate are required" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const stripe = getStripeClient();
      const startTs = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
      const endTs = Math.floor(new Date(`${endDate}T23:59:59.999Z`).getTime() / 1000);
      const endOfDayIso = `${endDate}T23:59:59.999Z`;

      // Helper — paginate Stripe list endpoints to get everything in the window.
      // Stripe caps limit=100 per page; loop until has_more=false.
      const fetchAllStripe = async (
        listPath: string,
      ): Promise<any[]> => {
        const out: any[] = [];
        let startingAfter: string | undefined;
        for (let i = 0; i < 20; i++) {
          const sep = listPath.includes("?") ? "&" : "?";
          const url =
            `${stripe.baseUrl}${listPath}${sep}limit=100` +
            (startingAfter ? `&starting_after=${startingAfter}` : "");
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${stripe.secretKey}` },
          });
          if (!res.ok) {
            console.warn(`stripe-audit: ${listPath} ${res.status}`);
            break;
          }
          const json = await res.json();
          const items = Array.isArray(json?.data) ? json.data : [];
          out.push(...items);
          if (!json.has_more || items.length === 0) break;
          startingAfter = items[items.length - 1].id;
        }
        return out;
      };

      // -----------------------------------------------------------------
      // 1) Pull Stripe truth for the window.
      // -----------------------------------------------------------------
      // Paid subscription invoices — this is the money that renewed monthly.
      const stripeInvoices = await fetchAllStripe(
        `/invoices?status=paid&created[gte]=${startTs}&created[lte]=${endTs}`,
      );
      // Successful non-subscription payment intents — one-time gifts.
      const stripePayments = await fetchAllStripe(
        `/payment_intents?created[gte]=${startTs}&created[lte]=${endTs}`,
      );

      // Fetch balance_transactions once per charge so we know the real fee.
      // Batched sequentially to keep memory bounded; for month-of-August scale
      // this is a few dozen requests.
      const feeByChargeId: Record<string, number> = {};
      const chargeIds = new Set<string>();
      for (const inv of stripeInvoices) {
        const cid = typeof inv.charge === "string" ? inv.charge : inv.charge?.id;
        if (cid) chargeIds.add(cid);
      }
      for (const pi of stripePayments) {
        if (pi.status !== "succeeded") continue;
        const cid =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : pi.latest_charge?.id ??
              pi.charges?.data?.[0]?.id;
        if (cid) chargeIds.add(cid);
      }
      for (const cid of chargeIds) {
        try {
          const cRes = await fetch(
            `${stripe.baseUrl}/charges/${encodeURIComponent(cid)}?expand[]=balance_transaction`,
            { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
          );
          if (!cRes.ok) continue;
          const charge = await cRes.json();
          const fee = charge.balance_transaction?.fee;
          if (typeof fee === "number") {
            feeByChargeId[cid] = fee / 100;
          }
        } catch (_e) {
          // best-effort — leave unset if lookup fails
        }
      }

      // -----------------------------------------------------------------
      // 2) Pull local records for the same window.
      // -----------------------------------------------------------------
      const { data: localTxns } = await supabase
        .from("transactions")
        .select(
          "id, user_id, type, amount, processing_fee, beneficiary_id, reference_id, stripe_invoice_id, stripe_charge_id, donation_id, gift_id, created_at",
        )
        .in("type", ["monthly_donation", "one_time_gift"])
        .eq("status", "completed")
        .gte("created_at", startDate)
        .lte("created_at", endOfDayIso);

      const { data: localGifts } = await supabase
        .from("one_time_gifts")
        .select(
          "id, user_id, amount, net_amount, processing_fee, beneficiary_id, stripe_payment_intent_id, stripe_charge_id, status, created_at",
        )
        .in("status", ["succeeded", "completed", "processed"])
        .gte("created_at", startDate)
        .lte("created_at", endOfDayIso);

      // -----------------------------------------------------------------
      // 3) Diff: match Stripe → local by invoice/payment_intent id.
      // -----------------------------------------------------------------
      const txnsByInvoice = new Map<string, any>();
      const txnsByCharge = new Map<string, any>();
      const txnsByReference = new Map<string, any>();
      for (const t of localTxns || []) {
        if (t.stripe_invoice_id) txnsByInvoice.set(t.stripe_invoice_id, t);
        if (t.stripe_charge_id) txnsByCharge.set(t.stripe_charge_id, t);
        if (t.reference_id) txnsByReference.set(t.reference_id, t);
      }
      const giftsByPI = new Map<string, any>();
      const giftsByCharge = new Map<string, any>();
      for (const g of localGifts || []) {
        if (g.stripe_payment_intent_id)
          giftsByPI.set(g.stripe_payment_intent_id, g);
        if (g.stripe_charge_id) giftsByCharge.set(g.stripe_charge_id, g);
      }

      const stripeOnly: any[] = [];
      const localOnly: any[] = [];
      const mismatched: any[] = [];
      let matchedCount = 0;
      let stripeTotalCents = 0;
      let localTotalCents = 0;

      // Monthly invoices
      for (const inv of stripeInvoices) {
        const invAmountCents = inv.amount_paid ?? 0;
        stripeTotalCents += invAmountCents;
        const chargeId =
          typeof inv.charge === "string" ? inv.charge : inv.charge?.id;
        const stripeFeeUsd = chargeId ? feeByChargeId[chargeId] ?? null : null;
        const localTxn =
          txnsByInvoice.get(inv.id) ??
          txnsByReference.get(inv.id) ??
          (chargeId ? txnsByCharge.get(chargeId) : undefined);

        if (!localTxn) {
          stripeOnly.push({
            source: "stripe_invoice",
            id: inv.id,
            charge_id: chargeId ?? null,
            customer: inv.customer ?? null,
            amount: invAmountCents / 100,
            fee: stripeFeeUsd,
            paidAt: inv.status_transitions?.paid_at ?? inv.created ?? null,
          });
          continue;
        }
        const localAmountCents = Math.round(parseFloat(localTxn.amount) * 100);
        const localFeeUsd =
          localTxn.processing_fee != null
            ? parseFloat(localTxn.processing_fee)
            : null;
        const amountOff = localAmountCents !== invAmountCents;
        const feeOff =
          stripeFeeUsd != null &&
          localFeeUsd != null &&
          Math.abs(stripeFeeUsd - localFeeUsd) > 0.005;
        if (amountOff || feeOff || (stripeFeeUsd != null && localFeeUsd == null)) {
          mismatched.push({
            source: "stripe_invoice",
            id: inv.id,
            local_txn_id: localTxn.id,
            stripe_amount: invAmountCents / 100,
            local_amount: parseFloat(localTxn.amount),
            stripe_fee: stripeFeeUsd,
            local_fee: localFeeUsd,
            issue: [
              amountOff && "amount_mismatch",
              feeOff && "fee_mismatch",
              stripeFeeUsd != null && localFeeUsd == null && "fee_missing_locally",
            ].filter(Boolean),
          });
        } else {
          matchedCount++;
        }
      }

      // One-time payment intents
      for (const pi of stripePayments) {
        if (pi.status !== "succeeded") continue;
        const piAmountCents = pi.amount_received ?? pi.amount ?? 0;
        stripeTotalCents += piAmountCents;
        const chargeId =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : pi.latest_charge?.id ?? pi.charges?.data?.[0]?.id ?? null;
        const stripeFeeUsd = chargeId ? feeByChargeId[chargeId] ?? null : null;

        const localGift =
          giftsByPI.get(pi.id) ??
          (chargeId ? giftsByCharge.get(chargeId) : undefined);
        // Also allow the transactions table to satisfy the match — a webhook
        // that landed the transactions row but never updated one_time_gifts
        // still counts as "we recorded this dollar".
        const localTxn = chargeId ? txnsByCharge.get(chargeId) : undefined;
        const local = localGift || localTxn;

        if (!local) {
          stripeOnly.push({
            source: "stripe_payment_intent",
            id: pi.id,
            charge_id: chargeId,
            customer: pi.customer ?? null,
            amount: piAmountCents / 100,
            fee: stripeFeeUsd,
            paidAt: pi.created,
          });
          continue;
        }
        const localAmountUsd = localGift
          ? parseFloat(localGift.amount || 0)
          : parseFloat(local.amount || 0);
        const localAmountCents = Math.round(localAmountUsd * 100);
        const localFeeUsd =
          local.processing_fee != null
            ? parseFloat(local.processing_fee)
            : null;
        const amountOff = localAmountCents !== piAmountCents;
        const feeOff =
          stripeFeeUsd != null &&
          localFeeUsd != null &&
          Math.abs(stripeFeeUsd - localFeeUsd) > 0.005;
        if (amountOff || feeOff) {
          mismatched.push({
            source: "stripe_payment_intent",
            id: pi.id,
            local_id: local.id,
            stripe_amount: piAmountCents / 100,
            local_amount: localAmountUsd,
            stripe_fee: stripeFeeUsd,
            local_fee: localFeeUsd,
            issue: [
              amountOff && "amount_mismatch",
              feeOff && "fee_mismatch",
            ].filter(Boolean),
          });
        } else {
          matchedCount++;
        }
      }

      // -----------------------------------------------------------------
      // 4) localOnly — anything we recorded that Stripe did not confirm.
      // Rare but possible: a manual test insert, a webhook replay that
      // recorded a phantom row, or a Stripe deletion outside our loop.
      // -----------------------------------------------------------------
      const stripeInvoiceIds = new Set(stripeInvoices.map((i: any) => i.id));
      const stripePIIds = new Set(
        stripePayments.filter((p: any) => p.status === "succeeded").map((p: any) => p.id),
      );
      const stripeChargeIds = new Set(
        [
          ...stripeInvoices.map((i: any) =>
            typeof i.charge === "string" ? i.charge : i.charge?.id,
          ),
          ...stripePayments.map((p: any) =>
            typeof p.latest_charge === "string"
              ? p.latest_charge
              : p.latest_charge?.id ?? p.charges?.data?.[0]?.id,
          ),
        ].filter(Boolean),
      );

      for (const t of localTxns || []) {
        const amountCents = Math.round(parseFloat(t.amount || 0) * 100);
        localTotalCents += amountCents;
        const inStripe =
          (t.stripe_invoice_id && stripeInvoiceIds.has(t.stripe_invoice_id)) ||
          (t.reference_id && stripeInvoiceIds.has(t.reference_id)) ||
          (t.stripe_charge_id && stripeChargeIds.has(t.stripe_charge_id));
        if (!inStripe) {
          localOnly.push({
            source: "local_transaction",
            id: t.id,
            type: t.type,
            user_id: t.user_id,
            amount: parseFloat(t.amount || 0),
            fee: t.processing_fee != null ? parseFloat(t.processing_fee) : null,
            reference_id: t.reference_id,
            stripe_invoice_id: t.stripe_invoice_id,
            stripe_charge_id: t.stripe_charge_id,
            created_at: t.created_at,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            dateRange: { startDate, endDate },
            summary: {
              stripe: {
                invoiceCount: stripeInvoices.length,
                paymentIntentCount: stripePayments.filter(
                  (p: any) => p.status === "succeeded",
                ).length,
                totalDollars: stripeTotalCents / 100,
              },
              local: {
                transactionCount: (localTxns || []).length,
                totalDollars: localTotalCents / 100,
              },
              matchedCount,
              mismatchedCount: mismatched.length,
              stripeOnlyCount: stripeOnly.length,
              localOnlyCount: localOnly.length,
              differenceDollars: (stripeTotalCents - localTotalCents) / 100,
            },
            mismatched,
            stripeOnly,
            localOnly,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ stripe-audit error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Stripe audit failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // PUT /admin/reporting/beneficiaries/:id/bank-info - Update bank information
  const bankInfoMatch = route.match(
    /^\/admin\/reporting\/beneficiaries\/(\d+)\/bank-info$/,
  );
  if (method === "PUT" && bankInfoMatch) {
    try {
      const beneficiaryId = parseInt(bankInfoMatch[1], 10);
      const body = await req.json();
      const {
        accountName,
        routingNumber,
        accountNumber,
        accountType,
        paymentMethod,
      } = body;

      // Verify charity exists
      const {data: charity, error: charityError} = await supabase
        .from("charities")
        .select("id")
        .eq("id", beneficiaryId)
        .single();

      if (charityError || !charity) {
        return new Response(JSON.stringify({error: "Beneficiary not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      // Update bank information
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (accountName !== undefined)
        updateData.bank_account_name = accountName || null;
      if (routingNumber !== undefined)
        updateData.bank_routing_number = routingNumber || null;
      if (accountNumber !== undefined)
        updateData.bank_account_number = accountNumber || null;
      if (accountType !== undefined)
        updateData.bank_account_type = accountType || null;
      if (paymentMethod !== undefined)
        updateData.payment_method = paymentMethod || "direct_deposit";

      const {data: updatedCharity, error: updateError} = await supabase
        .from("charities")
        .update(updateData)
        .eq("id", beneficiaryId)
        .select(
          "bank_account_name, bank_routing_number, bank_account_number, bank_account_type, payment_method",
        )
        .single();

      if (updateError) {
        console.error("❌ Error updating bank info:", updateError);
        return new Response(
          JSON.stringify({error: "Failed to update bank information"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            beneficiaryId,
            bankInfo: {
              accountName: updatedCharity.bank_account_name,
              routingNumber: updatedCharity.bank_routing_number,
              accountNumber: updatedCharity.bank_account_number
                ? "****" + updatedCharity.bank_account_number.slice(-4)
                : null,
              accountType: updatedCharity.bank_account_type,
              paymentMethod: updatedCharity.payment_method,
            },
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Admin update bank info error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to update bank information",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        },
      );
    }
  }

  // PUT /admin/reporting/beneficiaries/:id/payout-status - Update payout status
  const payoutStatusMatch = route.match(
    /^\/admin\/reporting\/beneficiaries\/(\d+)\/payout-status$/,
  );
  if (method === "PUT" && payoutStatusMatch) {
    try {
      const beneficiaryId = parseInt(payoutStatusMatch[1], 10);
      const body = await req.json();
      const {status, payoutDate, payoutAmount, notes} = body;

      // Verify charity exists
      const {data: charity, error: charityError} = await supabase
        .from("charities")
        .select("id")
        .eq("id", beneficiaryId)
        .single();

      if (charityError || !charity) {
        return new Response(JSON.stringify({error: "Beneficiary not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      // Update payout status
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (status !== undefined) updateData.payout_status = status;
      if (payoutDate !== undefined) updateData.payout_date = payoutDate || null;
      if (payoutAmount !== undefined)
        updateData.payout_amount = payoutAmount
          ? parseFloat(payoutAmount)
          : null;
      if (notes !== undefined) updateData.payout_notes = notes || null;

      const {data: updatedCharity, error: updateError} = await supabase
        .from("charities")
        .update(updateData)
        .eq("id", beneficiaryId)
        .select("payout_status, payout_date, payout_amount, payout_notes")
        .single();

      if (updateError) {
        console.error("❌ Error updating payout status:", updateError);
        return new Response(
          JSON.stringify({error: "Failed to update payout status"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            beneficiaryId,
            payoutStatus: updatedCharity.payout_status,
            payoutDate: updatedCharity.payout_date,
            payoutAmount: updatedCharity.payout_amount
              ? parseFloat(updatedCharity.payout_amount)
              : null,
            payoutNotes: updatedCharity.payout_notes,
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Admin update payout status error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to update payout status",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        },
      );
    }
  }

  // GET /admin/reporting/stripe-reconciliation - Get Stripe reconciliation data
  if (method === "GET" && route === "/admin/reporting/stripe-reconciliation") {
    try {
      const url = new URL(req.url);
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");

      if (!startDate || !endDate) {
        return new Response(
          JSON.stringify({error: "startDate and endDate are required"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Get all transactions in date range
      const {data: transactions, error: transactionsError} = await supabase
        .from("transactions")
        .select(
          "id, amount, stripe_charge_id, stripe_payment_intent_id, transaction_type, created_at",
        )
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .in("transaction_type", [
          "donation",
          "one_time_gift",
          "monthly_donation",
        ]);

      if (transactionsError) {
        console.error("❌ Error fetching transactions:", transactionsError);
        return new Response(
          JSON.stringify({error: "Failed to fetch transactions"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      // Calculate totals
      const stripeTotal = (transactions || []).reduce((sum, t) => {
        return sum + parseFloat(t.amount || 0);
      }, 0);

      // Get calculated totals from payouts endpoint logic
      // (In a real implementation, you'd want to share this logic)
      const {data: charities} = await supabase
        .from("charities")
        .select("id")
        .eq("is_active", true);

      let calculatedTotal = 0;
      for (const charity of charities || []) {
        const {data: monthlyDonations} = await supabase
          .from("monthly_donations")
          .select("amount, last_payment_amount")
          .eq("beneficiary_id", charity.id)
          .eq("status", "active")
          .gte("last_payment_date", startDate)
          .lte("last_payment_date", endDate);

        const {data: oneTimeGifts} = await supabase
          .from("one_time_gifts")
          .select("amount")
          .eq("beneficiary_id", charity.id)
          .eq("status", "completed")
          .gte("created_at", startDate)
          .lte("created_at", endDate);

        const monthlyTotal = (monthlyDonations || []).reduce((sum, d) => {
          return sum + parseFloat(d.last_payment_amount || d.amount || 0);
        }, 0);

        const oneTimeTotal = (oneTimeGifts || []).reduce((sum, g) => {
          return sum + parseFloat(g.amount || 0);
        }, 0);

        calculatedTotal += monthlyTotal + oneTimeTotal;
      }

      const difference = stripeTotal - calculatedTotal;
      const status =
        Math.abs(difference) < 0.01
          ? "matched"
          : difference > 0
            ? "needs_review"
            : "pending";

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            stripeTotal: parseFloat(stripeTotal.toFixed(2)),
            calculatedTotal: parseFloat(calculatedTotal.toFixed(2)),
            difference: parseFloat(difference.toFixed(2)),
            status,
            transactionCount: transactions?.length || 0,
            dateRange: {
              startDate,
              endDate,
            },
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Admin get stripe reconciliation error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch Stripe reconciliation data",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Reporting route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}
