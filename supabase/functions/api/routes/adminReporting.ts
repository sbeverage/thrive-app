import { corsHeaders } from "../lib/cors.ts";
import { getStripeClient } from "../lib/stripe.ts";

export async function handleAdminReporting(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // POST /admin/reporting/backfill-payment-dates
  // For each monthly_donations row missing last_payment_date, look up the
  // Stripe subscription's latest paid invoice and stamp last_payment_date /
  // last_payment_amount from Stripe. Idempotent — only touches rows missing data.
  if (method === "POST" && route === "/admin/reporting/backfill-payment-dates") {
    try {
      const {data: rows, error: rowsError} = await supabase
        .from("monthly_donations")
        .select("id, stripe_subscription_id, last_payment_date, processing_fee")
        .not("stripe_subscription_id", "is", null)
        .or("last_payment_date.is.null,processing_fee.is.null");

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

      for (const row of rows || []) {
        try {
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

      // Calculate payouts for each charity
      const payoutData = await Promise.all(
        (charities || []).map(async (charity: any) => {
          // Get monthly donations for this charity in date range
          const {data: monthlyDonations} = await supabase
            .from("monthly_donations")
            .select(
              "id, amount, status, last_payment_date, last_payment_amount, processing_fee",
            )
            .eq("beneficiary_id", charity.id)
            .eq("status", "active")
            .gte("last_payment_date", startDate)
            .lte("last_payment_date", endDate);

          // Get one-time gifts for this charity in date range
          const {data: oneTimeGifts} = await supabase
            .from("one_time_gifts")
            .select(
              "id, amount, net_amount, processing_fee, user_covered_fees, status, created_at",
            )
            .eq("beneficiary_id", charity.id)
            .eq("status", "completed")
            .gte("created_at", startDate)
            .lte("created_at", endDate);

          // Calculate totals
          const monthlyTotal = (monthlyDonations || []).reduce((sum, d) => {
            return sum + parseFloat(d.last_payment_amount || d.amount || 0);
          }, 0);

          const oneTimeTotal = (oneTimeGifts || []).reduce((sum, g) => {
            return sum + parseFloat(g.net_amount || g.amount || 0);
          }, 0);

          const totalDonations = monthlyTotal + oneTimeTotal;
          const donationCount =
            (monthlyDonations?.length || 0) + (oneTimeGifts?.length || 0);

          // Calculate fees
          const serviceFee = donationCount * 3.0; // $3 per donation
          // Real Stripe processing fees taken from the charge's balance_transaction.
          // For one-time gifts we historically only counted fees the donor didn't
          // cover (beneficiary absorbed); we keep that behavior, plus the monthly
          // Stripe fee (always counted since donors who cover fees pay an estimate,
          // not the exact Stripe cut — the real cut still reduces what hits THRIVE's
          // bank from the gross charge).
          const oneTimeAbsorbedFees = (oneTimeGifts || []).reduce((sum, g) => {
            if (!g.user_covered_fees) {
              return sum + parseFloat(g.processing_fee || 0);
            }
            return sum;
          }, 0);
          const monthlyStripeFees = (monthlyDonations || []).reduce(
            (sum, d) => sum + parseFloat(d.processing_fee || 0),
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

      // Calculate summary totals
      const summary = {
        totalDonations: payoutData.reduce(
          (sum, p) => sum + p.totalDonations,
          0,
        ),
        totalServiceFees: payoutData.reduce((sum, p) => sum + p.serviceFee, 0),
        totalProcessingFees: payoutData.reduce(
          (sum, p) => sum + p.processingFees,
          0,
        ),
        totalNetAmount: payoutData.reduce((sum, p) => sum + p.netAmount, 0),
        totalPlatformFees: payoutData.reduce(
          (sum, p) => sum + p.platformFee,
          0,
        ),
        totalPayoutAmount: payoutData.reduce(
          (sum, p) => sum + p.payoutAmount,
          0,
        ),
        totalDonationCount: payoutData.reduce(
          (sum, p) => sum + p.donationCount,
          0,
        ),
      };

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            payouts: payoutData,
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
