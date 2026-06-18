import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader, getJwtPayload } from "../lib/jwt-app.ts";
import {
  createStripePaymentIntent,
  createOrGetStripeCustomer,
  createStripeSubscriptionSetup,
  getStripeClient,
  getStripeSubscriptionInvoicePaymentDetails,
} from "../lib/stripe.ts";

/**
 * Undo cancel-at-period-end: POST Stripe cancel_at_period_end=false and sync monthly_donations.status.
 * Also supports rows with no Stripe id but status cancelling (local-only).
 */
async function resumeMonthlySubscriptionCore(
  supabase: any,
  userId: number,
  rawIdentifier: string,
): Promise<Response> {
  const jsonHeaders: Record<string, string> = {"Content-Type": "application/json"};

  const raw = decodeURIComponent(String(rawIdentifier ?? "").trim());
  if (!raw) {
    return new Response(
      JSON.stringify({error: "Subscription id is required"}),
      {headers: jsonHeaders, status: 400},
    );
  }

  let subQuery = supabase
    .from("monthly_donations")
    .select("*")
    .eq("user_id", userId);

  if (/^\d+$/.test(raw)) {
    subQuery = subQuery.eq("id", parseInt(raw, 10));
  } else {
    subQuery = subQuery.eq("stripe_subscription_id", raw);
  }

  const {data: subscription, error: fetchError} = await subQuery.maybeSingle();

  if (fetchError || !subscription) {
    return new Response(JSON.stringify({error: "Subscription not found"}), {
      headers: jsonHeaders,
      status: 404,
    });
  }

  const rowId = subscription.id;
  const rowStatus = String(subscription.status || "").toLowerCase();

  if (!subscription.stripe_subscription_id) {
    if (rowStatus === "cancelling" || rowStatus === "canceling") {
      await supabase
        .from("monthly_donations")
        .update({status: "active"})
        .eq("id", rowId);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription will continue renewing.",
        }),
        {headers: jsonHeaders, status: 200},
      );
    }
    return new Response(
      JSON.stringify({
        error: "This subscription is not scheduled for cancellation.",
      }),
      {headers: jsonHeaders, status: 400},
    );
  }

  const stripe = getStripeClient();
  const stripeSubUrl = `${stripe.baseUrl}/subscriptions/${subscription.stripe_subscription_id}`;

  const resumeBody = new URLSearchParams();
  resumeBody.set("cancel_at_period_end", "false");
  const stripeRes = await fetch(stripeSubUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: resumeBody.toString(),
  });

  if (!stripeRes.ok) {
    const errText = await stripeRes.text().catch(() => "");
    const lowerErr = String(errText || "").toLowerCase();
    console.error(
      "Stripe subscription resume (cancel_at_period_end=false) failed:",
      stripeRes.status,
      errText,
    );
    // If Stripe says this subscription is already canceled/missing, undo is no longer possible.
    if (
      (stripeRes.status === 404 &&
        (lowerErr.includes("no such subscription") ||
          lowerErr.includes("resource_missing"))) ||
      (stripeRes.status === 400 &&
        (lowerErr.includes("already canceled") ||
          lowerErr.includes("cannot update a canceled subscription") ||
          lowerErr.includes("status of canceled")))
    ) {
      await supabase
        .from("monthly_donations")
        .update({status: "cancelled"})
        .eq("id", rowId);
      return new Response(
        JSON.stringify({
          error:
            "This subscription has already been canceled by the payment provider and can no longer be resumed.",
        }),
        {
          headers: jsonHeaders,
          status: 409,
        },
      );
    }

    // Some Stripe failures still leave sub active. Verify state before failing hard.
    try {
      const verifyRes = await fetch(stripeSubUrl, {
        method: "GET",
        headers: {Authorization: `Bearer ${stripe.secretKey}`},
      });
      if (verifyRes.ok) {
        const verifyJson = (await verifyRes.json().catch(() => null)) as {
          status?: string;
          cancel_at_period_end?: boolean;
        } | null;
        const verifyStatus = String(verifyJson?.status || "").toLowerCase();
        const stillActiveish =
          ["active", "trialing", "past_due", "incomplete", "unpaid", "pending"].includes(
            verifyStatus,
          ) && !Boolean(verifyJson?.cancel_at_period_end);
        if (stillActiveish) {
          await supabase
            .from("monthly_donations")
            .update({status: verifyStatus === "pending" ? "pending" : "active"})
            .eq("id", rowId);
          return new Response(
            JSON.stringify({
              success: true,
              message: "Subscription will continue renewing.",
            }),
            {headers: jsonHeaders, status: 200},
          );
        }
      }
    } catch (verifyErr) {
      console.error("Stripe resume verify step failed:", verifyErr);
    }

    const conciseProviderError =
      String(errText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240) || null;
    return new Response(
      JSON.stringify({
        error: conciseProviderError
          ? `Unable to update subscription with payment provider: ${conciseProviderError}`
          : "Unable to update subscription with payment provider; try again or contact support.",
      }),
      {
        headers: jsonHeaders,
        status: 502,
      },
    );
  }

  const subJson = (await stripeRes.json().catch(() => null)) as {
    status?: string;
  } | null;
  const stripeSt = String(subJson?.status || "").toLowerCase();
  if (stripeSt === "canceled" || stripeSt === "incomplete_expired") {
    await supabase.from("monthly_donations").update({status: "cancelled"}).eq("id", rowId);
    return new Response(
      JSON.stringify({
        error:
          "This subscription has already been canceled by the payment provider and can no longer be resumed.",
      }),
      {headers: jsonHeaders, status: 409},
    );
  }
  const allowedDb = new Set([
    "active",
    "trialing",
    "pending",
    "past_due",
    "incomplete",
    "unpaid",
  ]);
  const nextStatus = allowedDb.has(stripeSt) ? stripeSt : "active";

  await supabase.from("monthly_donations").update({status: nextStatus}).eq("id", rowId);

  return new Response(
    JSON.stringify({
      success: true,
      message: "Subscription will continue renewing.",
    }),
    {headers: jsonHeaders, status: 200},
  );
}

