import { corsHeaders } from "../lib/cors.ts";
import { getStripeClient } from "../lib/stripe.ts";
import { sendPaymentFailureNotice } from "../lib/dunning.ts";
import { sendPushWithTicket } from "../lib/push.ts";
import { buildAccountAlerts } from "../lib/accountAlerts.ts";
import { geocodeAddress } from "../lib/geocoding.ts";

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

  // POST /admin/reporting/backfill-transaction-fees
  //
  // Fills processing_fee and stripe_charge_id on monthly_donation transactions
  // that lack them, reading the real fee from Stripe's balance transaction.
  //
  // Needed for two things: the payouts report sums processing_fee PER
  // transaction (see 20260804000000), so a null there understates what Stripe
  // actually took; and the dashboard's "Total Donation" figure is the donation
  // net of the service fee and the card fee, which cannot be computed without
  // it. The rows written by backfill-paid-invoices did not set it.
  //
  // Idempotent: only touches rows where processing_fee IS NULL.
  if (method === "POST" && route.startsWith("/admin/reporting/backfill-transaction-fees")) {
    try {
      const dryRun = new URL(req.url).searchParams.get("dry_run") === "true";
      const stripe = getStripeClient();

      const { data: rows } = await supabase
        .from("transactions")
        .select("id, amount, stripe_invoice_id, stripe_charge_id, processing_fee")
        .eq("type", "monthly_donation")
        .is("processing_fee", null);

      const updated: any[] = [];
      const failed: any[] = [];

      for (const t of rows || []) {
        if (!t.stripe_invoice_id) {
          failed.push({ id: t.id, reason: "no stripe_invoice_id" });
          continue;
        }
        // Invoice -> charge -> balance transaction fee. Both shapes again:
        // `charge` was removed from invoices in Stripe 2025-04-30.
        const invRes = await fetch(
          `${stripe.baseUrl}/invoices/${encodeURIComponent(t.stripe_invoice_id)}?expand[]=payments`,
          { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
        );
        if (!invRes.ok) {
          failed.push({ id: t.id, reason: `invoice HTTP ${invRes.status}` });
          continue;
        }
        const inv = await invRes.json();
        let chargeId: string | null =
          (typeof inv.charge === "string" ? inv.charge : inv.charge?.id) ?? null;
        if (!chargeId) {
          const pay = inv?.payments?.data?.[0]?.payment;
          chargeId =
            (typeof pay?.charge === "string" ? pay.charge : pay?.charge?.id) ?? null;
          if (!chargeId && typeof pay?.payment_intent === "string") {
            const piRes = await fetch(
              `${stripe.baseUrl}/payment_intents/${encodeURIComponent(pay.payment_intent)}?expand[]=latest_charge`,
              { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
            );
            if (piRes.ok) {
              const pi = await piRes.json();
              chargeId =
                (typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id) ?? null;
            }
          }
        }
        if (!chargeId) {
          failed.push({ id: t.id, reason: "no charge on invoice" });
          continue;
        }

        const chRes = await fetch(
          `${stripe.baseUrl}/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
          { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
        );
        if (!chRes.ok) {
          failed.push({ id: t.id, reason: `charge HTTP ${chRes.status}` });
          continue;
        }
        const ch = await chRes.json();
        const feeCents = ch?.balance_transaction?.fee;
        if (typeof feeCents !== "number") {
          failed.push({ id: t.id, reason: "no balance_transaction fee" });
          continue;
        }
        const fee = Math.round(feeCents) / 100;

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from("transactions")
            .update({ processing_fee: fee, stripe_charge_id: chargeId })
            .eq("id", t.id);
          if (upErr) {
            failed.push({ id: t.id, reason: `update failed: ${upErr.message}` });
            continue;
          }
        }
        updated.push({ id: t.id, amount: t.amount, processing_fee: fee, charge: chargeId });
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            dry_run: dryRun,
            candidates: (rows || []).length,
            updated_count: updated.length,
            total_fees_usd:
              Math.round(updated.reduce((a, u) => a + u.processing_fee, 0) * 100) / 100,
            updated,
            failed_count: failed.length,
            failed,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "fee backfill failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
  }

  // POST /admin/reporting/attribute-invoices?email=..&beneficiary_id=..[&dry_run=true]
  //
  // Records a person's paid Stripe invoices as monthly_donation transactions
  // credited to one charity. Built for a real case: gonzalezramoniii@gmail.com
  // had 8 paid invoices ($149.04) on two Stripe subscriptions our database knew
  // nothing about — no monthly_donations row, no transactions — because the
  // subscriptions were only ever created in Stripe and the user's role is
  // vendorAdmin, so the donor-scoped reconciliation never looked at them.
  //
  // Resolves the user by email across ALL roles, which is the gap that hid this.
  // Idempotent on stripe_invoice_id. Pass dry_run=true to preview.
  if (method === "POST" && route.startsWith("/admin/reporting/attribute-invoices")) {
    try {
      const url = new URL(req.url);
      const email = (url.searchParams.get("email") || "").trim().toLowerCase();
      const beneficiaryId = parseInt(url.searchParams.get("beneficiary_id") || "", 10);
      const dryRun = url.searchParams.get("dry_run") === "true";
      if (!email || !Number.isFinite(beneficiaryId)) {
        return new Response(
          JSON.stringify({ error: "email and beneficiary_id are required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      // Any role — not just donor.
      const { data: users } = await supabase
        .from("users")
        .select("id, email, role")
        .ilike("email", email);
      const user = (users || [])[0];
      if (!user) {
        return new Response(
          JSON.stringify({ error: `No user found with email ${email}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }

      const { data: charity } = await supabase
        .from("charities")
        .select("id, name")
        .eq("id", beneficiaryId)
        .maybeSingle();
      if (!charity) {
        return new Response(
          JSON.stringify({ error: `No charity with id ${beneficiaryId}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }

      const stripe = getStripeClient();
      const sFetch = async (path: string) => {
        const r = await fetch(`${stripe.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${stripe.secretKey}` },
        });
        return r.ok ? await r.json() : null;
      };

      // Every Stripe customer under this email — he has two.
      const custSearch = await sFetch(
        `/customers/search?query=${encodeURIComponent(`email:'${email}'`)}&limit=20`,
      );
      const customers = (custSearch?.data || []).map((c: any) => c.id);
      if (!customers.length) {
        return new Response(
          JSON.stringify({ error: `No Stripe customer for ${email}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }

      const { data: existingTxns } = await supabase
        .from("transactions")
        .select("stripe_invoice_id")
        .eq("type", "monthly_donation")
        .not("stripe_invoice_id", "is", null);
      const already = new Set((existingTxns || []).map((t: any) => String(t.stripe_invoice_id)));

      const written: any[] = [];
      const skipped: any[] = [];

      for (const cid of customers) {
        const invs = await sFetch(
          `/invoices?customer=${encodeURIComponent(cid)}&status=paid&limit=100`,
        );
        for (const inv of invs?.data || []) {
          if (already.has(String(inv.id))) {
            skipped.push({ invoice_id: inv.id, reason: "already recorded" });
            continue;
          }
          const amount = (inv.amount_paid || 0) / 100;

          // Real Stripe fee off the charge's balance transaction, so payouts
          // reflect what Stripe actually took.
          let chargeId: string | null =
            (typeof inv.charge === "string" ? inv.charge : inv.charge?.id) ?? null;
          if (!chargeId) {
            const pay = inv?.payments?.data?.[0]?.payment;
            chargeId = (typeof pay?.charge === "string" ? pay.charge : pay?.charge?.id) ?? null;
          }
          let fee: number | null = null;
          if (chargeId) {
            const ch = await sFetch(
              `/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
            );
            if (typeof ch?.balance_transaction?.fee === "number") {
              fee = Math.round(ch.balance_transaction.fee) / 100;
            }
          }

          const row: Record<string, any> = {
            user_id: user.id,
            type: "monthly_donation",
            amount,
            description: `Monthly donation to ${charity.name} (attributed from Stripe invoice)`,
            // Null by necessity — see the note in webhooks.ts. Identity is
            // stripe_invoice_id.
            reference_id: null,
            reference_type: "donation",
            beneficiary_id: charity.id,
            status: "completed",
            stripe_invoice_id: inv.id,
            stripe_charge_id: chargeId,
            processing_fee: fee,
            created_at: new Date(inv.created * 1000).toISOString(),
          };

          if (!dryRun) {
            const { error: insErr } = await supabase.from("transactions").insert([row]);
            if (insErr) {
              skipped.push({ invoice_id: inv.id, amount_usd: amount, reason: insErr.message });
              continue;
            }
          }
          written.push({
            invoice_id: inv.id,
            amount_usd: amount,
            processing_fee: fee,
            paid_at: row.created_at,
            stripe_customer: cid,
          });
        }
      }

      written.sort((a, b) => (a.paid_at < b.paid_at ? -1 : 1));
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            dry_run: dryRun,
            email,
            user_id: user.id,
            user_role: user.role,
            beneficiary: { id: charity.id, name: charity.name },
            stripe_customers: customers,
            written_count: written.length,
            written_total_usd:
              Math.round(written.reduce((a, w) => a + w.amount_usd, 0) * 100) / 100,
            written,
            skipped_count: skipped.length,
            skipped,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "attribution failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // POST /admin/reporting/cancel-subscription?id=sub_..&mode=immediate|period_end
  //
  // Cancels ONE Stripe subscription, named explicitly. Exists because the
  // resume/amount-change bugs fixed on 2026-09-01 created duplicate
  // subscriptions for real donors — gonzalezramoniii@gmail.com was billed twice
  // a month from 2026-05-28 — so support needs a way to stop the extra one.
  //
  // Deliberately narrow: one id per call, no bulk, no cancel-by-customer, and
  // it refuses anything that isn't a subscription id. It does NOT refund; past
  // charges are a separate decision. `immediate` stops future billing now and
  // leaves the already-paid current period alone; `period_end` lets it bill
  // once more, which is usually not what "remove the duplicate" means.
  if (method === "POST" && route.startsWith("/admin/reporting/cancel-subscription")) {
    try {
      const url = new URL(req.url);
      const id = (url.searchParams.get("id") || "").trim();
      const mode = (url.searchParams.get("mode") || "immediate").trim();
      if (!/^sub_[A-Za-z0-9]+$/.test(id)) {
        return new Response(
          JSON.stringify({ error: "id must be a Stripe subscription id (sub_...)" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }
      if (!["immediate", "period_end"].includes(mode)) {
        return new Response(
          JSON.stringify({ error: "mode must be immediate or period_end" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const stripe = getStripeClient();
      const headers = { Authorization: `Bearer ${stripe.secretKey}` };

      // Read first, so the response records what was cancelled.
      const beforeRes = await fetch(
        `${stripe.baseUrl}/subscriptions/${encodeURIComponent(id)}`,
        { headers },
      );
      if (!beforeRes.ok) {
        return new Response(
          JSON.stringify({ error: `Subscription not found on Stripe (HTTP ${beforeRes.status})` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }
      const before = await beforeRes.json();

      let after: any;
      if (mode === "immediate") {
        const r = await fetch(`${stripe.baseUrl}/subscriptions/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers,
        });
        after = await r.json();
        if (!r.ok) {
          return new Response(
            JSON.stringify({ error: after?.error?.message || `Stripe HTTP ${r.status}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 },
          );
        }
      } else {
        const form = new URLSearchParams();
        form.append("cancel_at_period_end", "true");
        const r = await fetch(`${stripe.baseUrl}/subscriptions/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        after = await r.json();
        if (!r.ok) {
          return new Response(
            JSON.stringify({ error: after?.error?.message || `Stripe HTTP ${r.status}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 },
          );
        }
      }

      // Keep any local row honest about it. Matched on the Stripe id, so this
      // is a no-op when the subscription was never mirrored locally — which is
      // the case for the duplicates that prompted this.
      const localStatus = mode === "immediate" ? "cancelled" : "active";
      const { data: localRows } = await supabase
        .from("monthly_donations")
        .update({ status: localStatus, updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", id)
        .select("id");

      console.log(
        `🛑 Cancelled Stripe subscription ${id} (${mode}); local rows updated: ${(localRows || []).length}`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id,
            mode,
            customer: before.customer ?? null,
            amount_usd: (before.items?.data?.[0]?.price?.unit_amount ?? 0) / 100,
            status_before: before.status,
            status_after: after.status,
            cancel_at_period_end: after.cancel_at_period_end ?? null,
            canceled_at: after.canceled_at
              ? new Date(after.canceled_at * 1000).toISOString()
              : null,
            current_period_end: after.current_period_end
              ? new Date(after.current_period_end * 1000).toISOString()
              : null,
            local_rows_updated: (localRows || []).length,
            note: "No refund was issued. Past charges are a separate decision.",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "cancel failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // GET /admin/reporting/billing-audit — read-only sweep of ALL Stripe billing.
  //
  // Answers "is anyone else being double-billed, and is anything else odd?"
  // across every customer, rather than the two accounts that happened to be
  // investigated by hand. Enumerates subscriptions and charges from Stripe —
  // the authority on what is actually billed — and flags:
  //   • customers with more than one live subscription (double billing)
  //   • live subscriptions our monthly_donations table has never heard of
  //   • refunded, disputed or failed charges
  //   • subscriptions stuck incomplete/past_due/unpaid
  //   • amounts outside the plausible range for this product
  if (method === "GET" && route.startsWith("/admin/reporting/billing-audit")) {
    try {
      const stripe = getStripeClient();
      const headers = { Authorization: `Bearer ${stripe.secretKey}` };
      const page = async (path: string, after: string | null) => {
        const sep = path.includes("?") ? "&" : "?";
        const url = `${stripe.baseUrl}${path}${after ? `${sep}starting_after=${after}` : ""}`;
        const r = await fetch(url, { headers });
        return r.ok ? await r.json() : null;
      };

      const LIVE = new Set(["active", "trialing", "past_due", "unpaid"]);
      const STUCK = new Set(["past_due", "unpaid", "incomplete"]);

      // ── every subscription ───────────────────────────────────────────
      const subs: any[] = [];
      let after: string | null = null;
      for (let i = 0; i < 40; i++) {
        const body = await page("/subscriptions?status=all&limit=100", after);
        if (!body) break;
        subs.push(...(body.data || []));
        if (!body.has_more || !(body.data || []).length) break;
        after = body.data[body.data.length - 1].id;
      }

      // ── local mirror, to spot untracked subscriptions ────────────────
      const { data: localSubs } = await supabase
        .from("monthly_donations")
        .select("stripe_subscription_id");
      const trackedSubIds = new Set(
        (localSubs || [])
          .map((r: any) => r.stripe_subscription_id)
          .filter(Boolean)
          .map(String),
      );

      // ── customer -> email, so findings are readable ──────────────────
      const custIds = [
        ...new Set(
          subs
            .map((x: any) => (typeof x.customer === "string" ? x.customer : x.customer?.id))
            .filter(Boolean),
        ),
      ];
      const emailByCustomer = new Map<string, string>();
      for (const cid of custIds) {
        const c = await page(`/customers/${encodeURIComponent(cid)}`, null);
        if (c?.email) emailByCustomer.set(cid, c.email);
      }

      const describe = (x: any) => {
        const cid = typeof x.customer === "string" ? x.customer : x.customer?.id;
        return {
          id: x.id,
          customer: cid,
          email: cid ? emailByCustomer.get(cid) ?? null : null,
          status: x.status,
          amount_usd: (x.items?.data?.[0]?.price?.unit_amount ?? 0) / 100,
          interval: x.items?.data?.[0]?.price?.recurring?.interval ?? null,
          created: new Date(x.created * 1000).toISOString(),
          next_bill: x.current_period_end
            ? new Date(x.current_period_end * 1000).toISOString()
            : null,
          tracked_locally: trackedSubIds.has(String(x.id)),
        };
      };

      // ── duplicates, grouped by EMAIL not customer: the same person can
      //    hold several customers, which is how one case was missed ──────
      const liveByEmail = new Map<string, any[]>();
      for (const x of subs) {
        if (!LIVE.has(x.status)) continue;
        const d = describe(x);
        const key = d.email || d.customer || "unknown";
        if (!liveByEmail.has(key)) liveByEmail.set(key, []);
        liveByEmail.get(key)!.push(d);
      }
      const doubleBilled = [...liveByEmail.entries()]
        .filter(([, list]) => list.length > 1)
        .map(([key, list]) => ({
          identity: key,
          live_subscription_count: list.length,
          monthly_total_usd:
            Math.round(list.reduce((a, s) => a + s.amount_usd, 0) * 100) / 100,
          subscriptions: list,
        }));

      const untracked = subs
        .filter((x: any) => LIVE.has(x.status) && !trackedSubIds.has(String(x.id)))
        .map(describe);
      const stuck = subs.filter((x: any) => STUCK.has(x.status)).map(describe);

      // Plausible band for this product: $1 coworking minimum up to $1000 plus
      // fees. Anything outside is worth a human look.
      const oddAmounts = subs
        .filter((x: any) => {
          if (!LIVE.has(x.status)) return false;
          const amt = (x.items?.data?.[0]?.price?.unit_amount ?? 0) / 100;
          return amt < 1 || amt > 1100;
        })
        .map(describe);

      // ── charges: refunds, disputes, failures ─────────────────────────
      const charges: any[] = [];
      after = null;
      for (let i = 0; i < 20; i++) {
        const body = await page("/charges?limit=100", after);
        if (!body) break;
        charges.push(...(body.data || []));
        if (!body.has_more || !(body.data || []).length) break;
        after = body.data[body.data.length - 1].id;
      }
      const describeCharge = (c: any) => ({
        id: c.id,
        // Attribution. Our PaymentIntents always carry metadata (user_id,
        // beneficiary_id, gift_id) and a statement descriptor; a charge with
        // neither did not originate in this app, which is the question when
        // unexplained traffic shows up on a Stripe account this old.
        metadata: c.metadata && Object.keys(c.metadata).length ? c.metadata : null,
        description: c.description ?? null,
        payment_intent: c.payment_intent ?? null,
        statement_descriptor:
          c.calculated_statement_descriptor ?? c.statement_descriptor ?? null,
        card_country: c.payment_method_details?.card?.country ?? null,
        card_brand: c.payment_method_details?.card?.brand ?? null,
        decline_code: c.outcome?.reason ?? c.failure_code ?? null,
        risk_level: c.outcome?.risk_level ?? null,
        email: c.billing_details?.email ?? (c.customer ? emailByCustomer.get(c.customer) ?? null : null),
        customer: c.customer ?? null,
        amount_usd: (c.amount ?? 0) / 100,
        refunded_usd: (c.amount_refunded ?? 0) / 100,
        status: c.status,
        disputed: !!c.disputed,
        failure_message: c.failure_message ?? null,
        created: new Date(c.created * 1000).toISOString(),
      });
      // The question that matters after finding card-testing attempts: did any
      // of it succeed? Our PaymentIntents always carry metadata, so a
      // succeeded charge in the current era with none is money that came from
      // somewhere other than this app and deserves a look.
      const eraStart = Date.parse("2026-01-01T00:00:00Z") / 1000;
      const suspiciousSucceeded = charges
        .filter(
          (c: any) =>
            c.status === "succeeded" &&
            c.created >= eraStart &&
            !(c.metadata && Object.keys(c.metadata).length) &&
            !c.invoice,
        )
        .map(describeCharge);

      const refunded = charges.filter((c: any) => (c.amount_refunded ?? 0) > 0).map(describeCharge);
      const disputed = charges.filter((c: any) => c.disputed).map(describeCharge);
      const failed = charges.filter((c: any) => c.status === "failed").map(describeCharge);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            subscriptions_scanned: subs.length,
            charges_scanned: charges.length,
            live_subscriptions: subs.filter((x: any) => LIVE.has(x.status)).length,
            double_billed_count: doubleBilled.length,
            double_billed: doubleBilled,
            untracked_live_count: untracked.length,
            untracked_live: untracked,
            stuck_count: stuck.length,
            stuck,
            odd_amount_count: oddAmounts.length,
            odd_amounts: oddAmounts,
            suspicious_succeeded_count: suspiciousSucceeded.length,
            suspicious_succeeded_total_usd:
              Math.round(suspiciousSucceeded.reduce((a, c) => a + c.amount_usd, 0) * 100) / 100,
            suspicious_succeeded: suspiciousSucceeded.slice(0, 25),
            refunded_count: refunded.length,
            refunded,
            disputed_count: disputed.length,
            disputed,
            failed_charge_count: failed.length,
            failed: failed.slice(0, 25),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "billing audit failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // POST /admin/reporting/link-subscription?id=sub_..&user_id=..&beneficiary_id=..
  //
  // Creates the monthly_donations row for a Stripe subscription we never
  // mirrored, so future charges get recorded.
  //
  // This matters more than it looks: the invoice.payment_succeeded webhook
  // finds the donation by stripe_subscription_id, and skips the whole block
  // when there is no match. A subscription Stripe is happily billing but that
  // we never wrote down produces no transaction, no charity credit and no
  // donor history — silently, month after month. That is what happened to
  // gonzalezramoniii@gmail.com's sub_1Tc5By.
  if (method === "POST" && route.startsWith("/admin/reporting/link-subscription")) {
    try {
      const url = new URL(req.url);
      const subId = (url.searchParams.get("id") || "").trim();
      const userId = parseInt(url.searchParams.get("user_id") || "", 10);
      const beneficiaryId = parseInt(url.searchParams.get("beneficiary_id") || "", 10);
      if (!/^sub_[A-Za-z0-9]+$/.test(subId) || !Number.isFinite(userId) || !Number.isFinite(beneficiaryId)) {
        return new Response(
          JSON.stringify({ error: "id (sub_...), user_id and beneficiary_id are required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const { data: existing } = await supabase
        .from("monthly_donations")
        .select("id")
        .eq("stripe_subscription_id", subId)
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ success: true, data: { already_linked: true, id: existing.id } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      const stripe = getStripeClient();
      const r = await fetch(`${stripe.baseUrl}/subscriptions/${encodeURIComponent(subId)}`, {
        headers: { Authorization: `Bearer ${stripe.secretKey}` },
      });
      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: `Subscription not found on Stripe (HTTP ${r.status})` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }
      const sub = await r.json();

      // Mirror Stripe rather than assume: status, amount and next billing date
      // all come from the subscription itself.
      const amount = (sub.items?.data?.[0]?.price?.unit_amount ?? 0) / 100;
      const PAID = new Set(["active", "trialing"]);
      const row: Record<string, any> = {
        user_id: userId,
        beneficiary_id: beneficiaryId,
        amount,
        currency: (sub.currency || "usd").toUpperCase(),
        status: PAID.has(sub.status) ? "active" : sub.status,
        stripe_subscription_id: subId,
        stripe_customer_id:
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
        next_payment_date: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString().split("T")[0]
          : null,
        created_at: new Date(sub.created * 1000).toISOString(),
      };

      const { data: inserted, error: insErr } = await supabase
        .from("monthly_donations")
        .insert([row])
        .select()
        .single();
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
      }

      return new Response(
        JSON.stringify({ success: true, data: { created: inserted, stripe_status: sub.status } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "link failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // POST /admin/reporting/send-payment-notice?email=..[&final=true]
  //
  // Sends the payment-failure notice by hand. The automatic version fires from
  // invoice.payment_failed as Stripe retries, but a donor already sitting at
  // past_due has usually missed that event — the sequence only started
  // existing today — so this lets someone reach them now rather than waiting
  // for the next retry.
  //
  // Uses the same copy as the webhook (lib/dunning.ts), and derives the amount
  // and attempt number from the donor's actual subscription rather than
  // inventing them.
  if (method === "POST" && route.startsWith("/admin/reporting/send-payment-notice")) {
    try {
      const url = new URL(req.url);
      const email = (url.searchParams.get("email") || "").trim().toLowerCase();
      const forceFinal = url.searchParams.get("final") === "true";
      // The notice normally pushes only on the first and last attempt. A donor
      // who was already mid-sequence when dunning shipped has had no push at
      // all, so allow one to be forced.
      const forcePush = url.searchParams.get("force_push") === "true";
      if (!email) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }

      const { data: users } = await supabase
        .from("users")
        .select("id, email, first_name")
        .ilike("email", email);
      const user = (users || [])[0];
      if (!user) {
        return new Response(JSON.stringify({ error: `No user with email ${email}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        });
      }

      // The failing subscription, so the amount in the email is the real one.
      const { data: subs } = await supabase
        .from("monthly_donations")
        .select("id, amount, status, stripe_subscription_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const failing =
        (subs || []).find((r: any) =>
          ["past_due", "unpaid", "incomplete", "pending"].includes(
            String(r.status || "").toLowerCase(),
          ),
        ) || (subs || [])[0];

      let amountDue = Number(failing?.amount || 0);
      let attempt = 1;
      let nextTry: string | null = null;

      // Prefer Stripe's own view of the open invoice: attempt count and next
      // retry date are facts we should not guess at.
      if (failing?.stripe_subscription_id) {
        const stripe = getStripeClient();
        const r = await fetch(
          `${stripe.baseUrl}/invoices?subscription=${encodeURIComponent(failing.stripe_subscription_id)}&limit=5`,
          { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
        );
        if (r.ok) {
          const body = await r.json();
          const open = (body.data || []).find((i: any) =>
            ["open", "draft", "uncollectible"].includes(i.status),
          );
          if (open) {
            amountDue = (open.amount_due || 0) / 100 || amountDue;
            attempt = Number(open.attempt_count || 1);
            nextTry = open.next_payment_attempt
              ? new Date(open.next_payment_attempt * 1000).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                })
              : null;
          }
        }
      }

      const result = await sendPaymentFailureNotice(supabase, user.id, {
        attempt,
        isFinal: forceFinal || (attempt > 1 && !nextTry),
        amountDue,
        nextTry,
        forcePush,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            sent_to: user.email,
            user_id: user.id,
            subscription: failing?.stripe_subscription_id ?? null,
            local_status: failing?.status ?? null,
            amount_due_usd: amountDue,
            attempt,
            next_retry: nextTry,
            ...result,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "send failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // POST /admin/reporting/test-push?email=... — send one harmless test push.
  //
  // The only way to push a single person before this was the payment-failure
  // notice, which also emails them that their card failed — not something to
  // fire at yourself to check plumbing.
  //
  // Reports the Expo ticket rather than a boolean, because Expo answers 200
  // even when it drops the message. "accepted: true" here means Expo really
  // took it; anything else names the reason.
  if (method === "POST" && route.startsWith("/admin/reporting/test-push")) {
    try {
      const url = new URL(req.url);
      const email = (url.searchParams.get("email") || "").trim();
      if (!email) {
        return new Response(JSON.stringify({ error: "email query param is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }

      const { data: users } = await supabase
        .from("users")
        .select("id, email, role, expo_push_token, push_token_updated_at")
        .ilike("email", email)
        .limit(5);

      if (!users || users.length === 0) {
        return new Response(
          JSON.stringify({ error: `No user found with email ${email}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }

      const results = [];
      for (const u of users) {
        if (!u.expo_push_token) {
          results.push({
            user_id: u.id,
            email: u.email,
            role: u.role,
            push_token_registered: false,
            accepted: false,
            reason:
              "No token on file. Install build 63 or later on a physical device, sign in, and accept the notification prompt — the simulator cannot register for push.",
          });
          continue;
        }

        // ?template=favorite_discount previews the real "your saved vendor
        // added a discount" notification, word for word, without having to
        // create a throwaway discount and push it at every favoriter of that
        // vendor. Copy is duplicated from routes/adminDiscounts.ts and
        // routes/vendorPortal.ts — if theirs changes, change this too or the
        // preview stops telling the truth.
        const template = (url.searchParams.get("template") || "").trim();
        const vendorName = (url.searchParams.get("vendor") || "THRIVE Coworking").trim();
        const discountTitle = (url.searchParams.get("discount") || "Free Day Pass").trim();

        // Resolve a real discount so the preview is tappable and lands on a
        // screen that actually exists. Without a path the tap does nothing,
        // which makes the preview useless for checking the deep link — the
        // part most likely to be wrong.
        let previewVendorId: number | null = null;
        let previewVendorName = vendorName;
        let previewDiscountTitle = discountTitle;
        if (template === "favorite_discount") {
          const { data: d } = await supabase
            .from("discounts")
            .select("id, title, vendor_id, is_active, vendor:vendors!vendor_id (id, name, signup_status)")
            .eq("is_active", true)
            .order("id", { ascending: false })
            .limit(25);
          const usable = (d || []).find((row: any) =>
            row.vendor?.signup_status === "approved" &&
            (!url.searchParams.get("vendor") ||
              String(row.vendor?.name || "").toLowerCase() === vendorName.toLowerCase()),
          );
          if (usable) {
            previewVendorId = usable.vendor_id;
            if (!url.searchParams.get("vendor")) previewVendorName = usable.vendor.name;
            if (!url.searchParams.get("discount")) previewDiscountTitle = usable.title;
          }
        }

        const payload = template === "favorite_discount"
          ? {
              title: `${previewVendorName} just added a new discount`,
              body: previewDiscountTitle || "Tap to see the latest offer from a place you love.",
              data: previewVendorId
                ? {
                    // Same shape the real fanout sends: a VENDOR id, since the
                    // [id] route resolves a vendor, not a discount.
                    path: `/discounts/${previewVendorId}`,
                    type: "favorite_new_discount",
                    vendor_id: previewVendorId,
                    preview: true,
                  }
                : { type: "favorite_new_discount", preview: true },
            }
          : template === "charity_rejected"
            ? {
                // Copy duplicated from routes/adminApprovals.ts. The internal
                // rejection reason is never shown to the donor.
                title: `We couldn't verify ${vendorName}`,
                body: "Your giving is safe and still set aside — tap to choose another cause.",
                data: { path: "/beneficiary", type: "charity_rejected", preview: true },
              }
          : template === "payment_failed"
            ? {
                // Copy duplicated from lib/dunning.ts (first-failure wording).
                // Keep in step with it or this stops previewing the truth.
                title: "Your THRIVE payment didn't go through",
                body: "Tap to update your card so we can keep your donation going.",
                data: { path: "/menu/manageCards", type: "payment_failed", preview: true },
              }
            : {
                title: "THRIVE test notification",
                body: "If you can read this, push notifications are working.",
                data: { type: "test" },
              };

        const ticket = await sendPushWithTicket({
          to: u.expo_push_token,
          ...payload,
        });

        results.push({
          user_id: u.id,
          email: u.email,
          role: u.role,
          push_token_registered: true,
          token_registered_at: u.push_token_updated_at,
          sent_title: payload.title,
          sent_body: payload.body,
          sent_path: (payload.data as any)?.path || null,
          accepted: ticket.accepted,
          expo_status: ticket.status,
          expo_ticket_id: ticket.id,
          expo_error: ticket.error,
          expo_message: ticket.message,
          hint:
            ticket.error === "DeviceNotRegistered"
              ? "Stale token — the app was deleted or reinstalled. Sign in again on the device to re-register."
              : ticket.error === "InvalidCredentials"
                ? "Expo has no valid APNs key for this bundle id. Re-run: eas credentials --platform ios -> Push Notifications."
                : undefined,
        });
      }

      return new Response(
        JSON.stringify({ success: true, data: { email, results } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "test push failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // GET /admin/reporting/alerts-preview?email=... — read-only.
  //
  // Exactly what the app would show this donor on launch, produced by the same
  // lib/accountAlerts.ts the app endpoint calls. Lets an alert be verified
  // against a real account without signing in as them.
  if (method === "GET" && route.startsWith("/admin/reporting/alerts-preview")) {
    try {
      const url = new URL(req.url);
      const email = (url.searchParams.get("email") || "").trim();
      if (!email) {
        return new Response(JSON.stringify({ error: "email query param is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }
      const { data: users } = await supabase
        .from("users")
        .select("id, email, role")
        .ilike("email", email)
        .limit(5);
      if (!users || users.length === 0) {
        return new Response(JSON.stringify({ error: `No user found with email ${email}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        });
      }
      const results = [];
      for (const u of users) {
        results.push({
          user_id: u.id,
          email: u.email,
          role: u.role,
          alerts: await buildAccountAlerts(supabase, u.id),
        });
      }
      return new Response(JSON.stringify({ success: true, data: { results } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "alerts preview failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // POST /admin/reporting/backfill-vendor-coordinates
  //
  // Vendors are stored with address.latitude/longitude of 0, which the app
  // reads as "unset" and falls back to geocoding on the device. That is why
  // the same build shows different pins on different phones: each device
  // resolves the coordinates itself, subject to its own timing, cache and
  // rate limits, so clusters split at different places or a vendor vanishes
  // when a lookup fails.
  //
  // Geocoding once and storing the result makes every device agree, and it
  // takes effect on builds already in the wild — the app prefers stored
  // coordinates and only geocodes when they are missing.
  //
  // Nominatim asks for no more than one request a second, so this paces
  // itself. Safe to re-run: vendors that already have real coordinates are
  // skipped unless force=1.
  if (method === "POST" && route.startsWith("/admin/reporting/backfill-vendor-coordinates")) {
    try {
      const url = new URL(req.url);
      const force = url.searchParams.get("force") === "1";

      const { data: vendors } = await supabase
        .from("vendors")
        .select("id, name, address");

      const results: any[] = [];
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      for (const v of vendors || []) {
        const addr = v.address || {};
        const lat = Number(addr.latitude);
        const lng = Number(addr.longitude);
        // 0/0 is the Gulf of Guinea, not Georgia — treat it as unset.
        const hasReal =
          Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
        if (hasReal && !force) {
          skipped += 1;
          continue;
        }

        // Nominatim fails outright on a suite or unit number, and some rows
        // carry placeholder text like "Location not specified" where the city
        // should be. Try the exact address first, then a cleaned-up version,
        // rather than giving up on a perfectly findable street.
        const clean = (x: any) => (typeof x === "string" ? x.trim() : "");
        const junk = /^(location not specified|n\/a|none|tbd|unknown)$/i;
        const street = clean(addr.street);
        const city = junk.test(clean(addr.city)) ? "" : clean(addr.city);
        const state = clean(addr.state);
        const zip = junk.test(clean(addr.zipCode)) ? "" : clean(addr.zipCode);
        // "10 Roswell St, Suite 100" -> "10 Roswell St"
        const streetNoUnit = street
          .replace(/[,]?\s*(suite|ste\.?|unit|apt\.?|#)\s*[\w-]+\s*$/i, "")
          .trim();

        const candidates = Array.from(
          new Set(
            [
              [street, city, state, zip],
              [streetNoUnit, city, state, zip],
              [streetNoUnit, city, state],
            ]
              .map((parts) => parts.filter(Boolean).join(", "))
              .filter((q) => q.length > 0),
          ),
        );

        if (candidates.length === 0) {
          results.push({ id: v.id, name: v.name, status: "no_address" });
          failed += 1;
          continue;
        }

        let geo: { latitude: number | null; longitude: number | null } = {
          latitude: null, longitude: null,
        };
        let query = candidates[0];
        for (const candidate of candidates) {
          query = candidate;
          geo = await geocodeAddress(candidate);
          if (geo.latitude != null && geo.longitude != null) break;
          // Pace each attempt, not just each vendor.
          await new Promise((r) => setTimeout(r, 1100));
        }

        if (geo.latitude == null || geo.longitude == null) {
          results.push({
            id: v.id, name: v.name, status: "not_found", tried: candidates,
          });
          failed += 1;
        } else {
          const { error } = await supabase
            .from("vendors")
            .update({
              address: { ...addr, latitude: geo.latitude, longitude: geo.longitude },
            })
            .eq("id", v.id);
          if (error) {
            results.push({ id: v.id, name: v.name, query, status: "write_failed", error: error.message });
            failed += 1;
          } else {
            results.push({
              id: v.id, name: v.name, query, status: "geocoded",
              latitude: geo.latitude, longitude: geo.longitude,
            });
            updated += 1;
          }
        }

        // Be a good Nominatim citizen.
        await new Promise((r) => setTimeout(r, 1100));
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: { total: (vendors || []).length, updated, skipped, failed, results },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "backfill failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // POST /admin/reporting/test-favorite?email=...&vendor_id=... — diagnostic.
  //
  // Performs the same insert as POST /vendors/:id/favorite, using the same
  // service-role client, and returns the raw error. Both call sites in the app
  // swallow failures silently, so this is the only way to see whether the
  // write itself is being rejected or the request never arrives.
  if (method === "POST" && route.startsWith("/admin/reporting/test-favorite")) {
    try {
      const url = new URL(req.url);
      const email = (url.searchParams.get("email") || "").trim();
      const vendorId = parseInt(url.searchParams.get("vendor_id") || "0", 10);
      if (!email || !vendorId) {
        return new Response(
          JSON.stringify({ error: "email and vendor_id are required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const { data: user } = await supabase
        .from("users")
        .select("id, email")
        .ilike("email", email)
        .maybeSingle();
      if (!user) {
        return new Response(JSON.stringify({ error: `no user ${email}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        });
      }

      const read = await supabase
        .from("vendor_favorites")
        .select("id, vendor_id, user_id, created_at")
        .eq("user_id", user.id);

      const write = await supabase
        .from("vendor_favorites")
        .insert({ vendor_id: vendorId, user_id: user.id })
        .select("id")
        .maybeSingle();

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            user_id: user.id,
            read_error: read.error ? read.error.message : null,
            existing_rows: read.data || [],
            insert_error: write.error ? write.error.message : null,
            insert_code: (write.error as any)?.code ?? null,
            inserted_id: write.data?.id ?? null,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // GET /admin/reporting/donated-in?month=YYYY-MM — read-only.
  //
  // Which donors actually paid in a given calendar month, so the Donors page
  // can filter by month.
  //
  // Uses the same predicates as the Beneficiary Payouts report — transactions
  // with status completed and amount > 0 — so the two screens cannot disagree.
  // The Donors page previously filtered on last_donation_date, a single date,
  // which answers a different question: it finds donors whose LAST EVER
  // payment fell in that month, i.e. people who lapsed afterwards. Someone who
  // paid in both August and September was invisible in August.
  //
  // Both monthly donations and one-time gifts count, since either makes
  // somebody a donor that month.
  if (method === "GET" && route.startsWith("/admin/reporting/donated-in")) {
    try {
      const url = new URL(req.url);
      const month = (url.searchParams.get("month") || "").trim();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return new Response(
          JSON.stringify({ error: "month must be YYYY-MM" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      // First instant of the next month, used with lt so the boundary day is
      // never double-counted or dropped.
      const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString();

      const { data: txns, error } = await supabase
        .from("transactions")
        .select("user_id, amount, type, created_at")
        .in("type", ["monthly_donation", "gift"])
        .eq("status", "completed")
        .gt("amount", 0)
        .gte("created_at", start)
        .lt("created_at", end);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
      }

      const byUser = new Map<number, { count: number; total: number }>();
      for (const t of txns || []) {
        if (!t.user_id) continue;
        const cur = byUser.get(t.user_id) || { count: 0, total: 0 };
        cur.count += 1;
        cur.total = Math.round((cur.total + Number(t.amount || 0)) * 100) / 100;
        byUser.set(t.user_id, cur);
      }

      const donors = [...byUser.entries()].map(([user_id, v]) => ({
        user_id,
        donation_count: v.count,
        total_collected: v.total,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            month,
            start,
            end,
            donor_count: donors.length,
            donation_count: (txns || []).length,
            user_ids: donors.map((d) => d.user_id),
            donors,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "donated-in failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // GET /admin/reporting/email-links — read-only.
  //
  // Which store URL the invitation email will actually use. APP_STORE_IOS_URL
  // overrides the code default, so a stale secret silently beats a fix in the
  // source — which is how invitation emails kept pointing at App Store id
  // 6744030078, an id that resolves to no app and which iOS Mail refuses with
  // "Unable to verify this link". Store URLs are public, so reporting the
  // resolved value leaks nothing.
  if (method === "GET" && route.startsWith("/admin/reporting/email-links")) {
    const iosEnv = Deno.env.get("APP_STORE_IOS_URL");
    const androidEnv = Deno.env.get("APP_STORE_ANDROID_URL");
    const resolvedIos =
      iosEnv || "https://apps.apple.com/us/app/thrive-initiative/id6759223641";
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ios_env_set: !!iosEnv,
          ios_resolved: resolvedIos,
          ios_looks_correct: resolvedIos.includes("6759223641"),
          android_env_set: !!androidEnv,
          app_base_url: Deno.env.get("APP_BASE_URL") || "(default)",
          // Where the admin temp-password email tells a new team member to
          // sign in. Used by both the add-member and reset-password flows.
          admin_portal_url:
            Deno.env.get("ADMIN_PORTAL_URL") ||
            "https://admin.forpurposetechnologies.com",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }

  // GET /admin/reporting/push-health — read-only.
  //
  // How many people can actually receive a push. Every notification feature —
  // charity approvals, payment failures, "your favourite vendor added a
  // discount" — filters on users.expo_push_token IS NOT NULL and silently
  // drops anyone without one. sendPushToUser returns false rather than
  // throwing, so a missing token looks like success from the caller's side.
  if (method === "GET" && route.startsWith("/admin/reporting/push-health")) {
    try {
      const { data: users } = await supabase
        .from("users")
        .select("id, role, expo_push_token, account_status");
      const all = users || [];
      const withToken = all.filter((u: any) => !!u.expo_push_token);

      const byRole: Record<string, { total: number; with_token: number }> = {};
      for (const u of all) {
        const r = String(u.role || "unknown");
        if (!byRole[r]) byRole[r] = { total: 0, with_token: 0 };
        byRole[r].total += 1;
        if (u.expo_push_token) byRole[r].with_token += 1;
      }

      const { count: favouriteRows } = await supabase
        .from("vendor_favorites")
        .select("vendor_id", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            users_total: all.length,
            users_with_push_token: withToken.length,
            coverage_percent:
              all.length ? Math.round((withToken.length / all.length) * 1000) / 10 : 0,
            by_role: byRole,
            vendor_favorite_rows: favouriteRows ?? 0,
            note:
              "A push feature can only reach users_with_push_token. Favourite-vendor alerts additionally require a vendor_favorites row.",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "push health failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // GET /admin/reporting/whois?email=... — read-only lookup.
  //
  // Answers "does this person exist in our system, and what is attached to
  // them?" across roles and Stripe. Written while attributing unrecorded
  // invoices: the reconciliation sweep filters role='donor', so an account
  // under any other role looked like no account at all.
  if (method === "GET" && route.startsWith("/admin/reporting/whois")) {
    try {
      const email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
      if (!email) return new Response(JSON.stringify({ error: "email is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });

      const { data: users } = await supabase
        .from("users")
        .select(
          "id, email, role, account_status, stripe_customer_id, created_at, invite_type, expo_push_token",
        )
        .ilike("email", email);

      const ids = (users || []).map((u: any) => u.id);

      // Push readiness and favourites — the two things that decide whether the
      // "your favourite vendor added a discount" fanout can reach someone. The
      // fanout filters on users.expo_push_token IS NOT NULL, so no token means
      // no notification, silently.
      let favourites: any[] = [];
      if (ids.length) {
        const f = await supabase
          .from("vendor_favorites")
          .select("vendor_id, user_id")
          .in("user_id", ids);
        favourites = f.data || [];
      }
      let subs: any[] = [];
      let txns: any[] = [];
      if (ids.length) {
        const a = await supabase
          .from("monthly_donations")
          .select("id, user_id, status, amount, beneficiary_id, stripe_subscription_id, stripe_customer_id")
          .in("user_id", ids);
        subs = a.data || [];
        const b = await supabase
          .from("transactions")
          .select("id, user_id, type, amount, beneficiary_id, stripe_invoice_id, created_at")
          .in("user_id", ids);
        txns = b.data || [];
      }

      // Any subscription row that references the same Stripe customer, even if
      // its user_id points elsewhere.
      const stripe = getStripeClient();
      const cRes = await fetch(
        `${stripe.baseUrl}/customers/search?query=${encodeURIComponent(`email:'${email}'`)}&limit=10`,
        { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
      );
      const stripeCustomers = cRes.ok ? ((await cRes.json()).data || []) : [];
      const customerIds = stripeCustomers.map((c: any) => c.id);

      let subsByCustomer: any[] = [];
      if (customerIds.length) {
        const c = await supabase
          .from("monthly_donations")
          .select("id, user_id, status, amount, beneficiary_id, stripe_subscription_id, stripe_customer_id")
          .in("stripe_customer_id", customerIds);
        subsByCustomer = c.data || [];
      }

      // Live subscription state per customer — what will bill again, and when.
      const subscriptions: any[] = [];
      for (const cid of customerIds) {
        const sRes = await fetch(
          `${stripe.baseUrl}/subscriptions?customer=${encodeURIComponent(cid)}&status=all&limit=20`,
          { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
        );
        if (!sRes.ok) continue;
        const body = await sRes.json();
        for (const sub of body.data || []) {
          subscriptions.push({
            id: sub.id,
            customer: cid,
            status: sub.status,
            amount_usd: (sub.items?.data?.[0]?.price?.unit_amount ?? 0) / 100,
            interval: sub.items?.data?.[0]?.price?.recurring?.interval ?? null,
            created: new Date(sub.created * 1000).toISOString(),
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            cancel_at_period_end: sub.cancel_at_period_end ?? null,
          });
        }
      }
      subscriptions.sort((a, b) => (a.created < b.created ? -1 : 1));

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            email,
            users: (users || []).map((u: any) => ({
              ...u,
              // Never echo the token itself; presence is the diagnostic.
              expo_push_token: undefined,
              push_token_registered: !!u.expo_push_token,
            })),
            user_count: (users || []).length,
            push_ready: (users || []).some((u: any) => !!u.expo_push_token),
            favorite_vendor_ids: favourites.map((f: any) => f.vendor_id),
            favorite_count: favourites.length,
            stripe_subscriptions: subscriptions,
            monthly_donations_by_user: subs,
            transactions_by_user: txns,
            stripe_customers: stripeCustomers.map((c: any) => ({
              id: c.id, email: c.email, created: new Date(c.created * 1000).toISOString(),
            })),
            monthly_donations_by_stripe_customer: subsByCustomer,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "whois failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
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

      // Sweep Stripe directly rather than per-donor.
      //
      // The first version iterated users with a stripe_customer_id and listed
      // each one's invoices — so any paid invoice whose customer wasn't linked
      // to a user row was invisible, and this endpoint reported "0 unrecorded"
      // while three real invoices ($61.09) sat unaccounted for. Stripe is the
      // authority on what was collected, so enumerate from there and resolve
      // the donor afterwards.
      const { data: donors } = await supabase
        .from("users")
        .select("id, email, stripe_customer_id")
        .eq("role", "donor");
      const userByCustomer = new Map<string, any>();
      for (const d of donors || []) {
        if (d.stripe_customer_id) userByCustomer.set(String(d.stripe_customer_id), d);
      }

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

      // Every paid invoice on the account, paginated. `starting_after` rather
      // than a single limit=100 so a growing history can't silently truncate
      // and look reconciled.
      let after: string | null = null;
      let pages = 0;
      while (pages < 40) {
        pages += 1;
        const qs = new URLSearchParams({ status: "paid", limit: "100" });
        if (after) qs.set("starting_after", after);
        const res = await fetch(`${stripe.baseUrl}/invoices?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${stripe.secretKey}` },
        });
        if (!res.ok) {
          errors.push({ error: `invoice list HTTP ${res.status}`, page: pages });
          break;
        }
        const body = await res.json();
        const batch = body.data || [];
        for (const inv of batch) {
          paidInvoiceCount += 1;
          paidCents += inv.amount_paid || 0;
          if (recorded.has(String(inv.id))) continue;

          const customerId =
            typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
          let donor = customerId ? userByCustomer.get(String(customerId)) : null;

          // Fall back to the customer's email. A donor can have a Stripe
          // customer that was never written back to users.stripe_customer_id —
          // which is exactly how these invoices ended up attributable to nobody.
          // Only for unmatched invoices, so the extra Stripe calls are few.
          let stripeCustomerEmail: string | null = null;
          if (!donor && customerId) {
            const cRes = await fetch(
              `${stripe.baseUrl}/customers/${encodeURIComponent(customerId)}`,
              { headers: { Authorization: `Bearer ${stripe.secretKey}` } },
            );
            if (cRes.ok) {
              const cust = await cRes.json();
              stripeCustomerEmail = cust?.email || null;
              if (stripeCustomerEmail) {
                const match = (donors || []).find(
                  (d: any) =>
                    String(d.email || "").trim().toLowerCase() ===
                    stripeCustomerEmail!.trim().toLowerCase(),
                );
                if (match) donor = match;
              }
            }
          }
          unmatchedCents += inv.amount_paid || 0;
          unmatched.push({
            donor_id: donor?.id ?? null,
            email: donor?.email ?? null,
            // Named explicitly: an invoice whose customer matches no user row
            // is the case the per-donor sweep could never see.
            donor_linked: Boolean(donor),
            // How the donor was found: by the customer id on their user row, or
            // only by matching the Stripe customer's email. The latter means
            // users.stripe_customer_id is missing or wrong for them.
            matched_by: donor
              ? (customerId && userByCustomer.has(String(customerId)) ? "customer_id" : "email")
              : "unresolved",
            stripe_customer: customerId ?? null,
            stripe_customer_email: stripeCustomerEmail,
            invoice_id: inv.id,
            amount_usd: (inv.amount_paid || 0) / 100,
            paid_at: new Date(inv.created * 1000).toISOString(),
            subscription:
              inv.subscription ??
              inv.parent?.subscription_details?.subscription ??
              null,
          });
        }
        if (!body.has_more || batch.length === 0) break;
        after = batch[batch.length - 1].id;
      }
      if (pages >= 40) {
        errors.push({ error: "stopped at 40 pages — rerun if this appears" });
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
            unrecorded_unlinked_count: unmatched.filter((u) => !u.donor_linked).length,
            unrecorded_unlinked_total_usd:
              Math.round(
                unmatched
                  .filter((u) => !u.donor_linked)
                  .reduce((a, u) => a + u.amount_usd, 0) * 100,
              ) / 100,
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
              // MUST stay null. reference_id is an INTEGER column, so writing a
              // Stripe invoice id ("in_1U9T…") fails with "invalid input syntax
              // for type integer" — every insert here failed silently while the
              // endpoint returned 200 with transactionsUpserted: 0. Identity
              // lives in stripe_invoice_id. Same fault as webhooks.ts had;
              // fixed there and missed on this sibling path.
              reference_id: null,
              reference_type: "donation",
              donation_id: row.id,
              beneficiary_id: row.beneficiary_id,
              status: "completed",
              created_at: new Date(invPaidAt * 1000).toISOString(),
              stripe_invoice_id: inv.id,
              stripe_charge_id: invChargeId ?? null,
              processing_fee: invFeeUsd,
            };
            // ON CONFLICT (reference_id) cannot work: there is no unique
            // CONSTRAINT on that column, only partial indexes, which ON CONFLICT
            // cannot target. Check-then-insert on stripe_invoice_id instead,
            // which is the real idempotency key.
            const { data: existingTxn } = await supabase
              .from("transactions")
              .select("id")
              .eq("stripe_invoice_id", inv.id)
              .maybeSingle();
            const { error: txnError } = existingTxn
              ? await supabase
                  .from("transactions")
                  .update(txnRow)
                  .eq("id", existingTxn.id)
              : await supabase.from("transactions").insert([txnRow]);
            if (txnError) {
              // Was swallowed by `if (!txnError)`, which is how this went
              // unnoticed — a failed write looked identical to nothing to do.
              console.error(
                `❌ backfill-payment-dates could not write transaction for invoice ${inv.id}:`,
                txnError.message,
              );
            } else {
              transactionsUpserted += 1;
            }
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

      // One-time payment intents.
      //
      // A subscription renewal settles through a PaymentIntent as well as its
      // invoice, so counting every succeeded PI double-counted every renewal:
      // it inflated stripeTotalCents and pushed the same charge into stripeOnly
      // as money we supposedly hadn't recorded. Evidence from the August audit:
      // invoice in_1U9TdC and pi_3U9UZv both resolved to charge
      // ch_3U9UZvHeCafBpXfQ0nHtC0ah, three such pairs in one month.
      //
      // Invoice-backed PaymentIntents are skipped — the invoice loop above has
      // already accounted for that money. `invoice` is the field on a PI when
      // Stripe created it for one; charge-id overlap is the belt-and-braces
      // check for API versions that omit it.
      const invoiceChargeIds = new Set<string>();
      for (const inv of stripeInvoices) {
        const cid = typeof inv.charge === "string" ? inv.charge : inv.charge?.id;
        if (cid) invoiceChargeIds.add(cid);
      }
      let subscriptionPisSkipped = 0;

      for (const pi of stripePayments) {
        if (pi.status !== "succeeded") continue;
        const piChargeId =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : pi.latest_charge?.id ?? pi.charges?.data?.[0]?.id ?? null;
        if (pi.invoice || (piChargeId && invoiceChargeIds.has(piChargeId))) {
          subscriptionPisSkipped += 1;
          continue;
        }
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
              // Renewals accounted for by their invoice rather than counted a
              // second time as a PaymentIntent. Surfaced so a jump here is
              // visible rather than silently changing the totals.
              subscriptionPaymentIntentsSkipped: subscriptionPisSkipped,
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
