/**
 * Stripe REST helpers (Deno — no official Stripe SDK).
 * Uses STRIPE_SECRET_KEY from the environment.
 */

export function getStripeClient() {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }

  return {
    secretKey: stripeSecretKey,
    baseUrl: "https://api.stripe.com/v1",
  };
}

export async function createStripePaymentIntent(
  amount: number,
  currency: string = "usd",
  metadata: Record<string, string> = {},
): Promise<{ id: string; client_secret: string; status: string }> {
  const stripe = getStripeClient();

  const formData = new URLSearchParams();
  formData.append("amount", Math.round(amount * 100).toString());
  formData.append("currency", currency);

  formData.append("automatic_payment_methods[enabled]", "true");
  formData.append("payment_method_types[]", "card");

  Object.entries(metadata).forEach(([key, value]) => {
    formData.append(`metadata[${key}]`, value);
  });

  const response = await fetch(`${stripe.baseUrl}/payment_intents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    let errorMessage = "Unknown Stripe API error";
    try {
      const error = await response.json();
      errorMessage =
        error.error?.message || error.message || JSON.stringify(error);
      console.error("❌ Stripe API error response:", {
        status: response.status,
        statusText: response.statusText,
        error: error,
      });
    } catch (_parseError) {
      const errorText = await response.text();
      errorMessage = `Stripe API error (${response.status}): ${errorText}`;
      console.error("❌ Stripe API error (non-JSON):", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
    }
    throw new Error(`Stripe API error: ${errorMessage}`);
  }

  const paymentIntent = await response.json();

  if (!paymentIntent.id || !paymentIntent.client_secret) {
    console.error("❌ Invalid payment intent response:", paymentIntent);
    throw new Error("Invalid payment intent response from Stripe");
  }

  return {
    id: paymentIntent.id,
    client_secret: paymentIntent.client_secret,
    status: paymentIntent.status,
  };
}

export async function confirmStripePaymentIntent(
  paymentIntentId: string,
  paymentMethodId?: string,
): Promise<{ id: string; status: string; charge: any }> {
  const stripe = getStripeClient();

  const formData = new URLSearchParams();
  if (paymentMethodId) {
    formData.append("payment_method", paymentMethodId);
  }

  const response = await fetch(
    `${stripe.baseUrl}/payment_intents/${paymentIntentId}/confirm`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripe.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Stripe API error: ${error.error?.message || "Unknown error"}`,
    );
  }

  return await response.json();
}

export async function getStripePaymentIntent(paymentIntentId: string): Promise<any> {
  const stripe = getStripeClient();

  const response = await fetch(
    `${stripe.baseUrl}/payment_intents/${paymentIntentId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${stripe.secretKey}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Stripe API error: ${error.error?.message || "Unknown error"}`,
    );
  }

  return await response.json();
}

export async function createStripeRefund(
  chargeId: string,
  amount?: number,
  reason?: string,
): Promise<{ id: string; amount: number; status: string }> {
  const stripe = getStripeClient();

  const formData = new URLSearchParams();
  formData.append("charge", chargeId);
  if (amount) {
    formData.append("amount", Math.round(amount * 100).toString());
  }
  if (reason) {
    formData.append("reason", reason);
  }

  const response = await fetch(`${stripe.baseUrl}/refunds`, {
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
      `Stripe API error: ${error.error?.message || "Unknown error"}`,
    );
  }

  return await response.json();
}

export async function createOrGetStripeCustomer(
  email: string,
  userId: number,
): Promise<{ id: string }> {
  const stripe = getStripeClient();

  const searchFormData = new URLSearchParams();
  searchFormData.append("query", `email:'${email}'`);
  searchFormData.append("limit", "1");

  const searchResponse = await fetch(
    `${stripe.baseUrl}/customers/search?${searchFormData.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${stripe.secretKey}`,
      },
    },
  );

  if (searchResponse.ok) {
    const searchResult = await searchResponse.json();
    if (searchResult.data && searchResult.data.length > 0) {
      const match = searchResult.data.find(
        (c: any) => c.metadata?.user_id === userId.toString(),
      );
      if (match) return { id: match.id };
    }
  }

  const formData = new URLSearchParams();
  formData.append("email", email);
  formData.append("metadata[user_id]", userId.toString());
  formData.append("metadata[source]", "thrive-backend");

  const response = await fetch(`${stripe.baseUrl}/customers`, {
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
      `Stripe API error: ${error.error?.message || "Unknown error"}`,
    );
  }

  return await response.json();
}

export async function createStripeSubscriptionSetup(
  customerId: string,
  amount: number,
  currency: string = "usd",
  metadata: Record<string, string> = {},
): Promise<{
  subscriptionId: string;
  clientSecret: string;
  status: string;
  latestInvoice?: any;
}> {
  const stripe = getStripeClient();

  const priceFormData = new URLSearchParams();
  priceFormData.append("unit_amount", Math.round(amount * 100).toString());
  priceFormData.append("currency", currency);
  priceFormData.append("recurring[interval]", "month");
  priceFormData.append("recurring[interval_count]", "1");
  priceFormData.append("product_data[name]", "Monthly Donation");

  const priceResponse = await fetch(`${stripe.baseUrl}/prices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: priceFormData.toString(),
  });

  if (!priceResponse.ok) {
    const priceError = await priceResponse.json();
    throw new Error(
      `Stripe price creation error: ${priceError.error?.message || "Unknown error"}`,
    );
  }

  const price = await priceResponse.json();

  const formData = new URLSearchParams();
  formData.append("customer", customerId);
  formData.append("items[0][price]", price.id);
  formData.append("payment_behavior", "default_incomplete");
  formData.append(
    "payment_settings[save_default_payment_method]",
    "on_subscription",
  );
  formData.append("payment_settings[payment_method_types][]", "card");
  formData.append("expand[]", "latest_invoice");
  formData.append("expand[]", "latest_invoice.payment_intent");

  Object.entries(metadata).forEach(([key, value]) => {
    formData.append(`metadata[${key}]`, value);
  });

  const response = await fetch(`${stripe.baseUrl}/subscriptions`, {
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
      `Stripe API error: ${error.error?.message || "Unknown error"}`,
    );
  }

  const subscription = await response.json();
  const inv = subscription.latest_invoice as any;
  const piRaw = inv?.payment_intent;
  let clientSecret: string | null =
    typeof piRaw === "object" && piRaw?.client_secret
      ? piRaw.client_secret
      : null;

  if (!clientSecret) {
    const piId =
      typeof piRaw === "string"
        ? piRaw
        : typeof piRaw === "object" && piRaw?.id
          ? piRaw.id
          : null;
    if (piId) {
      const piRes = await fetch(`${stripe.baseUrl}/payment_intents/${piId}`, {
        headers: { Authorization: `Bearer ${stripe.secretKey}` },
      });
      if (piRes.ok) {
        const pi = await piRes.json();
        clientSecret = pi.client_secret || null;
      }
    }
  }

  return {
    subscriptionId: subscription.id,
    clientSecret: clientSecret || "",
    status: subscription.status,
    latestInvoice: subscription.latest_invoice,
  };
}