export async function handleDonationRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /donations (public)
  if (method === "GET" && route === "/donations") {
    try {
      const {data: donations, error} = await supabase
        .from("donations")
        .select(
          `
          *,
          charity:charities (
            id,
            name,
            logo_url
          ),
          donor:users!donor_id (
            id,
            email,
            first_name,
            last_name
          )
        `,
        )
        .order("created_at", {ascending: false});

      if (error) {
        console.error("Error fetching donations:", error);
        return new Response(
          JSON.stringify({
            success: false,
            message: "Failed to fetch donations",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Format donations for API response
      const formattedDonations = (donations || []).map((donation: any) => ({
        id: donation.id,
        donor_id: donation.donor_id,
        charity_id: donation.charity_id,
        amount: donation.amount,
        stripe_subscription_id: donation.stripe_subscription_id,
        status: donation.status,
        created_at: donation.created_at,
        updated_at: donation.updated_at,
        charity_name: donation.charity?.name || null,
        donor_email: donation.donor?.email || null,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          data: formattedDonations,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching donations:", error);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to fetch donations",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /donations (requires auth - creates donation with Stripe)
  if (method === "POST" && route === "/donations") {
    try {
      const body = await req.json();
      const {charityId, amount, priceId} = body;

      if (!charityId || !amount || !priceId) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Charity ID, amount, and Stripe price ID are required",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const authHeader = getAppAuthHeader(req);
      const payload = await getJwtPayload(authHeader);
      if (!payload?.id) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Authentication required. JWT token must be provided.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const {data: charity, error: charityError} = await supabase
        .from("charities")
        .select("id, name")
        .eq("id", charityId)
        .single();

      if (charityError || !charity) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invalid charity ID",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const donationPayload: any = {
        donor_id: payload.id,
        charity_id: charityId,
        amount: parseFloat(amount),
        status: "pending",
      };

      try {
        const paymentIntent = await createStripePaymentIntent(
          parseFloat(amount),
          "usd",
          {
            donor_id: payload.id.toString(),
            charity_id: charityId.toString(),
            price_id: priceId?.toString() || "none",
          },
        );

        donationPayload.stripe_payment_intent_id = paymentIntent.id;
        donationPayload.status =
          paymentIntent.status === "succeeded" ? "completed" : "pending";
      } catch (stripeError) {
        console.warn(
          "⚠️ Stripe payment intent failed, saving donation without Stripe id:",
          stripeError,
        );
      }

      let {data: donation, error: donationError} = await supabase
        .from("donations")
        .insert([donationPayload])
        .select()
        .single();

      if (donationError) {
        if (donationError.message?.includes("stripe_payment_intent_id")) {
          const retryPayload = {...donationPayload};
          delete retryPayload.stripe_payment_intent_id;
          ({data: donation, error: donationError} = await supabase
            .from("donations")
            .insert([retryPayload])
            .select()
            .single());
        }
      }

      if (donationError) {
        console.error("Error creating donation:", donationError);
        return new Response(
          JSON.stringify({
            success: false,
            message: "Failed to create donation",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: donation,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating donation:", error);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to create donation",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /donations/my-donations (requires auth)
  if (method === "GET" && route === "/donations/my-donations") {
    try {
      const authHeader = getAppAuthHeader(req);
      const payload = await getJwtPayload(authHeader);
      if (!payload?.id) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Authentication required. JWT token must be provided.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const {data: donations, error} = await supabase
        .from("donations")
        .select(
          `
          *,
          charity:charities (
            id,
            name,
            logo_url
          )
        `,
        )
        .eq("donor_id", payload.id)
        .order("created_at", {ascending: false});

      if (error) {
        console.error("Error fetching user donations:", error);
        return new Response(
          JSON.stringify({
            success: false,
            message: "Failed to fetch donations",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: donations || [],
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching user donations:", error);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to fetch donations",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // ============================================
  // MONTHLY DONATIONS ENDPOINTS
  // ============================================

  // Get user ID from JWT token
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
        userId = ((payload as any).id ?? (payload as any).userId) as number;
      } catch (error) {
        // Invalid token - will be handled per endpoint
      }
    }
  }

  // POST /donations/monthly/subscribe
  if (method === "POST" && route === "/donations/monthly/subscribe") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const body = await req.json();
      const {beneficiary_id, amount, currency = "USD"} = body;
      // "Save my spot" intent — donor picked THRIVE because they haven't
      // chosen a cause yet. We tag the subscription so we can prompt them
      // to choose later and release prior held transactions when they do.
      // Sanity: only meaningful when the chosen beneficiary IS THRIVE itself;
      // otherwise we silently ignore the flag.
      const heldForDonorChoiceRaw = body.held_for_donor_choice === true || body.heldForDonorChoice === true;

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

      // Get user email
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("email, stripe_customer_id, preferences")
        .eq("id", userId)
        .single();

      if (userError || !user) {
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      const jsonHeaders = {"Content-Type": "application/json"};

      // Paid subscription — signup can finish without charging again.
      const {data: paidSubs} = await supabase
        .from("monthly_donations")
        .select("id, status, amount, beneficiary_id, next_payment_date, stripe_subscription_id")
        .eq("user_id", userId)
        .in("status", ["active", "trialing"])
        .limit(1);

      if (paidSubs && paidSubs.length > 0) {
        const existing = paidSubs[0];
        return new Response(
          JSON.stringify({
            error: "You already have an active subscription",
            code: "SUBSCRIPTION_EXISTS",
            existing: {
              id: existing.id,
              status: existing.status,
              amount: existing.amount,
              beneficiary_id: existing.beneficiary_id,
              next_payment_date: existing.next_payment_date,
            },
          }),
          {headers: jsonHeaders, status: 409},
        );
      }

      // Unpaid / incomplete row from a prior signup attempt — resume Payment Sheet instead of skipping to home.
      const {data: unpaidSubs} = await supabase
        .from("monthly_donations")
        .select(
          "id, status, amount, beneficiary_id, next_payment_date, stripe_subscription_id, stripe_customer_id",
        )
        .eq("user_id", userId)
        .in("status", ["pending", "incomplete", "past_due", "unpaid"])
        .order("id", {ascending: false})
        .limit(1);

      if (unpaidSubs && unpaidSubs.length > 0) {
        const existing = unpaidSubs[0];
        const resumeCustomerId =
          existing.stripe_customer_id || user.stripe_customer_id;

        if (existing.stripe_subscription_id && resumeCustomerId) {
          const paymentDetails = await getStripeSubscriptionInvoicePaymentDetails(
            existing.stripe_subscription_id,
          );

          if (paymentDetails.paymentIntentStatus === "succeeded") {
            await supabase
              .from("monthly_donations")
              .update({status: "active"})
              .eq("id", existing.id);
            return new Response(
              JSON.stringify({
                error: "You already have an active subscription",
                code: "SUBSCRIPTION_EXISTS",
                existing: {
                  id: existing.id,
                  status: "active",
                  amount: existing.amount,
                  beneficiary_id: existing.beneficiary_id,
                  next_payment_date: existing.next_payment_date,
                },
              }),
              {headers: jsonHeaders, status: 409},
            );
          }

          if (paymentDetails.clientSecret) {
            let customerEphemeralKeySecret: string | null = null;
            try {
              const stripe = getStripeClient();
              const ephemeralFormData = new URLSearchParams();
              ephemeralFormData.append("customer", resumeCustomerId);
              const ephemeralRes = await fetch(`${stripe.baseUrl}/ephemeral_keys`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${stripe.secretKey}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Stripe-Version": "2024-06-20",
                },
                body: ephemeralFormData.toString(),
              });
              if (ephemeralRes.ok) {
                const ek = await ephemeralRes.json();
                customerEphemeralKeySecret = ek.secret || null;
              }
            } catch (e) {
              console.warn("Ephemeral key (resume subscribe) failed:", e);
            }

            return new Response(
              JSON.stringify({
                success: true,
                resumedIncompletePayment: true,
                paymentIntentClientSecret: paymentDetails.clientSecret,
                paymentIntentAmountCents: paymentDetails.paymentIntentAmountCents,
                paymentIntentAmountUsd: paymentDetails.paymentIntentAmountUsd,
                customerId: resumeCustomerId,
                customerEphemeralKeySecret,
                subscription: {
                  id: existing.id,
                  subscriptionId: existing.stripe_subscription_id,
                  clientSecret: paymentDetails.clientSecret,
                  status: existing.status,
                  amount: existing.amount,
                  beneficiary_id: existing.beneficiary_id,
                  next_payment_date: existing.next_payment_date,
                  requiresPaymentMethod: true,
                },
              }),
              {headers: jsonHeaders, status: 200},
            );
          }
        }

        // Orphan or unrecoverable row — remove so a fresh subscription can be created.
        await supabase.from("monthly_donations").delete().eq("id", existing.id);
      }

      // Get or create Stripe customer
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const stripeCustomer = await createOrGetStripeCustomer(
          user.email,
          userId,
        );
        customerId = stripeCustomer.id;

        // Save customer ID to user
        await supabase
          .from("users")
          .update({stripe_customer_id: customerId})
          .eq("id", userId);
      }

      // Create Stripe subscription
      const subscription = await createStripeSubscriptionSetup(
        customerId,
        parseFloat(amount),
        currency.toLowerCase(),
        {
          user_id: userId.toString(),
          beneficiary_id: beneficiary_id.toString(),
          source: "monthly_subscription",
        },
      );

      // Calculate next payment date (1 month from now)
      const nextPaymentDate = new Date();
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      // Only set held_for_donor_choice when the chosen beneficiary is the
      // THRIVE Initiative row — otherwise the flag would be meaningless.
      let heldForDonorChoice = false;
      if (heldForDonorChoiceRaw) {
        const { data: chosenCharity } = await supabase
          .from("charities")
          .select("id, is_thrive")
          .eq("id", beneficiary_id)
          .maybeSingle();
        heldForDonorChoice = !!chosenCharity?.is_thrive;
      }

      // Save to database
      const {data: monthlyDonation, error: dbError} = await supabase
        .from("monthly_donations")
        .insert([
          {
            user_id: userId,
            beneficiary_id: beneficiary_id,
            amount: parseFloat(amount),
            currency: currency,
            stripe_subscription_id: subscription.subscriptionId,
            stripe_customer_id: customerId,
            status: subscription.status === "incomplete" ? "pending" : "active",
            next_payment_date: nextPaymentDate.toISOString().split("T")[0],
            held_for_donor_choice: heldForDonorChoice,
          },
        ])
        .select()
        .single();

      if (dbError) {
        console.error("Error saving monthly donation:", dbError);
        return new Response(
          JSON.stringify({error: "Failed to save subscription"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Persist the chosen beneficiary AND the monthly donation amount on the
      // user record so the admin donors list (which reads total_monthly_donation
      // / preferences.donationAmount) reflects the active subscription.
      try {
        const updatedPreferences = {
          ...(user.preferences || {}),
          preferredCharity: beneficiary_id,
          donationAmount: amount,
        };
        await supabase
          .from("users")
          .update({
            preferences: updatedPreferences,
            total_monthly_donation: amount,
          })
          .eq("id", userId);
      } catch (e) {
        console.warn("Could not update user record after subscribe:", e);
      }

      // Ephemeral key helps Stripe Payment Sheet (especially Apple Pay) attach to customer
      let customerEphemeralKeySecret: string | null = null;
      try {
        const stripe = getStripeClient();
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
        if (ephemeralRes.ok) {
          const ek = await ephemeralRes.json();
          customerEphemeralKeySecret = ek.secret || null;
        } else {
          const errText = await ephemeralRes.text();
          console.warn("Ephemeral key (subscribe) non-OK:", ephemeralRes.status, errText);
        }
      } catch (e) {
        console.warn("Ephemeral key (subscribe) failed:", e);
      }

      const clientSecret = subscription.clientSecret || null;
      if (!clientSecret) {
        console.error("Monthly subscribe: missing PaymentIntent client_secret after Stripe create");
        return new Response(
          JSON.stringify({
            error:
              "Subscription created but payment could not be initialized. Try again or use a card.",
          }),
          {headers: {"Content-Type": "application/json"}, status: 500},
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentIntentClientSecret: clientSecret,
          paymentIntentAmountCents: subscription.paymentIntentAmountCents,
          paymentIntentAmountUsd: subscription.paymentIntentAmountUsd,
          customerId,
          customerEphemeralKeySecret,
          subscription: {
            id: monthlyDonation.id,
            subscriptionId: subscription.subscriptionId,
            clientSecret,
            status: monthlyDonation.status,
            amount: monthlyDonation.amount,
            beneficiary_id: monthlyDonation.beneficiary_id,
            next_payment_date: monthlyDonation.next_payment_date,
            requiresPaymentMethod: subscription.status === "incomplete",
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to create subscription",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /donations/monthly/redirect — donor in "Save my spot" mode picks
  // their real cause. Updates the active monthly_donation's beneficiary,
  // clears the held flag, and releases every prior held transaction to the
  // new cause via a single bookkeeping transaction. Donor preferences are
  // also updated so the home screen reflects the new cause everywhere.
  if (method === "POST" && route === "/donations/monthly/redirect") {
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      });
    }

    try {
      const body = await req.json();
      const newBeneficiaryId = parseInt(body.beneficiary_id ?? body.beneficiaryId, 10);
      if (!newBeneficiaryId) {
        return new Response(
          JSON.stringify({ error: "beneficiary_id is required" }),
          { headers: { "Content-Type": "application/json" }, status: 400 },
        );
      }

      // Sanity — the new cause must NOT be THRIVE (that would be a no-op).
      const { data: newCharity } = await supabase
        .from("charities")
        .select("id, name, is_thrive, is_active")
        .eq("id", newBeneficiaryId)
        .maybeSingle();
      if (!newCharity || !newCharity.is_active) {
        return new Response(
          JSON.stringify({ error: "Charity not found or inactive" }),
          { headers: { "Content-Type": "application/json" }, status: 404 },
        );
      }
      if (newCharity.is_thrive) {
        return new Response(
          JSON.stringify({ error: "Already supporting THRIVE — pick a different cause to redirect held funds" }),
          { headers: { "Content-Type": "application/json" }, status: 400 },
        );
      }

      // Find the donor's active monthly_donation that's currently held.
      const { data: heldSub } = await supabase
        .from("monthly_donations")
        .select("id, beneficiary_id, held_for_donor_choice, status")
        .eq("user_id", userId)
        .eq("held_for_donor_choice", true)
        .in("status", ["active", "trialing", "past_due", "incomplete", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Sum unreleased held transactions for this user. We do this regardless
      // of whether the active sub is still in held mode — if a donor canceled
      // their held sub and is making a fresh choice later, we still want to
      // route the prior held charges to their pick.
      const { data: heldTxns } = await supabase
        .from("transactions")
        .select("id, amount")
        .eq("user_id", userId)
        .eq("held_for_donor_choice", true)
        .is("released_at", null);

      const heldTotal = (heldTxns || []).reduce(
        (sum: number, t: any) => sum + parseFloat(t.amount || 0),
        0,
      );
      const heldTxnIds = (heldTxns || []).map((t: any) => t.id);

      // Flip the active subscription to the new cause (if one exists).
      if (heldSub) {
        await supabase
          .from("monthly_donations")
          .update({
            beneficiary_id: newBeneficiaryId,
            held_for_donor_choice: false,
          })
          .eq("id", heldSub.id);
      }

      // Update user preferences so the home tab + admin reflect the new pick.
      const { data: userRow } = await supabase
        .from("users")
        .select("preferences")
        .eq("id", userId)
        .maybeSingle();
      const newPrefs = {
        ...(userRow?.preferences || {}),
        beneficiary: newBeneficiaryId,
        preferredCharity: newBeneficiaryId,
      };
      await supabase.from("users").update({ preferences: newPrefs }).eq("id", userId);

      // If there's anything to release, write the release transaction and
      // mark every contributing transaction as released to the new cause.
      let releaseTxnId: number | null = null;
      if (heldTotal > 0 && heldTxnIds.length > 0) {
        const { data: releaseTxn } = await supabase
          .from("transactions")
          .insert({
            user_id: userId,
            type: "held_release",
            amount: heldTotal,
            description: `Released held donations to ${newCharity.name}`,
            beneficiary_id: newBeneficiaryId,
            status: "completed",
            reference_type: "donation",
          })
          .select("id")
          .single();
        releaseTxnId = releaseTxn?.id ?? null;

        await supabase
          .from("transactions")
          .update({
            released_at: new Date().toISOString(),
            released_to_charity_id: newBeneficiaryId,
          })
          .in("id", heldTxnIds);
      }

      return new Response(
        JSON.stringify({
          success: true,
          beneficiary: { id: newBeneficiaryId, name: newCharity.name },
          released_amount: heldTotal,
          released_transaction_count: heldTxnIds.length,
          release_transaction_id: releaseTxnId,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    } catch (error: any) {
      console.error("Error redirecting held donations:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Could not redirect" }),
        { headers: { "Content-Type": "application/json" }, status: 500 },
      );
    }
  }

  // GET /donations/monthly/held-balance — used by the home tab to show the
  // "Saving your spot" banner when the donor has unreleased held transactions.
  if (method === "GET" && route === "/donations/monthly/held-balance") {
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      });
    }
    try {
      const { data: heldTxns } = await supabase
        .from("transactions")
        .select("id, amount")
        .eq("user_id", userId)
        .eq("held_for_donor_choice", true)
        .is("released_at", null);
      const total = (heldTxns || []).reduce(
        (s: number, t: any) => s + parseFloat(t.amount || 0),
        0,
      );

      // Also expose whether the active subscription is in held mode, so the
      // home tab can show the banner even before the first charge lands.
      const { data: heldSub } = await supabase
        .from("monthly_donations")
        .select("id, amount, held_for_donor_choice")
        .eq("user_id", userId)
        .eq("held_for_donor_choice", true)
        .in("status", ["active", "trialing", "past_due", "incomplete", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          balance: Math.round(total * 100) / 100,
          transaction_count: (heldTxns || []).length,
          subscription_held: !!heldSub,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    } catch (error: any) {
      console.error("Error fetching held balance:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Could not fetch held balance" }),
        { headers: { "Content-Type": "application/json" }, status: 500 },
      );
    }
  }

  // POST /donations/monthly/sync-status — after Payment Sheet success, align DB with Stripe
  if (method === "POST" && route === "/donations/monthly/sync-status") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const {data: rows} = await supabase
        .from("monthly_donations")
        .select("id, status, stripe_subscription_id")
        .eq("user_id", userId)
        .order("id", {ascending: false})
        .limit(5);

      const list = rows || [];
      const paidStatuses = new Set(["active", "trialing"]);
      const alreadyPaid = list.find((r) =>
        paidStatuses.has(String(r.status || "").toLowerCase()),
      );
      if (alreadyPaid) {
        return new Response(
          JSON.stringify({paid: true, status: alreadyPaid.status}),
          {headers: {"Content-Type": "application/json"}, status: 200},
        );
      }

      const unpaid = list.find((r) =>
        ["pending", "incomplete", "past_due", "unpaid"].includes(
          String(r.status || "").toLowerCase(),
        ),
      );

      if (!unpaid?.stripe_subscription_id) {
        return new Response(
          JSON.stringify({paid: false, reason: "no_subscription"}),
          {headers: {"Content-Type": "application/json"}, status: 200},
        );
      }

      const details = await getStripeSubscriptionInvoicePaymentDetails(
        unpaid.stripe_subscription_id,
      );
      const stripeSubSt = String(details.subscriptionStatus || "").toLowerCase();
      const piSt = String(details.paymentIntentStatus || "").toLowerCase();
      const paidOnStripe =
        paidStatuses.has(stripeSubSt) ||
        piSt === "succeeded" ||
        piSt === "processing";

      if (paidOnStripe) {
        const nextStatus = paidStatuses.has(stripeSubSt) ? stripeSubSt : "active";
        // Stamp the first payment so admin reporting picks this donor up in the
        // current billing month even if the Stripe webhook hasn't landed yet.
        const today = new Date().toISOString().split("T")[0];
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const paymentAmount = details.paymentIntentAmountUsd
          ? parseFloat(details.paymentIntentAmountUsd)
          : null;
        const updatePayload: Record<string, any> = {
          status: nextStatus,
          last_payment_date: today,
          next_payment_date: nextMonth.toISOString().split("T")[0],
        };
        if (paymentAmount != null && !Number.isNaN(paymentAmount)) {
          updatePayload.last_payment_amount = paymentAmount;
        }
        // Best-effort: pull the real Stripe processing fee for this charge so
        // admin reporting can show what Stripe actually took. Don't block the
        // sync response on this — webhook + backfill will catch any misses.
        try {
          const subRes = await fetch(
            `${getStripeClient().baseUrl}/subscriptions/${encodeURIComponent(unpaid.stripe_subscription_id)}?expand[]=latest_invoice`,
            {
              headers: {
                Authorization: `Bearer ${getStripeClient().secretKey}`,
              },
            },
          );
          if (subRes.ok) {
            const sub = await subRes.json();
            const chargeId =
              typeof sub.latest_invoice?.charge === "string"
                ? sub.latest_invoice.charge
                : sub.latest_invoice?.charge?.id;
            if (chargeId) {
              const chargeRes = await fetch(
                `${getStripeClient().baseUrl}/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
                {
                  headers: {
                    Authorization: `Bearer ${getStripeClient().secretKey}`,
                  },
                },
              );
              if (chargeRes.ok) {
                const charge = await chargeRes.json();
                if (typeof charge.balance_transaction?.fee === "number") {
                  updatePayload.processing_fee = charge.balance_transaction.fee / 100;
                }
              }
            }
          }
        } catch (_e) {
          // Swallow — non-critical, backfill will catch later.
        }
        await supabase
          .from("monthly_donations")
          .update(updatePayload)
          .eq("id", unpaid.id);
        return new Response(
          JSON.stringify({paid: true, status: nextStatus}),
          {headers: {"Content-Type": "application/json"}, status: 200},
        );
      }

      return new Response(
        JSON.stringify({
          paid: false,
          reason: "payment_incomplete",
          paymentIntentStatus: details.paymentIntentStatus,
          subscriptionStatus: details.subscriptionStatus,
        }),
        {headers: {"Content-Type": "application/json"}, status: 200},
      );
    } catch (error: any) {
      console.error("sync-status error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to sync payment status"}),
        {headers: {"Content-Type": "application/json"}, status: 500},
      );
    }
  }

  // GET /donations/monthly
  if (method === "GET" && route === "/donations/monthly") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const {data: subscriptions, error} = await supabase
        .from("monthly_donations")
        .select(
          `
          *,
          beneficiary:charities (
            id,
            name,
            logo_url
          )
        `,
        )
        .eq("user_id", userId)
        .order("created_at", {ascending: false});

      if (error) {
        console.error("Error fetching subscriptions:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch subscriptions"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          subscriptions: (subscriptions || []).map((sub: any) => ({
            id: sub.id,
            beneficiary_id: sub.beneficiary_id,
            amount: parseFloat(sub.amount),
            currency: sub.currency,
            status: sub.status,
            next_payment_date: sub.next_payment_date,
            last_payment_date: sub.last_payment_date,
            last_payment_amount: sub.last_payment_amount
              ? parseFloat(sub.last_payment_amount)
              : null,
            stripe_subscription_id: sub.stripe_subscription_id ?? null,
            charity_name: sub.beneficiary?.name ?? null,
            beneficiary: sub.beneficiary || null,
            created_at: sub.created_at,
          })),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch subscriptions"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /donations/monthly/billing-preview — live Stripe amounts + period dates (no client cache)
  if (method === "GET" && route === "/donations/monthly/billing-preview") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const url = new URL(req.url);
      const monthlyDonationIdParam = url.searchParams.get("monthly_donation_id");

      const {data: mdRows, error: mdError} = await supabase
        .from("monthly_donations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", {ascending: false});

      if (mdError) {
        console.error("billing-preview monthly_donations error:", mdError);
        return new Response(
          JSON.stringify({error: "Failed to load monthly donations"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const rows = mdRows || [];
      let row: any = null;
      if (monthlyDonationIdParam) {
        const mid = parseInt(monthlyDonationIdParam, 10);
        if (!Number.isNaN(mid)) {
          row = rows.find((r: any) => r.id === mid) || null;
        }
      }
      if (!row) {
        row =
          rows.find((r: any) => r.stripe_subscription_id) || rows[0] || null;
      }

      if (!row?.stripe_subscription_id) {
        return new Response(
          JSON.stringify({
            success: true,
            billing: null,
            subscription: null,
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      }

      const {data: dbUser} = await supabase
        .from("users")
        .select("stripe_customer_id")
        .eq("id", userId)
        .single();

      const customerId = row.stripe_customer_id || dbUser?.stripe_customer_id;
      if (!customerId) {
        return new Response(
          JSON.stringify({
            success: true,
            billing: null,
            subscription: {
              id: row.id,
              stripe_subscription_id: row.stripe_subscription_id,
              status: row.status,
            },
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      }

      const stripe = getStripeClient();
      const subId = row.stripe_subscription_id;

      const subRes = await fetch(
        `${stripe.baseUrl}/subscriptions/${subId}?expand[]=latest_invoice`,
        {
          method: "GET",
          headers: {Authorization: `Bearer ${stripe.secretKey}`},
        },
      );

      if (!subRes.ok) {
        const errText = await subRes.text();
        console.error("Stripe subscription fetch failed:", subRes.status, errText);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch subscription from Stripe",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 502,
          },
        );
      }

      const subJson = await subRes.json();

      const sumRecurring = (s: any) => {
        let total = 0;
        for (const item of s.items?.data || []) {
          const ua = item.price?.unit_amount;
          if (ua != null) {
            total += (ua * (item.quantity || 1)) / 100;
          }
        }
        return total;
      };

      const nextRecurring = sumRecurring(subJson);

      const upcomingParams = new URLSearchParams({
        customer: customerId,
        subscription: subId,
      });
      const upRes = await fetch(
        `${stripe.baseUrl}/invoices/upcoming?${upcomingParams.toString()}`,
        {
          method: "GET",
          headers: {Authorization: `Bearer ${stripe.secretKey}`},
        },
      );

      let upcomingInvoice: any = null;
      let currentAmount = nextRecurring;
      if (upRes.ok) {
        upcomingInvoice = await upRes.json();
        const cents =
          upcomingInvoice.amount_due != null
            ? upcomingInvoice.amount_due
            : upcomingInvoice.total ?? null;
        if (cents != null && typeof cents === "number") {
          currentAmount = cents / 100;
        }
      }

      const fmtDate = (unix: number | string | undefined | null) => {
        if (unix == null || unix === "") return null;
        const n = typeof unix === "string" ? parseInt(unix, 10) : Number(unix);
        if (!Number.isFinite(n) || n <= 0) return null;
        return new Date(n * 1000).toISOString().split("T")[0];
      };

      // Incomplete/pending subs may omit current_period_*; use start_date / upcoming invoice periods
      let periodStartUnix: number | null =
        subJson.current_period_start != null
          ? Number(subJson.current_period_start)
          : null;
      let periodEndUnix: number | null =
        subJson.current_period_end != null
          ? Number(subJson.current_period_end)
          : null;

      if (periodStartUnix == null && subJson.start_date != null) {
        const sd = Number(subJson.start_date);
        if (Number.isFinite(sd) && sd > 0) periodStartUnix = sd;
      }
      if (upcomingInvoice) {
        const ips = upcomingInvoice.period_start;
        const ipe = upcomingInvoice.period_end;
        if (ips != null && periodStartUnix == null) {
          const n = Number(ips);
          if (Number.isFinite(n) && n > 0) periodStartUnix = n;
        }
        if (ipe != null && periodEndUnix == null) {
          const n = Number(ipe);
          if (Number.isFinite(n) && n > 0) periodEndUnix = n;
        }
      }

      let periodStartStr = fmtDate(periodStartUnix);
      let periodEndStr = fmtDate(periodEndUnix);

      // DB often has next_payment_date when Stripe omits period fields (e.g. incomplete/pending)
      if (!periodEndStr && row.next_payment_date) {
        periodEndStr = String(row.next_payment_date).split("T")[0];
      }
      if (!periodStartStr && periodEndStr) {
        try {
          const end = new Date(`${periodEndStr}T12:00:00`);
          if (!Number.isNaN(end.getTime())) {
            const start = new Date(end);
            start.setMonth(start.getMonth() - 1);
            periodStartStr = start.toISOString().split("T")[0];
          }
        } catch (_) {
          /* ignore */
        }
      }

      const billing = {
        current_amount: currentAmount,
        next_amount: nextRecurring,
        current_period_start: periodStartStr,
        current_period_end: periodEndStr,
        // When plan/amount change applies at next cycle; align with period end if Stripe does not send a separate field
        effective_from: periodEndStr,
      };

      return new Response(
        JSON.stringify({
          success: true,
          billing,
          subscription: {
            id: row.id,
            amount: parseFloat(row.amount),
            status: row.status,
            stripe_subscription_id: subId,
            cancel_at_period_end: Boolean(subJson?.cancel_at_period_end),
            cancel_at: subJson?.cancel_at ?? null,
            beneficiary_id: row.beneficiary_id,
            currency: row.currency,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("billing-preview error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to load billing preview",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // PUT /donations/monthly/amount
  if (method === "PUT" && route === "/donations/monthly/amount") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const body = await req.json();
      const {subscription_id, amount} = body;

      if (!subscription_id || !amount) {
        return new Response(
          JSON.stringify({error: "subscription_id and amount are required"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Get existing subscription
      const {data: existing, error: fetchError} = await supabase
        .from("monthly_donations")
        .select("*")
        .eq("id", subscription_id)
        .eq("user_id", userId)
        .single();

      if (fetchError || !existing) {
        return new Response(JSON.stringify({error: "Subscription not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Cancel old Stripe subscription
      if (existing.stripe_subscription_id) {
        const stripe = getStripeClient();
        await fetch(
          `${stripe.baseUrl}/subscriptions/${existing.stripe_subscription_id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${stripe.secretKey}`,
            },
          },
        );
      }

      // Create new subscription with new amount
      const subscription = await createStripeSubscriptionSetup(
        existing.stripe_customer_id,
        parseFloat(amount),
        existing.currency.toLowerCase(),
        {
          user_id: userId.toString(),
          beneficiary_id: existing.beneficiary_id?.toString() || "",
          source: "update_amount",
        },
      );

      // Calculate next payment date
      const nextPaymentDate = new Date();
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      // Update database
      const {data: updated, error: updateError} = await supabase
        .from("monthly_donations")
        .update({
          amount: parseFloat(amount),
          stripe_subscription_id: subscription.subscriptionId,
          status: subscription.status === "incomplete" ? "pending" : "active",
          next_payment_date: nextPaymentDate.toISOString().split("T")[0],
        })
        .eq("id", subscription_id)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({error: "Failed to update subscription"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          subscription: {
            id: updated.id,
            subscriptionId: subscription.subscriptionId,
            clientSecret: subscription.clientSecret,
            status: updated.status,
            amount: updated.amount,
            requiresPaymentMethod: subscription.status === "incomplete",
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("Error updating subscription:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to update subscription",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /donations/monthly/summary
  if (method === "GET" && route === "/donations/monthly/summary") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const {data: subscriptions, error} = await supabase
        .from("monthly_donations")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active");

      if (error) {
        return new Response(
          JSON.stringify({error: "Failed to fetch subscriptions"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const totalMonthly = (subscriptions || []).reduce(
        (sum: number, sub: any) => sum + parseFloat(sub.amount || 0),
        0,
      );

      // Get transaction history for monthly donations
      const {data: transactions} = await supabase
        .from("transactions")
        .select("amount, created_at")
        .eq("user_id", userId)
        .eq("type", "monthly_donation")
        .eq("status", "completed")
        .order("created_at", {ascending: false})
        .limit(12);

      const monthlyBreakdown = (transactions || []).map((t: any) => ({
        month: new Date(t.created_at).toISOString().substring(0, 7),
        amount: parseFloat(t.amount || 0),
      }));

      return new Response(
        JSON.stringify({
          success: true,
          summary: {
            total_monthly_amount: totalMonthly,
            active_subscriptions: subscriptions?.length || 0,
            monthly_breakdown: monthlyBreakdown,
            total_donated: monthlyBreakdown.reduce(
              (sum: number, m: any) => sum + m.amount,
              0,
            ),
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching summary:", error);
      return new Response(JSON.stringify({error: "Failed to fetch summary"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // POST /donations/monthly/subscription/resume — JSON body monthly_donation_id (preferred vs extra path segments)
  if (method === "POST" && route === "/donations/monthly/subscription/resume") {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const body = await req.json().catch(() => ({}));
      const rid =
        body?.monthly_donation_id ??
        body?.subscription_id ??
        body?.subscriptionId ??
        "";
      return resumeMonthlySubscriptionCore(supabase, userId, String(rid));
    } catch (error: any) {
      console.error("Error resuming subscription (body route):", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to resume subscription",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /donations/monthly/subscription/:identifier/resume — undo cancel-at-period-end
  const resumeSubscriptionMatch = route.match(
    /^\/donations\/monthly\/subscription\/([^/?#]+)\/resume$/,
  );
  if (method === "POST" && resumeSubscriptionMatch) {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const raw = decodeURIComponent(resumeSubscriptionMatch[1] || "");
      return resumeMonthlySubscriptionCore(supabase, userId, raw);
    } catch (error: any) {
      console.error("Error resuming subscription:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to resume subscription",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // DELETE /donations/monthly/subscription/:identifier
  // Identifier: monthly_donations.id (digits) OR stripe_subscription_id (e.g. sub_xxx).
  const deleteSubscriptionMatch = route.match(
    /^\/donations\/monthly\/subscription\/([^/?#]+)$/,
  );
  if (method === "DELETE" && deleteSubscriptionMatch) {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const raw = decodeURIComponent(deleteSubscriptionMatch[1] || "");

      let subQuery = supabase
        .from("monthly_donations")
        .select("*")
        .eq("user_id", userId);

      if (/^\d+$/.test(raw)) {
        subQuery = subQuery.eq("id", parseInt(raw, 10));
      } else {
        subQuery = subQuery.eq("stripe_subscription_id", raw);
      }

      const {data: subscription, error: fetchError} = await subQuery.maybeSingle();

      if (fetchError || !subscription) {
        return new Response(JSON.stringify({error: "Subscription not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      const rowId = subscription.id;

      // Schedule cancel at period end (matches in-app copy). Avoid Stripe DELETE sub (immediate cancel).
      if (subscription.stripe_subscription_id) {
        const stripe = getStripeClient();
        const cancelBody = new URLSearchParams();
        cancelBody.set("cancel_at_period_end", "true");
        const stripeRes = await fetch(
          `${stripe.baseUrl}/subscriptions/${subscription.stripe_subscription_id}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${stripe.secretKey}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: cancelBody.toString(),
          },
        );
        if (!stripeRes.ok) {
          const errText = await stripeRes.text().catch(() => "");
          const lowerErr = String(errText || "").toLowerCase();
          const isMissingSubscription =
            stripeRes.status === 404 &&
            (lowerErr.includes("no such subscription") ||
              lowerErr.includes("resource_missing"));
          const isAlreadyCanceled =
            stripeRes.status === 400 &&
            (lowerErr.includes("already canceled") ||
              lowerErr.includes("cannot update a canceled subscription") ||
              lowerErr.includes("status of canceled"));
          console.error(
            "Stripe subscription cancel-at-period-end failed:",
            stripeRes.status,
            errText,
          );
          if (isMissingSubscription || isAlreadyCanceled) {
            // Stripe no longer considers this subscription renewable. Reflect that locally.
            await supabase
              .from("monthly_donations")
              .update({status: "cancelled"})
              .eq("id", rowId);

            return new Response(
              JSON.stringify({
                success: true,
                message:
                  "Subscription is already inactive with payment provider.",
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 200,
              },
            );
          }

          // Stripe can reject update even when cancellation is already scheduled.
          // Verify current Stripe state before treating as a hard failure.
          try {
            const verifyRes = await fetch(
              `${stripe.baseUrl}/subscriptions/${subscription.stripe_subscription_id}`,
              {
                method: "GET",
                headers: {Authorization: `Bearer ${stripe.secretKey}`},
              },
            );
            if (verifyRes.ok) {
              const verifyJson = (await verifyRes.json().catch(() => null)) as {
                status?: string;
                cancel_at_period_end?: boolean;
              } | null;
              const verifyStatus = String(verifyJson?.status || "").toLowerCase();
              const scheduled = Boolean(verifyJson?.cancel_at_period_end);
              const inactive =
                verifyStatus === "canceled" || verifyStatus === "incomplete_expired";

              if (scheduled || inactive) {
                await supabase
                  .from("monthly_donations")
                  .update({status: inactive ? "cancelled" : "cancelling"})
                  .eq("id", rowId);

                return new Response(
                  JSON.stringify({
                    success: true,
                    message: scheduled
                      ? "Subscription scheduled to cancel at period end."
                      : "Subscription is already inactive with payment provider.",
                  }),
                  {
                    headers: {"Content-Type": "application/json"},
                    status: 200,
                  },
                );
              }
            }
          } catch (verifyErr) {
            console.error("Stripe cancellation verify step failed:", verifyErr);
          }

          const conciseProviderError =
            String(errText || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 240) || null;
          return new Response(
            JSON.stringify({
              error: conciseProviderError
                ? `Unable to cancel with payment provider: ${conciseProviderError}`
                : "Unable to cancel with payment provider; try again or contact support.",
            }),
            {
              headers: {"Content-Type": "application/json"},
              status: 502,
            },
          );
        }
      }

      // Still billable until Stripe period end; keep row visible as "cancelling" (see app isSubscriptionRowEligible).
      await supabase
        .from("monthly_donations")
        .update({status: "cancelling"})
        .eq("id", rowId);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription scheduled to cancel at period end.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("Error cancelling subscription:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to cancel subscription",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Donation route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Transaction route handler
