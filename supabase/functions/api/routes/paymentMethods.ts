import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";
import { getStripeClient, createOrGetStripeCustomer } from "../lib/stripe.ts";

export async function handlePaymentMethodRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
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
        userId = payload.id as number;
      } catch (error) {
        // Invalid token
      }
    }
  }

  if (!userId) {
    return new Response(JSON.stringify({error: "Unauthorized"}), {
      headers: {"Content-Type": "application/json"},
      status: 401,
    });
  }

  // Get user's Stripe customer ID
  const {data: user} = await supabase
    .from("users")
    .select("stripe_customer_id, email")
    .eq("id", userId)
    .single();

  if (!user?.stripe_customer_id) {
    // "Create a subscription first" was a dead end for comped accounts: a team
    // member never creates a subscription, so they could never reach the card
    // form — and therefore never make a one-time gift, which is the one paid
    // thing they are meant to be able to do. The customer is cheap to create
    // and is what a subscription would have created anyway, so make it on
    // demand instead of refusing.
    if (!user?.email) {
      return new Response(
        JSON.stringify({error: "Account is missing an email address."}),
        {headers: {"Content-Type": "application/json"}, status: 400},
      );
    }
    try {
      const customer = await createOrGetStripeCustomer(user.email, userId);
      await supabase
        .from("users")
        .update({stripe_customer_id: customer.id})
        .eq("id", userId);
      user.stripe_customer_id = customer.id;
      console.log(
        `✅ Created Stripe customer ${customer.id} on demand for user ${userId}`,
      );
    } catch (e: any) {
      console.error("❌ Could not create Stripe customer on demand:", e?.message);
      return new Response(
        JSON.stringify({
          error: "Could not set up payments for this account. Please try again.",
        }),
        {headers: {"Content-Type": "application/json"}, status: 502},
      );
    }
  }

  const stripe = getStripeClient();

  // GET /payment-methods
  if (method === "GET" && route === "/payment-methods") {
    try {
      // Get customer to check default payment method
      const customerResponse = await fetch(
        `${stripe.baseUrl}/customers/${user.stripe_customer_id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${stripe.secretKey}`,
          },
        },
      );

      let defaultPaymentMethodId: string | null = null;
      if (customerResponse.ok) {
        const customer = await customerResponse.json();
        defaultPaymentMethodId =
          customer.invoice_settings?.default_payment_method || null;
      }

      // Get payment methods
      const response = await fetch(
        `${stripe.baseUrl}/payment_methods?customer=${user.stripe_customer_id}&type=card`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${stripe.secretKey}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch payment methods");
      }

      const data = await response.json();

      // Format payment methods with is_default flag
      const paymentMethods = (data.data || []).map((pm: any) => ({
        id: pm.id,
        type: pm.type,
        card: pm.card
          ? {
              brand: pm.card.brand,
              last4: pm.card.last4,
              exp_month: pm.card.exp_month,
              exp_year: pm.card.exp_year,
            }
          : null,
        brand: pm.card?.brand || null,
        last4: pm.card?.last4 || null,
        is_default: pm.id === defaultPaymentMethodId,
        created: pm.created,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          payment_methods: paymentMethods,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch payment methods",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /payment-methods (create SetupIntent)
  if (method === "POST" && route === "/payment-methods") {
    try {
      const formData = new URLSearchParams();
      formData.append("customer", user.stripe_customer_id);
      formData.append("usage", "off_session");

      const response = await fetch(`${stripe.baseUrl}/setup_intents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripe.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error?.message || "Failed to create setup intent",
        );
      }

      const setupIntent = await response.json();

      return new Response(
        JSON.stringify({
          success: true,
          client_secret: setupIntent.client_secret,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to create setup intent",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // DELETE /payment-methods/:id
  const deleteMatch = route.match(/^\/payment-methods\/(.+)$/);
  if (method === "DELETE" && deleteMatch) {
    try {
      const paymentMethodId = deleteMatch[1];

      const response = await fetch(
        `${stripe.baseUrl}/payment_methods/${paymentMethodId}/detach`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripe.secretKey}`,
          },
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error?.message || "Failed to delete payment method",
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Payment method deleted successfully",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to delete payment method",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(
    JSON.stringify({error: "Payment method route not found"}),
    {
      headers: {"Content-Type": "application/json"},
      status: 404,
    },
  );
}

// User points route handler
