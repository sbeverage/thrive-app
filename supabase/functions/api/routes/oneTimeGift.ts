import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";
import {
  createStripePaymentIntent,
  getStripePaymentIntent,
} from "../lib/stripe.ts";

export type CalculateProcessingFeeFn = (
  amount: number,
  userCoveredFees?: boolean,
) => {
  originalAmount: number;
  fee: number;
  totalAmount: number;
  netAmount: number;
};

export async function handleOneTimeGiftRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  calculateProcessingFee: CalculateProcessingFeeFn,
  /** From main serve() after gateway JWT verification — must not rely on a second decode here */
  gatewayUserId: number | null = null,
) {
  const authHeader = getAppAuthHeader(req);
  let userId: number | null =
    gatewayUserId != null && Number.isFinite(Number(gatewayUserId))
      ? Number(gatewayUserId)
      : null;

  if (userId == null && authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const jwtSecret = Deno.env.get("JWT_SECRET");

    if (jwtSecret) {
      try {
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["verify"],
        );

        const payload = await verifyJWT(token, secretKey);
        const raw = payload?.id ?? payload?.userId;
        const n = Number(raw);
        userId = Number.isFinite(n) ? n : null;
      } catch (error) {
        console.warn(
          "⚠️ JWT verification failed in handleOneTimeGiftRoute:",
          error,
        );
      }
    }
  }

  // POST /one-time-gifts/create-payment-intent
  if (method === "POST" && route === "/one-time-gifts/create-payment-intent") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const body = await req.json();
      const {
        beneficiary_id,
        amount,
        currency = "USD",
        user_covered_fees = false,
        donor_message,
        is_anonymous = false,
      } = body;

      // Validate input
      if (!beneficiary_id || !amount) {
        return new Response(
          JSON.stringify({error: "beneficiary_id and amount are required"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      if (amount < 1 || amount > 10000) {
        return new Response(
          JSON.stringify({error: "Amount must be between $1 and $10,000"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Verify beneficiary exists (try beneficiaries first, fallback to charities)
      let beneficiary: any = null;
      let beneficiaryError: any = null;

      // Try beneficiaries table first
      const beneficiariesResult = await supabase
        .from("beneficiaries")
        .select("id, name")
        .eq("id", beneficiary_id)
        .single();

      if (!beneficiariesResult.error && beneficiariesResult.data) {
        beneficiary = beneficiariesResult.data;
      } else {
        // Fallback to charities table
        const charitiesResult = await supabase
          .from("charities")
          .select("id, name")
          .eq("id", beneficiary_id)
          .single();

        beneficiary = charitiesResult.data;
        beneficiaryError = charitiesResult.error;
      }

      if (beneficiaryError || !beneficiary) {
        return new Response(JSON.stringify({error: "Invalid beneficiary_id"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Calculate processing fees
      const feeCalculation = calculateProcessingFee(amount, user_covered_fees);

      // Create Stripe PaymentIntent
      const paymentIntent = await createStripePaymentIntent(
        feeCalculation.totalAmount,
        currency.toLowerCase(),
        {
          gift_id: "pending", // Will update after creating gift record
          user_id: userId.toString(),
          beneficiary_id: beneficiary_id.toString(),
        },
      );

      // Create one-time gift record
      const {data: gift, error: giftError} = await supabase
        .from("one_time_gifts")
        .insert([
          {
            user_id: userId,
            beneficiary_id: beneficiary_id,
            amount: amount,
            currency: currency,
            stripe_payment_intent_id: paymentIntent.id,
            status: "pending",
            processing_fee: feeCalculation.fee,
            net_amount: feeCalculation.netAmount,
            user_covered_fees: user_covered_fees,
            donor_message: donor_message || null,
            is_anonymous: is_anonymous,
          },
        ])
        .select()
        .single();

      if (giftError) {
        console.error("❌ Error creating gift record:", giftError);
        return new Response(
          JSON.stringify({error: "Failed to create gift record"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          payment_intent: {
            id: paymentIntent.id,
            client_secret: paymentIntent.client_secret,
            amount: Math.round(feeCalculation.totalAmount * 100),
            currency: currency.toLowerCase(),
            status: paymentIntent.status,
          },
          gift: {
            id: gift.id,
            beneficiary_id: gift.beneficiary_id,
            beneficiary_name: beneficiary.name,
            amount: parseFloat(gift.amount),
            net_amount: parseFloat(gift.net_amount),
            processing_fee: parseFloat(gift.processing_fee),
            status: gift.status,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Create Payment Intent Error:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
        userId: userId || "unknown",
      });

      // Return detailed error message for debugging
      const errorMessage =
        error?.message || String(error) || "Failed to create payment intent";
      return new Response(
        JSON.stringify({
          error: "Failed to create payment intent",
          message: errorMessage,
          details: error?.stack || undefined,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /one-time-gifts/confirm-payment
  if (method === "POST" && route === "/one-time-gifts/confirm-payment") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const body = await req.json();
      const {payment_intent_id, payment_method_id} = body;

      if (!payment_intent_id) {
        return new Response(
          JSON.stringify({error: "payment_intent_id is required"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Get gift record (try beneficiaries first, fallback to charities)
      let gift: any = null;
      let giftError: any = null;

      // Try with beneficiaries table
      const beneficiariesGift = await supabase
        .from("one_time_gifts")
        .select("*, beneficiaries!inner(id, name)")
        .eq("stripe_payment_intent_id", payment_intent_id)
        .eq("user_id", userId)
        .single();

      if (!beneficiariesGift.error && beneficiariesGift.data) {
        gift = beneficiariesGift.data;
      } else {
        // Fallback to charities table
        const charitiesGift = await supabase
          .from("one_time_gifts")
          .select("*, charities!inner(id, name)")
          .eq("stripe_payment_intent_id", payment_intent_id)
          .eq("user_id", userId)
          .single();

        gift = charitiesGift.data;
        giftError = charitiesGift.error;
      }

      if (giftError || !gift) {
        return new Response(
          JSON.stringify({error: "Gift not found or unauthorized"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      // Get Stripe PaymentIntent to check status
      const stripePaymentIntent =
        await getStripePaymentIntent(payment_intent_id);

      if (stripePaymentIntent.status !== "succeeded") {
        // If not succeeded, try to confirm it
        if (
          stripePaymentIntent.status === "requires_payment_method" ||
          stripePaymentIntent.status === "requires_confirmation"
        ) {
          await confirmStripePaymentIntent(
            payment_intent_id,
            payment_method_id,
          );
          // Re-fetch to get updated status
          const updatedIntent = await getStripePaymentIntent(payment_intent_id);

          if (updatedIntent.status !== "succeeded") {
            return new Response(
              JSON.stringify({
                error: `Payment not completed. Status: ${updatedIntent.status}`,
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 400,
              },
            );
          }
        } else {
          return new Response(
            JSON.stringify({
              error: `Payment not succeeded. Status: ${stripePaymentIntent.status}`,
            }),
            {
              headers: {"Content-Type": "application/json"},
              status: 400,
            },
          );
        }
      }

      // Get charge details
      const charge =
        stripePaymentIntent.charges?.data?.[0] ||
        stripePaymentIntent.latest_charge;
      const chargeId = typeof charge === "string" ? charge : charge?.id;

      // Extract payment method details
      const paymentMethod = stripePaymentIntent.payment_method;
      let paymentMethodType = "card";
      let paymentMethodLast4 = null;
      let paymentMethodBrand = null;

      if (paymentMethod && typeof paymentMethod === "object") {
        paymentMethodType = paymentMethod.type || "card";
        if (paymentMethod.card) {
          paymentMethodLast4 = paymentMethod.card.last4;
          paymentMethodBrand = paymentMethod.card.brand;
        }
      }

      // Update gift record
      const {error: updateError} = await supabase
        .from("one_time_gifts")
        .update({
          status: "succeeded",
          stripe_charge_id: chargeId,
          payment_method_type: paymentMethodType,
          payment_method_last4: paymentMethodLast4,
          payment_method_brand: paymentMethodBrand,
          processed_at: new Date().toISOString(),
        })
        .eq("id", gift.id);

      if (updateError) {
        console.error("❌ Error updating gift:", updateError);
        return new Response(
          JSON.stringify({error: "Failed to update gift record"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Update beneficiary totals (try beneficiaries table first, fallback to charities)
      const beneficiaryTable = gift.beneficiaries
        ? "beneficiaries"
        : "charities";
      const {data: beneficiary} = await supabase
        .from(beneficiaryTable)
        .select("total_one_time_gifts, one_time_gifts_count")
        .eq("id", gift.beneficiary_id)
        .single();

      if (beneficiary) {
        await supabase
          .from(beneficiaryTable)
          .update({
            total_one_time_gifts:
              parseFloat(beneficiary.total_one_time_gifts || 0) +
              parseFloat(gift.net_amount),
            one_time_gifts_count:
              parseInt(beneficiary.one_time_gifts_count || 0) + 1,
            last_one_time_gift_at: new Date().toISOString(),
          })
          .eq("id", gift.beneficiary_id);
      }

      // Update user totals
      const {data: user} = await supabase
        .from("users")
        .select("total_one_time_gifts_given, one_time_gifts_count")
        .eq("id", userId)
        .single();

      if (user) {
        await supabase
          .from("users")
          .update({
            total_one_time_gifts_given:
              parseFloat(user.total_one_time_gifts_given || 0) +
              parseFloat(gift.amount),
            one_time_gifts_count: parseInt(user.one_time_gifts_count || 0) + 1,
            last_one_time_gift_at: new Date().toISOString(),
          })
          .eq("id", userId);
      }

      // Get updated gift (try beneficiaries first, fallback to charities)
      let updatedGift: any = null;
      const updatedBeneficiaries = await supabase
        .from("one_time_gifts")
        .select("*, beneficiaries!inner(id, name)")
        .eq("id", gift.id)
        .single();

      if (!updatedBeneficiaries.error && updatedBeneficiaries.data) {
        updatedGift = updatedBeneficiaries.data;
      } else {
        const updatedCharities = await supabase
          .from("one_time_gifts")
          .select("*, charities!inner(id, name)")
          .eq("id", gift.id)
          .single();
        updatedGift = updatedCharities.data;
      }

      const beneficiaryName =
        updatedGift?.beneficiaries?.name ||
        updatedGift?.charities?.name ||
        "Unknown";

      return new Response(
        JSON.stringify({
          success: true,
          gift: {
            id: updatedGift.id,
            beneficiary_id: updatedGift.beneficiary_id,
            beneficiary_name: beneficiaryName,
            amount: parseFloat(updatedGift.amount),
            net_amount: parseFloat(updatedGift.net_amount),
            processing_fee: parseFloat(updatedGift.processing_fee),
            status: updatedGift.status,
            processed_at: updatedGift.processed_at,
            stripe_charge_id: updatedGift.stripe_charge_id,
          },
          transaction: {
            id: updatedGift.id,
            type: "one-time-gift",
            beneficiary_name: beneficiaryName,
            amount: `$${parseFloat(updatedGift.amount).toFixed(2)}`,
            date: new Date(updatedGift.processed_at).toLocaleDateString(
              "en-US",
              {
                year: "numeric",
                month: "short",
                day: "numeric",
              },
            ),
            status: "completed",
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Confirm Payment Error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Server error. Please try again later.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /one-time-gifts/history
  if (method === "GET" && route === "/one-time-gifts/history") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const beneficiaryId = url.searchParams.get("beneficiary_id");

      const offset = (page - 1) * limit;

      /**
       * Do NOT use beneficiaries!inner / charities!inner: beneficiary_id may point at
       * either table. Inner join returns zero rows with no error, so the charities fallback
       * never ran and the app showed no one-time gifts in Donation Breakdown.
       */
      let query = supabase
        .from("one_time_gifts")
        .select("*", {count: "exact"})
        .eq("user_id", userId)
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      if (beneficiaryId) {
        query = query.eq("beneficiary_id", beneficiaryId);
      }

      const {data: gifts, error: giftsError, count} = await query;
      const finalGifts = gifts;
      const finalCount = count;

      if (giftsError) {
        console.error("❌ Error fetching gift history:", giftsError);
        return new Response(
          JSON.stringify({error: "Failed to fetch gift history"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Get summary stats
      const {data: allGifts} = await supabase
        .from("one_time_gifts")
        .select("amount, created_at, status")
        .eq("user_id", userId)
        .eq("status", "succeeded");

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisYear = new Date(now.getFullYear(), 0, 1);

      const totalGiven =
        allGifts?.reduce((sum, g) => sum + parseFloat(g.amount || 0), 0) || 0;
      const thisMonthGifts =
        allGifts?.filter((g) => new Date(g.created_at) >= thisMonth) || [];
      const thisYearGifts =
        allGifts?.filter((g) => new Date(g.created_at) >= thisYear) || [];
      const thisMonthTotal = thisMonthGifts.reduce(
        (sum, g) => sum + parseFloat(g.amount || 0),
        0,
      );
      const thisYearTotal = thisYearGifts.reduce(
        (sum, g) => sum + parseFloat(g.amount || 0),
        0,
      );

      const beneficiaryIds = [
        ...new Set(
          (finalGifts || [])
            .map((g: any) => g.beneficiary_id)
            .filter((id: any) => id != null && id !== ""),
        ),
      ] as (string | number)[];
      const nameByBeneficiaryId = new Map<
        string,
        {name: string; logo_url: string | null}
      >();
      if (beneficiaryIds.length > 0) {
        const {data: benRows} = await supabase
          .from("beneficiaries")
          .select("id, name, logo_url")
          .in("id", beneficiaryIds as any);
        for (const row of benRows || []) {
          nameByBeneficiaryId.set(String(row.id), {
            name: row.name,
            logo_url: row.logo_url ?? null,
          });
        }
        const {data: chRows} = await supabase
          .from("charities")
          .select("id, name, logo_url")
          .in("id", beneficiaryIds as any);
        for (const row of chRows || []) {
          const key = String(row.id);
          if (!nameByBeneficiaryId.has(key)) {
            nameByBeneficiaryId.set(key, {
              name: row.name,
              logo_url: row.logo_url ?? null,
            });
          }
        }
      }

      // Format gifts
      const formattedGifts = (finalGifts || []).map((gift: any) => {
        const meta = nameByBeneficiaryId.get(String(gift.beneficiary_id));
        return {
          id: gift.id,
          beneficiary_id: gift.beneficiary_id,
          beneficiary_name: meta?.name || "Unknown",
          charity_name: meta?.name || "Unknown",
          beneficiary_image_url: meta?.logo_url || null,
          amount: parseFloat(gift.amount || 0) || 0,
          net_amount: parseFloat(gift.net_amount || 0) || 0,
          status: gift.status,
          created_at: gift.created_at,
          date: new Date(gift.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          donor_message: gift.donor_message,
          is_anonymous: gift.is_anonymous,
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          gifts: formattedGifts,
          pagination: {
            page,
            limit,
            total: finalCount || 0,
            total_pages: Math.ceil((finalCount || 0) / limit),
          },
          summary: {
            total_given: totalGiven.toFixed(2),
            total_count: allGifts?.length || 0,
            this_month: thisMonthTotal.toFixed(2),
            this_year: thisYearTotal.toFixed(2),
            /** Alias for older clients expecting this_year_total */
            this_year_total: thisYearTotal.toFixed(2),
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Gift History Error:", error);
      return new Response(
        JSON.stringify({error: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // 404 for one-time gift routes
  return new Response(
    JSON.stringify({error: "One-time gift route not found"}),
    {
      headers: {"Content-Type": "application/json"},
      status: 404,
    },
  );
}

