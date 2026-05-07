import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";
import { createOrGetStripeCustomer, getStripeClient } from "../lib/stripe.ts";

export type CalculateProcessingFeeFn = (
  amount: number,
  userCoveredFees?: boolean,
) => {
  originalAmount: number;
  fee: number;
  totalAmount: number;
  netAmount: number;
};

export async function handleStripePaymentSheetRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  calculateProcessingFee: CalculateProcessingFeeFn,
) {
  // JWT auth — required for all stripe payment sheet endpoints
  const authHeader = getAppAuthHeader(req);
  let userId: number | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (jwtSecret) {
      try {
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );
        const payload = await verifyJWT(token, secretKey);
        userId = (payload.id || payload.userId) as number;
      } catch (_) {}
    }
  }

  // POST /stripe/payment-sheet/one-time — create PaymentIntent for a one-time gift
  if (method === "POST" && route === "/stripe/payment-sheet/one-time") {
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
        user_covered_fees: rawCovered,
      } = body;

      if (!beneficiary_id || !amount) {
        return new Response(
          JSON.stringify({error: "beneficiary_id and amount are required"}),
          {headers: {"Content-Type": "application/json"}, status: 400},
        );
      }

      const explicitCovered =
        rawCovered === true || rawCovered === "true" || rawCovered === 1;
      const explicitNotCovered =
        rawCovered === false || rawCovered === "false" || rawCovered === 0;
      const hasFeeFlag = "user_covered_fees" in body;
      let userCoveredFees = true;
      let donationAmount = parseFloat(amount);
      if (!Number.isFinite(donationAmount) || donationAmount < 1) {
        return new Response(JSON.stringify({error: "Invalid amount"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }
      if (explicitNotCovered) {
        userCoveredFees = false;
      } else if (explicitCovered) {
        userCoveredFees = true;
      } else if (!hasFeeFlag) {
        /**
         * Legacy checkout sent total card charge (donation + fee) with no flag.
         * If reversing fee math lands within a few cents of the total, treat as fee-inclusive; else base donation.
         */
        const total = donationAmount;
        const reversed =
          Math.round(((total - 0.3) / 1.029) * 100) / 100;
        const reconstructed = reversed * 1.029 + 0.3;
        if (
          Number.isFinite(reversed) &&
          reversed >= 1 &&
          Math.abs(reconstructed - total) < 0.06
        ) {
          donationAmount = reversed;
          userCoveredFees = true;
        } else {
          donationAmount = total;
          userCoveredFees = false;
        }
      }

      let beneficiary: any = null;
      const beneficiariesResult = await supabase
        .from("beneficiaries")
        .select("id, name")
        .eq("id", beneficiary_id)
        .single();
      if (!beneficiariesResult.error && beneficiariesResult.data) {
        beneficiary = beneficiariesResult.data;
      } else {
        const charitiesResult = await supabase
          .from("charities")
          .select("id, name")
          .eq("id", beneficiary_id)
          .single();
        beneficiary = charitiesResult.data;
        if (charitiesResult.error || !beneficiary) {
          return new Response(JSON.stringify({error: "Invalid beneficiary_id"}), {
            headers: {"Content-Type": "application/json"},
            status: 400,
          });
        }
      }

      if (donationAmount < 1 || donationAmount > 10000) {
        return new Response(
          JSON.stringify({error: "Amount must be between $1 and $10,000"}),
          {headers: {"Content-Type": "application/json"}, status: 400},
        );
      }

      const feeCalculation = calculateProcessingFee(
        donationAmount,
        userCoveredFees,
      );

      // Look up user
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("email, stripe_customer_id")
        .eq("id", userId)
        .single();

      if (userError || !user) {
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Get or create Stripe customer
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const stripeCustomer = await createOrGetStripeCustomer(user.email, userId);
        customerId = stripeCustomer.id;
        await supabase.from("users").update({stripe_customer_id: customerId}).eq("id", userId);
      }

      const stripe = getStripeClient();

      // Create ephemeral key for the customer (needed by Stripe Payment Sheet)
      const ephemeralFormData = new URLSearchParams();
      ephemeralFormData.append("customer", customerId);
      const ephemeralRes = await fetch(`${stripe.baseUrl}/ephemeral_keys`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripe.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": "2024-06-20",
        },
        body: ephemeralFormData.toString(),
      });

      if (!ephemeralRes.ok) {
        const err = await ephemeralRes.json();
        throw new Error(`Stripe ephemeral key error: ${err.error?.message || "unknown"}`);
      }
      const ephemeralKey = await ephemeralRes.json();

      // Create PaymentIntent for total charged (same as create-payment-intent)
      const piFormData = new URLSearchParams();
      piFormData.append(
        "amount",
        Math.round(feeCalculation.totalAmount * 100).toString(),
      );
      piFormData.append("currency", currency.toLowerCase());
      piFormData.append("customer", customerId);
      piFormData.append("automatic_payment_methods[enabled]", "true");
      piFormData.append("metadata[user_id]", userId.toString());
      piFormData.append("metadata[beneficiary_id]", beneficiary_id.toString());
      piFormData.append("metadata[source]", "one_time_gift");

      const piRes = await fetch(`${stripe.baseUrl}/payment_intents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripe.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: piFormData.toString(),
      });

      if (!piRes.ok) {
        const err = await piRes.json();
        throw new Error(`Stripe payment intent error: ${err.error?.message || "unknown"}`);
      }
      const paymentIntent = await piRes.json();

      /** Must exist before webhook runs — checkout used to skip this, so history was always empty */
      const {error: giftInsertError} = await supabase.from("one_time_gifts").insert([
        {
          user_id: userId,
          beneficiary_id,
          amount: feeCalculation.originalAmount,
          currency,
          stripe_payment_intent_id: paymentIntent.id,
          status: "pending",
          processing_fee: feeCalculation.fee,
          net_amount: feeCalculation.netAmount,
          user_covered_fees: userCoveredFees,
          donor_message: null,
          is_anonymous: false,
        },
      ]);

      if (giftInsertError) {
        console.error("❌ one_time_gifts insert (payment-sheet):", giftInsertError);
        try {
          await fetch(`${stripe.baseUrl}/payment_intents/${paymentIntent.id}/cancel`, {
            method: "POST",
            headers: {Authorization: `Bearer ${stripe.secretKey}`},
          });
        } catch (_) {}
        return new Response(
          JSON.stringify({
            error: "Failed to create gift record",
            details: giftInsertError.message,
          }),
          {headers: {"Content-Type": "application/json"}, status: 500},
        );
      }

      return new Response(
        JSON.stringify({
          paymentIntentClientSecret: paymentIntent.client_secret,
          customerId,
          customerEphemeralKeySecret: ephemeralKey.secret,
        }),
        {headers: {"Content-Type": "application/json"}, status: 200},
      );
    } catch (error: any) {
      console.error("Error creating one-time payment sheet:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to create payment sheet"}),
        {headers: {"Content-Type": "application/json"}, status: 500},
      );
    }
  }

  return new Response(JSON.stringify({error: "Route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

