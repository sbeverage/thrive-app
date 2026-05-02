// Supabase Edge Function - Main API Router
// Handles all API routes: vendors, admin, auth, discounts, charities, donations

import {serve} from "https://deno.land/std@0.208.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {
  create as createJWT,
  verify as verifyJWT,
} from "https://deno.land/x/djwt@v2.9/mod.ts";
// Use bcrypt library compatible with Edge Functions
// Lazy load bcryptjs to avoid boot errors (load only when needed)
// Using esm.sh version of bcryptjs which works in Edge Functions

// Wrapper functions to match async interface
async function bcryptHash(password: string): Promise<string> {
  const bcryptjs = await import("https://esm.sh/bcryptjs@2.4.3");
  return await bcryptjs.default.hash(password, 10);
}

async function bcryptCompare(password: string, hash: string): Promise<boolean> {
  const bcryptjs = await import("https://esm.sh/bcryptjs@2.4.3");
  return await bcryptjs.default.compare(password, hash);
}
// Use built-in Web Crypto API instead of Deno std crypto (more reliable in Edge Functions)
// No import needed - crypto is available globally in Deno/Edge Functions

// Capitalize name helper function - ensures first letter is uppercase, rest lowercase
function capitalizeName(name: string | null | undefined): string | null {
  if (!name || typeof name !== "string") {
    return null;
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Capitalize first letter, lowercase the rest
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Referral recognition tiers: counts use referrals.status = 'paid' only.
 * Keep milestoneType values aligned with check_referral_milestones in the database.
 */
const REFERRAL_TIERS: readonly {
  threshold: number;
  milestoneType: string;
  badgeName: string;
  title: string;
  description: string;
}[] = [
  {
    threshold: 1,
    milestoneType: "milestone_1",
    badgeName: "supporter",
    title: "Supporter",
    description:
      "Your first friend became a donor — thank you for spreading the word.",
  },
  {
    threshold: 3,
    milestoneType: "milestone_3",
    badgeName: "champion",
    title: "Champion",
    description: "Three friends are now donors — you are building real impact.",
  },
  {
    threshold: 5,
    milestoneType: "milestone_5",
    badgeName: "website_spotlight",
    title: "Website spotlight",
    description: "Five donors referred — recognition on our website.",
  },
];

// Geocoding helper function
async function geocodeAddress(
  location: string,
): Promise<{latitude: number | null; longitude: number | null}> {
  try {
    // Use a free geocoding service (OpenStreetMap Nominatim)
    // Note: This has rate limits, consider using a paid service for production
    const encodedLocation = encodeURIComponent(location);
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedLocation}&limit=1`;

    const response = await fetch(geocodeUrl, {
      headers: {
        "User-Agent": "Thrive-Initiative/1.0", // Required by Nominatim
      },
    });

    if (!response.ok) {
      console.warn("Geocoding API error:", response.status);
      return {latitude: null, longitude: null};
    }

    const data = await response.json();

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
      };
    }

    return {latitude: null, longitude: null};
  } catch (error) {
    console.error("Geocoding error:", error);
    return {latitude: null, longitude: null};
  }
}

// Referral helper functions
async function createReferralRecord(
  supabase: any,
  referrerId: number,
  referredUserId: number,
  referralToken?: string,
): Promise<void> {
  try {
    // Generate referral token if not provided
    if (!referralToken) {
      const tokenArray = new Uint8Array(32);
      crypto.getRandomValues(tokenArray);
      referralToken = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    }

    // Create referral record
    const {error: referralError} = await supabase.from("referrals").insert([
      {
        referrer_id: referrerId,
        referred_user_id: referredUserId,
        referral_token: referralToken,
        status: "pending",
      },
    ]);

    if (referralError) {
      console.error("❌ Error creating referral record:", referralError);
      // Don't fail signup if referral tracking fails
    } else {
      console.log("✅ Referral record created:", {referrerId, referredUserId});
    }
  } catch (error) {
    console.error("❌ Error in createReferralRecord:", error);
    // Don't fail signup if referral tracking fails
  }
}

async function updateReferralStatus(
  supabase: any,
  referredUserId: number,
  status: string,
  monthlyDonationAmount?: number,
  stripeSubscriptionId?: string,
): Promise<void> {
  try {
    const {data: existing} = await supabase
      .from("referrals")
      .select("referrer_id, status, first_payment_at")
      .eq("referred_user_id", referredUserId)
      .maybeSingle();

    if (!existing) {
      return;
    }

    const previousStatus = existing.status;
    const updateData: any = {status};

    if (status === "paid" && monthlyDonationAmount != null) {
      updateData.monthly_donation_amount = monthlyDonationAmount;
      updateData.last_payment_at = new Date().toISOString();
      if (!existing.first_payment_at) {
        updateData.first_payment_at = new Date().toISOString();
      }
    }

    if (stripeSubscriptionId) {
      updateData.stripe_subscription_id = stripeSubscriptionId;
    }

    const {error: updateError} = await supabase
      .from("referrals")
      .update(updateData)
      .eq("referred_user_id", referredUserId);

    if (updateError) {
      console.error("❌ Error updating referral status:", updateError);
    } else {
      console.log("✅ Referral status updated:", {referredUserId, status});

      if (
        status === "paid" &&
        previousStatus !== "paid" &&
        existing.referrer_id
      ) {
        await checkAndGrantMilestones(supabase, existing.referrer_id);
      }
    }
  } catch (error) {
    console.error("❌ Error in updateReferralStatus:", error);
  }
}

async function checkAndGrantMilestones(
  supabase: any,
  referrerId: number,
): Promise<void> {
  try {
    // Call the database function to check and grant milestones
    const {data, error} = await supabase.rpc("check_referral_milestones", {
      p_user_id: referrerId,
    });

    if (error) {
      console.error("❌ Error checking milestones:", error);
    } else if (data && data.length > 0) {
      console.log("✅ Milestones granted:", data);
    }
  } catch (error) {
    console.error("❌ Error in checkAndGrantMilestones:", error);
  }
}

async function getReferrerFromToken(
  supabase: any,
  referralToken: string,
): Promise<number | null> {
  try {
    // Find referrer by token (could be in referrals table or users table)
    // First check if there's a referral with this token
    const {data: referral} = await supabase
      .from("referrals")
      .select("referrer_id")
      .eq("referral_token", referralToken)
      .limit(1)
      .single();

    if (referral && referral.referrer_id) {
      return referral.referrer_id;
    }

    // If not found, check if token matches a user's ID (for backward compatibility)
    // This allows using user IDs as referral tokens
    const userId = parseInt(referralToken);
    if (!isNaN(userId)) {
      const {data: user} = await supabase
        .from("users")
        .select("id")
        .eq("id", userId)
        .limit(1)
        .single();

      if (user && user.id) {
        return user.id;
      }
    }

    return null;
  } catch (error) {
    console.error("❌ Error in getReferrerFromToken:", error);
    return null;
  }
}

// OAuth verification helper functions
// Cache for JWKS (JSON Web Key Set) to avoid fetching on every request
const jwksCache: Map<string, {keys: any[]; expiresAt: number}> = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

// Fetch and cache JWKS from provider
async function fetchJWKS(jwksUrl: string): Promise<any[]> {
  const cached = jwksCache.get(jwksUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  try {
    const response = await fetch(jwksUrl, {
      headers: {"User-Agent": "Thrive-Backend/1.0"},
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status}`);
    }

    const jwks = await response.json();
    const keys = jwks.keys || [];

    // Cache for 1 hour
    jwksCache.set(jwksUrl, {
      keys,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return keys;
  } catch (error) {
    console.error("Error fetching JWKS:", error);
    // Return cached keys even if expired, as fallback
    if (cached) {
      return cached.keys;
    }
    throw error;
  }
}

// Convert JWK to CryptoKey for verification
async function jwkToCryptoKey(jwk: any): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );
}

// Base64URL decode
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64WithPadding = base64 + padding;

  const binaryString = atob(base64WithPadding);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Verify JWT token signature with JWKS
async function verifyJWTWithJWKS(
  token: string,
  jwksUrl: string,
  expectedIssuer: string,
  expectedAudience?: string,
): Promise<{sub: string; email?: string} | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("Invalid token format");
      return null;
    }

    // Decode header
    const header = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[0])),
    );

    // Decode payload
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[1])),
    );

    // Validate issuer
    if (payload.iss !== expectedIssuer) {
      console.error(
        `Invalid issuer: ${payload.iss}, expected: ${expectedIssuer}`,
      );
      return null;
    }

    // Validate audience if provided
    if (expectedAudience && payload.aud !== expectedAudience) {
      console.error(
        `Invalid audience: ${payload.aud}, expected: ${expectedAudience}`,
      );
      return null;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error("Token expired");
      return null;
    }

    // Check issued at time (not before)
    if (payload.nbf && payload.nbf > now) {
      console.error("Token not yet valid");
      return null;
    }

    // Get the key ID from header
    const kid = header.kid;
    if (!kid) {
      console.error("Token missing key ID");
      return null;
    }

    // Fetch JWKS
    const keys = await fetchJWKS(jwksUrl);

    // Find the matching key
    const key = keys.find((k: any) => k.kid === kid);
    if (!key) {
      console.error(`Key not found for kid: ${kid}`);
      return null;
    }

    // Convert JWK to CryptoKey
    const cryptoKey = await jwkToCryptoKey(key);

    // Prepare data for verification (header.payload)
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

    // Decode signature
    const signature = base64UrlDecode(parts[2]);

    // Verify signature
    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      data,
    );

    if (!isValid) {
      console.error("Invalid token signature");
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email || null,
    };
  } catch (error) {
    console.error("JWT verification error:", error);
    return null;
  }
}

async function verifyAppleToken(
  identityToken: string,
): Promise<{sub: string; email?: string} | null> {
  try {
    // Apple's JWKS endpoint
    const jwksUrl = "https://appleid.apple.com/auth/keys";
    const expectedIssuer = "https://appleid.apple.com";
    const validAudiences = [
      Deno.env.get("APPLE_CLIENT_ID"),
      Deno.env.get("APPLE_BUNDLE_ID"),
      Deno.env.get("APPLE_SERVICE_ID"),
    ].filter(Boolean) as string[];

    // If no audience is configured, verify signature/issuer/exp only.
    if (validAudiences.length === 0) {
      return await verifyJWTWithJWKS(identityToken, jwksUrl, expectedIssuer);
    }

    // Try all configured Apple audiences (bundle ID / service ID / legacy APPLE_CLIENT_ID).
    for (const audience of validAudiences) {
      const verified = await verifyJWTWithJWKS(
        identityToken,
        jwksUrl,
        expectedIssuer,
        audience,
      );

      if (verified) {
        return verified;
      }
    }

    console.error(
      "Apple token verification failed for all configured audiences",
    );
    return null;
  } catch (error) {
    console.error("Apple token verification error:", error);
    return null;
  }
}

async function verifyGoogleToken(
  idToken: string,
): Promise<{sub: string; email?: string} | null> {
  try {
    // Google's JWKS endpoint
    const jwksUrl = "https://www.googleapis.com/oauth2/v3/certs";
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    const validAudiences = [
      Deno.env.get("GOOGLE_WEB_CLIENT_ID"),
      Deno.env.get("GOOGLE_IOS_CLIENT_ID"),
      Deno.env.get("GOOGLE_ANDROID_CLIENT_ID"),
      Deno.env.get("GOOGLE_CLIENT_ID"), // Backward compatibility
      "1079764121058-0jj3h2rm28c7jsk6e227s0eaasgtp0hb.apps.googleusercontent.com", // Explicitly allow this web/android client ID
    ].filter(Boolean) as string[];

    if (validAudiences.length === 0) {
      console.error("No Google client IDs configured in environment");
      return null;
    }
    const parts = idToken.split(".");
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[1])),
    );

    // Google tokens can have different issuers
    const expectedIssuer = payload.iss;
    if (
      !expectedIssuer ||
      (!expectedIssuer.includes("accounts.google.com") &&
        !expectedIssuer.includes("https://accounts.google.com"))
    ) {
      console.error(`Invalid Google issuer: ${expectedIssuer}`);
      return null;
    }

    // Get client ID from environment for audience validation
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");

    return await verifyJWTWithJWKS(
      idToken,
      jwksUrl,
      expectedIssuer,
      googleClientId || undefined,
    );
  } catch (error) {
    console.error("Google token verification error:", error);
    return null;
  }
}

async function verifyFacebookToken(
  accessToken: string,
): Promise<{id: string; email?: string} | null> {
  try {
    // Get Facebook App ID from environment for verification
    const facebookAppId = Deno.env.get("FACEBOOK_APP_ID");

    // First, verify the token is valid by checking it with the app
    let verifyUrl = `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
    if (facebookAppId) {
      verifyUrl += `&app_id=${facebookAppId}`;
    }

    const verifyResponse = await fetch(verifyUrl, {
      headers: {"User-Agent": "Thrive-Backend/1.0"},
    });

    if (!verifyResponse.ok) {
      console.error(
        "Facebook token verification failed:",
        verifyResponse.status,
      );
      return null;
    }

    const verifyData = await verifyResponse.json();

    // Check if token is valid
    if (!verifyData.data || !verifyData.data.is_valid) {
      console.error("Facebook token is invalid:", verifyData);
      return null;
    }

    // Check app ID matches (if provided)
    if (facebookAppId && verifyData.data.app_id !== facebookAppId) {
      console.error(
        `Facebook app ID mismatch: ${verifyData.data.app_id} !== ${facebookAppId}`,
      );
      return null;
    }

    // Check if token is expired
    if (
      verifyData.data.expires_at &&
      verifyData.data.expires_at < Math.floor(Date.now() / 1000)
    ) {
      console.error("Facebook token expired");
      return null;
    }

    // Now get user info
    const userResponse = await fetch(
      `https://graph.facebook.com/me?fields=id,email&access_token=${accessToken}`,
      {
        headers: {"User-Agent": "Thrive-Backend/1.0"},
      },
    );

    if (!userResponse.ok) {
      console.error("Failed to fetch Facebook user info:", userResponse.status);
      return null;
    }

    const userData = await userResponse.json();

    if (!userData.id) {
      console.error("Facebook user data missing ID");
      return null;
    }

    // Verify the user ID matches the token's user ID
    if (verifyData.data.user_id && verifyData.data.user_id !== userData.id) {
      console.error("Facebook user ID mismatch");
      return null;
    }

    return {
      id: userData.id,
      email: userData.email || null,
    };
  } catch (error) {
    console.error("Facebook token verification error:", error);
    return null;
  }
}

// One-time gift helper functions
function calculateProcessingFee(
  amount: number,
  userCoveredFees: boolean = false,
): {
  originalAmount: number;
  fee: number;
  totalAmount: number;
  netAmount: number;
} {
  // Stripe standard fees: 2.9% + $0.30
  const percentageFee = amount * 0.029;
  const flatFee = 0.3;
  const totalFee = percentageFee + flatFee;

  if (userCoveredFees) {
    // Add fee to the amount user pays
    return {
      originalAmount: amount,
      fee: totalFee,
      totalAmount: amount + totalFee,
      netAmount: amount, // Beneficiary receives full amount
    };
  } else {
    // Fee is deducted from donation
    return {
      originalAmount: amount,
      fee: totalFee,
      totalAmount: amount,
      netAmount: amount - totalFee, // Beneficiary receives amount minus fee
    };
  }
}

// Stripe helper - initialize Stripe client
function getStripeClient() {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }

  // For Deno, we'll use fetch API to call Stripe REST API directly
  // Stripe doesn't have official Deno SDK, so we'll use REST API
  return {
    secretKey: stripeSecretKey,
    baseUrl: "https://api.stripe.com/v1",
  };
}

// Create Stripe PaymentIntent
async function createStripePaymentIntent(
  amount: number,
  currency: string = "usd",
  metadata: Record<string, string> = {},
): Promise<{id: string; client_secret: string; status: string}> {
  const stripe = getStripeClient();

  const formData = new URLSearchParams();
  formData.append("amount", Math.round(amount * 100).toString()); // Convert to cents
  formData.append("currency", currency);

  // Enable automatic payment methods (includes Apple Pay, Google Pay, Link, etc.)
  formData.append("automatic_payment_methods[enabled]", "true");
  // Explicitly enable Apple Pay and Google Pay
  formData.append("payment_method_types[]", "card");

  // Add metadata
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
    } catch (parseError) {
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

// Confirm Stripe PaymentIntent
async function confirmStripePaymentIntent(
  paymentIntentId: string,
  paymentMethodId?: string,
): Promise<{id: string; status: string; charge: any}> {
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

// Get Stripe PaymentIntent
async function getStripePaymentIntent(paymentIntentId: string): Promise<any> {
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

// Create Stripe Refund
async function createStripeRefund(
  chargeId: string,
  amount?: number,
  reason?: string,
): Promise<{id: string; amount: number; status: string}> {
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

// Create or retrieve Stripe customer
async function createOrGetStripeCustomer(
  email: string,
  userId: number,
): Promise<{id: string}> {
  const stripe = getStripeClient();

  // First, try to find existing customer by email
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
      return {id: searchResult.data[0].id};
    }
  }

  // Create new customer if not found
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

// Create Stripe subscription setup (for recurring donations)
async function createStripeSubscriptionSetup(
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

  // Step 1: Create a recurring Price object with an inline product.
  // Using the /prices endpoint supports product_data[name] on all API versions,
  // avoiding the "unknown parameter: product_data" error on the subscriptions endpoint.
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

  // Step 2: Create subscription using the price ID
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

  // Add metadata
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

  // If expand returned only a PaymentIntent id, fetch the full PI for client_secret
  if (!clientSecret) {
    const piId =
      typeof piRaw === "string"
        ? piRaw
        : typeof piRaw === "object" && piRaw?.id
          ? piRaw.id
          : null;
    if (piId) {
      const piRes = await fetch(`${stripe.baseUrl}/payment_intents/${piId}`, {
        headers: {Authorization: `Bearer ${stripe.secretKey}`},
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

/** Default From address when EMAIL_FROM is unset (must match a verified domain in Resend). */
const DEFAULT_TRANSACTIONAL_FROM_EMAIL = "info@jointhriveinitiative.org";
/** Inbox display name for verification / invitation emails (Resend + SendGrid). */
const DEFAULT_TRANSACTIONAL_FROM_NAME = "THRIVE Initiative";

/** Resend `from`: "THRIVE Initiative <email>" when EMAIL_FROM is a bare address. */
function buildResendVerificationFromHeader(): string {
  const raw = (Deno.env.get("EMAIL_FROM") || DEFAULT_TRANSACTIONAL_FROM_EMAIL)
    .trim();
  const displayName =
    (Deno.env.get("EMAIL_FROM_DISPLAY_NAME") || DEFAULT_TRANSACTIONAL_FROM_NAME)
      .trim();
  const m = raw.match(/^(.+?)\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim().replace(/^["']|["']$/g, "");
    return `${name} <${m[2].trim()}>`;
  }
  return `${displayName} <${raw}>`;
}

function buildSendGridVerificationFrom(): { email: string; name: string } {
  const raw = (Deno.env.get("EMAIL_FROM") || DEFAULT_TRANSACTIONAL_FROM_EMAIL)
    .trim();
  const displayName =
    (Deno.env.get("EMAIL_FROM_DISPLAY_NAME") || DEFAULT_TRANSACTIONAL_FROM_NAME)
      .trim();
  const m = raw.match(/^(.+?)\s*<([^>]+)>\s*$/);
  if (m) {
    return {
      email: m[2].trim(),
      name: m[1].trim().replace(/^["']|["']$/g, ""),
    };
  }
  return { email: raw, name: displayName };
}

// Email sending helper function
async function sendInvitationEmail({
  to,
  name,
  verificationToken,
  donorId,
}: {
  to: string;
  name: string;
  verificationToken: string;
  donorId: number;
}): Promise<void> {
  try {
    // Get email service configuration from environment variables
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend"; // 'resend', 'sendgrid', 'supabase'
    const appName = Deno.env.get("APP_NAME") || "Thrive Initiative";

    // Determine if this is an invitation (64-char token) or self-signup
    const isInvitationToken = verificationToken.length === 64;

    // Build verification link - Use Universal Link (Vercel frontend URL) so iOS intercepts it
    // and opens the app directly instead of showing a web page in Safari.
    // APP_BASE_URL is registered in the app's associatedDomains (applinks:thrive-web-jet.vercel.app).
    const appBaseUrl =
      Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";

    const verificationLink = isInvitationToken
      ? `${appBaseUrl}/donorInvitationVerify?token=${verificationToken}`
      : `${appBaseUrl}/verify?token=${verificationToken}&email=${encodeURIComponent(to)}`;

    // App store links (update these with your actual app URLs)
    const appStoreLinks = {
      ios:
        Deno.env.get("APP_STORE_IOS_URL") ||
        "https://apps.apple.com/app/your-app",
      android:
        Deno.env.get("APP_STORE_ANDROID_URL") ||
        "https://play.google.com/store/apps/details?id=your.app",
    };

    // Email content (adapt subject based on context)
    const isInvitation = donorId && isInvitationToken;
    const emailSubject = isInvitation
      ? `Welcome to ${appName} - Verify Your Email`
      : `Verify Your ${appName} Account`;
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 0;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      background-color: #f5f5f5;
    }
    .email-wrapper {
      padding: 40px 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 12px;
      padding: 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      padding: 40px 30px;
      text-align: center;
      color: #ffffff;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #ffffff;
      margin-bottom: 10px;
      letter-spacing: 0.5px;
    }
    h1 {
      color: #ffffff;
      font-size: 26px;
      margin: 10px 0;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    p {
      color: #555;
      font-size: 16px;
      margin-bottom: 20px;
      line-height: 1.7;
    }
    .button-container {
      text-align: center;
      margin: 35px 0;
    }
    .button {
      display: inline-block;
      background-color: #DB8633;
      color: #ffffff !important;
      padding: 16px 32px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 10px 0;
      box-shadow: 0 4px 12px rgba(219, 134, 51, 0.3);
      transition: all 0.3s ease;
    }
    .button:hover {
      background-color: #c97527;
      box-shadow: 0 6px 16px rgba(219, 134, 51, 0.4);
      transform: translateY(-2px);
    }
    .app-links {
      margin-top: 30px;
      padding-top: 25px;
      border-top: 2px solid #f0f0f0;
      text-align: center;
      background-color: #fafafa;
      padding: 25px 30px;
      margin: 30px -30px -30px -30px;
    }
    .app-links p {
      color: #324E58;
      font-weight: 600;
      margin-bottom: 15px;
      font-size: 15px;
    }
    .app-links a {
      display: inline-block;
      margin: 0 12px;
      color: #324E58;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 6px;
      background-color: #fff;
      border: 1px solid #324E58;
      transition: all 0.2s ease;
    }
    .app-links a:hover {
      background-color: #324E58;
      color: #ffffff;
    }
    .app-links span {
      color: #ddd;
      margin: 0 5px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 25px;
      border-top: 2px solid #f0f0f0;
      text-align: center;
      color: #999;
      font-size: 13px;
      background-color: #fafafa;
      padding: 25px 30px;
      margin: 30px -30px -30px -30px;
    }
    .footer p {
      color: #999;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .footer a {
      color: #324E58;
      text-decoration: none;
    }
    .token-link {
      word-break: break-all;
      color: #666;
      font-size: 12px;
      margin-top: 20px;
      padding: 12px;
      background-color: #f9f9f9;
      border-radius: 6px;
      border-left: 3px solid #324E58;
    }
    .highlight {
      color: #324E58;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">${appName}</div>
        <h1>Welcome, ${name}! 👋</h1>
      </div>
      <div class="content">
    
        ${
          isInvitation
            ? `<p>You've been invited to join <span class="highlight">${appName}</span> as a donor! We're excited to have you join our community of changemakers.</p>`
            : `<p>Thank you for signing up for <span class="highlight">${appName}</span>! We're thrilled to have you on board.</p>`
        }
        
        <p>Click the button below to verify your email address and get started:</p>
        
        <div class="button-container">
          <a href="${verificationLink}" class="button">
            ${isInvitation ? "Verify Email & Download App" : "Verify Email"}
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666; text-align: center;">
          ${
            isInvitation
              ? `This link will expire in 24 hours. If you're on a mobile device, this will open our app directly. If you're on a desktop, you'll be redirected to download the app.`
              : `This link will open in the Thrive app to verify your email and continue with signup.`
          }
        </p>
        
        ${
          isInvitation
            ? `
        <div class="token-link">
          <strong>Or copy this link:</strong><br>
          ${verificationLink}
        </div>
        `
            : `
        <p style="font-size: 14px; color: #666; text-align: center;">
          If the app doesn't open automatically, tap the button above or paste this link into your browser:<br>
          <span style="font-size: 12px; color: #999; word-break: break-all;">${verificationLink}</span>
        </p>
        `
        }
      </div>
      
      ${
        isInvitation
          ? `
      <div class="app-links">
        <p>📱 Download our mobile app:</p>
        <a href="${appStoreLinks.ios}">📱 Download for iOS</a>
        <span>|</span>
        <a href="${appStoreLinks.android}">📱 Download for Android</a>
      </div>
      `
          : ""
      }
      
      <div class="footer">
        <p>If you didn't request this ${isInvitation ? "invitation" : "account"}, you can safely ignore this email.</p>
        <p>Need help? Contact <a href="mailto:info@jointhriveinitiative.org">info@jointhriveinitiative.org</a></p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const emailText = `
${
  isInvitation
    ? `Welcome to ${appName}, ${name}!\n\nYou've been invited to join as a donor.`
    : `Thank you for signing up for ${appName}, ${name}!\n\nPlease verify your email to complete your account setup.`
}

Verify your email and get started:
${verificationLink}

This link will expire in 24 hours.

${
  isInvitation
    ? `
Download our mobile app:
- iOS: ${appStoreLinks.ios}
- Android: ${appStoreLinks.android}
`
    : `
This link will open in the Thrive app to complete your verification.
`
}

${
  isInvitation
    ? "If you didn't request this invitation, you can safely ignore this email."
    : "If you didn't create this account, you can safely ignore this email."
}

Need help? Contact info@jointhriveinitiative.org
    `.trim();

    // Send email based on configured service
    // Note: Supabase doesn't have a built-in email service for custom emails
    // You must use a third-party service (Resend, SendGrid, or SMTP)
    if (emailService === "resend") {
      // Using Resend API
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn("⚠️ RESEND_API_KEY not set - email will not be sent");
        return;
      }

      const fromHeader = buildResendVerificationFromHeader();

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [to],
          subject: emailSubject,
          html: emailHtml,
          text: emailText,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Resend API error: ${errorText}`;

        // Parse error for better messaging
        try {
          const errorJson = JSON.parse(errorText);
          if (
            errorJson.message &&
            errorJson.message.includes("domain is not verified")
          ) {
            errorMessage = `Domain verification required: ${errorJson.message}. Please verify jointhriveinitiative.org at https://resend.com/domains`;
          } else if (errorJson.message) {
            errorMessage = `Resend API error: ${errorJson.message}`;
          }
        } catch (e) {
          // If parsing fails, use original error text
        }

        console.error("❌ Resend API error:", errorMessage);
        throw new Error(errorMessage);
      }

      console.log("✅ Invitation email sent via Resend:", to);
    } else if (emailService === "sendgrid") {
      // Using SendGrid API
      const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
      if (!sendgridApiKey) {
        console.warn("⚠️ SENDGRID_API_KEY not set - email will not be sent");
        return;
      }

      const sgFrom = buildSendGridVerificationFrom();

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{to: [{email: to}]}],
          from: {email: sgFrom.email, name: sgFrom.name},
          subject: emailSubject,
          content: [
            {type: "text/plain", value: emailText},
            {type: "text/html", value: emailHtml},
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`SendGrid API error: ${error}`);
      }

      console.log("✅ Invitation email sent via SendGrid:", to);
    } else if (emailService === "smtp" || emailService === "gmail") {
      // Using SMTP (Gmail, custom SMTP server, etc.)
      const smtpHost =
        Deno.env.get("SMTP_HOST") ||
        Deno.env.get("EMAIL_HOST") ||
        "smtp.gmail.com";
      const smtpPort = parseInt(
        Deno.env.get("SMTP_PORT") || Deno.env.get("EMAIL_PORT") || "587",
      );
      const smtpUser = Deno.env.get("SMTP_USER") || Deno.env.get("EMAIL_USER");
      const smtpPass = Deno.env.get("SMTP_PASS") || Deno.env.get("EMAIL_PASS");
      const smtpFrom = Deno.env.get("EMAIL_FROM") || smtpUser;

      if (!smtpUser || !smtpPass) {
        console.warn("⚠️ SMTP credentials not set - email will not be sent");
        console.log("📧 Email would be sent to:", to);
        console.log("📧 Verification link:", verificationLink);
        return;
      }

      // For Deno Edge Functions, we'll use a simple HTTP-based approach
      // Option: Call a Vercel API route that sends emails (if you have one)
      const vercelEmailApi = Deno.env.get("VERCEL_EMAIL_API_URL");

      if (vercelEmailApi) {
        // Call Vercel API route that sends email
        try {
          const response = await fetch(vercelEmailApi, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to,
              subject: emailSubject,
              html: emailHtml,
              text: emailText,
            }),
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Vercel email API error: ${error}`);
          }

          console.log("✅ Invitation email sent via Vercel API:", to);
          return;
        } catch (error) {
          console.error("❌ Error calling Vercel email API:", error);
          // Fall through to logging
        }
      }

      // If no Vercel API, log the email details for manual sending or setup
      console.log("📧 Email would be sent via SMTP to:", to);
      console.log("📧 SMTP Host:", smtpHost);
      console.log("📧 SMTP Port:", smtpPort);
      console.log("📧 From:", smtpFrom);
      console.log("📧 Subject:", emailSubject);
      console.log("📧 Verification link:", verificationLink);
      console.log("");
      console.log(
        "⚠️ SMTP sending requires a Deno SMTP library or Vercel API route.",
      );
      console.log("");
      console.log("RECOMMENDED: Create a Vercel API route at /api/send-email");
      const appUrl =
        Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";
      console.log(`Then set: VERCEL_EMAIL_API_URL=${appUrl}/api/send-email`);
      console.log("");
      console.log("OR: Use Resend or SendGrid (easier setup)");
    } else {
      // Default: Log email (for development/testing)
      console.log("📧 Email would be sent to:", to);
      console.log("📧 Subject:", emailSubject);
      console.log("📧 Verification link:", verificationLink);
      console.log("");
      console.log("⚠️ EMAIL SERVICE CONFIGURATION REQUIRED");
      console.log("");
      console.log(
        "Supabase does not have a built-in email service for custom emails.",
      );
      console.log("You must use a third-party email service:");
      console.log("");
      console.log("Option 1: Resend (Recommended - Modern API)");
      console.log("  1. Sign up at https://resend.com");
      console.log("  2. Create API key");
      console.log(
        "  3. Set secrets: EMAIL_SERVICE=resend, RESEND_API_KEY=your_key",
      );
      console.log("");
      console.log("Option 2: SendGrid");
      console.log("  1. Sign up at https://sendgrid.com");
      console.log("  2. Create API key");
      console.log(
        "  3. Set secrets: EMAIL_SERVICE=sendgrid, SENDGRID_API_KEY=your_key",
      );
      console.log("");
      console.log("Option 3: Custom SMTP (Gmail, etc.)");
      console.log(
        "  Note: SMTP in Edge Functions requires additional libraries",
      );
      console.log("  Recommended: Use Resend or SendGrid instead");
      console.log("");
    }
  } catch (error) {
    console.error("❌ Error sending invitation email:", error);
    throw error; // Re-throw to be caught by caller
  }
}

// Send referral reminder email to referred users who haven't completed first payment
async function sendReferralReminderEmail({
  to,
  name,
  referrerName,
}: {
  to: string;
  name: string;
  referrerName?: string;
}): Promise<void> {
  try {
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
    const appName = Deno.env.get("APP_NAME") || "Thrive Initiative";
    const appBaseUrl =
      Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";
    const fromEmail = Deno.env.get("EMAIL_FROM") || "noreply@yourapp.com";

    const emailSubject = `Complete Your ${appName} Signup - You Were Referred!`;
    const referrerText = referrerName ? ` by ${referrerName}` : "";
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #fff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%); color: #fff; padding: 24px; border-radius: 12px 12px 0 0; margin: -30px -30px 24px -30px; text-align: center; }
    .button { display: inline-block; background: #DB8633; color: #fff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .footer { color: #666; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0; font-size: 22px;">${appName}</h2>
    </div>
    <p>Hi ${name},</p>
    <p>You were referred to ${appName}${referrerText}. You've signed up, but we noticed you haven't completed your first donation yet.</p>
    <p>Complete your setup to support your chosen cause and help your friend earn referral recognition (badges and website spotlight milestones).</p>
    <p style="text-align: center;">
      <a href="${appBaseUrl}/login" class="button">Complete Your Signup</a>
    </p>
    <p>If you have any questions, contact us at <a href="mailto:info@jointhriveinitiative.org">info@jointhriveinitiative.org</a>.</p>
    <div class="footer">
      <p>If you didn't expect this email, you can safely ignore it.</p>
    </div>
  </div>
</body>
</html>`;

    const emailText = `Hi ${name},\n\nYou were referred to ${appName}${referrerText}. Complete your signup at ${appBaseUrl}/login to support your cause and help your friend earn referral recognition.\n\n- The ${appName} Team`;

    if (emailService === "resend") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn(
          "⚠️ RESEND_API_KEY not set - referral reminder email will not be sent",
        );
        return;
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject: emailSubject,
          html: emailHtml,
          text: emailText,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Resend API error: ${errText}`);
      }
      console.log("✅ Referral reminder email sent via Resend:", to);
    } else if (emailService === "sendgrid") {
      const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
      if (!sendgridApiKey) {
        console.warn(
          "⚠️ SENDGRID_API_KEY not set - referral reminder email will not be sent",
        );
        return;
      }
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{to: [{email: to}]}],
          from: {email: fromEmail},
          subject: emailSubject,
          content: [
            {type: "text/plain", value: emailText},
            {type: "text/html", value: emailHtml},
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`SendGrid API error: ${await response.text()}`);
      }
      console.log("✅ Referral reminder email sent via SendGrid:", to);
    } else {
      console.warn("⚠️ Email service not configured for referral reminders");
    }
  } catch (error) {
    console.error("❌ Error sending referral reminder email:", error);
    throw error;
  }
}

async function sendAdminTempPasswordEmail({
  to,
  name,
  tempPassword,
}: {
  to: string;
  name: string;
  tempPassword: string;
}): Promise<void> {
  try {
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
    const appName = Deno.env.get("APP_NAME") || "Thrive Initiative";
    const fromEmail = Deno.env.get("EMAIL_FROM") || "noreply@yourapp.com";

    const emailSubject = `${appName} Admin Access - Temporary Password`;
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 0;
      background: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 12px;
      margin: 24px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .password-box {
      background: #fff6ed;
      border: 1px solid #f1d9c1;
      border-radius: 8px;
      padding: 12px;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.5px;
      color: #9a4f1a;
      margin: 12px 0;
      text-align: center;
    }
    .hint {
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="title">Hi ${name},</div>
    <p>You have been added to the ${appName} admin team.</p>
    <p>Use the temporary password below to sign in:</p>
    <div class="password-box">${tempPassword}</div>
    <p class="hint">For security, please change this password after your first login.</p>
  </div>
</body>
</html>`;

    const emailText = `Hi ${name},

You have been added to the ${appName} admin team.

Temporary password: ${tempPassword}

For security, please change this password after your first login.`;

    if (emailService === "resend") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn("⚠️ RESEND_API_KEY not set - email will not be sent");
        return;
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to,
          subject: emailSubject,
          html: emailHtml,
          text: emailText,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend API error: ${errorText}`);
      }
      console.log("✅ Admin temp password email sent via Resend:", to);
      return;
    }

    if (emailService === "sendgrid") {
      const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
      if (!sendgridApiKey) {
        console.warn("⚠️ SENDGRID_API_KEY not set - email will not be sent");
        return;
      }
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{to: [{email: to}]}],
          from: {email: fromEmail},
          subject: emailSubject,
          content: [
            {type: "text/plain", value: emailText},
            {type: "text/html", value: emailHtml},
          ],
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid API error: ${errorText}`);
      }
      console.log("✅ Admin temp password email sent via SendGrid:", to);
      return;
    }

    console.log("📧 Admin temp password email fallback:", {
      to,
      subject: emailSubject,
    });
  } catch (error) {
    console.error("❌ Error sending admin temp password email:", error);
  }
}

async function sendNotificationEmail({
  to,
  name,
  title,
  message,
  level,
}: {
  to: string;
  name: string;
  title: string;
  message?: string | null;
  level: string;
}): Promise<void> {
  try {
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
    const appName = Deno.env.get("APP_NAME") || "Thrive Initiative";
    const fromEmail = Deno.env.get("EMAIL_FROM") || "noreply@yourapp.com";

    const emailSubject = `[${appName}] ${title}`;
    const levelColor =
      level === "error"
        ? "#dc3545"
        : level === "warning"
          ? "#f0ad4e"
          : level === "success"
            ? "#5cb85c"
            : "#17a2b8";
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background: #f5f5f5; }
    .container { background: #fff; border-radius: 12px; margin: 24px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
    .title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    .message { color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge" style="background: ${levelColor}; color: white;">${level}</div>
    <div class="title">${title}</div>
    ${message ? `<div class="message">${message.replace(/\n/g, "<br>")}</div>` : ""}
    <p style="margin-top: 20px; font-size: 12px; color: #888;">This notification was sent from ${appName} Admin Panel.</p>
  </div>
</body>
</html>`;

    const emailText = `${title}${message ? `\n\n${message}` : ""}\n\n— ${appName} Admin Panel`;

    if (emailService === "resend") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn(
          "⚠️ RESEND_API_KEY not set - notification email will not be sent",
        );
        return;
      }
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject: emailSubject,
          html: emailHtml,
          text: emailText,
        }),
      });
      console.log("✅ Notification email sent via Resend:", to);
    } else if (emailService === "sendgrid") {
      const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
      if (!sendgridKey) {
        console.warn(
          "⚠️ SENDGRID_API_KEY not set - notification email will not be sent",
        );
        return;
      }
      await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{to: [{email: to}]}],
          from: {email: fromEmail},
          subject: emailSubject,
          content: [
            {type: "text/plain", value: emailText},
            {type: "text/html", value: emailHtml},
          ],
        }),
      });
      console.log("✅ Notification email sent via SendGrid:", to);
    }
  } catch (error) {
    console.error("❌ Error sending notification email:", error);
  }
}

async function sendPasswordResetEmail({
  to,
  name,
  resetToken,
}: {
  to: string;
  name: string;
  resetToken: string;
}): Promise<void> {
  try {
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
    const appName = Deno.env.get("APP_NAME") || "Thrive Initiative";
    const fromEmail = Deno.env.get("EMAIL_FROM") || "noreply@yourapp.com";
    const appUrl =
      Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";

    const resetLink = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(to)}`;
    const emailSubject = `${appName} Password Reset`;
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 0;
      background: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 12px;
      margin: 24px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .button {
      display: inline-block;
      background: #DB8633;
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 8px;
    }
    .hint {
      color: #666;
      font-size: 14px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="title">Hi ${name},</div>
    <p>We received a request to reset your password.</p>
    <p>Click the button below to set a new password:</p>
    <a class="button" href="${resetLink}">Reset Password</a>
    <p class="hint">If you did not request this, you can ignore this email.</p>
  </div>
</body>
</html>`;

    const emailText = `Hi ${name},

We received a request to reset your password.

Reset your password: ${resetLink}

If you did not request this, you can ignore this email.`;

    if (emailService === "resend") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn("⚠️ RESEND_API_KEY not set - email will not be sent");
        return;
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to,
          subject: emailSubject,
          html: emailHtml,
          text: emailText,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend API error: ${errorText}`);
      }
      console.log("✅ Password reset email sent via Resend:", to);
      return;
    }

    if (emailService === "sendgrid") {
      const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
      if (!sendgridApiKey) {
        console.warn("⚠️ SENDGRID_API_KEY not set - email will not be sent");
        return;
      }
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{to: [{email: to}]}],
          from: {email: fromEmail},
          subject: emailSubject,
          content: [
            {type: "text/plain", value: emailText},
            {type: "text/html", value: emailHtml},
          ],
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid API error: ${errorText}`);
      }
      console.log("✅ Password reset email sent via SendGrid:", to);
      return;
    }

    console.log("📧 Password reset email fallback:", {
      to,
      subject: emailSubject,
    });
  } catch (error) {
    console.error("❌ Error sending password reset email:", error);
  }
}

// CORS headers helper
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-app-authorization, x-client-info, apikey, content-type, x-admin-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function getAppAuthHeader(req: Request): string | null {
  return req.headers.get("X-App-Authorization") || req.headers.get("Authorization");
}

async function getJwtPayload(authHeader: string | null): Promise<any | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const jwtSecret = Deno.env.get("JWT_SECRET");
  if (!jwtSecret) {
    console.error("JWT_SECRET not configured");
    return null;
  }

  try {
    const secretKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      {name: "HMAC", hash: "SHA-256"},
      false,
      ["verify"],
    );
    const decoded = await verifyJWT(token, secretKey);
    return decoded;
  } catch (error) {
    console.error("❌ JWT verification failed:", error);
    return null;
  }
}

/** Base64 for Resend attachment payloads (binary-safe, avoids stack limits on large images). */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function handleFeedbackRoute(
  req: Request,
  supabase: any,
  userId: number | null,
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  const contentType = req.headers.get("content-type") || "";
  let rating: unknown;
  let feedbackType: unknown;
  let message: string;
  /** Client may send JSON `{ attachments: [{ filename, content }] }` with base64 content (RN). */
  const jsonAttachments: { filename: string; content: string }[] = [];
  /** RN/axios multipart often yields Blob parts that are not `instanceof File` in Deno. */
  const attachmentBlobs: { blob: Blob; filename: string }[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    rating = formData.get("rating") ?? undefined;
    feedbackType = formData.get("feedbackType") ?? undefined;
    const msg = formData.get("message");
    message = typeof msg === "string" ? msg : "";
    let attachmentIndex = 0;
    for (const entry of formData.getAll("attachments")) {
      if (!(entry instanceof Blob) || entry.size === 0) continue;
      attachmentIndex += 1;
      const filename = entry instanceof File && entry.name?.trim()
        ? entry.name
        : `attachment_${attachmentIndex}.jpg`;
      attachmentBlobs.push({ blob: entry, filename });
    }
    console.log(
      `📎 Feedback multipart: ${attachmentBlobs.length} file part(s), keys=${[...new Set([...formData.keys()])].join(",")}`,
    );
  } else {
    const body = await req.json();
    rating = body.rating;
    feedbackType = body.feedbackType;
    message = typeof body.message === "string" ? body.message : "";
    const rawAtt = body.attachments;
    if (Array.isArray(rawAtt)) {
      const MAX_FILES = 5;
      const MAX_B64_CHARS = 16 * 1024 * 1024;
      for (let i = 0; i < Math.min(rawAtt.length, MAX_FILES); i++) {
        const item = rawAtt[i];
        if (!item || typeof item.content !== "string" || typeof item.filename !== "string") {
          continue;
        }
        const fn = String(item.filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
        const c = String(item.content).replace(/\s/g, "");
        if (!c || c.length > MAX_B64_CHARS) continue;
        jsonAttachments.push({
          filename: fn || `attachment_${i + 1}.jpg`,
          content: c,
        });
      }
      console.log(`📎 Feedback JSON: ${jsonAttachments.length} base64 attachment(s)`);
    }
  }

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message is required." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const type = (feedbackType || "general") as string;
  const ratingRequired = type === "general";
  const ratingNum =
    rating === undefined || rating === null || rating === ""
      ? 0
      : Number(rating);
  if (ratingRequired && (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5)) {
    return new Response(JSON.stringify({ error: "A rating from 1–5 is required for general feedback." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  let userName = "App User";
  let userEmail = "unknown";
  if (userId != null) {
    const { data: userData } = await supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", userId)
      .single();
    if (userData) {
      userName = `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || "App User";
      userEmail = userData.email || "unknown";
    }
  }

  const ratingLabel =
    ratingNum >= 1 && ratingNum <= 5
      ? (["", "Poor", "Fair", "Good", "Very Good", "Excellent"][ratingNum] || String(ratingNum))
      : "Not provided";
  const typeLabel = type;

  const ratingRowHtml =
    ratingNum >= 1 && ratingNum <= 5
      ? `<tr><td style="padding:8px;font-weight:600;color:#324E58">Rating</td><td style="padding:8px;color:#555">${ratingNum}/5 — ${ratingLabel}</td></tr>`
      : `<tr><td style="padding:8px;font-weight:600;color:#324E58">Rating</td><td style="padding:8px;color:#555">${ratingLabel}</td></tr>`;

  const safeMessageHtml = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#DB8633">New App Feedback</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:8px;font-weight:600;color:#324E58;width:140px">From</td><td style="padding:8px;color:#555">${userName} (${userEmail})</td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:600;color:#324E58">Type</td><td style="padding:8px;color:#555">${typeLabel}</td></tr>
        ${ratingRowHtml}
      </table>
      <div style="background:#fafafa;border-left:4px solid #DB8633;padding:16px;border-radius:4px">
        <p style="margin:0;color:#324E58;line-height:1.6">${safeMessageHtml}</p>
      </div>
      <p style="margin-top:24px;font-size:12px;color:#aaa">Sent from THRIVE app</p>
    </div>
  `;

  const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
  const toEmail = "info@jointhriveinitiative.org";

  try {
    if (emailService === "resend") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn("⚠️ RESEND_API_KEY not set — feedback not emailed");
      } else {
        const attachmentsPayload: { filename: string; content: string }[] = [
          ...jsonAttachments,
        ];
        for (const { blob, filename } of attachmentBlobs) {
          try {
            const content = await blobToBase64(blob);
            attachmentsPayload.push({ filename, content });
          } catch (attErr) {
            console.error("Feedback attachment encode failed:", attErr);
          }
        }
        console.log(`📎 Resend: attaching ${attachmentsPayload.length} file(s) to feedback email`);
        const emailPayload: Record<string, unknown> = {
          from: "THRIVE App <noreply@jointhriveinitiative.org>",
          to: [toEmail],
          subject: `[THRIVE Feedback] ${typeLabel} — ${
            ratingNum >= 1 && ratingNum <= 5 ? `${ratingLabel} (${ratingNum}/5)` : ratingLabel
          }`,
          html: emailHtml,
        };
        if (attachmentsPayload.length > 0) {
          emailPayload.attachments = attachmentsPayload;
        }
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(emailPayload),
        });
        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error("Resend API error:", resendRes.status, errText);
        }
      }
    }
  } catch (e) {
    console.error("Failed to send feedback email:", e);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {headers: corsHeaders, status: 204});
  }

  try {
    // Parse URL and route first (before any authentication checks)
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    // Supabase Edge Functions have path: /functions/v1/api/*
    // Remove the Supabase function path prefix
    let route = pathname;

    // Remove Supabase function prefix if present
    if (route.startsWith("/functions/v1/api")) {
      route = route.replace("/functions/v1/api", "");
    } else if (route.startsWith("/api")) {
      route = route.replace("/api", "");
    }

    // Ensure route starts with /
    if (!route.startsWith("/")) {
      route = "/" + route;
    }

    // Handle root path
    if (route === "/") {
      route = "/";
    }

    // Define public routes that don't require JWT authentication
    // These routes only need the 'apikey' header (Supabase project identifier)
    const publicRoutes = [
      "/auth/signup",
      "/auth/login",
      "/auth/social-login", // Social login endpoint (OAuth)
      "/auth/verify",
      "/auth/verify-email", // Email verification endpoint (public - no auth required)
      "/auth/resend-verification",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/delete-user", // Public for testing - should be secured in production
      "/discounts",
      "/vendors",
      "/charities",
      "/donations", // GET /donations is public (browse all donations)
      "/invitations/beneficiary", // Allow unauthenticated beneficiary requests
      "/webhooks/stripe", // Stripe webhook endpoint (public but secured with signature)
      "/delete-account", // Account deletion information page (Google Play requirement)
      "/data-deletion/request", // Partial data deletion request endpoint
      "/data-deletion/types", // Get available data types for deletion
      "/health",
      "/",
    ];

    // Define protected sub-routes that should not be treated as public
    // even if they start with a public route prefix
    const protectedSubRoutes = [
      "/donations/monthly",
      "/donations/my-donations",
    ];

    // Check if this is a protected sub-route first
    const isProtectedSubRoute = protectedSubRoutes.some((protectedRoute) =>
      route.startsWith(protectedRoute),
    );

    // Check if this is a public route (but not if it's a protected sub-route)
    // Normalize route by removing trailing slashes for matching
    const normalizedRoute = route.replace(/\/$/, "");
    const isPublicRoute =
      !isProtectedSubRoute &&
      publicRoutes.some((publicRoute) => {
        const normalizedPublicRoute = publicRoute.replace(/\/$/, "");
        // Exact match
        if (normalizedRoute === normalizedPublicRoute) {
          return true;
        }
        // For routes that start with public route, check if it's a sub-route
        if (normalizedRoute.startsWith(normalizedPublicRoute + "/")) {
          return true;
        }
        return false;
      });

    // Debug logging for delete-account route
    if (route === "/delete-account" || pathname.includes("delete-account")) {
      console.log(`🔍 DELETE-ACCOUNT ROUTE DEBUG:`);
      console.log(`   Original pathname: ${pathname}`);
      console.log(`   Parsed route: ${route}`);
      console.log(`   isPublicRoute: ${isPublicRoute}`);
      console.log(`   isProtectedSubRoute: ${isProtectedSubRoute}`);
      console.log(
        `   Public routes check: ${publicRoutes.includes("/delete-account")}`,
      );
    }

    // Verify apikey header is present (required for all Supabase Edge Function requests)
    const apikey = req.headers.get("apikey") || req.headers.get("x-api-key");
    const authHeader = getAppAuthHeader(req);
    /** Set from JWT on protected routes; passed to handlers like /feedback */
    let userId: number | null = null;

    // For public routes, allow requests with or without Authorization header
    // For protected routes, require Authorization header with valid JWT
    // Exception: Admin routes can use X-Admin-Secret header instead of JWT
    const isAdminRoute = route.startsWith("/admin/");
    const adminSecret = req.headers.get("x-admin-secret");

    // Special handling for delete-account route - always allow (it's public)
    const isDeleteAccountRoute =
      route === "/delete-account" || pathname.includes("delete-account");

    if (!isPublicRoute && !isAdminRoute && !isDeleteAccountRoute) {
      // Protected route (non-admin) - require JWT token
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.warn("⚠️ Protected route requires Authorization header");
        console.warn(
          `   Route: ${route}, isPublicRoute: ${isPublicRoute}, isAdminRoute: ${isAdminRoute}`,
        );
        return new Response(
          JSON.stringify({
            code: 401,
            message:
              "Missing authorization header. This endpoint requires authentication.",
          }),
          {
            status: 401,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      const payload = await getJwtPayload(authHeader);
      if (!payload) {
        return new Response(
          JSON.stringify({code: 401, message: "Invalid or expired token"}),
          {
            status: 401,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }
      const rawUserId = payload.id ?? payload.userId;
      if (rawUserId != null && rawUserId !== "") {
        const n = Number(rawUserId);
        userId = Number.isFinite(n) ? n : null;
      }
    } else if (isAdminRoute) {
      // Admin route - allow through (handleAdminRoute will check admin secret)
      console.log("📝 Admin route - will check admin secret in handler");
    } else {
      // Public route - log but allow through (even without Authorization header)
      if (authHeader) {
        console.log("📝 Public route with Authorization header (optional)");
      } else {
        console.log("📝 Public route without Authorization header (allowed)");
      }
    }

    // Log route info for debugging
    console.log(
      `📡 ${method} ${pathname} → ${route} [${isPublicRoute ? "PUBLIC" : "PROTECTED"}]`,
    );
    console.log(
      `🔑 apikey present: ${!!apikey}, authHeader present: ${!!authHeader}`,
    );

    // For public routes, ensure apikey is present (Supabase requirement)
    // But don't block if missing - just log a warning
    if (isPublicRoute && !apikey) {
      console.warn(
        "⚠️ Public route accessed without apikey header (may cause issues)",
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Missing required environment variables:");
      console.error("   SUPABASE_URL:", supabaseUrl ? "✅ Set" : "❌ Missing");
      console.error(
        "   SUPABASE_SERVICE_ROLE_KEY:",
        supabaseKey ? "✅ Set" : "❌ Missing",
      );
      return new Response(
        JSON.stringify({
          error:
            "Server configuration error: Missing required environment variables",
          details:
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Edge Function secrets",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Route handlers
    let response;

    // Account deletion information page (Google Play requirement) - handle early
    if (route === "/delete-account") {
      console.log("✅ Handling delete-account route");
      response = await handleAccountDeletionPage();
    }
    // Data deletion routes (partial data deletion) - handle early
    else if (route.startsWith("/data-deletion")) {
      response = await handleDataDeletionRoute(req, supabase, route, method);
    }
    // Admin routes
    else if (route.startsWith("/admin/")) {
      response = await handleAdminRoute(req, supabase, route, method);
    }
    // Vendor routes (public API)
    else if (route.startsWith("/vendors")) {
      response = await handleVendorRoute(req, supabase, route, method);
    }
    // Auth routes
    else if (route.startsWith("/auth")) {
      response = await handleAuthRoute(req, supabase, route, method);
    }
    // Discounts routes
    else if (route.startsWith("/discounts")) {
      console.log(`🔍 Processing discount route: ${method} ${route}`);
      response = await handleDiscountRoute(req, supabase, route, method);
    }
    // Charities routes
    else if (route.startsWith("/charities")) {
      response = await handleCharityRoute(req, supabase, route, method);
    }
    // Donations routes
    else if (route.startsWith("/donations")) {
      response = await handleDonationRoute(req, supabase, route, method);
    }
    // Transactions routes
    else if (route.startsWith("/transactions")) {
      response = await handleTransactionRoute(req, supabase, route, method);
    }
    // Payment methods routes
    else if (route.startsWith("/payment-methods")) {
      response = await handlePaymentMethodRoute(req, supabase, route, method);
    }
    // User points routes
    else if (route.startsWith("/user/points")) {
      response = await handleUserPointsRoute(req, supabase, route, method);
    }
    // Invitations routes
    else if (route.startsWith("/invitations")) {
      response = await handleInvitationRoute(req, supabase, route, method);
    }
    // Uploads routes
    else if (route.startsWith("/uploads")) {
      response = await handleUploadRoute(req, supabase, route, method);
    }
    // Referrals routes
    else if (route.startsWith("/referrals")) {
      response = await handleReferralRoute(req, supabase, route, method);
    }
    // Stripe payment sheet routes
    else if (route.startsWith("/stripe")) {
      response = await handleStripePaymentSheetRoute(req, supabase, route, method);
    }
    // One-time gifts routes
    else if (route.startsWith("/one-time-gifts")) {
      response = await handleOneTimeGiftRoute(req, supabase, route, method);
    }
    // Webhooks routes
    else if (route.startsWith("/webhooks")) {
      response = await handleWebhookRoute(req, supabase, route, method);
    }
    // Feedback route
    else if (route === "/feedback") {
      response = await handleFeedbackRoute(req, supabase, userId);
    }
    // Health check
    else if (route === "/" || route === "/health") {
      response = new Response(
        JSON.stringify({
          status: "ok",
          message: "Supabase Edge Function API",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    }
    // 404
    else {
      response = new Response(JSON.stringify({error: "Route not found"}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 404,
      });
    }

    // Add CORS headers to response (preserve existing Content-Type)
    const existingContentType = response.headers.get("Content-Type");

    // Clone response to get body (responses can only be read once)
    const clonedResponse = response.clone();
    const responseBody = await clonedResponse.text();

    // Create new headers object to ensure Content-Type is preserved
    const finalHeaders = new Headers();

    // CRITICAL: Set Content-Type FIRST (before CORS) if it exists, otherwise default to JSON
    if (existingContentType) {
      finalHeaders.set("Content-Type", existingContentType);
    } else if (!response.headers.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }

    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      finalHeaders.set(key, value);
    });

    // Create new response with correct headers and body
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: finalHeaders,
    });
  } catch (error) {
    console.error("❌ Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString(),
      }),
      {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 500,
      },
    );
  }
});

// Admin route handler
async function handleAdminRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // Check admin secret
  const adminSecret = req.headers.get("x-admin-secret");
  const expectedSecret = Deno.env.get("ADMIN_SECRET_KEY");

  if (!adminSecret || adminSecret !== expectedSecret) {
    return new Response(JSON.stringify({error: "Unauthorized admin access"}), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      status: 401,
    });
  }

  // Vendors routes under /admin/vendors
  if (route.startsWith("/admin/vendors")) {
    return await handleAdminVendors(req, supabase, route, method);
  }

  // Discounts routes under /admin/discounts
  if (route.startsWith("/admin/discounts")) {
    return await handleAdminDiscounts(req, supabase, route, method);
  }

  // Analytics routes
  if (route.startsWith("/admin/analytics")) {
    return await handleAdminAnalytics(req, supabase, route, method);
  }

  // Notifications routes
  if (route.startsWith("/admin/notifications")) {
    return await handleAdminNotifications(req, supabase, route, method);
  }

  // Settings routes
  if (route.startsWith("/admin/settings")) {
    return await handleAdminSettings(req, supabase, route, method);
  }

  // Donors routes
  if (route.startsWith("/admin/donors")) {
    return await handleAdminDonors(req, supabase, route, method);
  }

  // Charities routes under /admin/charities
  if (route.startsWith("/admin/charities")) {
    return await handleAdminCharities(req, supabase, route, method);
  }

  // One-time gifts routes under /admin/one-time-gifts
  if (route.startsWith("/admin/one-time-gifts")) {
    return await handleAdminOneTimeGifts(req, supabase, route, method);
  }

  // Storage routes under /admin/storage
  if (route.startsWith("/admin/storage")) {
    return await handleAdminStorageRoute(req, supabase, route, method);
  }

  // Users routes under /admin/users
  if (route.startsWith("/admin/users")) {
    return await handleAdminUsers(req, supabase, route, method);
  }

  // Credits routes under /admin/credits
  if (route.startsWith("/admin/credits")) {
    return await handleAdminCredits(req, supabase, route, method);
  }

  // Reporting routes under /admin/reporting
  if (route.startsWith("/admin/reporting")) {
    return await handleAdminReporting(req, supabase, route, method);
  }

  // Invitations routes under /admin/invitations
  if (route.startsWith("/admin/invitations")) {
    return await handleAdminInvitations(req, supabase, route, method);
  }

  return new Response(JSON.stringify({error: "Admin route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Admin vendors handler (placeholder - will implement)
async function handleAdminVendors(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/vendors
  if (method === "GET" && route === "/admin/vendors") {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;
    const search = url.searchParams.get("search");
    const category = url.searchParams.get("category");

    // Build query
    let query = supabase.from("vendors").select("*", {count: "exact"});

    // Search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Category filter
    if (category) {
      query = query.eq("category", category);
    }

    // Order and pagination
    query = query
      .order("created_at", {ascending: false})
      .range(offset, offset + limit - 1);

    const {data: vendors, error, count} = await query;

    if (error) {
      console.error("❌ Admin get vendors error:", error);
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: vendors || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit),
        },
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/vendors/:id/logo (file upload)
  const vendorLogoMatch = route.match(/^\/admin\/vendors\/(\d+)\/logo$/);
  if (method === "POST" && vendorLogoMatch) {
    const vendorId = vendorLogoMatch[1];

    // Verify vendor exists
    const {data: vendor, error: vendorError} = await supabase
      .from("vendors")
      .select("*")
      .eq("id", vendorId)
      .single();

    if (vendorError || !vendor) {
      return new Response(JSON.stringify({error: "Vendor not found"}), {
        headers: {"Content-Type": "application/json"},
        status: 404,
      });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("logo") as File;

    if (!file) {
      return new Response(JSON.stringify({error: "No file uploaded"}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = file.name.split(".").pop();
    const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `vendor-${vendorId}/${fileName}`;

    // Upload to Supabase Storage
    const {data: uploadData, error: uploadError} = await supabase.storage
      .from("vendor-logos")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("❌ Error uploading logo:", uploadError);
      return new Response(JSON.stringify({error: "Failed to upload logo"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    // Get public URL
    const {
      data: {publicUrl},
    } = supabase.storage.from("vendor-logos").getPublicUrl(filePath);

    // Update vendor with new logo URL
    const {error: updateError} = await supabase
      .from("vendors")
      .update({
        logo_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vendorId);

    if (updateError) {
      console.error("❌ Error updating vendor logo:", updateError);

      // Try to delete uploaded file if database update fails
      try {
        await supabase.storage.from("vendor-logos").remove([filePath]);
      } catch (deleteError) {
        console.error("Error deleting uploaded file:", deleteError);
      }

      return new Response(
        JSON.stringify({error: "Failed to update vendor logo"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        logoUrl: publicUrl,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/vendors
  if (method === "POST" && route === "/admin/vendors") {
    const body = await req.json();
    const {
      name,
      category,
      description,
      website,
      phone,
      email,
      socialLinks,
      address,
      hours,
      logoUrl,
      logo_url,
    } = body;

    if (!name) {
      return new Response(JSON.stringify({error: "Vendor name is required"}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    // Handle logo URL - accept both camelCase and snake_case
    const logoUrlValue = logoUrl || logo_url;
    if (logoUrlValue !== undefined) {
      console.log(
        `📸 Logo URL received in POST /admin/vendors: ${logoUrlValue}`,
      );
    }

    const {data: newVendor, error: insertError} = await supabase
      .from("vendors")
      .insert([
        {
          name,
          category: category || null,
          description: description || null,
          website: website || null,
          phone: phone || null,
          email: email || null,
          social_links: socialLinks || null,
          address: address || null,
          hours: hours || null,
          logo_url: logoUrlValue || null,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("❌ Admin create vendor error:", insertError);
      return new Response(JSON.stringify({error: insertError.message}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    return new Response(JSON.stringify({success: true, data: newVendor}), {
      headers: {"Content-Type": "application/json"},
      status: 201,
    });
  }

  // GET /admin/vendors/:id
  const vendorIdMatch = route.match(/^\/admin\/vendors\/(\d+)$/);
  if (method === "GET" && vendorIdMatch) {
    const vendorId = vendorIdMatch[1];

    const {data: vendor, error} = await supabase
      .from("vendors")
      .select("*")
      .eq("id", vendorId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(JSON.stringify({error: "Vendor not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    return new Response(JSON.stringify({success: true, data: vendor}), {
      headers: {"Content-Type": "application/json"},
      status: 200,
    });
  }

  // PUT /admin/vendors/:id
  const putVendorMatch = route.match(/^\/admin\/vendors\/(\d+)$/);
  if (method === "PUT" && putVendorMatch) {
    const vendorId = putVendorMatch[1];
    const body = await req.json();

    const {
      name,
      category,
      description,
      website,
      phone,
      email,
      socialLinks,
      address,
      hours,
      logoUrl,
      logo_url,
      status,
      is_enabled,
    } = body;

    // Handle logo URL - accept both camelCase and snake_case
    const logoUrlValue = logoUrl || logo_url;
    if (logoUrlValue !== undefined) {
      console.log(
        `📸 Logo URL received in PUT /admin/vendors/${vendorId}: ${logoUrlValue}`,
      );
    } else {
      console.log(
        `⚠️ No logoUrl or logo_url provided in PUT /admin/vendors/${vendorId}`,
      );
    }

    // Build update object - only include fields that were explicitly provided (partial update support)
    const updateObj: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updateObj.name = name;
    if (category !== undefined) updateObj.category = category || null;
    if (description !== undefined) updateObj.description = description || null;
    if (website !== undefined) updateObj.website = website || null;
    if (phone !== undefined) updateObj.phone = phone || null;
    if (email !== undefined) updateObj.email = email || null;
    if (socialLinks !== undefined) updateObj.social_links = socialLinks || null;
    if (address !== undefined) updateObj.address = address || null;
    if (hours !== undefined) updateObj.hours = hours || null;
    if (logoUrlValue !== undefined) updateObj.logo_url = logoUrlValue || null;
    // Active/inactive toggle - vendors table uses is_active (not status)
    if (status !== undefined) {
      updateObj.is_active = status === "active";
    }
    // is_enabled for enable/disable toggle (if vendors table has this column)
    if (is_enabled !== undefined) {
      updateObj.is_enabled = !!is_enabled;
    }

    const {data: updatedVendor, error} = await supabase
      .from("vendors")
      .update(updateObj)
      .eq("id", vendorId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(JSON.stringify({error: "Vendor not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    return new Response(JSON.stringify({success: true, data: updatedVendor}), {
      headers: {"Content-Type": "application/json"},
      status: 200,
    });
  }

  // DELETE /admin/vendors/:id
  const deleteVendorMatch = route.match(/^\/admin\/vendors\/(\d+)$/);
  if (method === "DELETE" && deleteVendorMatch) {
    const vendorId = deleteVendorMatch[1];

    const {error} = await supabase.from("vendors").delete().eq("id", vendorId);

    if (error) {
      console.error("❌ Admin delete vendor error:", error);
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({message: "Vendor deleted successfully"}),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  return new Response(JSON.stringify({error: "Vendor route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Admin discounts handler
async function handleAdminDiscounts(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/discounts
  if (method === "GET" && route === "/admin/discounts") {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;
    const search = url.searchParams.get("search");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const vendorId = url.searchParams.get("vendorId");

    // Build query with JOIN to vendors
    let query = supabase.from("discounts").select(
      `
        *,
        vendor:vendors!vendor_id (
          id,
          name
        )
      `,
      {count: "exact"},
    );

    // Search filter
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Category filter
    if (category) {
      query = query.eq("category", category);
    }

    // Status filter
    if (status) {
      if (status === "active") {
        const today = new Date().toISOString().split("T")[0];
        query = query
          .eq("is_active", true)
          .or(`end_date.is.null,end_date.gte.${today}`);
      } else if (status === "inactive") {
        query = query.eq("is_active", false);
      } else if (status === "expired") {
        const today = new Date().toISOString().split("T")[0];
        query = query.lt("end_date", today);
      }
    }

    // Vendor filter
    if (vendorId) {
      query = query.eq("vendor_id", vendorId);
    }

    // Order and pagination
    query = query
      .order("created_at", {ascending: false})
      .range(offset, offset + limit - 1);

    const {data: discounts, error, count} = await query;

    if (error) {
      console.error("❌ Admin get discounts error:", error);
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    // Format discounts to include vendor_name
    const formattedDiscounts = (discounts || []).map((discount: any) => ({
      ...discount,
      vendor_name: discount.vendor?.name || null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedDiscounts,
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit),
        },
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/discounts
  if (method === "POST" && route === "/admin/discounts") {
    const body = await req.json();
    const {
      vendorId,
      title,
      description,
      discountCode,
      discountType,
      discountValue,
      usageLimit,
      category,
      tags,
      startDate,
      endDate,
      isActive,
      terms,
      availability,
    } = body;

    if (!vendorId || !title) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Vendor ID and title are required",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 400,
        },
      );
    }

    // Ensure tags is an array for JSONB
    let tagsArray = null;
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else if (typeof tags === "string") {
        try {
          tagsArray = JSON.parse(tags);
          if (!Array.isArray(tagsArray)) {
            tagsArray = [tags];
          }
        } catch {
          tagsArray = [tags];
        }
      } else {
        tagsArray = [tags];
      }
    }

    // Map camelCase to snake_case for database
    // Support both discountCode and posCode (frontend sends discountCode)
    // IMPORTANT: Only include columns that exist in the database
    // DO NOT include: min_purchase, max_discount (these columns don't exist)
    const dbData: any = {
      vendor_id: vendorId,
      title: title, // Use title field
      description: description || null,
      discount_code: discountCode || null, // Support discountCode from frontend
      discount_type: discountType || "percentage",
      discount_value: discountValue || 0,
      usage_limit: usageLimit || "unlimited", // New field: usage limit
      category: category || null,
      tags: tagsArray,
      start_date: startDate || null,
      end_date: endDate || null,
      is_active: isActive !== undefined ? isActive : true,
      terms: terms || null,
      availability: availability || null,
    };

    // Explicitly remove any fields that don't exist in the database
    // This prevents PostgREST from trying to validate non-existent columns
    delete dbData.min_purchase;
    delete dbData.max_discount;
    delete dbData.minPurchase;
    delete dbData.maxDiscount;

    const {data: newDiscount, error: insertError} = await supabase
      .from("discounts")
      .insert([dbData])
      .select(
        `
        *,
        vendor:vendors!vendor_id (
          id,
          name
        )
      `,
      )
      .single();

    if (insertError) {
      console.error("❌ Admin create discount error:", insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: insertError.message,
          details: insertError.details,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 400,
        },
      );
    }

    const formattedDiscount = {
      ...newDiscount,
      vendor_name: newDiscount.vendor?.name || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedDiscount,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 201,
      },
    );
  }

  // GET /admin/discounts/:id
  const discountIdMatch = route.match(/^\/admin\/discounts\/(\d+)$/);
  if (method === "GET" && discountIdMatch) {
    const discountId = discountIdMatch[1];

    const {data: discount, error} = await supabase
      .from("discounts")
      .select(
        `
        *,
        vendor:vendors!vendor_id (
          id,
          name
        )
      `,
      )
      .eq("id", discountId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(JSON.stringify({error: "Discount not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    const formattedDiscount = {
      ...discount,
      vendor_name: discount.vendor?.name || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedDiscount,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // PUT /admin/discounts/:id
  const putDiscountMatch = route.match(/^\/admin\/discounts\/(\d+)$/);
  if (method === "PUT" && putDiscountMatch) {
    const discountId = putDiscountMatch[1];
    const body = await req.json();

    const {
      vendorId,
      title,
      description,
      discountCode,
      discountType,
      discountValue,
      usageLimit,
      category,
      tags,
      startDate,
      endDate,
      isActive,
      terms,
      availability,
    } = body;

    // Ensure tags is array for JSONB
    let tagsArray = null;
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else if (typeof tags === "string") {
        try {
          const parsed = JSON.parse(tags);
          tagsArray = Array.isArray(parsed) ? parsed : [tags];
        } catch {
          tagsArray = [tags];
        }
      } else {
        tagsArray = [tags];
      }
    }

    // Map camelCase to snake_case for database
    // Support both discountCode and posCode (frontend sends discountCode)
    // IMPORTANT: Only include columns that exist in the database
    // DO NOT include: min_purchase, max_discount (these columns don't exist)
    const updateData: any = {
      vendor_id: vendorId,
      title: title,
      description: description || null,
      discount_code: discountCode || null, // Support discountCode from frontend
      discount_type: discountType || "percentage",
      discount_value: discountValue || 0,
      usage_limit: usageLimit !== undefined ? usageLimit : "unlimited", // New field: usage limit
      category: category || null,
      tags: tagsArray,
      start_date: startDate || null,
      end_date: endDate || null,
      is_active: isActive !== undefined ? isActive : true,
      terms: terms || null,
      availability: availability || null,
      updated_at: new Date().toISOString(),
    };

    // Explicitly remove any fields that don't exist in the database
    // This prevents PostgREST from trying to validate non-existent columns
    delete updateData.min_purchase;
    delete updateData.max_discount;
    delete updateData.minPurchase;
    delete updateData.maxDiscount;

    const {data: updatedDiscount, error} = await supabase
      .from("discounts")
      .update(updateData)
      .eq("id", discountId)
      .select(
        `
        *,
        vendor:vendors!vendor_id (
          id,
          name
        )
      `,
      )
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Discount not found",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 404,
          },
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          details: error.details,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 400,
        },
      );
    }

    const formattedDiscount = {
      ...updatedDiscount,
      vendor_name: updatedDiscount.vendor?.name || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedDiscount,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // DELETE /admin/discounts/:id
  const deleteDiscountMatch = route.match(/^\/admin\/discounts\/(\d+)$/);
  if (method === "DELETE" && deleteDiscountMatch) {
    const discountId = deleteDiscountMatch[1];

    const {error} = await supabase
      .from("discounts")
      .delete()
      .eq("id", discountId);

    if (error) {
      console.error("❌ Admin delete discount error:", error);
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Discount deleted successfully",
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/discounts/:id/image (file upload)
  const discountImageMatch = route.match(/^\/admin\/discounts\/(\d+)\/image$/);
  if (method === "POST" && discountImageMatch) {
    const discountId = discountImageMatch[1];

    // Verify discount exists
    const {data: discount, error: discountError} = await supabase
      .from("discounts")
      .select("*")
      .eq("id", discountId)
      .single();

    if (discountError || !discount) {
      return new Response(JSON.stringify({error: "Discount not found"}), {
        headers: {"Content-Type": "application/json"},
        status: 404,
      });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return new Response(JSON.stringify({error: "No file uploaded"}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = file.name.split(".").pop();
    const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `discount-${discountId}/${fileName}`;

    // Upload to Supabase Storage
    const {data: uploadData, error: uploadError} = await supabase.storage
      .from("discount-images")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("❌ Error uploading discount image:", uploadError);
      return new Response(JSON.stringify({error: "Failed to upload image"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    // Get public URL
    const {
      data: {publicUrl},
    } = supabase.storage.from("discount-images").getPublicUrl(filePath);

    // Update discount with new image URL
    const {error: updateError} = await supabase
      .from("discounts")
      .update({
        image_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", discountId);

    if (updateError) {
      console.error("❌ Error updating discount image:", updateError);

      // Try to delete uploaded file if database update fails
      try {
        await supabase.storage.from("discount-images").remove([filePath]);
      } catch (deleteError) {
        console.error("Error deleting uploaded file:", deleteError);
      }

      return new Response(
        JSON.stringify({error: "Failed to update discount image"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: publicUrl,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  return new Response(JSON.stringify({error: "Discount route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Admin analytics handler
async function handleAdminAnalytics(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/analytics/leaderboard/:type
  const leaderboardMatch = route.match(
    /^\/admin\/analytics\/leaderboard\/(\w+)$/,
  );
  if (method === "GET" && leaderboardMatch) {
    const type = leaderboardMatch[1]; // 'donors', 'beneficiaries', 'vendors'
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "30d";

    // Calculate date range from period
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;
      case "1y":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case "all":
        startDate = new Date(0);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    if (type === "donors") {
      // Get top donors based on donations
      const {data: donations, error: donationsError} = await supabase
        .from("donations")
        .select("donor_id, amount")
        .eq("status", "active")
        .gte("created_at", startDate.toISOString());

      if (donationsError) {
        console.error("Error fetching donations:", donationsError);
        return new Response(
          JSON.stringify({error: "Failed to fetch leaderboard data"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Aggregate donations by donor
      const donorTotals: Record<
        number,
        {totalAmount: number; donationCount: number}
      > = {};
      donations?.forEach((donation: any) => {
        if (!donorTotals[donation.donor_id]) {
          donorTotals[donation.donor_id] = {totalAmount: 0, donationCount: 0};
        }
        donorTotals[donation.donor_id].totalAmount += parseFloat(
          donation.amount || 0,
        );
        donorTotals[donation.donor_id].donationCount += 1;
      });

      // Get donor details
      const donorIds = Object.keys(donorTotals).map((id) => parseInt(id));

      if (donorIds.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [],
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      }

      const {data: users, error: usersError} = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, phone, city, state, profile_picture_url",
        )
        .in("id", donorIds)
        .eq("role", "donor");

      if (usersError) {
        console.error("Error fetching users:", usersError);
        return new Response(
          JSON.stringify({error: "Failed to fetch leaderboard data"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Combine data and calculate points
      const leaderboard =
        users?.map((user: any) => {
          const totals = donorTotals[user.id];
          return {
            rank: 0,
            name:
              `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
              user.email.split("@")[0],
            email: user.email,
            contact: user.phone || "N/A",
            cityState: `${user.city || "N/A"}, ${user.state || "N/A"}`,
            points: Math.round(totals.totalAmount),
            avatar:
              user.first_name?.[0]?.toUpperCase() ||
              user.email[0].toUpperCase(),
            totalDonations: totals.totalAmount,
            donationCount: totals.donationCount,
          };
        }) || [];

      // Sort by points (descending) and assign ranks
      leaderboard.sort((a, b) => b.points - a.points);
      leaderboard.forEach((item, index) => {
        item.rank = index + 1;
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: leaderboard,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    }

    // For other types, return empty array for now
    return new Response(
      JSON.stringify({
        success: true,
        data: [],
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // GET /admin/analytics/referrals
  if (method === "GET" && route === "/admin/analytics/referrals") {
    try {
      const {data: referrals, error} = await supabase
        .from("referrals")
        .select("id, referrer_id, status, referral_source, created_at");

      if (error) {
        console.error("Error fetching referrals:", error);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              totalReferrals: 0,
              activeReferrers: 0,
              conversionRate: 0,
              topReferrers: [],
              referralSources: [],
            },
            warning: "Referral analytics unavailable",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      }

      const referralList = referrals || [];
      const totalReferrals = referralList.length;
      const paidReferrals = referralList.filter(
        (r: any) => r.status === "paid",
      ).length;
      const conversionRate =
        totalReferrals > 0
          ? Math.round((paidReferrals / totalReferrals) * 100)
          : 0;

      const referrerCounts: Record<string, number> = {};
      const sourceCounts: Record<string, number> = {};
      referralList.forEach((ref: any) => {
        if (ref.referrer_id) {
          const key = String(ref.referrer_id);
          referrerCounts[key] = (referrerCounts[key] || 0) + 1;
        }
        const source = ref.referral_source || "Unknown";
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      });

      const referrerIds = Object.keys(referrerCounts)
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));
      const {data: referrers} = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", referrerIds);

      const topReferrers = Object.entries(referrerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => {
          const user = referrers?.find((u: any) => String(u.id) === id);
          const name = user
            ? `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
              user.email
            : `User ${id}`;
          return {id: parseInt(id, 10), name, count};
        });

      const referralSources = Object.entries(sourceCounts).map(
        ([name, count]) => ({name, count}),
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            totalReferrals,
            activeReferrers: Object.keys(referrerCounts).length,
            conversionRate,
            topReferrers,
            referralSources,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("Error building referral analytics:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch referral analytics",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/analytics/referrals/invitations/resend - Resend reminder emails for pending referral invitations
  if (
    method === "POST" &&
    route === "/admin/analytics/referrals/invitations/resend"
  ) {
    try {
      const body = await req.json().catch(() => ({}));
      const invitationIds = Array.isArray(body?.invitationIds)
        ? body.invitationIds
        : [];

      if (invitationIds.length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "No invitation IDs provided"}),
          {
            status: 400,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // Fetch referrals by ID - only those with status 'pending'
      const {data: referrals, error: refError} = await supabase
        .from("referrals")
        .select("id, referrer_id, referred_user_id, status")
        .in("id", invitationIds)
        .eq("status", "pending");

      if (refError || !referrals || referrals.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {resent: 0, message: "No pending referrals found to resend"},
          }),
          {
            status: 200,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      const referredUserIds = referrals
        .map((r: any) => r.referred_user_id)
        .filter(Boolean);
      if (referredUserIds.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              resent: 0,
              message: "No referred users found for these referrals",
            },
          }),
          {
            status: 200,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // Get referred users and referrers for email content
      const {data: referredUsers, error: usersError} = await supabase
        .from("users")
        .select("id, email, first_name, last_name")
        .in("id", referredUserIds);

      if (usersError || !referredUsers?.length) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch referred users",
          }),
          {
            status: 500,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      const referrerIds = [
        ...new Set(referrals.map((r: any) => r.referrer_id).filter(Boolean)),
      ];
      const {data: referrers} = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", referrerIds);

      const referrerById = (referrers || []).reduce((acc: any, r: any) => {
        acc[r.id] =
          `${r.first_name || ""} ${r.last_name || ""}`.trim() || "A friend";
        return acc;
      }, {});

      let sentCount = 0;
      const errors: string[] = [];

      for (const ref of referrals) {
        if (!ref.referred_user_id) continue;
        const user = referredUsers.find(
          (u: any) => u.id === ref.referred_user_id,
        );
        if (!user?.email) continue;

        const name =
          `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
          user.email.split("@")[0];
        const referrerName = referrerById[ref.referrer_id];

        try {
          await sendReferralReminderEmail({to: user.email, name, referrerName});
          sentCount++;
        } catch (emailErr: any) {
          console.error(
            `Failed to send referral reminder to ${user.email}:`,
            emailErr,
          );
          errors.push(`${user.email}: ${emailErr?.message || "Unknown error"}`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            resent: sentCount,
            total: referrals.length,
            message: `Resent ${sentCount} of ${referrals.length} referral reminder(s)`,
            ...(errors.length > 0 && {errors}),
          },
        }),
        {
          status: 200,
          headers: {...corsHeaders, "Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Error resending referral invitations:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message || "Failed to resend referral invitations",
        }),
        {
          status: 500,
          headers: {...corsHeaders, "Content-Type": "application/json"},
        },
      );
    }
  }

  // GET /admin/analytics/geographic
  if (method === "GET" && route === "/admin/analytics/geographic") {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "30d";

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "15d":
        startDate.setDate(now.getDate() - 15);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;
      case "180d":
        startDate.setDate(now.getDate() - 180);
        break;
      case "365d":
        startDate.setDate(now.getDate() - 365);
        break;
      case "1y":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case "all":
        startDate = new Date(0);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get users by location
    const {data: users, error: usersError} = await supabase
      .from("users")
      .select("id, city, state, country, role, created_at")
      .gte("created_at", startDate.toISOString());

    if (usersError) {
      console.error(
        "Error fetching users for geographic analytics:",
        usersError,
      );
      return new Response(
        JSON.stringify({error: "Failed to fetch geographic data"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    // Get donations for the period
    const {data: donations} = await supabase
      .from("donations")
      .select("donor_id, amount, charity_id")
      .eq("status", "active")
      .gte("created_at", startDate.toISOString());

    // Aggregate by location
    const locationStats: Record<string, any> = {};
    const countryStats: Record<string, any> = {};
    const stateStats: Record<string, any> = {};
    const cityStats: Record<string, any> = {};

    users?.forEach((user: any) => {
      const country = user.country || "Unknown";
      if (!countryStats[country]) {
        countryStats[country] = {donors: 0, vendors: 0, beneficiaries: 0};
      }
      if (user.role === "donor") countryStats[country].donors++;
      if (user.role === "vendorAdmin") countryStats[country].vendors++;
      if (user.role === "charityAdmin") countryStats[country].beneficiaries++;

      const state = user.state || "Unknown";
      if (!stateStats[state]) {
        stateStats[state] = {donors: 0, vendors: 0, beneficiaries: 0};
      }
      if (user.role === "donor") stateStats[state].donors++;
      if (user.role === "vendorAdmin") stateStats[state].vendors++;
      if (user.role === "charityAdmin") stateStats[state].beneficiaries++;

      const city = user.city || "Unknown";
      const cityKey = `${city}, ${state}`;
      if (!cityStats[cityKey]) {
        cityStats[cityKey] = {
          city,
          state,
          donors: 0,
          vendors: 0,
          beneficiaries: 0,
        };
      }
      if (user.role === "donor") cityStats[cityKey].donors++;
      if (user.role === "vendorAdmin") cityStats[cityKey].vendors++;
      if (user.role === "charityAdmin") cityStats[cityKey].beneficiaries++;
    });

    // Calculate donation totals by location
    const donationByDonor: Record<number, number> = {};
    donations?.forEach((donation: any) => {
      if (!donationByDonor[donation.donor_id]) {
        donationByDonor[donation.donor_id] = 0;
      }
      donationByDonor[donation.donor_id] += parseFloat(donation.amount || 0);
    });

    // Get donor locations for donations
    const donorIds = Object.keys(donationByDonor).map((id) => parseInt(id));
    if (donorIds.length > 0) {
      const {data: donors} = await supabase
        .from("users")
        .select("id, city, state, country")
        .in("id", donorIds);

      if (donors) {
        donors.forEach((donor: any) => {
          const state = donor.state || "Unknown";
          if (!stateStats[state]) {
            stateStats[state] = {
              donors: 0,
              vendors: 0,
              beneficiaries: 0,
              totalDonations: 0,
            };
          }
          stateStats[state].totalDonations =
            (stateStats[state].totalDonations || 0) +
            (donationByDonor[donor.id] || 0);
        });
      }
    }

    // Format top countries
    const topCountries = Object.entries(countryStats)
      .map(([name, stats]) => ({
        name,
        ...stats,
        totalDonations: "$0",
      }))
      .sort(
        (a, b) =>
          b.donors +
          b.vendors +
          b.beneficiaries -
          (a.donors + a.vendors + a.beneficiaries),
      )
      .slice(0, 10);

    // Format top states
    const topStates = Object.entries(stateStats)
      .map(([name, stats]) => ({
        name,
        ...stats,
        totalDonations: stats.totalDonations
          ? `$${stats.totalDonations.toFixed(2)}`
          : "$0",
      }))
      .sort(
        (a, b) =>
          b.donors +
          b.vendors +
          b.beneficiaries -
          (a.donors + a.vendors + a.beneficiaries),
      )
      .slice(0, 10);

    // Format top cities
    const topCities = Object.values(cityStats)
      .map((stats: any) => ({
        city: stats.city,
        state: stats.state,
        donors: stats.donors,
        vendors: stats.vendors,
        beneficiaries: stats.beneficiaries,
        donations: "$0",
      }))
      .sort(
        (a, b) =>
          b.donors +
          b.vendors +
          b.beneficiaries -
          (a.donors + a.vendors + a.beneficiaries),
      )
      .slice(0, 20);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          totalCountries: Object.keys(countryStats).length,
          totalStates: Object.keys(stateStats).length,
          totalCities: Object.keys(cityStats).length,
          topCountries,
          topStates,
          topCities,
        },
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  return new Response(JSON.stringify({error: "Analytics route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Admin donors handler
async function handleAdminDonors(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/donors - List all donors (users with role 'donor')
  if (method === "GET" && route === "/admin/donors") {
    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const search = url.searchParams.get("search");

      // Build query to get all users with role 'donor'
      let query = supabase
        .from("users")
        .select("*", {count: "exact"})
        .eq("role", "donor");

      // Search filter (by email, first_name, last_name)
      if (search) {
        query = query.or(
          `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
        );
      }

      // Order and pagination
      query = query
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      const {data: users, error, count} = await query;

      if (error) {
        console.error("❌ Admin get donors error:", error);
        return new Response(JSON.stringify({error: error.message}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        });
      }

      // Build charity name lookup for preferred beneficiary IDs
      const preferredCharityIds = Array.from(
        new Set(
          (users || [])
            .map(
              (user: any) =>
                user.preferences?.preferredCharity ||
                user.preferences?.beneficiary,
            )
            .filter((id: any) => id !== undefined && id !== null && id !== "")
            .map((id: any) => parseInt(id, 10))
            .filter((id: number) => !Number.isNaN(id)),
        ),
      );

      let charityNameById: Record<number, string> = {};
      if (preferredCharityIds.length > 0) {
        const {data: charities, error: charitiesError} = await supabase
          .from("charities")
          .select("id, name")
          .in("id", preferredCharityIds);

        if (!charitiesError && charities) {
          charityNameById = charities.reduce(
            (acc: Record<number, string>, charity: any) => {
              acc[charity.id] = charity.name;
              return acc;
            },
            {},
          );
        }
      }

      // Format donors data to match what the frontend expects
      const formattedDonors = (users || []).map((user: any) => {
        const fullName =
          `${user.first_name || ""} ${user.last_name || ""}`.trim();
        const preferredCharityId =
          user.preferences?.preferredCharity ||
          user.preferences?.beneficiary ||
          null;
        const monthlyDonation =
          user.total_monthly_donation ??
          user.preferences?.monthlyDonation ??
          user.preferences?.donationAmount ??
          0;
        const oneTimeDonation =
          user.extra_donation_amount ?? user.preferences?.oneTimeDonation ?? 0;
        return {
          id: user.id,
          name: fullName || user.email.split("@")[0],
          email: user.email,
          phone: user.phone || "N/A",
          beneficiary_id: preferredCharityId,
          beneficiary_name: preferredCharityId
            ? charityNameById[preferredCharityId] || "N/A"
            : "N/A",
          coworking:
            user.coworking === true || user.invite_type === "coworking",
          total_donations: parseFloat(monthlyDonation) || 0,
          one_time_donation: parseFloat(oneTimeDonation) || 0,
          last_donation_date: null,
          address: {
            city: user.city || "",
            state: user.state || "",
            zipCode: user.zip_code || "",
            street: user.street_address || "",
            latitude: user.latitude ? parseFloat(user.latitude) : null,
            longitude: user.longitude ? parseFloat(user.longitude) : null,
          },
          location_permission_granted:
            user.location_permission_granted || false,
          location_updated_at: user.location_updated_at || null,
          is_active: user.account_status === "active",
          is_enabled: user.account_status === "active",
          created_at: user.created_at,
          updated_at: user.updated_at,
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: formattedDonors,
          pagination: {
            page,
            limit,
            total: count || 0,
            pages: Math.ceil((count || 0) / limit),
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
      console.error("❌ Admin get donors error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to fetch donors"}),
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

  // PUT /admin/donors/:id - Update donor information
  const updateDonorMatch = route.match(/^\/admin\/donors\/(\d+)$/);
  if (method === "PUT" && updateDonorMatch) {
    try {
      const donorId = parseInt(updateDonorMatch[1], 10);

      if (!donorId || isNaN(donorId)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid donor ID"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Parse request body
      const body = await req.json();
      const {
        name,
        email,
        phone,
        beneficiary_id,
        beneficiary_name,
        coworking,
        invite_type,
        inviteType,
        sponsor_amount,
        sponsorAmount,
        donation_amount,
        donationAmount,
        one_time_donation,
        oneTimeDonation,
        total_donations,
        last_donation_date,
        address,
        latitude,
        longitude,
        locationPermissionGranted,
        location_permission_granted,
        is_active,
        is_enabled,
        notes,
      } = body;

      // Verify the donor exists and has role 'donor'
      const {data: existingDonor, error: donorError} = await supabase
        .from("users")
        .select("id, email, role, first_name, last_name, phone, preferences")
        .eq("id", donorId)
        .eq("role", "donor")
        .single();

      if (donorError || !existingDonor) {
        if (donorError?.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        return new Response(
          JSON.stringify({success: false, error: "Donor not found"}),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Check if email is being changed and if it conflicts with another user
      if (email && email !== existingDonor.email) {
        const {data: emailCheck, error: emailError} = await supabase
          .from("users")
          .select("id, email")
          .eq("email", email)
          .neq("id", donorId)
          .limit(1);

        if (emailError) {
          console.error("❌ Error checking email:", emailError);
          return new Response(
            JSON.stringify({success: false, error: "Failed to validate email"}),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        if (emailCheck && emailCheck.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Email already in use by another user",
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Check if phone is being changed and if it conflicts with another user
      if (phone && phone !== existingDonor.phone) {
        const {data: phoneCheck, error: phoneError} = await supabase
          .from("users")
          .select("id, phone")
          .eq("phone", phone)
          .neq("id", donorId)
          .limit(1);

        if (phoneError) {
          console.error("❌ Error checking phone:", phoneError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to validate phone number",
            }),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        if (phoneCheck && phoneCheck.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Phone number already in use by another user",
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Parse name into first_name and last_name
      let first_name = existingDonor.first_name;
      let last_name = existingDonor.last_name;

      if (name) {
        const nameParts = name.trim().split(/\s+/);
        if (nameParts.length > 0) {
          first_name = capitalizeName(nameParts[0]);
          last_name = capitalizeName(nameParts.slice(1).join(" ")) || "";
        }
      }

      // Build update object - only include fields that are provided
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Update basic fields if provided (with name capitalization)
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone || null;
      if (first_name !== undefined)
        updateData.first_name = capitalizeName(first_name);
      if (last_name !== undefined)
        updateData.last_name = capitalizeName(last_name);

      // Update address fields if provided
      if (address) {
        if (address.city !== undefined) updateData.city = address.city || null;
        if (address.state !== undefined)
          updateData.state = address.state || null;
        if (address.zipCode !== undefined)
          updateData.zip_code = address.zipCode || null;
        if (address.street !== undefined)
          updateData.street_address = address.street || null;
        if (address.latitude !== undefined)
          updateData.latitude = address.latitude
            ? parseFloat(address.latitude)
            : null;
        if (address.longitude !== undefined)
          updateData.longitude = address.longitude
            ? parseFloat(address.longitude)
            : null;
      }

      // Also support flat location fields
      if (latitude !== undefined) {
        updateData.latitude = latitude ? parseFloat(latitude) : null;
      }
      if (longitude !== undefined) {
        updateData.longitude = longitude ? parseFloat(longitude) : null;
      }

      // Handle location permission
      if (
        locationPermissionGranted !== undefined ||
        location_permission_granted !== undefined
      ) {
        const locationPermission =
          locationPermissionGranted || location_permission_granted;
        updateData.location_permission_granted = locationPermission === true;
        if (locationPermission === true) {
          updateData.location_updated_at = new Date().toISOString();
        }
      }

      // If location fields are provided but coordinates are missing, try to geocode
      if (
        (updateData.city || updateData.state) &&
        !updateData.latitude &&
        !updateData.longitude
      ) {
        const locationString = [
          updateData.city,
          updateData.state,
          updateData.zip_code,
        ]
          .filter(Boolean)
          .join(", ");
        if (locationString) {
          const geocodeResult = await geocodeAddress(locationString);
          if (geocodeResult.latitude && geocodeResult.longitude) {
            updateData.latitude = geocodeResult.latitude;
            updateData.longitude = geocodeResult.longitude;
            console.log(
              `✅ Geocoded location "${locationString}" to (${geocodeResult.latitude}, ${geocodeResult.longitude})`,
            );
          }
        }
      }

      // Update account status (map is_active and is_enabled to account_status)
      if (is_active !== undefined || is_enabled !== undefined) {
        // If either is false, set to inactive; otherwise active
        updateData.account_status =
          is_active !== false && is_enabled !== false ? "active" : "inactive";
      }

      // Update notes field if provided (if notes column exists in users table)
      // Other metadata fields (beneficiary_name, coworking, total_donations, etc.)
      // are typically calculated from related tables and not stored directly on users
      // If you need to store these, consider creating a user_metadata JSONB column
      if (notes !== undefined) {
        updateData.notes = notes;
      }

      // Update coworking/invite fields if provided
      if (coworking !== undefined) {
        updateData.coworking =
          coworking === true || coworking === "Yes" || coworking === "yes";
      }
      if (invite_type !== undefined || inviteType !== undefined) {
        updateData.invite_type = invite_type || inviteType;
      }
      if (sponsor_amount !== undefined || sponsorAmount !== undefined) {
        updateData.sponsor_amount =
          parseFloat(sponsor_amount ?? sponsorAmount) || 0;
      }

      // Update donation amounts if provided
      const donationAmountValue = donation_amount ?? donationAmount;
      if (donationAmountValue !== undefined) {
        updateData.total_monthly_donation =
          parseFloat(donationAmountValue) || 0;
      }
      const oneTimeDonationValue = one_time_donation ?? oneTimeDonation;
      if (oneTimeDonationValue !== undefined) {
        updateData.extra_donation_amount =
          parseFloat(oneTimeDonationValue) || 0;
      }

      // Merge preferences for beneficiary/donation selections
      const preferencesUpdate: any = {
        ...(existingDonor.preferences || {}),
      };
      if (
        beneficiary_id !== undefined &&
        beneficiary_id !== null &&
        beneficiary_id !== ""
      ) {
        preferencesUpdate.preferredCharity = beneficiary_id;
        preferencesUpdate.beneficiary = beneficiary_id;
      }
      if (donationAmountValue !== undefined) {
        preferencesUpdate.monthlyDonation =
          parseFloat(donationAmountValue) || 0;
        preferencesUpdate.donationAmount = parseFloat(donationAmountValue) || 0;
      }
      if (oneTimeDonationValue !== undefined) {
        preferencesUpdate.oneTimeDonation =
          parseFloat(oneTimeDonationValue) || 0;
      }
      if (Object.keys(preferencesUpdate).length > 0) {
        updateData.preferences = preferencesUpdate;
      }

      // Update the donor
      const {data: updatedDonor, error: updateError} = await supabase
        .from("users")
        .update(updateData)
        .eq("id", donorId)
        .eq("role", "donor")
        .select()
        .single();

      if (updateError) {
        console.error("❌ Admin update donor error:", updateError);

        if (updateError.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        // Handle unique constraint violations (e.g., duplicate email)
        if (updateError.code === "23505") {
          return new Response(
            JSON.stringify({success: false, error: "Email already in use"}),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({success: false, error: updateError.message}),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Format response to match frontend expectations
      const fullName =
        `${updatedDonor.first_name || ""} ${updatedDonor.last_name || ""}`.trim();
      const responseData = {
        id: updatedDonor.id,
        name: fullName || updatedDonor.email.split("@")[0],
        email: updatedDonor.email,
        message: "Donor updated successfully",
      };

      return new Response(
        JSON.stringify({
          success: true,
          data: responseData,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Unexpected error updating donor:", error);
      return new Response(
        JSON.stringify({success: false, error: "Internal server error"}),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // DELETE /admin/donors/:id - Delete a donor
  const deleteDonorMatch = route.match(/^\/admin\/donors\/(\d+)$/);
  if (method === "DELETE" && deleteDonorMatch) {
    try {
      const donorId = parseInt(deleteDonorMatch[1], 10);

      if (!donorId || isNaN(donorId)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid donor ID"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Verify the donor exists and has role 'donor'
      const {data: donor, error: donorError} = await supabase
        .from("users")
        .select("id, email, role, profile_picture_url")
        .eq("id", donorId)
        .eq("role", "donor")
        .single();

      if (donorError || !donor) {
        if (donorError?.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: donorError?.message || "Donor not found",
          }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Delete profile picture from Supabase Storage if it exists
      if (donor.profile_picture_url) {
        try {
          const urlParts = donor.profile_picture_url.split("/");
          const publicIndex = urlParts.indexOf("public");
          if (publicIndex !== -1 && publicIndex < urlParts.length - 1) {
            const filePath = urlParts
              .slice(publicIndex + 1)
              .join("/")
              .split("?")[0];
            const bucketName = "profile-pictures";

            const {error: storageError} = await supabase.storage
              .from(bucketName)
              .remove([filePath]);

            if (storageError) {
              console.error(
                "⚠️ Error deleting profile picture from storage:",
                storageError,
              );
              // Continue with user deletion even if storage delete fails
            }
          }
        } catch (storageError) {
          console.error("⚠️ Error deleting profile picture:", storageError);
          // Continue with user deletion even if storage delete fails
        }
      }

      // Delete the donor from the database
      const {data: deletedDonor, error: deleteError} = await supabase
        .from("users")
        .delete()
        .eq("id", donorId)
        .eq("role", "donor")
        .select()
        .single();

      if (deleteError) {
        console.error("❌ Admin delete donor error:", deleteError);

        if (deleteError.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({success: false, error: deleteError.message}),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Success response
      return new Response(
        JSON.stringify({
          success: true,
          data: {id: donorId, message: "Donor deleted successfully"},
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Unexpected error deleting donor:", error);
      return new Response(
        JSON.stringify({success: false, error: "Internal server error"}),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // GET /admin/donors/:id/details - Get comprehensive donor details
  const donorDetailsMatch = route.match(/^\/admin\/donors\/(\d+)\/details$/);
  if (method === "GET" && donorDetailsMatch) {
    try {
      const donorId = parseInt(donorDetailsMatch[1], 10);

      if (!donorId || isNaN(donorId)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid donor ID"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Verify the donor exists
      const {data: donor, error: donorError} = await supabase
        .from("users")
        .select("id, email, role")
        .eq("id", donorId)
        .eq("role", "donor")
        .single();

      if (donorError || !donor) {
        if (donorError?.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        return new Response(
          JSON.stringify({success: false, error: "Donor not found"}),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Fetch payment methods (handle if table doesn't exist)
      let paymentMethods: any[] = [];
      try {
        const {data: pmData, error: pmError} = await supabase
          .from("payment_methods")
          .select("*")
          .eq("donor_id", donorId)
          .order("is_default", {ascending: false});

        if (!pmError && pmData) {
          paymentMethods = pmData.map((pm: any) => ({
            type: pm.type || "card",
            brand: pm.brand || null,
            last4: pm.last4 || null,
            exp_month: pm.exp_month || null,
            exp_year: pm.exp_year || null,
            is_default: pm.is_default || false,
          }));
        }
      } catch (pmErr) {
        console.log("⚠️ Payment methods table may not exist:", pmErr);
        // Continue with empty array
      }

      // Fetch monthly donation/subscription
      let monthlyDonation: any = null;
      try {
        const {data: mdData, error: mdError} = await supabase
          .from("donor_subscriptions")
          .select("*")
          .eq("donor_id", donorId)
          .eq("active", true)
          .single();

        if (!mdError && mdData) {
          monthlyDonation = {
            amount: mdData.amount || 0,
            active: mdData.active || false,
            start_date: mdData.start_date || null,
            next_charge_date: mdData.next_charge_date || null,
          };
        }
      } catch (mdErr) {
        console.log("⚠️ Donor subscriptions table may not exist:", mdErr);
      }

      // Fetch current beneficiary
      let currentBeneficiary: any = null;
      try {
        const {data: cbData, error: cbError} = await supabase
          .from("donor_beneficiaries")
          .select("*, beneficiaries(*)")
          .eq("donor_id", donorId)
          .eq("is_current", true)
          .single();

        if (!cbError && cbData) {
          currentBeneficiary = {
            name: cbData.beneficiaries?.name || cbData.beneficiary_name || null,
            category: cbData.beneficiaries?.category || "Charity",
            amount: cbData.amount || cbData.monthly_amount || 0,
            start_date: cbData.start_date || null,
          };
        }
      } catch (cbErr) {
        console.log("⚠️ Donor beneficiaries table may not exist:", cbErr);
      }

      // Fetch donation history (past donations)
      let donationHistory: any[] = [];
      try {
        const {data: dhData, error: dhError} = await supabase
          .from("donations")
          .select("*, charities(name), beneficiaries(name)")
          .eq("donor_id", donorId)
          .order("created_at", {ascending: false})
          .limit(50);

        if (!dhError && dhData) {
          donationHistory = dhData.map((donation: any) => ({
            date: donation.created_at || donation.date || null,
            amount: parseFloat(donation.amount || 0),
            beneficiary_name:
              donation.charities?.name ||
              donation.beneficiaries?.name ||
              donation.charity_name ||
              "Unknown",
            type:
              donation.type || (donation.is_recurring ? "monthly" : "one_time"),
          }));
        }
      } catch (dhErr) {
        console.log("⚠️ Donations table may not exist:", dhErr);
      }

      // Fetch discount redemptions
      let discountRedemptions: any[] = [];
      let totalSavings = 0;
      try {
        const {data: redData, error: redError} = await supabase
          .from("discount_redemptions")
          .select("*, discounts(name, discount_value), vendors(name, address)")
          .eq("donor_id", donorId)
          .order("redeemed_at", {ascending: false})
          .limit(100);

        if (!redError && redData) {
          discountRedemptions = redData.map((redemption: any) => {
            const savings =
              redemption.savings ||
              redemption.discount_amount ||
              redemption.discounts?.discount_value ||
              0;
            totalSavings += parseFloat(savings);
            return {
              vendor_name:
                redemption.vendors?.name || redemption.vendor_name || null,
              discount_name:
                redemption.discounts?.name || redemption.discount_name || null,
              date: redemption.redeemed_at || redemption.date || null,
              savings: parseFloat(savings),
              location:
                redemption.vendors?.address || redemption.location || null,
            };
          });
        }
      } catch (redErr) {
        console.log("⚠️ Discount redemptions table may not exist:", redErr);
      }

      // Fetch leaderboard position (calculate rank based on points or donations)
      let leaderboardPosition: any = null;
      try {
        // Try to get points from donor_points table
        const {data: pointsData, error: pointsError} = await supabase
          .from("donor_points")
          .select("points, rank")
          .eq("donor_id", donorId)
          .single();

        if (!pointsError && pointsData) {
          let rank = pointsData.rank;

          // Calculate rank if not stored
          if (!rank) {
            const {data: allDonors, error: rankError} = await supabase
              .from("donor_points")
              .select("donor_id, points")
              .order("points", {ascending: false});

            if (!rankError && allDonors) {
              const donorIndex = allDonors.findIndex(
                (d: any) => d.donor_id === donorId,
              );
              rank = donorIndex >= 0 ? donorIndex + 1 : null;
            }
          }

          if (rank) {
            leaderboardPosition = {
              rank: rank,
              points: pointsData.points || 0,
              period: "all_time",
            };
          }
        } else {
          // Fallback: calculate rank based on total donations
          const {data: allDonations, error: allDonationsError} = await supabase
            .from("donations")
            .select("donor_id, amount")
            .eq("status", "active");

          if (!allDonationsError && allDonations) {
            // Aggregate donations by donor
            const donorTotals: Record<number, number> = {};
            allDonations.forEach((donation: any) => {
              if (!donorTotals[donation.donor_id]) {
                donorTotals[donation.donor_id] = 0;
              }
              donorTotals[donation.donor_id] += parseFloat(
                donation.amount || 0,
              );
            });

            // Sort donors by total donations
            const sortedDonors = Object.entries(donorTotals)
              .map(([id, total]) => ({id: parseInt(id), total}))
              .sort((a, b) => b.total - a.total);

            const donorIndex = sortedDonors.findIndex((d) => d.id === donorId);
            if (donorIndex >= 0) {
              leaderboardPosition = {
                rank: donorIndex + 1,
                points: sortedDonors[donorIndex].total,
                period: "all_time",
              };
            }
          }
        }
      } catch (lbErr) {
        console.log("⚠️ Leaderboard calculation error:", lbErr);
      }

      // Format response
      const responseData = {
        payment_methods: paymentMethods,
        monthly_donation: monthlyDonation,
        current_beneficiary: currentBeneficiary,
        donation_history: donationHistory,
        discount_redemptions: discountRedemptions,
        total_savings: totalSavings,
        leaderboard_position: leaderboardPosition,
      };

      return new Response(
        JSON.stringify({
          success: true,
          data: responseData,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Error fetching donor details:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to fetch donor details",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // POST /admin/donors/:id/resend-invitation - Resend invitation email
  const resendInvitationMatch = route.match(
    /^\/admin\/donors\/(\d+)\/resend-invitation$/,
  );
  if (method === "POST" && resendInvitationMatch) {
    try {
      const donorId = parseInt(resendInvitationMatch[1]);

      if (!donorId || isNaN(donorId)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid donor ID"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Get donor by ID
      const {data: donor, error: donorError} = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, role, verification_token, account_status, is_verified",
        )
        .eq("id", donorId)
        .eq("role", "donor")
        .single();

      if (donorError || !donor) {
        return new Response(
          JSON.stringify({success: false, error: "Donor not found"}),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Check if donor is already verified and active
      if (
        donor.is_verified &&
        donor.account_status === "active" &&
        !donor.verification_token
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Donor has already completed signup. Invitation email cannot be resent.",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Generate new verification token if they don't have one
      let verificationToken = donor.verification_token;

      if (!verificationToken) {
        const tokenArray = new Uint8Array(32);
        crypto.getRandomValues(tokenArray);
        verificationToken = Array.from(tokenArray, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");

        // Update donor with new token
        const {error: updateError} = await supabase
          .from("users")
          .update({
            verification_token: verificationToken,
            is_verified: false,
          })
          .eq("id", donorId);

        if (updateError) {
          console.error("❌ Error updating verification token:", updateError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to generate new verification token",
            }),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Send invitation email
      const fullName =
        `${donor.first_name || ""} ${donor.last_name || ""}`.trim();
      const donorName = fullName || donor.email.split("@")[0];

      try {
        await sendInvitationEmail({
          to: donor.email,
          name: donorName,
          verificationToken: verificationToken,
          donorId: donor.id,
        });

        console.log("✅ Invitation email resent successfully to:", donor.email);

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: donor.id,
              email: donor.email,
              name: donorName,
              message: "Invitation email resent successfully",
            },
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (emailError) {
        console.error("❌ Error sending invitation email:", emailError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to send invitation email",
            details: emailError.message,
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
    } catch (error: any) {
      console.error("❌ Unexpected error resending invitation:", error);
      return new Response(
        JSON.stringify({success: false, error: "Internal server error"}),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // POST /admin/donors - Create new donor (invitation flow)
  if (method === "POST" && route === "/admin/donors") {
    try {
      const body = await req.json();
      const {
        name,
        email,
        phone,
        address,
        beneficiary_id,
        coworking,
        sponsor_amount,
        sponsorAmount,
        sponsor_source,
        sponsorSource,
        invite_type,
        inviteType,
        external_billed,
        externalBilled,
      } = body;

      // Validate required fields
      if (!email) {
        return new Response(
          JSON.stringify({success: false, error: "Email is required"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid email format"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Check if user already exists
      const {data: existingUser, error: checkError} = await supabase
        .from("users")
        .select("id, email, role, account_status")
        .eq("email", email)
        .limit(1);

      if (checkError && checkError.code !== "PGRST116") {
        console.error("❌ Error checking existing user:", checkError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to check existing user",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (existingUser && existingUser.length > 0) {
        const existing = existingUser[0];
        return new Response(
          JSON.stringify({
            success: false,
            error: `User with email ${email} already exists. Status: ${existing.account_status || "unknown"}`,
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Check if phone already exists
      if (phone) {
        const {data: phoneCheck, error: phoneError} = await supabase
          .from("users")
          .select("id, phone, role")
          .eq("phone", phone)
          .limit(1);

        if (phoneError) {
          console.error("❌ Error checking phone:", phoneError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to check existing phone number",
            }),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        if (phoneCheck && phoneCheck.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Phone number already exists. Please use a unique number.",
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Parse name into first_name and last_name
      let first_name = "";
      let last_name = "";
      if (name) {
        const nameParts = name.trim().split(/\s+/);
        if (nameParts.length > 0) {
          first_name = capitalizeName(nameParts[0]);
          last_name = capitalizeName(nameParts.slice(1).join(" ")) || "";
        }
      }

      // Generate verification token
      const tokenArray = new Uint8Array(32);
      crypto.getRandomValues(tokenArray);
      const verificationToken = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      // Set token expiration (24 hours) - store in code for now
      // Note: verification_token_expires column may not exist in users table
      // If you need expiration tracking, add the column to your database
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + 24);
      // We'll log the expiration but won't store it if column doesn't exist

      const isCoworking =
        coworking === true || coworking === "Yes" || coworking === "yes";
      const rawSponsorAmount =
        sponsor_amount ??
        sponsorAmount ??
        body.donation ??
        body.donationAmount ??
        0;
      const sponsorAmountValue = isCoworking
        ? parseFloat(rawSponsorAmount) || 15
        : parseFloat(rawSponsorAmount) || 0;
      const sponsorSourceValue =
        sponsor_source ||
        sponsorSource ||
        (isCoworking ? "THRIVE Coworking" : null);
      const inviteTypeValue =
        invite_type || inviteType || (isCoworking ? "coworking" : "standard");
      const externalBilledValue =
        external_billed ?? externalBilled ?? isCoworking;

      const preferences: any = {};
      if (
        beneficiary_id !== undefined &&
        beneficiary_id !== null &&
        beneficiary_id !== ""
      ) {
        preferences.preferredCharity = beneficiary_id;
        preferences.beneficiary = beneficiary_id;
      }
      if (sponsorAmountValue > 0) {
        preferences.monthlyDonation = sponsorAmountValue;
        preferences.donationAmount = sponsorAmountValue;
      }

      // Create donor with pending verification status
      // Note: password_hash is required - set a temporary hash that won't work for login
      // User will set their real password during signup completion
      const tempPasswordHash = await bcryptHash(
        "temp_invited_" + verificationToken + "_" + Date.now(),
      );

      // Create donor with pending verification status
      // Build insert data object
      const insertData: any = {
        email,
        first_name: capitalizeName(first_name) || null,
        last_name: capitalizeName(last_name) || null,
        phone: phone || null,
        city: address?.city || null,
        state: address?.state || null,
        zip_code: address?.zipCode || null,
        street_address: address?.street || null,
        role: "donor",
        account_status: "active", // Set to active - user will complete signup later
        verification_token: verificationToken,
        is_verified: false,
        password_hash: tempPasswordHash, // Temporary hash - user will update during signup
        preferences: Object.keys(preferences).length > 0 ? preferences : null,
      };

      // Add coworking fields only if they exist in the schema (migration may not be run)
      // Try with all fields first, retry without if column doesn't exist
      try {
        insertData.coworking = isCoworking;
        insertData.invite_type = inviteTypeValue;
        insertData.sponsor_amount = sponsorAmountValue;
        insertData.sponsor_source = sponsorSourceValue;
        insertData.external_billed = externalBilledValue;
        insertData.extra_donation_amount = 0;
        insertData.total_monthly_donation = sponsorAmountValue || 0;
      } catch (e) {
        // Fields will be added conditionally below
      }

      let {data: newDonor, error: insertError} = await supabase
        .from("users")
        .insert([insertData])
        .select()
        .single();

      // If insert fails due to missing columns, retry without coworking fields
      if (
        insertError &&
        (insertError.message?.includes("coworking") ||
          insertError.message?.includes("invite_type") ||
          insertError.message?.includes("sponsor_amount"))
      ) {
        console.warn(
          "⚠️ Coworking columns not found, retrying without them. Please run migration: 20260125000000_add_coworking_invite_fields.sql",
        );

        // Remove coworking-related fields and retry
        const retryData = {...insertData};
        delete retryData.coworking;
        delete retryData.invite_type;
        delete retryData.sponsor_amount;
        delete retryData.sponsor_source;
        delete retryData.external_billed;
        delete retryData.extra_donation_amount;
        delete retryData.total_monthly_donation;

        // Store coworking data in preferences instead
        if (isCoworking) {
          retryData.preferences = {
            ...(retryData.preferences || {}),
            coworking: true,
            inviteType: inviteTypeValue,
            sponsorAmount: sponsorAmountValue,
            sponsorSource: sponsorSourceValue,
            externalBilled: externalBilledValue,
            totalMonthlyDonation: sponsorAmountValue || 0,
          };
        }

        const retryResult = await supabase
          .from("users")
          .insert([retryData])
          .select()
          .single();

        if (retryResult.error) {
          insertError = retryResult.error;
          newDonor = null;
        } else {
          insertError = null;
          newDonor = retryResult.data;
          console.log(
            "✅ Donor created successfully (coworking fields stored in preferences)",
          );
        }
      }

      if (insertError) {
        console.error("❌ Error creating donor:", insertError);

        // Handle unique constraint violations
        if (insertError.code === "23505") {
          return new Response(
            JSON.stringify({success: false, error: "Email already in use"}),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: insertError.message || "Failed to create donor",
            hint: insertError.message?.includes("coworking")
              ? "Please run migration: supabase/migrations/20260125000000_add_coworking_invite_fields.sql"
              : undefined,
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      console.log("✅ Donor created successfully:", email);
      console.log("🔗 Verification token generated:", verificationToken);

      // Send invitation email (async - don't wait for it)
      sendInvitationEmail({
        to: email,
        name: name || email.split("@")[0],
        verificationToken: verificationToken,
        donorId: newDonor.id,
      }).catch((emailError) => {
        console.error("❌ Error sending invitation email:", emailError);
        // Don't fail the request if email fails - user can resend later
      });

      // Return success response
      const fullName =
        `${newDonor.first_name || ""} ${newDonor.last_name || ""}`.trim();
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: newDonor.id,
            email: newDonor.email,
            name: fullName || email.split("@")[0],
            status: "pending_verification",
            message:
              "Donor invitation sent successfully. Email verification required.",
          },
        }),
        {
          status: 201,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Unexpected error creating donor:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Internal server error",
          details: error?.message || String(error),
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Donors route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}

// Admin invitations handler
async function handleAdminInvitations(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/invitations - List all invitations with filters
  if (method === "GET" && route === "/admin/invitations") {
    try {
      const url = new URL(req.url);
      const type = url.searchParams.get("type"); // 'vendor' or 'beneficiary'
      const status = url.searchParams.get("status"); // 'pending', 'approved', 'rejected', 'contacted'
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const search = url.searchParams.get("search"); // Search by contact_name, company_name, email

      // Build query with user information
      let query = supabase
        .from("invitations")
        .select(
          `
          *,
          users:user_id (
            id,
            email,
            first_name,
            last_name
          )
        `,
          {count: "exact"},
        )
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      // Apply filters
      if (type) {
        query = query.eq("type", type);
      }
      if (status) {
        query = query.eq("status", status);
      }
      if (search) {
        query = query.or(
          `contact_name.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%`,
        );
      }

      const {data: invitations, error, count} = await query;

      if (error) {
        console.error("Error fetching invitations:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch invitations"}),
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
          invitations: invitations || [],
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
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
    } catch (error) {
      console.error("Error fetching invitations:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch invitations"}),
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

  // PUT /admin/invitations/:id/status - Update invitation status
  const statusUpdateMatch = route.match(
    /^\/admin\/invitations\/(\d+)\/status$/,
  );
  if (method === "PUT" && statusUpdateMatch) {
    try {
      const invitationId = parseInt(statusUpdateMatch[1]);
      const body = await req.json();
      const {status, notes} = body;

      if (
        !status ||
        !["pending", "approved", "rejected", "contacted"].includes(status)
      ) {
        return new Response(
          JSON.stringify({
            error:
              "Invalid status. Must be: pending, approved, rejected, or contacted",
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Update invitation status
      const updateData: any = {status};
      if (notes) {
        // Store notes in message field or add a notes column if needed
        // For now, we'll append to message
        const {data: existing} = await supabase
          .from("invitations")
          .select("message")
          .eq("id", invitationId)
          .single();

        if (existing) {
          const existingMessage = existing.message || "";
          updateData.message =
            existingMessage +
            (existingMessage ? "\n\n" : "") +
            `[Admin Notes: ${notes}]`;
        }
      }

      const {data: invitation, error} = await supabase
        .from("invitations")
        .update(updateData)
        .eq("id", invitationId)
        .select()
        .single();

      if (error || !invitation) {
        console.error("Error updating invitation:", error);
        return new Response(
          JSON.stringify({error: "Failed to update invitation"}),
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
          invitation,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error updating invitation status:", error);
      return new Response(
        JSON.stringify({error: "Failed to update invitation status"}),
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

  // POST /admin/invitations/:id/invite - Create user account and send invitation email
  const inviteMatch = route.match(/^\/admin\/invitations\/(\d+)\/invite$/);
  if (method === "POST" && inviteMatch) {
    try {
      const invitationId = parseInt(inviteMatch[1]);

      // Get invitation
      const {data: invitation, error: inviteError} = await supabase
        .from("invitations")
        .select("*")
        .eq("id", invitationId)
        .single();

      if (inviteError || !invitation) {
        return new Response(JSON.stringify({error: "Invitation not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      // Check if user already exists
      const {data: existingUser} = await supabase
        .from("users")
        .select("id, email, role")
        .eq("email", invitation.email)
        .limit(1);

      if (existingUser && existingUser.length > 0) {
        return new Response(
          JSON.stringify({
            error: `User with email ${invitation.email} already exists`,
            existingUserId: existingUser[0].id,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Generate verification token
      const tokenArray = new Uint8Array(32);
      crypto.getRandomValues(tokenArray);
      const verificationToken = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      // Create temporary password hash
      const tempPasswordHash = await bcryptHash(
        "temp_invited_" + verificationToken + "_" + Date.now(),
      );

      // Determine role based on invitation type
      const role =
        invitation.type === "beneficiary" ? "charityAdmin" : "vendorAdmin";

      // Parse contact_name into first_name and last_name
      let first_name = "";
      let last_name = "";
      if (invitation.contact_name) {
        const nameParts = invitation.contact_name.trim().split(/\s+/);
        if (nameParts.length > 0) {
          first_name = capitalizeName(nameParts[0]);
          last_name = capitalizeName(nameParts.slice(1).join(" ")) || "";
        }
      }

      // Create user account
      const {data: newUser, error: userError} = await supabase
        .from("users")
        .insert([
          {
            email: invitation.email.toLowerCase().trim(),
            first_name: first_name || null,
            last_name: last_name || null,
            phone: invitation.phone || null,
            role: role,
            account_status: "active",
            verification_token: verificationToken,
            is_verified: false,
            password_hash: tempPasswordHash,
          },
        ])
        .select()
        .single();

      if (userError) {
        console.error("Error creating user:", userError);
        return new Response(
          JSON.stringify({error: "Failed to create user account"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      // Update invitation status to 'approved'
      await supabase
        .from("invitations")
        .update({status: "approved"})
        .eq("id", invitationId);

      // Send invitation email
      const userName =
        invitation.contact_name || invitation.email.split("@")[0];
      sendInvitationEmail({
        to: invitation.email,
        name: userName,
        verificationToken: verificationToken,
        donorId: newUser.id,
      }).catch((emailError) => {
        console.error("❌ Error sending invitation email:", emailError);
        // Don't fail the request if email fails
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "User account created and invitation email sent",
          user: {
            id: newUser.id,
            email: newUser.email,
            name:
              `${newUser.first_name || ""} ${newUser.last_name || ""}`.trim() ||
              userName,
            role: newUser.role,
            status: "pending_verification",
          },
          invitation: {
            id: invitation.id,
            status: "approved",
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 201,
        },
      );
    } catch (error: any) {
      console.error("Error creating user from invitation:", error);
      return new Response(
        JSON.stringify({error: "Failed to create user account"}),
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

  return new Response(JSON.stringify({error: "Invitations route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}

// Admin users handler
async function handleAdminUsers(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/users/referrals - Get all donors with referral data
  if (method === "GET" && route === "/admin/users/referrals") {
    try {
      const url = new URL(req.url);
      const search = url.searchParams.get("search") || "";

      // Get all users with role 'donor' who have referrals
      let usersQuery = supabase
        .from("users")
        .select(
          `
          id,
          email,
          first_name,
          last_name,
          avatar_url,
          created_at
        `,
        )
        .eq("role", "donor");

      if (search) {
        usersQuery = usersQuery.or(
          `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
        );
      }

      const {data: users, error: usersError} = await usersQuery;

      if (usersError) {
        console.error("❌ Error fetching users:", usersError);
        return new Response(JSON.stringify({error: "Failed to fetch users"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        });
      }

      // For each user, get their referral stats
      const donorsWithReferrals = await Promise.all(
        (users || []).map(async (user: any) => {
          // Get all referrals for this user
          const {data: referrals, error: referralsError} = await supabase
            .from("referrals")
            .select("id, status, referral_token, created_at, first_payment_at")
            .eq("referrer_id", user.id);

          if (referralsError) {
            console.error(
              `❌ Error fetching referrals for user ${user.id}:`,
              referralsError,
            );
          }

          const allReferrals = referrals || [];
          const successfulReferrals = allReferrals.filter(
            (r: any) => r.status === "paid",
          );
          const totalReferrals = allReferrals.length;
          const conversionRate =
            totalReferrals > 0
              ? Math.round((successfulReferrals.length / totalReferrals) * 100)
              : 0;

          // Get milestones
          const {data: milestones, error: milestonesError} = await supabase
            .from("user_milestones")
            .select(
              "milestone_type, milestone_count, credit_amount, badge_name, unlocked_at",
            )
            .eq("user_id", user.id)
            .order("milestone_count", {ascending: true});

          if (milestonesError) {
            console.error(
              `❌ Error fetching milestones for user ${user.id}:`,
              milestonesError,
            );
          }

          // Get credits
          const {data: credits, error: creditsError} = await supabase
            .from("user_credits")
            .select("id, amount, status, expires_at, created_at")
            .eq("user_id", user.id);

          if (creditsError) {
            console.error(
              `❌ Error fetching credits for user ${user.id}:`,
              creditsError,
            );
          }

          const allCredits = credits || [];
          const activeCredits = allCredits
            .filter(
              (c: any) =>
                c.status === "active" && new Date(c.expires_at) > new Date(),
            )
            .reduce(
              (sum: number, c: any) => sum + parseFloat(c.amount || 0),
              0,
            );
          const totalEarned = allCredits.reduce(
            (sum: number, c: any) => sum + parseFloat(c.amount || 0),
            0,
          );
          const expired = allCredits
            .filter(
              (c: any) =>
                c.status === "expired" || new Date(c.expires_at) <= new Date(),
            )
            .reduce(
              (sum: number, c: any) => sum + parseFloat(c.amount || 0),
              0,
            );

          const fullName =
            `${user.first_name || ""} ${user.last_name || ""}`.trim();
          const name = fullName || user.email.split("@")[0];
          const avatar =
            user.avatar_url ||
            name[0]?.toUpperCase() ||
            user.email[0]?.toUpperCase() ||
            "?";

          return {
            id: user.id,
            name,
            email: user.email,
            avatar,
            totalReferrals,
            successfulReferrals: successfulReferrals.length,
            conversionRate,
            milestones: (milestones || []).length,
            activeCredits: parseFloat(activeCredits.toFixed(2)),
            referrals: allReferrals.map((r: any) => ({
              id: r.id,
              status: r.status,
              code: r.referral_token || `ref-${r.id}`,
              createdAt: r.created_at,
              firstPaymentAt: r.first_payment_at,
            })),
            milestonesList: (milestones || []).map((m: any) => ({
              type: m.milestone_type,
              count: m.milestone_count,
              creditAmount: parseFloat(m.credit_amount || 0),
              badgeName: m.badge_name,
              unlockedAt: m.unlocked_at,
            })),
            credits: {
              active: parseFloat(activeCredits.toFixed(2)),
              totalEarned: parseFloat(totalEarned.toFixed(2)),
              expired: parseFloat(expired.toFixed(2)),
            },
          };
        }),
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: donorsWithReferrals,
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
      console.error("❌ Admin get users referrals error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch users with referrals",
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

  // GET /admin/users/:userId/referrals - Get user referral details
  const userReferralsMatch = route.match(/^\/admin\/users\/(\d+)\/referrals$/);
  if (method === "GET" && userReferralsMatch) {
    try {
      const userId = parseInt(userReferralsMatch[1], 10);

      // Get user
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("id, email, first_name, last_name, avatar_url")
        .eq("id", userId)
        .single();

      if (userError || !user) {
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      // Get referrals
      const {data: referrals, error: referralsError} = await supabase
        .from("referrals")
        .select(
          `
          id,
          referred_user_id,
          status,
          referral_token,
          monthly_donation_amount,
          first_payment_at,
          last_payment_at,
          created_at,
          referred_user:referred_user_id (
            id,
            email,
            first_name,
            last_name
          )
        `,
        )
        .eq("referrer_id", userId)
        .order("created_at", {ascending: false});

      if (referralsError) {
        console.error("❌ Error fetching referrals:", referralsError);
        return new Response(
          JSON.stringify({error: "Failed to fetch referrals"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      // Get milestones
      const {data: milestones, error: milestonesError} = await supabase
        .from("user_milestones")
        .select(
          "milestone_type, milestone_count, credit_amount, badge_name, reward_description, unlocked_at",
        )
        .eq("user_id", userId)
        .order("milestone_count", {ascending: true});

      if (milestonesError) {
        console.error("❌ Error fetching milestones:", milestonesError);
      }

      // Get credits
      const {data: credits, error: creditsError} = await supabase
        .from("user_credits")
        .select(
          "id, amount, source, status, expires_at, applied_at, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", {ascending: false});

      if (creditsError) {
        console.error("❌ Error fetching credits:", creditsError);
      }

      const allReferrals = referrals || [];
      const successfulReferrals = allReferrals.filter(
        (r: any) => r.status === "paid",
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name:
                `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
                user.email.split("@")[0],
              avatar:
                user.avatar_url ||
                user.first_name?.[0]?.toUpperCase() ||
                user.email[0]?.toUpperCase() ||
                "?",
            },
            referrals: allReferrals.map((r: any) => {
              const referredUser = r.referred_user || {};
              return {
                id: r.id,
                referredUserId: r.referred_user_id,
                referredUserName:
                  referredUser.first_name && referredUser.last_name
                    ? `${referredUser.first_name} ${referredUser.last_name}`
                    : referredUser.email?.split("@")[0] || "Unknown",
                referredUserEmail: referredUser.email || "N/A",
                status: r.status,
                code: r.referral_token || `ref-${r.id}`,
                monthlyDonationAmount: r.monthly_donation_amount
                  ? parseFloat(r.monthly_donation_amount)
                  : null,
                firstPaymentAt: r.first_payment_at,
                lastPaymentAt: r.last_payment_at,
                createdAt: r.created_at,
              };
            }),
            milestones: (milestones || []).map((m: any) => ({
              type: m.milestone_type,
              count: m.milestone_count,
              creditAmount: parseFloat(m.credit_amount || 0),
              badgeName: m.badge_name,
              rewardDescription: m.reward_description,
              unlockedAt: m.unlocked_at,
            })),
            credits: (credits || []).map((c: any) => ({
              id: c.id,
              amount: parseFloat(c.amount || 0),
              source: c.source,
              status: c.status,
              expiresAt: c.expires_at,
              appliedAt: c.applied_at,
              createdAt: c.created_at,
            })),
            stats: {
              totalReferrals: allReferrals.length,
              successfulReferrals: successfulReferrals.length,
              conversionRate:
                allReferrals.length > 0
                  ? Math.round(
                      (successfulReferrals.length / allReferrals.length) * 100,
                    )
                  : 0,
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
      console.error("❌ Admin get user referrals error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch user referrals",
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

  // POST /admin/users/:userId/credits - Grant credit to user
  const grantCreditMatch = route.match(/^\/admin\/users\/(\d+)\/credits$/);
  if (method === "POST" && grantCreditMatch) {
    try {
      const userId = parseInt(grantCreditMatch[1], 10);
      const body = await req.json();
      const {amount, description, expirationDays = 90} = body;

      if (!amount || amount <= 0) {
        return new Response(
          JSON.stringify({error: "Amount must be a positive number"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Verify user exists
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("id, email")
        .eq("id", userId)
        .single();

      if (userError || !user) {
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (expirationDays || 90));

      // Create credit
      const {data: credit, error: creditError} = await supabase
        .from("user_credits")
        .insert([
          {
            user_id: userId,
            amount: parseFloat(amount),
            source: "manual_grant",
            status: "active",
            expires_at: expiresAt.toISOString(),
          },
        ])
        .select()
        .single();

      if (creditError) {
        console.error("❌ Error creating credit:", creditError);
        return new Response(JSON.stringify({error: "Failed to grant credit"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: credit.id,
            userId: credit.user_id,
            amount: parseFloat(credit.amount),
            expiresAt: credit.expires_at,
            description: description || "Manually granted credit",
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 201,
        },
      );
    } catch (error: any) {
      console.error("❌ Admin grant credit error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to grant credit"}),
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

  return new Response(JSON.stringify({error: "Users route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}

// Admin credits handler
async function handleAdminCredits(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // PUT /admin/credits/:creditId/extend - Extend credit expiration
  const extendCreditMatch = route.match(/^\/admin\/credits\/(\d+)\/extend$/);
  if (method === "PUT" && extendCreditMatch) {
    try {
      const creditId = parseInt(extendCreditMatch[1], 10);
      const body = await req.json();
      const {expirationDays = 90} = body;

      // Get existing credit
      const {data: credit, error: creditError} = await supabase
        .from("user_credits")
        .select("id, expires_at, status")
        .eq("id", creditId)
        .single();

      if (creditError || !credit) {
        return new Response(JSON.stringify({error: "Credit not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      if (credit.status !== "active") {
        return new Response(
          JSON.stringify({error: "Can only extend active credits"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Calculate new expiration date
      const currentExpiresAt = new Date(credit.expires_at);
      const newExpiresAt = new Date(currentExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + (expirationDays || 90));

      // Update credit
      const {data: updatedCredit, error: updateError} = await supabase
        .from("user_credits")
        .update({
          expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", creditId)
        .select()
        .single();

      if (updateError) {
        console.error("❌ Error extending credit:", updateError);
        return new Response(
          JSON.stringify({error: "Failed to extend credit"}),
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
            id: updatedCredit.id,
            expiresAt: updatedCredit.expires_at,
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
      console.error("❌ Admin extend credit error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to extend credit"}),
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

  return new Response(JSON.stringify({error: "Credits route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}

// Admin reporting handler
async function handleAdminReporting(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
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
              "id, amount, status, last_payment_date, last_payment_amount",
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
          const processingFees = (oneTimeGifts || []).reduce((sum, g) => {
            if (!g.user_covered_fees) {
              return sum + parseFloat(g.processing_fee || 0);
            }
            return sum;
          }, 0);

          const netAmount = totalDonations - serviceFee - processingFees;
          const platformFee = netAmount * 0.2; // 20% platform fee
          const payoutAmount = netAmount * 0.8; // 80% to beneficiary

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

// Helper function to format charity response (includes all fields)
function formatCharityResponse(charity: any) {
  return {
    id: charity.id,
    name: charity.name,
    category: charity.category || null,
    type: charity.type || null,
    description: charity.description || null,
    about: charity.about || charity.description || null,
    // Impact & Story fields
    whyThisMatters: charity.why_this_matters || null,
    successStory: charity.success_story || null,
    storyAuthor: charity.story_author || null,
    // Impact statements
    impactStatement1: charity.impact_statement_1 || null,
    impactStatement2: charity.impact_statement_2 || null,
    // Note: These fields don't exist in database schema, always return null
    familiesHelped: null,
    communitiesServed: null,
    directToPrograms: null,
    imageUrl: charity.image_url || charity.logo_url || null,
    logoUrl: charity.logo_url || charity.image_url || null,
    location: charity.location || null,
    latitude: charity.latitude ? parseFloat(charity.latitude) : null,
    longitude: charity.longitude ? parseFloat(charity.longitude) : null,
    ein: charity.ein || null,
    website: charity.website || null,
    phone: charity.phone || null,
    email: charity.email || null,
    contactName: charity.contact_name || null,
    social: charity.social || null,
    profileLinks: charity.profile_links || [],
    likes: charity.likes || 0,
    mutual: charity.mutual || 0,
    isActive: charity.is_active !== false,
    verificationStatus: charity.verification_status !== false, // Default to true if null
    // Impact metrics - return as camelCase (now supports full sentences, not just numbers)
    livesImpacted: charity.lives_impacted || null,
    programsActive: charity.programs_active || null,
    directToProgramsPercentage: charity.direct_to_programs_percentage || null,
    createdAt: charity.created_at,
    updatedAt: charity.updated_at,
  };
}

// Admin charities handler
async function handleAdminCharities(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/charities - List all charities
  if (method === "GET" && route === "/admin/charities") {
    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const search = url.searchParams.get("search");
      const category = url.searchParams.get("category");
      const isActive = url.searchParams.get("isActive");
      const includeInactive =
        url.searchParams.get("includeInactive") === "true" ||
        url.searchParams.get("include_inactive") === "true";
      console.log(
        "GET /admin/charities - req.url:",
        req.url,
        "| includeInactive:",
        includeInactive,
        "| params:",
        url.searchParams.toString(),
      );

      let query = supabase.from("charities").select("*", {count: "exact"});

      // Search filter
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,description.ilike.%${search}%,about.ilike.%${search}%`,
        );
      }

      // Category filter
      if (category && category !== "All") {
        query = query.eq("category", category);
      }

      // Active status filter - Admin panel needs ALL charities (active + inactive) for toggles/filters
      // Only filter when isActive param is explicitly set; otherwise return all
      if (isActive === "false") {
        query = query.eq("is_active", false);
      } else if (isActive === "true") {
        query = query.eq("is_active", true);
      }
      // No isActive param (or includeInactive=true): return all - no filter

      // Order and pagination
      const {
        data: charities,
        error,
        count,
      } = await query
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching charities:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch charities"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Format charities for admin panel
      const formattedCharities = (charities || []).map((charity: any) =>
        formatCharityResponse(charity),
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: formattedCharities,
          pagination: {
            page,
            limit,
            total: count || 0,
            pages: Math.ceil((count || 0) / limit),
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching charities:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch charities"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /admin/charities/:id - Get single charity
  const getCharityMatch = route.match(/^\/admin\/charities\/(\d+)$/);
  if (method === "GET" && getCharityMatch) {
    try {
      const charityId = getCharityMatch[1];

      const {data: charity, error} = await supabase
        .from("charities")
        .select("*")
        .eq("id", charityId)
        .single();

      if (error || !charity) {
        return new Response(JSON.stringify({error: "Charity not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      const formattedCharity = formatCharityResponse(charity);

      return new Response(
        JSON.stringify({
          success: true,
          data: formattedCharity,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching charity:", error);
      return new Response(JSON.stringify({error: "Failed to fetch charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // POST /admin/charities - Create new charity
  if (method === "POST" && route === "/admin/charities") {
    try {
      const body = await req.json();

      // Log the entire request body for debugging
      console.log(
        "📦 POST /admin/charities - Full request body:",
        JSON.stringify(body, null, 2),
      );
      console.log(
        "📦 POST /admin/charities - All keys in body:",
        Object.keys(body),
      );
      console.log("📦 POST /admin/charities - name field:", body.name);
      console.log(
        "📦 POST /admin/charities - beneficiaryName field:",
        body.beneficiaryName,
      );
      console.log(
        "📦 POST /admin/charities - charityName field:",
        body.charityName,
      );
      console.log("📦 POST /admin/charities - Impact metrics:", {
        livesImpacted: body.livesImpacted || body.lives_impacted,
        programsActive: body.programsActive || body.programs_active,
        directToProgramsPercentage:
          body.directToProgramsPercentage || body.direct_to_programs_percentage,
      });

      const {
        name,
        beneficiaryName, // Accept both name and beneficiaryName (frontend might use different field)
        charityName, // Also accept charityName as fallback
        category,
        type,
        description,
        about,
        why_this_matters,
        whyThisMatters,
        success_story,
        successStory,
        story_author,
        storyAuthor,
        // Impact statements - accept both camelCase and snake_case
        impact_statement_1,
        impactStatement1,
        impact_statement_2,
        impactStatement2,
        // Note: Removed non-existent fields from destructuring:
        // families_helped, familiesHelped, communities_served, communitiesServed,
        // direct_to_programs, directToPrograms
        website,
        phone,
        email,
        primary_email,
        contact_name,
        contactName,
        social,
        location,
        latitude,
        longitude,
        ein,
        imageUrl,
        logoUrl,
        likes,
        mutual,
        isActive,
        verification_status,
        verificationStatus,
        profile_links,
        profileLinks,
        // Impact metrics - accept both camelCase and snake_case
        livesImpacted,
        lives_impacted,
        programsActive,
        programs_active,
        directToProgramsPercentage,
        direct_to_programs_percentage,
      } = body;

      // Accept name, beneficiaryName, or charityName (frontend might use different field names)
      const finalName = name || beneficiaryName || charityName;

      if (!finalName) {
        console.error(
          "❌ Missing charity name in request body. Received fields:",
          Object.keys(body),
        );
        return new Response(
          JSON.stringify({
            error:
              'Charity name is required (send as "name", "beneficiaryName", or "charityName")',
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Handle profile_links (accept both snake_case and camelCase)
      let profileLinksData = null;
      if (profile_links !== undefined) {
        profileLinksData = Array.isArray(profile_links) ? profile_links : null;
      } else if (profileLinks !== undefined) {
        profileLinksData = Array.isArray(profileLinks) ? profileLinks : null;
      }

      // Geocode if location provided but coordinates are not
      let finalLatitude = latitude ? parseFloat(latitude) : null;
      let finalLongitude = longitude ? parseFloat(longitude) : null;

      if (location && !finalLatitude && !finalLongitude) {
        const geocodeResult = await geocodeAddress(location);
        finalLatitude = geocodeResult.latitude;
        finalLongitude = geocodeResult.longitude;
        if (finalLatitude && finalLongitude) {
          console.log(
            `✅ Geocoded location "${location}" to (${finalLatitude}, ${finalLongitude})`,
          );
        }
      }

      // Log image URL for debugging
      if (imageUrl) {
        console.log(
          `📸 Image URL received in POST /admin/charities: ${imageUrl}`,
        );
      } else if (logoUrl) {
        console.log(
          `📸 Logo URL received in POST /admin/charities: ${logoUrl}`,
        );
      } else {
        console.log(
          `⚠️ No imageUrl or logoUrl provided in POST /admin/charities`,
        );
      }

      // Define valid database columns for charities table
      // This list should match the actual database schema
      const validCharityColumns = [
        "name",
        "category",
        "type",
        "description",
        "about",
        "why_this_matters",
        "success_story",
        "story_author",
        "impact_statement_1",
        "impact_statement_2",
        "website",
        "phone",
        "email",
        "contact_name",
        "social",
        "location",
        "latitude",
        "longitude",
        "ein",
        "image_url",
        "logo_url",
        "likes",
        "mutual",
        "is_active",
        "verification_status",
        "profile_links",
        "lives_impacted",
        "programs_active",
        "direct_to_programs_percentage",
        "created_by_user_id",
        "created_at",
        "updated_at",
      ];

      const charityData: any = {
        name: finalName, // Use the resolved name value
        category: category || null,
        type: type || null,
        description: description || null,
        about: about || description || null,
        // Impact & Story fields - handle both camelCase and snake_case
        why_this_matters:
          whyThisMatters !== undefined
            ? whyThisMatters
            : why_this_matters !== undefined
              ? why_this_matters
              : null,
        success_story:
          successStory !== undefined
            ? successStory
            : success_story !== undefined
              ? success_story
              : null,
        story_author:
          storyAuthor !== undefined
            ? storyAuthor
            : story_author !== undefined
              ? story_author
              : null,
        // Impact statements - handle both camelCase and snake_case
        impact_statement_1:
          impactStatement1 !== undefined
            ? impactStatement1
            : impact_statement_1 !== undefined
              ? impact_statement_1
              : null,
        impact_statement_2:
          impactStatement2 !== undefined
            ? impactStatement2
            : impact_statement_2 !== undefined
              ? impact_statement_2
              : null,
        // Note: Removed non-existent fields:
        // - families_helped, communities_served, direct_to_programs
        website: website || null,
        phone: phone || null,
        email: email || primary_email || null,
        contact_name: contact_name || contactName || null,
        social: social || null,
        location: location || null,
        latitude: finalLatitude,
        longitude: finalLongitude,
        ein: ein || null,
        image_url: imageUrl || logoUrl || null,
        logo_url: logoUrl || imageUrl || null,
        likes: likes ? parseInt(likes) : 0,
        mutual: mutual ? parseInt(mutual) : 0,
        is_active: isActive !== false,
        verification_status:
          verification_status !== undefined
            ? verification_status
            : verificationStatus !== undefined
              ? verificationStatus
              : true, // Default to true
        // Impact metrics - handle both camelCase and snake_case (now supports full sentences)
        lives_impacted:
          livesImpacted !== undefined
            ? String(livesImpacted)
            : lives_impacted !== undefined
              ? String(lives_impacted)
              : null,
        programs_active:
          programsActive !== undefined
            ? String(programsActive)
            : programs_active !== undefined
              ? String(programs_active)
              : null,
        direct_to_programs_percentage:
          directToProgramsPercentage !== undefined
            ? String(directToProgramsPercentage)
            : direct_to_programs_percentage !== undefined
              ? String(direct_to_programs_percentage)
              : null,
      };

      // Add profile_links if provided
      if (profileLinksData !== null) {
        charityData.profile_links = profileLinksData;
      }

      // Defensive: Remove any fields that don't exist in the database schema
      // This prevents schema cache errors if unexpected fields are sent
      const filteredCharityData: any = {};
      for (const key in charityData) {
        if (validCharityColumns.includes(key)) {
          filteredCharityData[key] = charityData[key];
        } else {
          console.warn(`⚠️ Filtering out non-existent column: ${key}`);
        }
      }

      const {data: newCharity, error: insertError} = await supabase
        .from("charities")
        .insert([filteredCharityData])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating charity:", insertError);
        return new Response(
          JSON.stringify({
            error: insertError.message || "Failed to create charity",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: formatCharityResponse(newCharity),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating charity:", error);
      return new Response(JSON.stringify({error: "Failed to create charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // PUT /admin/charities/:id - Update charity
  const updateCharityMatch = route.match(/^\/admin\/charities\/(\d+)$/);
  if (method === "PUT" && updateCharityMatch) {
    try {
      const charityId = updateCharityMatch[1];
      const body = await req.json();
      const {
        name,
        category,
        type,
        description,
        about,
        why_this_matters,
        whyThisMatters,
        success_story,
        successStory,
        story_author,
        storyAuthor,
        // Impact statements - accept both camelCase and snake_case
        impact_statement_1,
        impactStatement1,
        impact_statement_2,
        impactStatement2,
        // Note: Removed non-existent fields from destructuring:
        // familiesHelped, families_helped, communitiesServed, communities_served,
        // directToPrograms, direct_to_programs
        website,
        phone,
        email,
        primary_email,
        contact_name,
        contactName,
        social,
        location,
        latitude,
        longitude,
        ein,
        imageUrl,
        logoUrl,
        likes,
        mutual,
        isActive,
        is_active: is_activeBody,
        verificationStatus,
        verification_status,
        profile_links,
        profileLinks,
        // Impact metrics - accept both camelCase and snake_case
        livesImpacted,
        lives_impacted,
        programsActive,
        programs_active,
        directToProgramsPercentage,
        direct_to_programs_percentage,
      } = body;

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (name !== undefined) updateData.name = name;
      if (category !== undefined) updateData.category = category;
      if (type !== undefined) updateData.type = type;
      if (description !== undefined) updateData.description = description;
      if (about !== undefined) updateData.about = about;

      // Impact & Story fields - handle both camelCase and snake_case
      if (whyThisMatters !== undefined || why_this_matters !== undefined) {
        updateData.why_this_matters =
          whyThisMatters !== undefined
            ? whyThisMatters
            : why_this_matters !== undefined
              ? why_this_matters
              : null;
      }
      if (successStory !== undefined || success_story !== undefined) {
        updateData.success_story =
          successStory !== undefined
            ? successStory
            : success_story !== undefined
              ? success_story
              : null;
      }
      if (storyAuthor !== undefined || story_author !== undefined) {
        updateData.story_author =
          storyAuthor !== undefined
            ? storyAuthor
            : story_author !== undefined
              ? story_author
              : null;
      }

      // Impact statements - handle both camelCase and snake_case
      if (impactStatement1 !== undefined || impact_statement_1 !== undefined) {
        updateData.impact_statement_1 =
          impactStatement1 !== undefined
            ? impactStatement1
            : impact_statement_1 !== undefined
              ? impact_statement_1
              : null;
      }
      if (impactStatement2 !== undefined || impact_statement_2 !== undefined) {
        updateData.impact_statement_2 =
          impactStatement2 !== undefined
            ? impactStatement2
            : impact_statement_2 !== undefined
              ? impact_statement_2
              : null;
      }

      // Impact metrics - handle both camelCase and snake_case (now supports full sentences)
      if (livesImpacted !== undefined || lives_impacted !== undefined) {
        updateData.lives_impacted =
          livesImpacted !== undefined
            ? String(livesImpacted)
            : lives_impacted !== undefined
              ? String(lives_impacted)
              : null;
      }
      if (programsActive !== undefined || programs_active !== undefined) {
        updateData.programs_active =
          programsActive !== undefined
            ? String(programsActive)
            : programs_active !== undefined
              ? String(programs_active)
              : null;
      }
      if (
        directToProgramsPercentage !== undefined ||
        direct_to_programs_percentage !== undefined
      ) {
        updateData.direct_to_programs_percentage =
          directToProgramsPercentage !== undefined
            ? String(directToProgramsPercentage)
            : direct_to_programs_percentage !== undefined
              ? String(direct_to_programs_percentage)
              : null;
      }
      // Note: Removed non-existent fields:
      // families_helped, communities_served, direct_to_programs
      // These columns do not exist in the database schema
      if (website !== undefined) updateData.website = website;
      if (email !== undefined || primary_email !== undefined) {
        updateData.email = email || primary_email || null;
      }
      if (contact_name !== undefined || contactName !== undefined) {
        updateData.contact_name = contact_name || contactName || null;
      }
      if (phone !== undefined) updateData.phone = phone;
      if (social !== undefined) updateData.social = social;
      if (location !== undefined) updateData.location = location;
      if (verification_status !== undefined)
        updateData.verification_status = verification_status;
      if (verificationStatus !== undefined)
        updateData.verification_status = verificationStatus;

      // Handle coordinates - geocode if location changed but coordinates not provided
      if (latitude !== undefined) {
        updateData.latitude = latitude ? parseFloat(latitude) : null;
      }
      if (longitude !== undefined) {
        updateData.longitude = longitude ? parseFloat(longitude) : null;
      }

      // Geocode if location is being updated but coordinates are not provided
      if (
        location !== undefined &&
        latitude === undefined &&
        longitude === undefined
      ) {
        const geocodeResult = await geocodeAddress(location);
        if (geocodeResult.latitude && geocodeResult.longitude) {
          updateData.latitude = geocodeResult.latitude;
          updateData.longitude = geocodeResult.longitude;
          console.log(
            `✅ Geocoded location "${location}" to (${geocodeResult.latitude}, ${geocodeResult.longitude})`,
          );
        }
      }

      if (ein !== undefined) updateData.ein = ein;
      if (imageUrl !== undefined) {
        console.log(
          `📸 Image URL received in PUT /admin/charities/${charityId}: ${imageUrl}`,
        );
        updateData.image_url = imageUrl;
      }
      if (logoUrl !== undefined) {
        console.log(
          `📸 Logo URL received in PUT /admin/charities/${charityId}: ${logoUrl}`,
        );
        updateData.logo_url = logoUrl;
      }
      if (imageUrl === undefined && logoUrl === undefined) {
        console.log(
          `⚠️ No imageUrl or logoUrl provided in PUT /admin/charities/${charityId}`,
        );
      }

      // Handle profile_links (accept both snake_case and camelCase)
      if (profile_links !== undefined) {
        updateData.profile_links = Array.isArray(profile_links)
          ? profile_links
          : null;
      } else if (profileLinks !== undefined) {
        updateData.profile_links = Array.isArray(profileLinks)
          ? profileLinks
          : null;
      }

      if (likes !== undefined) updateData.likes = parseInt(likes);
      if (mutual !== undefined) updateData.mutual = parseInt(mutual);
      // Only update is_active if explicitly provided as a boolean (accept isActive or is_active)
      const isActiveVal = isActive ?? is_activeBody;
      if (isActiveVal !== undefined && typeof isActiveVal === "boolean") {
        updateData.is_active = isActiveVal;
      }

      const {data: updatedCharity, error: updateError} = await supabase
        .from("charities")
        .update(updateData)
        .eq("id", charityId)
        .select()
        .single();

      if (updateError || !updatedCharity) {
        return new Response(
          JSON.stringify({error: "Charity not found or update failed"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: formatCharityResponse(updatedCharity),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error updating charity:", error);
      return new Response(JSON.stringify({error: "Failed to update charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // DELETE /admin/charities/:id - Delete charity (soft delete)
  const deleteCharityMatch = route.match(/^\/admin\/charities\/(\d+)$/);
  if (method === "DELETE" && deleteCharityMatch) {
    try {
      const charityId = deleteCharityMatch[1];
      console.log(
        `🗑️ DELETE /admin/charities/${charityId} - Attempting to soft delete charity`,
      );

      // First, verify the charity exists
      const {data: existingCharity, error: fetchError} = await supabase
        .from("charities")
        .select("id, name, is_active")
        .eq("id", charityId)
        .single();

      if (fetchError || !existingCharity) {
        console.error(`❌ Charity ${charityId} not found:`, fetchError);
        return new Response(JSON.stringify({error: "Charity not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      console.log(
        `📋 Found charity: ${existingCharity.name} (id: ${charityId}, is_active: ${existingCharity.is_active})`,
      );

      // Soft delete by setting is_active to false
      const {data: updatedCharity, error: updateError} = await supabase
        .from("charities")
        .update({is_active: false, updated_at: new Date().toISOString()})
        .eq("id", charityId)
        .select("id, name, is_active")
        .single();

      if (updateError || !updatedCharity) {
        console.error(`❌ Error deleting charity ${charityId}:`, updateError);
        return new Response(
          JSON.stringify({
            error: updateError?.message || "Failed to delete charity",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log(
        `✅ Successfully soft-deleted charity: ${updatedCharity.name} (id: ${charityId})`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: "Charity deleted successfully",
          data: {
            id: updatedCharity.id,
            name: updatedCharity.name,
            isActive: updatedCharity.is_active,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Error deleting charity:", error);
      return new Response(JSON.stringify({error: "Failed to delete charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  return new Response(
    JSON.stringify({error: "Admin charities route not found"}),
    {
      headers: {"Content-Type": "application/json"},
      status: 404,
    },
  );
}

// Admin settings handler
// Admin one-time gifts handler
async function handleAdminOneTimeGifts(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // POST /admin/one-time-gifts/:id/refund
  const refundMatch = route.match(/^\/admin\/one-time-gifts\/(\d+)\/refund$/);
  if (method === "POST" && refundMatch) {
    try {
      const giftId = parseInt(refundMatch[1]);
      const body = await req.json();
      const {amount, reason, admin_notes} = body;

      if (!giftId) {
        return new Response(JSON.stringify({error: "Invalid gift ID"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Get gift record (try beneficiaries first, fallback to charities)
      let gift: any = null;
      let giftError: any = null;

      const beneficiariesGift = await supabase
        .from("one_time_gifts")
        .select("*, beneficiaries!inner(id, name)")
        .eq("id", giftId)
        .single();

      if (!beneficiariesGift.error && beneficiariesGift.data) {
        gift = beneficiariesGift.data;
      } else {
        const charitiesGift = await supabase
          .from("one_time_gifts")
          .select("*, charities!inner(id, name)")
          .eq("id", giftId)
          .single();
        gift = charitiesGift.data;
        giftError = charitiesGift.error;
      }

      if (giftError || !gift) {
        return new Response(JSON.stringify({error: "Gift not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      if (gift.status !== "succeeded") {
        return new Response(
          JSON.stringify({error: "Can only refund succeeded gifts"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      if (!gift.stripe_charge_id) {
        return new Response(
          JSON.stringify({error: "Gift does not have a Stripe charge ID"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Create refund in Stripe
      const refundAmount = amount
        ? parseFloat(amount)
        : parseFloat(gift.amount);
      const stripeRefund = await createStripeRefund(
        gift.stripe_charge_id,
        refundAmount,
        reason || "requested_by_customer",
      );

      // Update gift record
      const refundAmountDecimal = refundAmount;
      const isFullRefund =
        Math.abs(refundAmountDecimal - parseFloat(gift.amount)) < 0.01;

      const {error: updateError} = await supabase
        .from("one_time_gifts")
        .update({
          status: isFullRefund ? "refunded" : "refunded",
          refund_amount: refundAmountDecimal,
          refunded_at: new Date().toISOString(),
          admin_notes: admin_notes || gift.admin_notes || null,
        })
        .eq("id", gift.id);

      if (updateError) {
        console.error("❌ Error updating gift refund:", updateError);
        return new Response(
          JSON.stringify({error: "Failed to update gift record"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Update beneficiary totals (subtract refunded amount)
      const {data: charity} = await supabase
        .from("charities")
        .select("total_one_time_gifts, one_time_gifts_count")
        .eq("id", gift.beneficiary_id)
        .single();

      if (charity) {
        await supabase
          .from("charities")
          .update({
            total_one_time_gifts: Math.max(
              0,
              parseFloat(charity.total_one_time_gifts || 0) -
                refundAmountDecimal,
            ),
          })
          .eq("id", gift.beneficiary_id);
      }

      // Update user totals (subtract refunded amount)
      const {data: user} = await supabase
        .from("users")
        .select("total_one_time_gifts_given")
        .eq("id", gift.user_id)
        .single();

      if (user) {
        await supabase
          .from("users")
          .update({
            total_one_time_gifts_given: Math.max(
              0,
              parseFloat(user.total_one_time_gifts_given || 0) -
                refundAmountDecimal,
            ),
          })
          .eq("id", gift.user_id);
      }

      // Get updated gift
      const {data: updatedGift} = await supabase
        .from("one_time_gifts")
        .select("*, charities!inner(id, name)")
        .eq("id", gift.id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          gift: {
            id: updatedGift.id,
            status: updatedGift.status,
            refund_amount: parseFloat(updatedGift.refund_amount || 0),
            refunded_at: updatedGift.refunded_at,
          },
          stripe_refund: {
            id: stripeRefund.id,
            amount: stripeRefund.amount / 100, // Convert from cents
            status: stripeRefund.status,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Refund Error:", error);
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

  // 404 for admin one-time gift routes
  return new Response(
    JSON.stringify({error: "Admin one-time gift route not found"}),
    {
      headers: {"Content-Type": "application/json"},
      status: 404,
    },
  );
}

// Admin storage handler
async function handleAdminStorageRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // POST /admin/storage/upload
  if (method === "POST" && route === "/admin/storage/upload") {
    try {
      const {bucket, path, file, contentType, fileName} = await req.json();

      if (!bucket || !path || !file || !contentType) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing required fields: bucket, path, file, contentType",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Convert base64 to Uint8Array
      let fileData: Uint8Array;
      try {
        // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        const base64Data = file.includes(",") ? file.split(",")[1] : file;
        fileData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid base64 file data",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Upload to Supabase Storage
      const {data: uploadData, error: uploadError} = await supabase.storage
        .from(bucket)
        .upload(path, fileData, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("❌ Storage upload error:", uploadError);
        return new Response(
          JSON.stringify({
            success: false,
            error: uploadError.message || "Failed to upload file",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Get public URL
      const {data: urlData} = supabase.storage.from(bucket).getPublicUrl(path);

      return new Response(
        JSON.stringify({
          success: true,
          url: urlData.publicUrl,
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Storage upload error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error. Please try again later.",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/storage/delete
  if (method === "POST" && route === "/admin/storage/delete") {
    try {
      const {bucket, path} = await req.json();

      if (!bucket || !path) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing required fields: bucket, path",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Extract just the file path (remove bucket name if included)
      let filePath = path;
      if (path.startsWith(`${bucket}/`)) {
        filePath = path.replace(`${bucket}/`, "");
      }

      // Delete from Supabase Storage
      const {error: deleteError} = await supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (deleteError) {
        console.error("❌ Storage delete error:", deleteError);
        return new Response(
          JSON.stringify({
            success: false,
            error: deleteError.message || "Failed to delete file",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({success: true}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("❌ Storage delete error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error. Please try again later.",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // 404 for admin storage routes
  return new Response(
    JSON.stringify({error: "Admin storage route not found"}),
    {
      headers: {...corsHeaders, "Content-Type": "application/json"},
      status: 404,
    },
  );
}

async function handleAdminNotifications(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  const url = new URL(req.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "20", 10),
    100,
  );
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";

  if (method === "GET" && route === "/admin/notifications") {
    try {
      let query = supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      if (unreadOnly) {
        query = query.is("read_at", null);
      }

      const {data, error} = await query;

      if (error) {
        console.error("❌ Error fetching notifications:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch notifications",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const {count: unreadCount, error: unreadError} = await supabase
        .from("admin_notifications")
        .select("id", {count: "exact", head: true})
        .is("read_at", null);

      if (unreadError) {
        console.warn("⚠️ Failed to count unread notifications:", unreadError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: data || [],
          unreadCount: unreadCount ?? 0,
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Notifications GET error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  if (method === "POST" && route === "/admin/notifications") {
    try {
      const payload = await req.json();
      const title = payload?.title?.toString().trim();
      const message = payload?.message?.toString().trim() || null;
      const level = ["info", "success", "warning", "error"].includes(
        payload?.level,
      )
        ? payload.level
        : "info";

      if (!title) {
        return new Response(
          JSON.stringify({success: false, error: "Title is required"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const insertPayload = {
        title,
        message,
        level,
        entity_type: payload?.entity_type || null,
        entity_id: payload?.entity_id ? String(payload.entity_id) : null,
        metadata: payload?.metadata || {},
      };

      const {data, error} = await supabase
        .from("admin_notifications")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        console.error("❌ Error creating notification:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to create notification",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Send email to admin team members for notifications shown in the bell
      try {
        const {data: members} = await supabase
          .from("admin_team_members")
          .select("id, name, email")
          .eq("status", "Active");
        if (members && members.length > 0) {
          for (const member of members) {
            if (member.email) {
              await sendNotificationEmail({
                to: member.email,
                name: member.name || member.email.split("@")[0],
                title,
                message,
                level,
              });
            }
          }
        }
      } catch (emailErr) {
        console.warn(
          "⚠️ Failed to send notification emails (non-fatal):",
          emailErr,
        );
      }

      return new Response(JSON.stringify({success: true, data}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 201,
      });
    } catch (error: any) {
      console.error("❌ Notifications POST error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  if (method === "POST" && route === "/admin/notifications/read") {
    try {
      const payload = await req.json();
      const markAll = payload?.all === true;
      const ids: string[] = Array.isArray(payload?.ids)
        ? payload.ids.map((id: any) => String(id))
        : [];

      let updateQuery = supabase
        .from("admin_notifications")
        .update({read_at: new Date().toISOString()});

      if (markAll) {
        updateQuery = updateQuery.is("read_at", null);
      } else if (ids.length > 0) {
        updateQuery = updateQuery.in("id", ids);
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: "No notification ids provided",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {error} = await updateQuery;

      if (error) {
        console.error("❌ Error updating notifications:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to mark notifications as read",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({success: true}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("❌ Notifications read error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(
    JSON.stringify({error: "Notifications route not found"}),
    {
      headers: {...corsHeaders, "Content-Type": "application/json"},
      status: 404,
    },
  );
}

async function handleAdminSettings(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/settings
  if (method === "GET" && route === "/admin/settings") {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          notifications: {
            email: true,
            push: true,
            sms: false,
          },
          apiRateLimiting: {
            enabled: true,
            requestsPerMinute: 60,
            requestsPerHour: 1000,
          },
          system: {
            maintenanceMode: false,
            allowRegistration: true,
          },
        },
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // PUT /admin/settings
  if (method === "PUT" && route === "/admin/settings") {
    const settingsData = await req.json();

    // For now, just acknowledge the update
    // You can store settings in a table later
    console.log("Settings update requested:", settingsData);

    return new Response(
      JSON.stringify({
        success: true,
        data: settingsData,
        message: "Settings updated successfully",
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // GET /admin/settings/team
  if (method === "GET" && route === "/admin/settings/team") {
    const {data: members, error} = await supabase
      .from("admin_team_members")
      .select(
        "id, name, email, role, status, created_at, updated_at, last_login_at",
      )
      .order("created_at", {ascending: false});

    if (error) {
      console.error("Error fetching team members:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch team members"}),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    const teamMembers = (members || []).map((member: any) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
      lastLogin: member.last_login_at || member.updated_at || member.created_at,
      avatar:
        member.name?.[0]?.toUpperCase() ||
        member.email?.[0]?.toUpperCase() ||
        "A",
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: teamMembers,
      }),
      {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/settings/team
  if (method === "POST" && route === "/admin/settings/team") {
    try {
      const payload = await req.json();
      const name = payload?.name?.toString().trim();
      const email = payload?.email?.toString().trim().toLowerCase();
      const role = payload?.role?.toString().trim() || "User";
      const status = payload?.status?.toString().trim() || "Active";

      if (!name || !email) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Name and email are required",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data: existingMember} = await supabase
        .from("admin_team_members")
        .select("id")
        .eq("email", email)
        .limit(1);

      if (existingMember && existingMember.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Team member with this email already exists",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 409,
          },
        );
      }

      const tempPassword = `TI${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`;
      const passwordHash = await bcryptHash(tempPassword);

      const {data, error} = await supabase
        .from("admin_team_members")
        .insert({
          name,
          email,
          role,
          status,
          password_hash: passwordHash,
          must_reset_password: true,
        })
        .select("id, name, email, role, status, created_at, updated_at")
        .single();

      if (error) {
        console.error("Error creating team member:", error);
        return new Response(
          JSON.stringify({success: false, error: "Failed to add team member"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      sendAdminTempPasswordEmail({
        to: email,
        name,
        tempPassword,
      }).catch((emailError) => {
        console.error(
          "❌ Error sending admin temp password email:",
          emailError,
        );
      });

      return new Response(JSON.stringify({success: true, data}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 201,
      });
    } catch (error: any) {
      console.error("Team member create error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // PUT /admin/settings/team/:id
  const teamUpdateMatch = route.match(/^\/admin\/settings\/team\/(\d+)$/);
  if (method === "PUT" && teamUpdateMatch) {
    try {
      const memberId = parseInt(teamUpdateMatch[1], 10);
      const payload = await req.json();
      const updateData: any = {};

      if (payload?.name) updateData.name = payload.name.toString().trim();
      if (payload?.email)
        updateData.email = payload.email.toString().trim().toLowerCase();
      if (payload?.role) updateData.role = payload.role.toString().trim();
      if (payload?.status) updateData.status = payload.status.toString().trim();
      updateData.updated_at = new Date().toISOString();

      if (Object.keys(updateData).length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "No fields to update"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data, error} = await supabase
        .from("admin_team_members")
        .update(updateData)
        .eq("id", memberId)
        .select("id, name, email, role, status, created_at, updated_at")
        .single();

      if (error) {
        console.error("Error updating team member:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to update team member",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({success: true, data}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("Team member update error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/settings/team/login
  if (method === "POST" && route === "/admin/settings/team/login") {
    try {
      const payload = await req.json();
      const email = payload?.email?.toString().trim().toLowerCase();
      const password = payload?.password?.toString() || "";

      if (!email || !password) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Email and password are required",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data: members, error} = await supabase
        .from("admin_team_members")
        .select(
          "id, name, email, role, status, password_hash, must_reset_password",
        )
        .eq("email", email)
        .limit(1);

      if (error || !members || members.length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid email or password"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const member = members[0];
      if (member.status?.toLowerCase() !== "active") {
        return new Response(
          JSON.stringify({success: false, error: "Account is inactive"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 403,
          },
        );
      }

      if (
        !member.password_hash ||
        !(await bcryptCompare(password, member.password_hash))
      ) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid email or password"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      await supabase
        .from("admin_team_members")
        .update({
          last_login_at: new Date().toISOString(),
          must_reset_password: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: member.id,
            name: member.name,
            email: member.email,
            role: member.role,
          },
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("Team member login error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/settings/team/reset-password
  if (method === "POST" && route === "/admin/settings/team/reset-password") {
    try {
      const payload = await req.json();
      const email = payload?.email?.toString().trim().toLowerCase();
      const providedTempPassword = payload?.tempPassword?.toString();

      if (!email) {
        return new Response(
          JSON.stringify({success: false, error: "Email is required"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data: members, error} = await supabase
        .from("admin_team_members")
        .select("id, name, email, status")
        .eq("email", email)
        .limit(1);

      if (error || !members || members.length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "Team member not found"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      const member = members[0];
      if (member.status?.toLowerCase() !== "active") {
        return new Response(
          JSON.stringify({success: false, error: "Account is inactive"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 403,
          },
        );
      }

      const tempPassword = providedTempPassword
        ? providedTempPassword
        : `TI${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`;
      const passwordHash = await bcryptHash(tempPassword);

      const {error: updateError} = await supabase
        .from("admin_team_members")
        .update({
          password_hash: passwordHash,
          must_reset_password: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);

      if (updateError) {
        console.error("Error resetting team member password:", updateError);
        return new Response(
          JSON.stringify({success: false, error: "Failed to reset password"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      sendAdminTempPasswordEmail({
        to: member.email,
        name: member.name || member.email.split("@")[0],
        tempPassword,
      }).catch((emailError) => {
        console.error(
          "❌ Error sending admin temp password email:",
          emailError,
        );
      });

      return new Response(JSON.stringify({success: true}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("Team member reset password error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/settings/team/change-password
  if (method === "POST" && route === "/admin/settings/team/change-password") {
    try {
      const payload = await req.json();
      const email = payload?.email?.toString().trim().toLowerCase();
      const currentPassword = payload?.currentPassword?.toString() || "";
      const newPassword = payload?.newPassword?.toString() || "";

      if (!email || !currentPassword || !newPassword) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Email, current password, and new password are required",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data: members, error} = await supabase
        .from("admin_team_members")
        .select("id, email, status, password_hash")
        .eq("email", email)
        .limit(1);

      if (error || !members || members.length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "Team member not found"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      const member = members[0];
      if (member.status?.toLowerCase() !== "active") {
        return new Response(
          JSON.stringify({success: false, error: "Account is inactive"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 403,
          },
        );
      }

      if (
        !member.password_hash ||
        !(await bcryptCompare(currentPassword, member.password_hash))
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Current password is incorrect",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const passwordHash = await bcryptHash(newPassword);
      const {error: updateError} = await supabase
        .from("admin_team_members")
        .update({
          password_hash: passwordHash,
          must_reset_password: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);

      if (updateError) {
        console.error("Error changing team member password:", updateError);
        return new Response(
          JSON.stringify({success: false, error: "Failed to change password"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({success: true}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("Team member change password error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Settings route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Account deletion information page handler (Google Play requirement)
async function handleAccountDeletionPage(): Promise<Response> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Delete Your Account - Thrive Initiative</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .header p {
      font-size: 1.1em;
      opacity: 0.95;
    }
    .content {
      padding: 40px 30px;
    }
    .section {
      margin-bottom: 35px;
    }
    .section h2 {
      color: #667eea;
      font-size: 1.8em;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
    }
    .section h3 {
      color: #764ba2;
      font-size: 1.3em;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    .steps {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .steps ol {
      margin-left: 20px;
      margin-top: 10px;
    }
    .steps li {
      margin-bottom: 12px;
      font-size: 1.05em;
    }
    .data-list {
      background: #fff5f5;
      border-left: 4px solid #e53e3e;
      padding: 20px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .data-list ul {
      margin-left: 20px;
      margin-top: 10px;
    }
    .data-list li {
      margin-bottom: 8px;
    }
    .kept-list {
      background: #f0fff4;
      border-left: 4px solid #38a169;
      padding: 20px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .kept-list ul {
      margin-left: 20px;
      margin-top: 10px;
    }
    .kept-list li {
      margin-bottom: 8px;
    }
    .warning {
      background: #fffbf0;
      border: 2px solid #f6ad55;
      border-radius: 8px;
      padding: 20px;
      margin: 25px 0;
    }
    .warning strong {
      color: #c05621;
      display: block;
      margin-bottom: 10px;
      font-size: 1.1em;
    }
    .contact-box {
      background: #e6f3ff;
      border: 2px solid #4299e1;
      border-radius: 8px;
      padding: 25px;
      margin: 25px 0;
      text-align: center;
    }
    .contact-box h3 {
      color: #2c5282;
      margin-bottom: 15px;
    }
    .contact-box p {
      font-size: 1.1em;
      margin: 8px 0;
    }
    .contact-box a {
      color: #2b6cb0;
      text-decoration: none;
      font-weight: 600;
    }
    .contact-box a:hover {
      text-decoration: underline;
    }
    .footer {
      background: #f8f9fa;
      padding: 25px 30px;
      text-align: center;
      color: #666;
      border-top: 1px solid #e9ecef;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    @media (max-width: 600px) {
      .header h1 {
        font-size: 2em;
      }
      .content {
        padding: 25px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delete Your Account</h1>
      <p>Thrive Initiative by For Purpose Technologies</p>
    </div>
    
    <div class="content">
      <div class="section">
        <h2>Partial Data Deletion (Without Deleting Your Account)</h2>
        <div class="kept-list">
          <p><strong>You can request deletion of specific data types without deleting your entire account:</strong></p>
          <ul>
            <li><strong>Profile Information:</strong> Name, bio, phone number</li>
            <li><strong>Location Data:</strong> City, state, zip code, GPS coordinates</li>
            <li><strong>User Preferences:</strong> App preferences and settings</li>
            <li><strong>Profile Picture:</strong> Your profile picture image</li>
            <li><strong>Donation History:</strong> Your donation records</li>
            <li><strong>Transaction History:</strong> Your transaction records</li>
            <li><strong>User Activity:</strong> Referrals, credits, milestones, badges</li>
            <li><strong>All Personal Data:</strong> Delete all personal data while keeping your account</li>
          </ul>
          <p style="margin-top: 15px;"><strong>How to Request Partial Data Deletion:</strong></p>
          <ol style="margin-left: 20px; margin-top: 10px;">
            <li>Send an email to <a href="mailto:support@jointhriveinitiative.org">support@jointhriveinitiative.org</a></li>
            <li>Subject: "Partial Data Deletion Request"</li>
            <li>Include your email address and specify which data types you want deleted</li>
            <li>We'll process your request within 30 days</li>
          </ol>
          <p style="margin-top: 15px;"><strong>Or use the API:</strong> POST to <code>/api/data-deletion/request</code> with your email and data types</p>
        </div>
      </div>

      <div class="section">
        <h2>How to Request Full Account Deletion</h2>
        <div class="steps">
          <p><strong>Follow these steps to request deletion of your Thrive Initiative account and associated data:</strong></p>
          <ol>
            <li><strong>Open the Thrive Initiative app</strong> on your mobile device</li>
            <li><strong>Navigate to Settings</strong> (usually found in your profile or account menu)</li>
            <li><strong>Select "Delete Account"</strong> or "Account Settings"</li>
            <li><strong>Follow the in-app prompts</strong> to confirm your account deletion request</li>
            <li><strong>Enter your email address</strong> to verify your identity</li>
            <li><strong>Confirm the deletion</strong> - you will receive a confirmation email</li>
          </ol>
        </div>
        
        <div class="warning">
          <strong>⚠ Important:</strong>
          <p>Account deletion is permanent and cannot be undone. Once your account is deleted, you will lose access to all your data, donation history, redeemed discounts, and app features.</p>
        </div>
      </div>

      <div class="section">
        <h2>Alternative Method: Email Request</h2>
        <div class="contact-box">
          <h3>Contact Us Directly</h3>
          <p>If you cannot access the app, you can request account deletion by email:</p>
          <p><strong>Email:</strong> <a href="mailto:support@jointhriveinitiative.org">support@jointhriveinitiative.org</a></p>
          <p>Please include the following in your email:</p>
          <ul style="text-align: left; display: inline-block; margin-top: 10px;">
            <li>Your registered email address</li>
            <li>Subject line: "Account Deletion Request"</li>
            <li>Confirmation that you want to delete your account</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <h2>What Data Will Be Deleted</h2>
        <p>When you delete your account, the following data will be permanently removed from our systems:</p>
        
        <div class="data-list">
          <h3>✓ Permanently Deleted:</h3>
          <ul>
            <li><strong>Account Information:</strong> Email address, password, name, phone number, profile picture</li>
            <li><strong>Profile Data:</strong> Bio, preferences, location data (city, state, zip code, GPS coordinates)</li>
            <li><strong>Donation History:</strong> All donations, monthly donations, and one-time gifts</li>
            <li><strong>User Activity:</strong> Referrals, user credits, milestones, badges, points transactions</li>
            <li><strong>Transaction Records:</strong> All transaction history associated with your account</li>
            <li><strong>Stored Files:</strong> Profile pictures and any uploaded images</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <h2>What Data May Be Retained</h2>
        <p>For legal, accounting, and operational purposes, some data may be retained:</p>
        
        <div class="kept-list">
          <h3>Retained Data:</h3>
          <ul>
            <li><strong>Redemption Records:</strong> Discount redemption records may be kept for vendor accounting purposes, but your personal identifier (user_id) will be removed</li>
            <li><strong>Legal Records:</strong> Transaction records may be retained for up to 7 years as required by law for accounting and tax purposes</li>
            <li><strong>Aggregated Analytics:</strong> Anonymized, aggregated usage statistics that cannot be linked to your identity</li>
            <li><strong>Charity/Vendor Records:</strong> If you created any charities or vendors, the organization records will be preserved but your creator association will be removed</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <h2>Data Retention Period</h2>
        <div class="warning">
          <strong>Retention Timeline:</strong>
          <ul style="margin-left: 20px; margin-top: 10px;">
            <li><strong>Account Data:</strong> Deleted within 30 days of your deletion request</li>
            <li><strong>Legal Records:</strong> Transaction records may be retained for up to 7 years for legal and accounting compliance</li>
            <li><strong>Backup Systems:</strong> Data may exist in encrypted backups for up to 90 days, after which backups are purged</li>
          </ul>
        </div>
        <p>We will process your deletion request as quickly as possible. Most account data is removed within 30 days, though some records may be retained longer for legal compliance.</p>
      </div>

      <div class="section">
        <h2>After Account Deletion</h2>
        <p>Once your account is deleted:</p>
        <ul style="margin-left: 20px; margin-top: 10px;">
          <li>You will no longer be able to log in to the Thrive Initiative app</li>
          <li>All your personal data will be removed from active systems</li>
          <li>You will receive a confirmation email when deletion is complete</li>
          <li>You can create a new account at any time using the same or different email address</li>
        </ul>
      </div>

      <div class="section">
        <h2>Questions or Concerns?</h2>
        <div class="contact-box">
          <h3>We're Here to Help</h3>
          <p>If you have questions about account deletion or need assistance:</p>
          <p><strong>Email:</strong> <a href="mailto:support@jointhriveinitiative.org">support@jointhriveinitiative.org</a></p>
          <p><strong>Response Time:</strong> We aim to respond within 48 hours</p>
          <p style="margin-top: 15px;"><a href="https://jointhriveinitiative.org">Visit our website</a> for more information</p>
        </div>
      </div>
    </div>

    <div class="footer">
      <p><strong>Thrive Initiative</strong> by <a href="https://jointhriveinitiative.org">For Purpose Technologies</a></p>
      <p style="margin-top: 10px; font-size: 0.9em;">
        <a href="https://jointhriveinitiative.org/privacy-policy">Privacy Policy</a> | 
        <a href="https://jointhriveinitiative.org/terms-of-service">Terms of Service</a>
      </p>
      <p style="margin-top: 10px; font-size: 0.85em; color: #999;">
        Last Updated: ${new Date().toLocaleDateString("en-US", {year: "numeric", month: "long", day: "numeric"})}
      </p>
    </div>
  </div>
</body>
</html>`;

  // Create response with explicit Content-Type
  const response = new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...corsHeaders,
    },
  });

  // Ensure Content-Type is set (Supabase may override, so set it again)
  response.headers.set("Content-Type", "text/html; charset=utf-8");

  return response;
}

// Data deletion request handler (partial data deletion)
async function handleDataDeletionRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
): Promise<Response> {
  // GET /data-deletion/types - Get available data types
  if (method === "GET" && route === "/data-deletion/types") {
    return new Response(
      JSON.stringify({
        success: true,
        dataTypes: [
          {
            id: "profile",
            name: "Profile Information",
            description: "Name, bio, phone number, and other profile details",
            deletable: true,
          },
          {
            id: "location",
            name: "Location Data",
            description:
              "City, state, zip code, street address, and GPS coordinates",
            deletable: true,
          },
          {
            id: "preferences",
            name: "User Preferences",
            description: "App preferences and settings",
            deletable: true,
          },
          {
            id: "profile_picture",
            name: "Profile Picture",
            description: "Your profile picture image",
            deletable: true,
          },
          {
            id: "donation_history",
            name: "Donation History",
            description: "Records of all your donations",
            deletable: true,
            note: "May require manual processing",
          },
          {
            id: "transaction_history",
            name: "Transaction History",
            description: "Records of all transactions",
            deletable: true,
            note: "May be retained for legal compliance (up to 7 years)",
          },
          {
            id: "activity",
            name: "User Activity",
            description: "Referrals, credits, milestones, badges, and points",
            deletable: true,
            note: "May require manual processing",
          },
          {
            id: "all_personal_data",
            name: "All Personal Data",
            description:
              "Delete all personal data while keeping your account active",
            deletable: true,
          },
        ],
        fullAccountDeletion: {
          available: true,
          endpoint: "/api/auth/delete-user",
          infoPage: "/delete-account",
        },
      }),
      {
        status: 200,
        headers: {...corsHeaders, "Content-Type": "application/json"},
      },
    );
  }

  // POST /data-deletion/request - Request partial or full data deletion
  if (method === "POST" && route === "/data-deletion/request") {
    try {
      const body = await req.json();
      const {email, deletionType, dataTypes} = body;

      // Validate required fields
      if (!email) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Email address is required",
          }),
          {
            status: 400,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invalid email format",
          }),
          {
            status: 400,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // Validate deletionType
      const validDeletionTypes = ["partial", "full"];
      if (!deletionType || !validDeletionTypes.includes(deletionType)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'deletionType must be "partial" or "full"',
          }),
          {
            status: 400,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // For partial deletion, validate dataTypes
      if (deletionType === "partial") {
        if (!dataTypes || !Array.isArray(dataTypes) || dataTypes.length === 0) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "dataTypes array is required for partial deletion",
            }),
            {
              status: 400,
              headers: {...corsHeaders, "Content-Type": "application/json"},
            },
          );
        }

        const validDataTypes = [
          "profile",
          "location",
          "preferences",
          "donation_history",
          "transaction_history",
          "activity",
          "profile_picture",
          "all_personal_data",
        ];

        const invalidTypes = dataTypes.filter(
          (type: string) => !validDataTypes.includes(type),
        );
        if (invalidTypes.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              message: `Invalid data types: ${invalidTypes.join(", ")}`,
              validTypes: validDataTypes,
            }),
            {
              status: 400,
              headers: {...corsHeaders, "Content-Type": "application/json"},
            },
          );
        }
      }

      // Check if user exists
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("id, email, first_name, last_name, profile_picture_url")
        .eq("email", email)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "User not found with this email address",
          }),
          {
            status: 404,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // Full deletion - redirect to account deletion
      if (deletionType === "full") {
        return new Response(
          JSON.stringify({
            success: true,
            message:
              "For full account deletion, please use the account deletion process",
            redirectTo: "/delete-account",
            action:
              "Use the DELETE /api/auth/delete-user endpoint or visit /delete-account page",
          }),
          {
            status: 200,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // Process partial deletion
      const updates: any = {};
      const deletionLog: string[] = [];

      if (
        dataTypes.includes("profile") ||
        dataTypes.includes("all_personal_data")
      ) {
        updates.first_name = null;
        updates.last_name = null;
        updates.bio = null;
        updates.phone = null;
        deletionLog.push("Profile information");
      }

      if (
        dataTypes.includes("location") ||
        dataTypes.includes("all_personal_data")
      ) {
        updates.city = null;
        updates.state = null;
        updates.zip_code = null;
        updates.street_address = null;
        updates.latitude = null;
        updates.longitude = null;
        deletionLog.push("Location data");
      }

      if (
        dataTypes.includes("preferences") ||
        dataTypes.includes("all_personal_data")
      ) {
        updates.preferences = null;
        deletionLog.push("User preferences");
      }

      if (
        dataTypes.includes("profile_picture") ||
        dataTypes.includes("all_personal_data")
      ) {
        if (user.profile_picture_url) {
          try {
            const urlParts = user.profile_picture_url.split("/");
            const publicIndex = urlParts.indexOf("public");
            if (publicIndex !== -1 && publicIndex < urlParts.length - 1) {
              const filePath = urlParts
                .slice(publicIndex + 1)
                .join("/")
                .split("?")[0];
              const bucketName = "profile-pictures";

              const {error: storageError} = await supabase.storage
                .from(bucketName)
                .remove([filePath]);

              if (!storageError) {
                deletionLog.push("Profile picture");
              }
            }
          } catch (storageError) {
            console.error("Error deleting profile picture:", storageError);
          }
        }
        updates.profile_picture_url = null;
      }

      // Update user record
      if (Object.keys(updates).length > 0) {
        const {error: updateError} = await supabase
          .from("users")
          .update(updates)
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating user:", updateError);
          return new Response(
            JSON.stringify({
              success: false,
              message: "Failed to process data deletion request",
              error: updateError.message,
            }),
            {
              status: 500,
              headers: {...corsHeaders, "Content-Type": "application/json"},
            },
          );
        }
      }

      // Note: donation_history, transaction_history, and activity require manual processing
      const requiresManualProcessing: string[] = [];
      if (dataTypes.includes("donation_history")) {
        requiresManualProcessing.push(
          "Donation history (requires manual review)",
        );
      }
      if (dataTypes.includes("transaction_history")) {
        requiresManualProcessing.push(
          "Transaction history (may be retained for legal compliance)",
        );
      }
      if (dataTypes.includes("activity")) {
        requiresManualProcessing.push(
          "User activity (referrals, credits, milestones, badges)",
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Data deletion request processed successfully",
          deleted: deletionLog,
          requiresManualProcessing:
            requiresManualProcessing.length > 0
              ? requiresManualProcessing
              : undefined,
          note:
            requiresManualProcessing.length > 0
              ? "Some data types require manual review and will be processed within 30 days"
              : "All requested data has been deleted",
        }),
        {
          status: 200,
          headers: {...corsHeaders, "Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Data deletion request error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Internal server error",
          error: error.message,
        }),
        {
          status: 500,
          headers: {...corsHeaders, "Content-Type": "application/json"},
        },
      );
    }
  }

  // 404 for other data-deletion routes
  return new Response(
    JSON.stringify({error: "Data deletion route not found"}),
    {
      status: 404,
      headers: {...corsHeaders, "Content-Type": "application/json"},
    },
  );
}

// Auth handler
async function handleAuthRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  const jwtSecret = Deno.env.get("JWT_SECRET");
  if (!jwtSecret) {
    return new Response(JSON.stringify({error: "JWT_SECRET not configured"}), {
      headers: {"Content-Type": "application/json"},
      status: 500,
    });
  }

  // POST /auth/signup
  if (method === "POST" && route === "/auth/signup") {
    try {
      const body = await req.json();

      // Log entire request body for debugging
      console.log("📝 Signup request body:", JSON.stringify(body, null, 2));

      const {
        email,
        password,
        role,
        firstName, // User's first name
        lastName, // User's last name
        first_name, // Alternative field name
        last_name, // Alternative field name
        phone,
        profileImage,
        profileImageUrl,
        profile_picture_url,
        coworking,
        inviteType,
        invite_type,
        sponsorAmount,
        extraDonationAmount,
        totalMonthlyDonation,
        city,
        state,
        zipCode, // zip code for more accurate location
        zip_code, // alternative field name
        latitude, // GPS latitude
        longitude, // GPS longitude
        locationPermissionGranted, // location permission flag
        location_permission_granted, // alternative field name
        beneficiary, // charity_id or charity name
        charityId, // alternative field name
        donationAmount,
        monthlyDonation, // alternative field name
        referralToken, // referral token from referral link
        referrerId, // direct referrer ID (alternative to token)
        token: inviteToken, // invitation verification token (for invited donor completion)
      } = body;

      // Validate required fields
      if (!email || !password) {
        return new Response(
          JSON.stringify({message: "Email and password are required."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Validate email format (basic)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({message: "Invalid email format."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Validate password length
      if (password.length < 6) {
        return new Response(
          JSON.stringify({
            message: "Password must be at least 6 characters long.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Validate role
      const validRoles = ["donor", "charityAdmin", "vendorAdmin"];
      const userRole = role && validRoles.includes(role) ? role : "donor";

      // Check if user exists
      // If an invitation token is provided, look up by token first so we find the
      // exact invited donor row even when the same email exists on another account.
      let existing: any[] | null = null;
      let existingError: any = null;
      let foundByToken = false;

      if (inviteToken) {
        const tokenLookup = await supabase
          .from("users")
          .select(
            "id, email, account_status, is_verified, role, verification_token",
          )
          .eq("verification_token", inviteToken)
          .eq("role", "donor")
          .limit(1);
        existingError = tokenLookup.error;
        existing = tokenLookup.data;
        if (existing && existing.length > 0) {
          foundByToken = true;
        } else {
          // Token not found or already consumed — fall back to email lookup
          const emailLookup = await supabase
            .from("users")
            .select(
              "id, email, account_status, is_verified, role, verification_token",
            )
            .eq("email", email)
            .eq("role", "donor")
            .limit(1);
          existingError = emailLookup.error;
          existing = emailLookup.data;
        }
      } else {
        const emailLookup = await supabase
          .from("users")
          .select(
            "id, email, account_status, is_verified, role, verification_token",
          )
          .eq("email", email)
          .limit(1);
        existingError = emailLookup.error;
        existing = emailLookup.data;
      }

      // If there was an error (unexpected)
      if (existingError) {
        console.error("❌ Error checking existing user:", existingError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // If user exists, check if it's an invited donor completing signup
      if (existing && existing.length > 0) {
        const existingUser = existing[0];

        // Allow completion when:
        // - Found by invitation token (token is proof of invitation regardless of status), OR
        // - Found by email with an invitation-specific account_status
        const isInvitedDonor =
          foundByToken ||
          existingUser.account_status === "pending_verification" ||
          existingUser.account_status === "email_verified";

        if (isInvitedDonor) {
          // User is completing invitation signup - update password and activate account
          console.log("✅ Invited donor completing signup:", email);

          // Hash password
          let hashedPassword;
          try {
            hashedPassword = await bcryptHash(password);
          } catch (hashError) {
            console.error("❌ Password hashing error:", hashError);
            return new Response(
              JSON.stringify({
                message: "Server error. Please try again later.",
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 500,
              },
            );
          }

          // Build update data with optional fields
          const updateData: any = {
            password_hash: hashedPassword,
            account_status: "active",
            is_verified: true,
            verification_token: null,
            updated_at: new Date().toISOString(),
          };

          if (phone !== undefined) {
            updateData.phone = phone || null;
          }

          const profileUrl =
            profileImageUrl || profileImage || profile_picture_url;
          if (profileUrl !== undefined) {
            updateData.profile_picture_url = profileUrl || null;
          }

          if (coworking !== undefined) {
            updateData.coworking =
              coworking === true || coworking === "Yes" || coworking === "yes";
          }
          if (inviteType !== undefined && inviteType !== null) {
            updateData.invite_type = inviteType;
          }
          if (
            sponsorAmount !== undefined &&
            sponsorAmount !== null &&
            sponsorAmount !== ""
          ) {
            updateData.sponsor_amount = parseFloat(sponsorAmount);
          }
          if (
            extraDonationAmount !== undefined &&
            extraDonationAmount !== null &&
            extraDonationAmount !== ""
          ) {
            updateData.extra_donation_amount = parseFloat(extraDonationAmount);
          }
          if (
            totalMonthlyDonation !== undefined &&
            totalMonthlyDonation !== null &&
            totalMonthlyDonation !== ""
          ) {
            updateData.total_monthly_donation =
              parseFloat(totalMonthlyDonation);
          }

          // Add city, state, and zip code if provided
          if (city !== undefined && city !== null) {
            updateData.city = city;
          }
          if (state !== undefined && state !== null) {
            updateData.state = state;
          }
          const zip = zipCode || zip_code;
          if (zip !== undefined && zip !== null) {
            updateData.zip_code = zip;
          }

          // Add GPS coordinates if provided
          if (latitude !== undefined && latitude !== null) {
            updateData.latitude = parseFloat(latitude);
          }
          if (longitude !== undefined && longitude !== null) {
            updateData.longitude = parseFloat(longitude);
          }

          // Handle location permission
          const locationPermission =
            locationPermissionGranted || location_permission_granted;
          if (locationPermission !== undefined) {
            updateData.location_permission_granted =
              locationPermission === true;
            if (locationPermission === true) {
              updateData.location_updated_at = new Date().toISOString();
            }
          }

          // If location fields are provided but coordinates are missing, try to geocode
          if (
            (updateData.city || updateData.state) &&
            !updateData.latitude &&
            !updateData.longitude
          ) {
            const locationString = [
              updateData.city,
              updateData.state,
              updateData.zip_code,
            ]
              .filter(Boolean)
              .join(", ");
            if (locationString) {
              const geocodeResult = await geocodeAddress(locationString);
              if (geocodeResult.latitude && geocodeResult.longitude) {
                updateData.latitude = geocodeResult.latitude;
                updateData.longitude = geocodeResult.longitude;
                console.log(
                  `✅ Geocoded location "${locationString}" to (${geocodeResult.latitude}, ${geocodeResult.longitude})`,
                );
              }
            }
          }

          // Extract beneficiary and donation amount (for use in donation creation later)
          const beneficiaryId = beneficiary || charityId;
          const donationAmt = donationAmount || monthlyDonation;

          // Build preferences object for beneficiary and donation amount
          const preferences: any = {};
          if (beneficiaryId !== undefined && beneficiaryId !== null) {
            preferences.preferredCharity = beneficiaryId;
            preferences.beneficiary = beneficiaryId;
          }
          if (donationAmt !== undefined && donationAmt !== null) {
            preferences.monthlyDonation = parseFloat(donationAmt);
            preferences.donationAmount = parseFloat(donationAmt);
          }

          // Get existing preferences and merge
          if (Object.keys(preferences).length > 0) {
            try {
              const {data: existingUserData} = await supabase
                .from("users")
                .select("preferences")
                .eq("id", existingUser.id)
                .single();

              const existingPreferences = existingUserData?.preferences || {};
              updateData.preferences = {...existingPreferences, ...preferences};
            } catch (prefError) {
              // If we can't get existing preferences, just use new ones
              console.log(
                "⚠️ Could not fetch existing preferences, using new ones only",
              );
              updateData.preferences = preferences;
            }
          }

          // Update user with password and activate account
          const {data: updatedUser, error: updateError} = await supabase
            .from("users")
            .update(updateData)
            .eq("id", existingUser.id)
            .select(
              "id, email, role, is_verified, first_name, last_name, city, state, zip_code, preferences",
            )
            .single();

          if (updateError) {
            console.error("❌ Error updating invited user:", updateError);
            return new Response(
              JSON.stringify({
                message: "Server error. Please try again later.",
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 500,
              },
            );
          }

          // Generate JWT token
          if (!jwtSecret) {
            return new Response(
              JSON.stringify({
                message:
                  "Signup completed but JWT_SECRET not configured. Please contact support.",
                user: {
                  id: updatedUser.id,
                  email: updatedUser.email,
                  role: updatedUser.role,
                  isVerified: updatedUser.is_verified,
                },
                token: null,
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 201,
              },
            );
          }

          try {
            const secretKey = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(jwtSecret),
              {name: "HMAC", hash: "SHA-256"},
              false,
              ["sign", "verify"],
            );

            const authToken = await createJWT(
              {alg: "HS256", typ: "JWT"},
              {
                id: updatedUser.id,
                email: updatedUser.email,
                role: updatedUser.role,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
              },
              secretKey,
            );

            // Create donation record if charity_id and donation amount are provided
            let donationRecord = null;
            if (beneficiaryId && donationAmt) {
              try {
                const charityIdInt = parseInt(beneficiaryId);
                if (!isNaN(charityIdInt) && charityIdInt > 0) {
                  const {data: donation, error: donationError} = await supabase
                    .from("donations")
                    .insert([
                      {
                        donor_id: updatedUser.id,
                        charity_id: charityIdInt,
                        amount: parseFloat(donationAmt),
                        status: "pending",
                      },
                    ])
                    .select()
                    .single();

                  if (!donationError) {
                    donationRecord = donation;
                  }
                }
              } catch (donationErr) {
                // Don't fail the signup if donation creation fails
              }
            }

            return new Response(
              JSON.stringify({
                success: true,
                message: "Signup completed successfully!",
                user: {
                  id: updatedUser.id,
                  email: updatedUser.email,
                  role: updatedUser.role,
                  firstName: updatedUser.first_name,
                  lastName: updatedUser.last_name,
                  isVerified: updatedUser.is_verified,
                  city: updatedUser.city || null,
                  state: updatedUser.state || null,
                  zipCode: updatedUser.zip_code || null,
                  preferences: updatedUser.preferences || null,
                },
                token: authToken,
                donation: donationRecord
                  ? {
                      id: donationRecord.id,
                      charityId: donationRecord.charity_id,
                      amount: donationRecord.amount,
                      status: donationRecord.status,
                    }
                  : null,
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 200,
              },
            );
          } catch (tokenError) {
            console.error("❌ JWT token generation error:", tokenError);
            return new Response(
              JSON.stringify({
                message:
                  "Signup completed but token generation failed. Please login.",
                user: {
                  id: updatedUser.id,
                  email: updatedUser.email,
                  role: updatedUser.role,
                  isVerified: updatedUser.is_verified,
                },
                token: null,
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 201,
              },
            );
          }
        }

        // User exists but is not an invited donor - return error
        return new Response(
          JSON.stringify({message: "Email already in use."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 409,
          },
        );
      }

      // User doesn't exist - proceed with normal signup
      console.log("✅ Email is available - creating new user:", email);

      // Hash password
      console.log("🔐 Hashing password for:", email);
      let hashedPassword;
      try {
        hashedPassword = await bcryptHash(password);
        console.log("✅ Password hashed successfully");
      } catch (hashError) {
        console.error("❌ Password hashing error:", hashError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Generate verification token
      const tokenArray = new Uint8Array(20);
      crypto.getRandomValues(tokenArray);
      const token = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      // Build user data object with optional fields
      const userData: any = {
        email,
        password_hash: hashedPassword,
        verification_token: token,
        is_verified: false,
        role: userRole,
        account_status: "active",
      };

      // Add first name and last name if provided (with capitalization)
      const signupFirstName = firstName || first_name;
      const signupLastName = lastName || last_name;
      if (
        signupFirstName !== undefined &&
        signupFirstName !== null &&
        signupFirstName !== ""
      ) {
        userData.first_name = capitalizeName(signupFirstName);
        console.log(
          "✅ Saving first name:",
          userData.first_name,
          "from:",
          signupFirstName,
        );
      }
      if (
        signupLastName !== undefined &&
        signupLastName !== null &&
        signupLastName !== ""
      ) {
        userData.last_name = capitalizeName(signupLastName);
        console.log(
          "✅ Saving last name:",
          userData.last_name,
          "from:",
          signupLastName,
        );
      }

      // Log if no name provided
      if (!signupFirstName && !signupLastName) {
        console.warn("⚠️ No name provided in signup request:", {
          firstName,
          first_name,
          lastName,
          last_name,
        });
      }

      // Add city, state, and zip code if provided
      if (city !== undefined && city !== null) {
        userData.city = city;
      }
      if (state !== undefined && state !== null) {
        userData.state = state;
      }
      const zip = zipCode || zip_code;
      if (zip !== undefined && zip !== null) {
        userData.zip_code = zip;
      }

      // Build preferences object for beneficiary and donation amount
      // IMPORTANT: Only save beneficiary if explicitly provided (no auto-selection)
      const preferences: any = {};
      const beneficiaryId = beneficiary || charityId;
      // Only save if beneficiary is explicitly provided (not null, not undefined, not empty string)
      if (
        beneficiaryId !== undefined &&
        beneficiaryId !== null &&
        beneficiaryId !== ""
      ) {
        preferences.preferredCharity = beneficiaryId;
        preferences.beneficiary = beneficiaryId;
        console.log("✅ Saving beneficiary preference:", beneficiaryId);
      } else {
        console.log(
          "ℹ️ No beneficiary provided in signup - not setting default",
        );
      }
      const donationAmt = donationAmount || monthlyDonation;
      if (donationAmt !== undefined && donationAmt !== null) {
        preferences.monthlyDonation = parseFloat(donationAmt);
        preferences.donationAmount = parseFloat(donationAmt);
      }

      // Add preferences if we have any
      if (Object.keys(preferences).length > 0) {
        userData.preferences = preferences;
      }

      // Coworking / account type (Stripe business rules: standard vs coworking)
      const isCoworkingSignup =
        coworking === true || coworking === "Yes" || coworking === "yes";
      if (coworking !== undefined && coworking !== null) {
        userData.coworking = isCoworkingSignup;
      }
      const inviteTypeResolved =
        inviteType || invite_type ||
        (coworking !== undefined && coworking !== null
          ? (isCoworkingSignup ? "coworking" : "standard")
          : undefined);
      if (
        inviteTypeResolved !== undefined &&
        inviteTypeResolved !== null &&
        inviteTypeResolved !== ""
      ) {
        userData.invite_type = inviteTypeResolved;
      }

      // Insert new user
      console.log("👤 Creating user:", email);
      const locationStr = city
        ? `${city}, ${state || ""}${zip ? ` ${zip}` : ""}`
        : "Not provided";
      console.log("📍 Location:", locationStr);
      console.log("💝 Beneficiary:", beneficiaryId || "Not provided");
      console.log("💰 Donation amount:", donationAmt || "Not provided");

      const {data: newUser, error: insertError} = await supabase
        .from("users")
        .insert([userData])
        .select(
          "id, email, role, is_verified, first_name, last_name, city, state, zip_code, preferences",
        )
        .single();

      if (insertError) {
        console.error("❌ Error creating user:", insertError);
        console.error(
          "❌ Error details:",
          JSON.stringify(insertError, null, 2),
        );

        // Handle specific database errors
        if (insertError.code === "23505") {
          // PostgreSQL unique violation
          return new Response(
            JSON.stringify({message: "Email already in use."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 409,
            },
          );
        }

        return new Response(
          JSON.stringify({
            message: "Server error. Please try again later.",
            // Include error details in development
            ...(Deno.env.get("ENVIRONMENT") === "development"
              ? {error: insertError.message}
              : {}),
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Generate JWT token for immediate authentication
      console.log("🎫 Generating JWT token for:", email);
      console.log("🔑 JWT_SECRET available:", !!jwtSecret);
      console.log("🔑 JWT_SECRET length:", jwtSecret ? jwtSecret.length : 0);
      console.log(
        "🔑 JWT_SECRET first 10 chars:",
        jwtSecret ? jwtSecret.substring(0, 10) : "N/A",
      );
      let authToken: string | null = null;

      if (!jwtSecret) {
        console.error("❌ JWT_SECRET not available for token generation");
        console.error(
          "❌ Please set JWT_SECRET in Supabase Edge Function secrets",
        );
        return new Response(
          JSON.stringify({
            message:
              "Signup successful! Please check your email to verify your account. (JWT_SECRET not configured - token not generated)",
            user: {
              id: newUser.id,
              email: newUser.email,
              role: newUser.role,
              isVerified: newUser.is_verified,
            },
            token: null,
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 201,
          },
        );
      }

      try {
        console.log("✅ JWT_SECRET is available, creating token...");
        console.log(
          "📝 Payload:",
          JSON.stringify({
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          }),
        );

        // Convert secret string to CryptoKey for djwt v2.9
        // djwt v2.9 requires the secret to be a CryptoKey for HS256
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );

        authToken = await createJWT(
          {alg: "HS256", typ: "JWT"},
          {
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
          },
          secretKey,
        );

        console.log("✅ JWT token generated successfully");
        console.log("✅ Token length:", authToken ? authToken.length : 0);
        console.log(
          "✅ Token first 50 chars:",
          authToken ? authToken.substring(0, 50) : "N/A",
        );
      } catch (tokenError: any) {
        console.error("❌ JWT token generation error:", tokenError);
        console.error("❌ Token error name:", tokenError?.name || "Unknown");
        console.error(
          "❌ Token error message:",
          tokenError?.message || "Unknown error",
        );
        console.error(
          "❌ Token error stack:",
          tokenError?.stack || "No stack trace",
        );
        console.error(
          "❌ Token error details:",
          JSON.stringify(tokenError, Object.getOwnPropertyNames(tokenError)),
        );
        // Continue without token - user can still login later
        authToken = null;
      }

      // Handle Stripe integration for recurring donations (if beneficiary and donation amount provided)
      // Note: beneficiaryId and donationAmt are already declared above in the preferences section
      let stripeSubscriptionInfo: any = null;
      let donationRecord: any = null;

      if (beneficiaryId && donationAmt && parseFloat(donationAmt) > 0) {
        try {
          console.log("💳 Setting up Stripe subscription for donation:", {
            beneficiaryId,
            amount: donationAmt,
          });

          // Create or get Stripe customer
          const stripeCustomer = await createOrGetStripeCustomer(
            email,
            newUser.id,
          );
          console.log(
            "✅ Stripe customer created/retrieved:",
            stripeCustomer.id,
          );

          // Create subscription setup (incomplete, requires payment method)
          const subscription = await createStripeSubscriptionSetup(
            stripeCustomer.id,
            parseFloat(donationAmt),
            "usd",
            {
              user_id: newUser.id.toString(),
              charity_id: beneficiaryId.toString(),
              source: "signup",
            },
          );
          console.log(
            "✅ Stripe subscription created:",
            subscription.subscriptionId,
          );

          stripeSubscriptionInfo = {
            subscriptionId: subscription.subscriptionId,
            clientSecret: subscription.clientSecret,
            status: subscription.status,
            requiresPaymentMethod: subscription.status === "incomplete",
          };

          // Create donation record with pending status
          // Try beneficiaries table first, fallback to charities
          const beneficiaryTable = "beneficiaries"; // Will try this first
          let charityExists = false;

          // Check if beneficiaries table exists, otherwise use charities
          const {data: beneficiaryCheck} = await supabase
            .from("beneficiaries")
            .select("id")
            .eq("id", beneficiaryId)
            .single()
            .catch(() => ({data: null}));

          if (!beneficiaryCheck) {
            // Try charities table
            const {data: charityCheck} = await supabase
              .from("charities")
              .select("id")
              .eq("id", beneficiaryId)
              .single();

            if (charityCheck) {
              charityExists = true;
            }
          } else {
            charityExists = true;
          }

          if (charityExists) {
            const {data: newDonation, error: donationError} = await supabase
              .from("donations")
              .insert([
                {
                  donor_id: newUser.id,
                  charity_id: beneficiaryId,
                  amount: parseFloat(donationAmt),
                  stripe_subscription_id: subscription.subscriptionId,
                  status: "pending",
                },
              ])
              .select()
              .single();

            if (donationError) {
              console.error(
                "❌ Error creating donation record:",
                donationError,
              );
              // Don't fail signup if donation record creation fails
            } else {
              donationRecord = newDonation;
              console.log("✅ Donation record created:", newDonation.id);
            }
          } else {
            console.warn(
              "⚠️ Beneficiary/charity not found, skipping donation record creation",
            );
          }
        } catch (stripeError: any) {
          console.error(
            "❌ Stripe integration error during signup:",
            stripeError,
          );
          console.error("❌ Error details:", stripeError.message);
          // Don't fail signup if Stripe setup fails - user can set up payment later
          // Just log the error and continue
        }
      }

      // Handle referral tracking (if referral token or referrer ID provided)
      let foundReferrerId: number | null = null;
      if (referralToken) {
        foundReferrerId = await getReferrerFromToken(supabase, referralToken);
        if (foundReferrerId) {
          console.log("🔗 Referral found:", {
            referralToken,
            referrerId: foundReferrerId,
          });
          // Create referral record
          await createReferralRecord(
            supabase,
            foundReferrerId,
            newUser.id,
            referralToken,
          );
          // Update user's referrer_id for quick lookup
          await supabase
            .from("users")
            .update({referrer_id: foundReferrerId})
            .eq("id", newUser.id);
        } else {
          console.log("⚠️ Referral token not found:", referralToken);
        }
      } else if (referrerId) {
        // Direct referrer ID provided
        console.log("🔗 Direct referrer ID provided:", referrerId);
        await createReferralRecord(supabase, referrerId, newUser.id);
        // Update user's referrer_id for quick lookup
        await supabase
          .from("users")
          .update({referrer_id: referrerId})
          .eq("id", newUser.id);
      }

      // Send verification email
      console.log("📧 Sending verification email to:", email);

      // Build user's name for email greeting
      // Priority: 1) Request body (what user just entered), 2) Database (newUser), 3) Email prefix
      // Apply proper capitalization using capitalizeName function

      // Log raw values first
      console.log("📧 Name extraction - Raw values:", {
        firstName_from_body: firstName,
        first_name_from_body: first_name,
        lastName_from_body: lastName,
        last_name_from_body: last_name,
        newUser_first_name: newUser.first_name,
        newUser_last_name: newUser.last_name,
        email: email,
      });

      const emailFirstName = capitalizeName(
        firstName || first_name || newUser.first_name,
      );
      const emailLastName = capitalizeName(
        lastName || last_name || newUser.last_name,
      );
      let userName: string;
      if (emailFirstName && emailLastName) {
        userName = `${emailFirstName} ${emailLastName}`;
      } else if (emailFirstName) {
        userName = emailFirstName;
      } else if (emailLastName) {
        userName = emailLastName;
      } else {
        // Fallback to email prefix if no name provided (capitalize it)
        userName = capitalizeName(email.split("@")[0]) || email.split("@")[0];
        console.warn("⚠️ No name found, using email prefix:", userName);
      }

      // Log final result
      console.log("📧 Final email name:", {
        emailFirstName,
        emailLastName,
        finalUserName: userName,
      });

      // NOTE: Verification email is NOT sent here.
      // The frontend will send it after the user completes their profile (first/last name),
      // so the greeting reads "Welcome, Stephanie!" instead of the email prefix.
      // The token is stored in the DB and the frontend calls /auth/resend-verification
      // (which fetches the saved name) after profile setup is complete.

      console.log("✅ User created successfully:", email);
      console.log("📧 Verification email will be sent after profile setup");
      if (stripeSubscriptionInfo) {
        console.log(
          "💳 Stripe subscription setup complete:",
          stripeSubscriptionInfo.subscriptionId,
        );
      }

      return new Response(
        JSON.stringify({
          message:
            "Signup successful! Please check your email to verify your account.",
          user: {
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            isVerified: newUser.is_verified,
            city: newUser.city || null,
            state: newUser.state || null,
            zipCode: newUser.zip_code || null,
            preferences: newUser.preferences || null,
          },
          token: authToken || null, // Include JWT token for immediate authentication
          donation: donationRecord
            ? {
                id: donationRecord.id,
                charityId: donationRecord.charity_id,
                amount: donationRecord.amount,
                status: donationRecord.status,
              }
            : null,
          stripe: stripeSubscriptionInfo
            ? {
                subscriptionId: stripeSubscriptionInfo.subscriptionId,
                clientSecret: stripeSubscriptionInfo.clientSecret,
                status: stripeSubscriptionInfo.status,
                requiresPaymentMethod:
                  stripeSubscriptionInfo.requiresPaymentMethod,
              }
            : null,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("❌ Signup Error:", error);
      console.error("❌ Error stack:", error.stack || error.toString());
      return new Response(
        JSON.stringify({
          message: "Server error. Please try again later.",
          // Include error details in development
          ...(Deno.env.get("ENVIRONMENT") === "development"
            ? {
                error: error.message,
                stack: error.stack,
              }
            : {}),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/login
  if (method === "POST" && route === "/auth/login") {
    try {
      const body = await req.json();
      const {email, password} = body;

      // Get user by email
      const {data: users, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .limit(1);

      // If error querying users table
      if (userError) {
        return new Response(
          JSON.stringify({message: "Login failed. Please try again."}),
          {headers: {"Content-Type": "application/json"}, status: 500},
        );
      }

      // Email not found — distinct 404 so the client can prompt signup
      if (!users || users.length === 0) {
        return new Response(
          JSON.stringify({
            code: "USER_NOT_FOUND",
            message: "No account found for this email. Please sign up.",
          }),
          {headers: {"Content-Type": "application/json"}, status: 404},
        );
      }

      const user = users[0];

      // Check if account is active
      if (user.account_status !== "active") {
        return new Response(
          JSON.stringify({
            message: "Account is suspended. Please contact support.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 403,
          },
        );
      }

      // Verify password
      let isPasswordValid = false;
      try {
        console.log("🔐 Verifying password for:", email);
        isPasswordValid = await bcryptCompare(password, user.password_hash);
        console.log("✅ Password verification result:", isPasswordValid);
      } catch (compareError) {
        console.error("❌ Password comparison error:", compareError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      if (!isPasswordValid) {
        return new Response(
          JSON.stringify({message: "Invalid email or password."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // Generate JWT token
      // Convert secret string to CryptoKey for djwt v2.9
      const secretKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(jwtSecret),
        {name: "HMAC", hash: "SHA-256"},
        false,
        ["sign", "verify"],
      );
      const token = await createJWT(
        {alg: "HS256", typ: "JWT"},
        {
          id: user.id,
          email: user.email,
          role: user.role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        },
        secretKey,
      );

      // Update last login
      await supabase
        .from("users")
        .update({updated_at: new Date().toISOString()})
        .eq("id", user.id);

      // Check if user has completed onboarding.
      // Consider onboarding complete if user has either:
      // 1) a selected beneficiary in preferences, OR
      // 2) recurring donation setup/billing metadata.
      const hasBeneficiaryPreference = Boolean(
        user.preferences?.preferredCharity || user.preferences?.beneficiary,
      );
      const hasRecurringSetup =
        Number(user.total_monthly_donation || 0) > 0 ||
        Number(user.sponsor_amount || 0) > 0 ||
        user.external_billed === true;
      const needsOnboarding = !(hasBeneficiaryPreference || hasRecurringSetup);

      // Detailed logging for debugging
      console.log(
        "═══════════════════════════════════════════════════════════",
      );
      console.log("📋 [EMAIL-LOGIN] Final decision data:");
      console.log(
        "═══════════════════════════════════════════════════════════",
      );
      console.log("🆔 [EMAIL-LOGIN] User ID:", user.id);
      console.log("📧 [EMAIL-LOGIN] Email:", user.email);
      console.log("👤 [EMAIL-LOGIN] First Name:", user.first_name);
      console.log("👤 [EMAIL-LOGIN] Last Name:", user.last_name);
      console.log(
        "📋 [EMAIL-LOGIN] user.preferences:",
        JSON.stringify(user.preferences),
      );
      console.log(
        "📋 [EMAIL-LOGIN] preferredCharity:",
        user.preferences?.preferredCharity,
      );
      console.log(
        "📋 [EMAIL-LOGIN] beneficiary:",
        user.preferences?.beneficiary,
      );
      console.log(
        "💳 [EMAIL-LOGIN] total_monthly_donation:",
        user.total_monthly_donation,
      );
      console.log("💳 [EMAIL-LOGIN] sponsor_amount:", user.sponsor_amount);
      console.log("💳 [EMAIL-LOGIN] external_billed:", user.external_billed);
      console.log("📋 [EMAIL-LOGIN] needsOnboarding:", needsOnboarding);
      console.log("✅ [EMAIL-LOGIN] isVerified:", user.is_verified);
      console.log(
        "═══════════════════════════════════════════════════════════",
      );

      // Return user data (excluding sensitive fields)
      const userData = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        isVerified: user.is_verified,
        needsOnboarding: needsOnboarding,
      };

      return new Response(
        JSON.stringify({
          token,
          user: userData,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Login Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /auth/verify - Verify email token and redirect to mobile app
  if (method === "GET" && route === "/auth/verify") {
    try {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      const wantsJson =
        url.searchParams.get("format") === "json" ||
        (req.headers.get("accept")?.includes("application/json") ?? false);
      const email = url.searchParams.get("email");

      if (!token || !email) {
        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Verification Failed</h1>
    <p>Missing verification token or email.</p>
  </div>
</body>
</html>`,
          {
            status: 400,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              ...corsHeaders,
            },
          },
        );
      }

      // Verify user with token
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("verification_token", token)
        .single();

      if (userError || !user) {
        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Verification Failed</h1>
    <p>Invalid or expired verification token.</p>
  </div>
</body>
</html>`,
          {
            status: 400,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              ...corsHeaders,
            },
          },
        );
      }

      // Update user as verified
      const {error: updateError} = await supabase
        .from("users")
        .update({
          is_verified: true,
          email_verified_at: new Date().toISOString(),
          verification_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("❌ Error verifying user:", {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
        });
        // Continue anyway - token is valid
      }

      // Use universal link (HTTPS) instead of custom scheme for better compatibility
      // Universal links work in all browsers and can open the app if configured
      const appBaseUrl =
        Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";
      const universalLink = `${appBaseUrl}/verify-success?token=${token}&email=${encodeURIComponent(email)}&verified=true`;

      // Also provide custom scheme as fallback
      const appDeepLinkScheme =
        Deno.env.get("APP_DEEP_LINK_SCHEME") || "thriveapp";
      const appDeepLink = `${appDeepLinkScheme}://verify?token=${token}&email=${encodeURIComponent(email)}&verified=true`;

      // Return HTML page that redirects to mobile app
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verified - Opening App</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
    .check { font-size: 48px; margin-bottom: 20px; color: #4a6b7a; }
    .link {
      display: inline-block;
      margin: 10px;
      padding: 12px 24px;
      background: #324E58;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .link:hover { background: #4a6b7a; }
    .link.secondary {
      background: #6c757d;
    }
    .link.secondary:hover {
      background: #5a6268;
    }
    .button-group {
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">✅</div>
    <h1>Email Verified!</h1>
    <p>Your email has been verified successfully.</p>
    <p style="font-size: 14px; color: #666; margin-top: 20px;">
      Opening the Thrive app...
    </p>
    <div class="button-group">
      <a href="${universalLink}" class="link" id="appLink">Open in Thrive App</a>
      <a href="${appDeepLink}" class="link" id="deepLink" style="display: none;">Try Alternative Link</a>
      <button onclick="window.close()" class="link secondary" id="skipLink" style="border: none; font-size: inherit; font-family: inherit; width: 100%;">Close & Return to App</button>
      <p style="font-size: 12px; color: #999; margin-top: 10px;">
        Your email is verified! You can close this page and return to the Thrive app.
      </p>
    </div>
  </div>
  <script>
    // Try universal link first (works better with universal links configured)
    setTimeout(function() {
      window.location.href = "${universalLink}";
    }, 500);
    
    // Fallback: try custom scheme after 1 second
    setTimeout(function() {
      const deepLink = document.getElementById('deepLink');
      if (deepLink) {
        deepLink.style.display = 'block';
        window.location.href = "${appDeepLink}";
      }
    }, 1500);
    
    // Update message after 2 seconds if app hasn't opened
    setTimeout(function() {
      const message = document.querySelector('p:last-of-type');
      if (message) {
        message.innerHTML = 'If the app didn\'t open automatically, tap "Close & Return to App" above.';
        message.style.color = '#324E58';
        message.style.fontWeight = '600';
      }
    }, 2000);
  </script>
</body>
</html>`,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          },
        },
      );
    } catch (error) {
      console.error("❌ Verify Error:", error);
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Verification Error</h1>
    <p>An error occurred during verification. Please try again later.</p>
  </div>
</body>
</html>`,
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
          },
        },
      );
    }
  }

  // POST /auth/verify
  if (method === "POST" && route === "/auth/verify") {
    try {
      const body = await req.json();
      const {token, email} = body;

      // Verify user with token
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("verification_token", token)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({message: "Invalid verification token."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Update user as verified
      const {error: updateError} = await supabase
        .from("users")
        .update({
          is_verified: true,
          email_verified_at: new Date().toISOString(),
          verification_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("❌ Error verifying user:", {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
          userId: user.id,
        });
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({message: "Email verified successfully!"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Verify Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /auth/verify-email - Verify email token from invitation link
  if (method === "GET" && route === "/auth/verify-email") {
    try {
      const url = new URL(req.url);
      let token = url.searchParams.get("token");
      const wantsJson =
        url.searchParams.get("format") === "json" ||
        (req.headers.get("accept")?.includes("application/json") ?? false) ||
        true; // Mobile app always wants JSON from this endpoint

      if (!token) {
        console.error("❌ No token provided in verify-email request");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Verification token is required",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Decode token in case it's URL encoded
      token = decodeURIComponent(token);
      console.log(
        "🔍 Verifying token (first 10 chars):",
        token.substring(0, 10) + "...",
      );

      // Verify token exists and is valid
      // First, check if token exists at all (without role filter for better debugging)
      const {data: tokenCheck, error: tokenCheckError} = await supabase
        .from("users")
        .select("id, email, role, verification_token")
        .eq("verification_token", token)
        .limit(1);

      if (tokenCheckError) {
        console.error("❌ Error checking token:", tokenCheckError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Database error checking token",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      if (!tokenCheck || tokenCheck.length === 0) {
        console.error("❌ Token not found in database:", token);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid or expired verification token",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Check if user has correct role
      const tokenUser = tokenCheck[0];
      if (tokenUser.role !== "donor") {
        console.error("❌ Token found but user role is not donor:", {
          userId: tokenUser.id,
          email: tokenUser.email,
          role: tokenUser.role,
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid user role for this verification link",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Now get full user data
      // Try with all columns first, fallback to basic columns if coworking columns don't exist
      let user: any = null;
      let userError: any = null;

      // First attempt: try with all columns including coworking fields
      const fullUserResult = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, phone, role, verification_token, account_status, is_verified, coworking, invite_type, sponsor_amount, sponsor_source, external_billed, extra_donation_amount, total_monthly_donation",
        )
        .eq("verification_token", token)
        .eq("role", "donor")
        .single();

      if (fullUserResult.error) {
        // If error is about missing columns, retry with basic columns only
        if (
          fullUserResult.error.message?.includes("does not exist") ||
          fullUserResult.error.message?.includes("column")
        ) {
          console.warn("⚠️ Coworking columns not found, using basic columns");
          const basicUserResult = await supabase
            .from("users")
            .select(
              "id, email, first_name, last_name, role, verification_token, account_status, is_verified",
            )
            .eq("verification_token", token)
            .eq("role", "donor")
            .single();

          if (basicUserResult.error) {
            userError = basicUserResult.error;
          } else {
            user = basicUserResult.data;
          }
        } else {
          userError = fullUserResult.error;
        }
      } else {
        user = fullUserResult.data;
      }

      if (userError || !user) {
        console.error("❌ Error fetching full user data:", {
          error: userError,
          tokenUserId: tokenUser.id,
          tokenUserEmail: tokenUser.email,
          errorMessage: userError?.message,
          errorCode: userError?.code,
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: "Error fetching user data",
            details: userError?.message || "Unknown error",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Check if token is expired (if verification_token_expires column exists)
      // Note: verification_token_expires column may not exist in your schema
      // You can add token expiration logic later if needed

      // Mark email as verified (if not already verified)
      if (!user.is_verified) {
        const {error: updateError} = await supabase
          .from("users")
          .update({
            is_verified: true,
            email_verified_at: new Date().toISOString(),
            account_status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (updateError) {
          console.error("❌ Error updating verification status:", {
            message: updateError.message,
            code: updateError.code,
            details: updateError.details,
            hint: updateError.hint,
          });
          // Continue anyway - token is valid, user can complete signup
        }
      }

      // Format user data
      const fullName =
        `${user.first_name || ""} ${user.last_name || ""}`.trim();
      const userData = {
        id: user.id,
        email: user.email,
        name: fullName || user.email.split("@")[0],
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        phone: user.phone || null,
        role: user.role,
        isVerified: true,
        status: user.account_status,
        // Handle coworking fields - may not exist if migration hasn't been run
        coworking:
          user.coworking === true || user.invite_type === "coworking" || false,
        inviteType: user.invite_type || null,
        sponsorAmount: user.sponsor_amount || 0,
        sponsorSource: user.sponsor_source || null,
        externalBilled: user.external_billed === true || false,
        extraDonationAmount: user.extra_donation_amount || 0,
        totalMonthlyDonation: user.total_monthly_donation || 0,
      };

      if (wantsJson) {
        return new Response(JSON.stringify({success: true, user: userData}), {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        });
      }

      // Return HTML page (same as /auth/verify) for better user experience
      const appBaseUrl =
        Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";
      const universalLink = `${appBaseUrl}/verify-success?token=${token}&verified=true`;
      const appDeepLinkScheme =
        Deno.env.get("APP_DEEP_LINK_SCHEME") || "thriveapp";
      const appDeepLink = `${appDeepLinkScheme}://verify?token=${token}&verified=true`;

      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verified - Opening App</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
    .check { font-size: 48px; margin-bottom: 20px; color: #4a6b7a; }
    .link {
      display: inline-block;
      margin: 10px;
      padding: 12px 24px;
      background: #324E58;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      box-sizing: border-box;
    }
    .link:hover { background: #4a6b7a; }
    .link.secondary {
      background: #6c757d;
    }
    .link.secondary:hover {
      background: #5a6268;
    }
    .button-group {
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    button.link {
      border: none;
      font-size: inherit;
      font-family: inherit;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">✅</div>
    <h1>Email Verified!</h1>
    <p>Your email has been verified successfully.</p>
    <p style="font-size: 14px; color: #666; margin-top: 20px;">
      Opening the Thrive app...
    </p>
    <div class="button-group">
      <a href="${universalLink}" class="link" id="appLink">Open in Thrive App</a>
      <a href="${appDeepLink}" class="link" id="deepLink" style="display: none;">Try Alternative Link</a>
      <button onclick="window.close()" class="link secondary" id="skipLink">Close & Return to App</button>
      <p style="font-size: 12px; color: #999; margin-top: 10px;">
        Your email is verified! You can close this page and return to the Thrive app.
      </p>
    </div>
  </div>
  <script>
    // Try universal link first
    setTimeout(function() {
      window.location.href = "${universalLink}";
    }, 500);
    
    // Fallback: try custom scheme after 1 second
    setTimeout(function() {
      const deepLink = document.getElementById('deepLink');
      if (deepLink) {
        deepLink.style.display = 'block';
        window.location.href = "${appDeepLink}";
      }
    }, 1500);
    
    // Update message after 2 seconds
    setTimeout(function() {
      const message = document.querySelector('p:last-of-type');
      if (message) {
        message.innerHTML = 'If the app didn\'t open automatically, tap "Close & Return to App" above.';
        message.style.color = '#324E58';
        message.style.fontWeight = '600';
      }
    }, 2000);
  </script>
</body>
</html>`,
        {
          headers: {"Content-Type": "text/html; charset=utf-8", ...corsHeaders},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Verify Email Error:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Server error. Please try again later.",
          details: error?.message || String(error),
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/forgot-password
  if (method === "POST" && route === "/auth/forgot-password") {
    try {
      const body = await req.json();
      const {email} = body;

      // Get user by email
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

      // Don't reveal if user exists or not (security best practice)
      if (!userError && user) {
        // Generate reset token
        const tokenArray = new Uint8Array(32);
        crypto.getRandomValues(tokenArray);
        const resetToken = Array.from(tokenArray, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        const resetTokenExpiry = new Date();
        resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // 1 hour expiry

        // Update user with reset token
        await supabase
          .from("users")
          .update({
            password_reset_token: resetToken,
            password_reset_expires: resetTokenExpiry.toISOString(),
          })
          .eq("id", user.id);

        // Send reset email using configured email service
        const recipientName =
          `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
          user.email.split("@")[0];
        sendPasswordResetEmail({
          to: email,
          name: recipientName,
          resetToken,
        }).catch((emailError) => {
          console.error("❌ Error sending password reset email:", emailError);
        });
      }

      // Always return success (don't reveal if user exists)
      return new Response(
        JSON.stringify({
          message: "If an account exists, a password reset link has been sent.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Forgot Password Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/reset-password
  if (method === "POST" && route === "/auth/reset-password") {
    try {
      const body = await req.json();
      const {token, email, newPassword} = body;

      // Get user by email and token
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("password_reset_token", token)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({message: "Invalid or expired reset token."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Check if token is expired
      if (
        user.password_reset_expires &&
        new Date(user.password_reset_expires) < new Date()
      ) {
        return new Response(
          JSON.stringify({message: "Reset token has expired."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Hash new password
      const hashedPassword = await bcryptHash(newPassword);

      // Update password and clear reset token
      const {error: updateError} = await supabase
        .from("users")
        .update({
          password_hash: hashedPassword,
          password_reset_token: null,
          password_reset_expires: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("❌ Error resetting password:", updateError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({message: "Password reset successfully!"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Reset Password Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/resend-verification
  if (method === "POST" && route === "/auth/resend-verification") {
    try {
      const body = await req.json();
      const {email, firstName: bodyFirstName} = body;

      // Validate email
      if (!email) {
        return new Response(JSON.stringify({message: "Email is required."}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({message: "Invalid email format."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      console.log("📧 Resending verification email for:", email);

      // Check if user exists (include name fields for email)
      const {data: users, error: userError} = await supabase
        .from("users")
        .select(
          "id, email, is_verified, verification_token, first_name, last_name",
        )
        .eq("email", email)
        .limit(1);

      // Security: Don't reveal if user exists
      // Always return success message regardless of whether user exists
      if (userError || !users || users.length === 0) {
        console.log(
          "⚠️ User not found (or error) - returning generic success for security",
        );
        return new Response(
          JSON.stringify({
            message:
              "If an account exists with this email, a verification link has been sent.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      }

      const user = users[0];

      // Check if already verified
      if (user.is_verified) {
        return new Response(
          JSON.stringify({message: "This email is already verified."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Generate new verification token
      console.log("🔐 Generating new verification token");
      const tokenArray = new Uint8Array(20);
      crypto.getRandomValues(tokenArray);
      const verificationToken = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      // Update user with new verification token
      const {error: tokenError} = await supabase
        .from("users")
        .update({
          verification_token: verificationToken,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (tokenError) {
        console.error("❌ Error saving verification token:", tokenError);
        return new Response(
          JSON.stringify({
            message:
              "Failed to generate verification token. Please try again later.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log("✅ Verification token updated for user:", email);

      // Build user's name for email greeting.
      // Priority: 1) firstName passed directly in request body (most reliable during signup,
      // before the profile save roundtrip completes), 2) DB fields, 3) email prefix fallback.
      let userName: string;
      if (bodyFirstName && bodyFirstName.trim()) {
        userName = capitalizeName(bodyFirstName.trim()) || bodyFirstName.trim();
      } else {
        const firstName = capitalizeName(user.first_name);
        const lastName = capitalizeName(user.last_name);
        if (firstName && lastName) {
          userName = `${firstName} ${lastName}`;
        } else if (firstName) {
          userName = firstName;
        } else if (lastName) {
          userName = lastName;
        } else {
          // Fallback to email prefix if no name anywhere
          userName = capitalizeName(email.split("@")[0]) || email.split("@")[0];
        }
      }

      // Send verification email (async - don't wait for it)
      // sendInvitationEmail uses APP_BASE_URL env var (defaults to https://thrive-web-jet.vercel.app)
      sendInvitationEmail({
        to: email,
        name: userName,
        verificationToken: verificationToken,
        donorId: user.id,
      }).catch((emailError) => {
        console.error("❌ Error sending verification email:", emailError);
        // Don't fail the request if email fails - user can try again later
      });

      console.log("📧 Verification email sent to:", email);
      console.log("🔗 Verification token:", verificationToken);

      return new Response(
        JSON.stringify({
          message: "Verification email sent successfully.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Resend Verification Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/request-new-invite
  // Allows a donor whose invite link is expired/consumed to request a fresh one.
  // Generates a 64-char token so the app routes to /donorInvitationVerify.
  if (method === "POST" && route === "/auth/request-new-invite") {
    try {
      const body = await req.json();
      const {email} = body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(
          JSON.stringify({success: false, error: "Valid email is required."}),
          {headers: {...corsHeaders, "Content-Type": "application/json"}, status: 400},
        );
      }

      // Look up donor by email
      const {data: users} = await supabase
        .from("users")
        .select("id, email, first_name, last_name, role, account_status, is_verified")
        .eq("email", email.toLowerCase().trim())
        .eq("role", "donor")
        .limit(1);

      // Always return a generic success (don't leak whether email exists)
      const genericSuccess = new Response(
        JSON.stringify({success: true, message: "If an account exists for this email, a new invitation has been sent."}),
        {headers: {...corsHeaders, "Content-Type": "application/json"}, status: 200},
      );

      if (!users || users.length === 0) {
        console.log("⚠️ request-new-invite: donor not found for", email);
        return genericSuccess;
      }

      const donor = users[0];

      // If donor has fully completed signup (active + verified, no token needed), don't resend
      if (donor.is_verified && donor.account_status === "active") {
        console.log("ℹ️ request-new-invite: donor already active, skipping resend for", email);
        return genericSuccess;
      }

      // Generate fresh 64-char invitation token
      const tokenArray = new Uint8Array(32);
      crypto.getRandomValues(tokenArray);
      const newToken = Array.from(tokenArray, (b) => b.toString(16).padStart(2, "0")).join("");

      await supabase
        .from("users")
        .update({
          verification_token: newToken,
          is_verified: false,
          account_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", donor.id);

      const fullName = `${donor.first_name || ""} ${donor.last_name || ""}`.trim();
      sendInvitationEmail({
        to: donor.email,
        name: fullName || donor.email.split("@")[0],
        verificationToken: newToken,
        donorId: donor.id,
      }).catch((e) => console.error("❌ request-new-invite email error:", e));

      console.log("✅ request-new-invite: resent invite to", email);
      return genericSuccess;
    } catch (err) {
      console.error("❌ request-new-invite error:", err);
      return new Response(
        JSON.stringify({success: false, error: "Server error. Please try again."}),
        {headers: {...corsHeaders, "Content-Type": "application/json"}, status: 500},
      );
    }
  }

  // DELETE /auth/delete-user
  if (method === "DELETE" && route === "/auth/delete-user") {
    try {
      const body = await req.json();
      const {email} = body;

      // Validate email
      if (!email) {
        return new Response(JSON.stringify({message: "Email is required."}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({message: "Invalid email format."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      console.log(`🗑️ Attempting to delete user: ${email}`);

      // Get user to check if exists and get profile picture URL
      const {data: users, error: userError} = await supabase
        .from("users")
        .select("id, email, profile_picture_url")
        .eq("email", email)
        .limit(1);

      if (userError || !users || users.length === 0) {
        return new Response(JSON.stringify({message: "User not found."}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      const user = users[0];

      // Delete profile picture from Supabase Storage if it exists
      if (user.profile_picture_url) {
        try {
          // Extract file path from URL
          // URL format: https://mdqgndyhzlnwojtubouh.supabase.co/storage/v1/object/public/profile-pictures/...
          const urlParts = user.profile_picture_url.split("/");
          const publicIndex = urlParts.indexOf("public");
          if (publicIndex !== -1 && publicIndex < urlParts.length - 1) {
            const filePath = urlParts
              .slice(publicIndex + 1)
              .join("/")
              .split("?")[0];
            const bucketName = "profile-pictures";

            console.log(
              `🗑️ Deleting profile picture from storage: ${bucketName}/${filePath}`,
            );

            const {error: storageError} = await supabase.storage
              .from(bucketName)
              .remove([filePath]);

            if (storageError) {
              console.error(
                "⚠️ Error deleting profile picture from storage:",
                storageError,
              );
              // Continue with user deletion even if storage delete fails
            } else {
              console.log("✅ Profile picture deleted from storage");
            }
          }
        } catch (storageError) {
          console.error("⚠️ Error deleting profile picture:", storageError);
          // Continue with user deletion even if storage delete fails
        }
      }

      // Delete user from database
      // Note: Database foreign keys will handle cascading deletes:
      // - donations with donor_id will be deleted (ON DELETE CASCADE)
      // - charities/vendors created_by_user_id will be set to NULL (ON DELETE SET NULL)
      // - redemptions user_id will be set to NULL (ON DELETE SET NULL)
      const {error: deleteError} = await supabase
        .from("users")
        .delete()
        .eq("email", email);

      if (deleteError) {
        console.error("❌ Error deleting user:", deleteError);
        return new Response(
          JSON.stringify({message: "Failed to delete user."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log(`✅ User deleted successfully: ${email}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "User and all associated data deleted successfully.",
          deletedEmail: email,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Delete User Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/profile-picture (file upload - requires authentication)
  if (method === "POST" && route === "/auth/profile-picture") {
    try {
      console.log("🔍 Profile picture upload route matched");

      // Check for authentication
      const authHeader = getAppAuthHeader(req);
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("❌ Missing or invalid Authorization header");
        return new Response(JSON.stringify({error: "Unauthorized"}), {
          headers: {"Content-Type": "application/json"},
          status: 401,
        });
      }

      // Verify JWT token
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return new Response(
          JSON.stringify({error: "Server configuration error"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let decoded: any;
      try {
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );
        decoded = await verifyJWT(token, secretKey);
      } catch (jwtError) {
        console.error("JWT verification error:", jwtError);
        return new Response(
          JSON.stringify({error: "Invalid or expired token"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const userId = decoded.id || decoded.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({error: "Invalid token: user ID not found"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // Parse multipart form data
      const formData = await req.formData();
      const file =
        formData.get("profilePicture") ||
        formData.get("image") ||
        (formData.get("file") as File);

      if (!file || !(file instanceof File)) {
        console.log("❌ No file uploaded or invalid file");
        return new Response(JSON.stringify({error: "No file uploaded"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = new Uint8Array(arrayBuffer);

      // Generate unique filename
      const timestamp = Date.now();
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `profile-${userId}-${timestamp}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `user-${userId}/${fileName}`;

      // Upload to Supabase Storage
      const bucketName = "profile-pictures";
      const {data: uploadData, error: uploadError} = await supabase.storage
        .from(bucketName)
        .upload(filePath, fileBuffer, {
          contentType: file.type || "image/jpeg",
          upsert: true, // Allow overwriting existing files
        });

      if (uploadError) {
        console.error("❌ Error uploading profile picture:", uploadError);
        return new Response(
          JSON.stringify({
            error: "Failed to upload profile picture",
            details: uploadError.message,
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Get public URL
      const {
        data: {publicUrl},
      } = supabase.storage.from(bucketName).getPublicUrl(filePath);

      // Update user profile with new picture URL
      const {error: updateError} = await supabase
        .from("users")
        .update({
          profile_picture_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        console.error("❌ Error updating profile picture URL:", updateError);
        // Still return success with the URL, as the upload succeeded
      }

      console.log("✅ Profile picture uploaded successfully:", publicUrl);

      // Return success response with the public URL
      return new Response(
        JSON.stringify({
          success: true,
          message: "Profile picture uploaded successfully",
          profileImageUrl: publicUrl,
          profileImage: publicUrl,
        }),
        {
          status: 200,
          headers: {"Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Profile picture upload error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to upload profile picture",
        }),
        {status: 500, headers: {"Content-Type": "application/json"}},
      );
    }
  }

  // GET /auth/profile (requires authentication)
  if (method === "GET" && route === "/auth/profile") {
    try {
      console.log("🔍 Get profile route matched");

      // Check for authentication
      const authHeader = getAppAuthHeader(req);
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("❌ Missing or invalid Authorization header");
        return new Response(JSON.stringify({error: "Unauthorized"}), {
          headers: {"Content-Type": "application/json"},
          status: 401,
        });
      }

      // Verify JWT token
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return new Response(
          JSON.stringify({error: "Server configuration error"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let decoded: any;
      try {
        // Convert secret string to CryptoKey for djwt v2.9
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );
        decoded = await verifyJWT(token, secretKey);
      } catch (jwtError) {
        console.error("JWT verification error:", jwtError);
        return new Response(
          JSON.stringify({error: "Invalid or expired token"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const userId = decoded.id || decoded.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({error: "Invalid token: user ID not found"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // Fetch user profile from database
      const {data: user, error: userError} = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, phone, profile_picture_url, city, state, zip_code, latitude, longitude, location_permission_granted, location_updated_at, preferences, is_verified, account_status",
        )
        .eq("id", userId)
        .single();

      if (userError || !user) {
        console.error("❌ Error fetching user profile:", userError);
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Resolve full beneficiary object so the app can display it immediately
      const charityId =
        user.preferences?.preferredCharity ||
        user.preferences?.beneficiary ||
        null;

      let selectedBeneficiary: any = null;
      if (charityId) {
        const {data: charity} = await supabase
          .from("charities")
          .select("id, name, description, logo_url, category")
          .eq("id", charityId)
          .single();
        if (charity) {
          selectedBeneficiary = {
            id: charity.id,
            name: charity.name || "",
            description: charity.description || null,
            logo_url: charity.logo_url || "",
            category: charity.category || null,
            image: charity.logo_url ? {uri: charity.logo_url} : null,
          };
        }
      }

      // Return profile data in the format the app expects
      return new Response(
        JSON.stringify({
          success: true,
          profile: {
            id: user.id,
            email: user.email,
            firstName: user.first_name || null,
            lastName: user.last_name || null,
            phone: user.phone || null,
            profileImage: user.profile_picture_url || null,
            profileImageUrl: user.profile_picture_url || null,
            address: {
              city: user.city || "",
              state: user.state || "",
              zipCode: user.zip_code || "",
              latitude: user.latitude ? parseFloat(user.latitude) : null,
              longitude: user.longitude ? parseFloat(user.longitude) : null,
            },
            locationPermissionGranted:
              user.location_permission_granted || false,
            locationUpdatedAt: user.location_updated_at || null,
            monthlyDonation: user.preferences?.monthlyDonation || null,
            points: user.preferences?.points || null,
            totalSavings: user.preferences?.totalSavings || null,
            preferredCharity: charityId,
            beneficiary: charityId,
            selectedBeneficiary,
            referredCharity: selectedBeneficiary,
            isVerified: user.is_verified || false,
            accountStatus: user.account_status || "active",
          },
        }),
        {
          status: 200,
          headers: {"Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Get profile unexpected error:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });

      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: error?.message || String(error) || "Unknown error occurred",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/save-profile (requires authentication)
  if (method === "POST" && route === "/auth/save-profile") {
    let userId: number | undefined; // Declare userId outside try block for catch block access
    try {
      console.log("🔍 Save profile route matched");

      // Check for authentication
      const authHeader = getAppAuthHeader(req);
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("❌ Missing or invalid Authorization header");
        return new Response(JSON.stringify({error: "Unauthorized"}), {
          headers: {"Content-Type": "application/json"},
          status: 401,
        });
      }

      // Verify JWT token
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return new Response(
          JSON.stringify({error: "Server configuration error"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let decoded: any;
      try {
        // Convert secret string to CryptoKey for djwt v2.9 (same as when creating token)
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );
        decoded = await verifyJWT(token, secretKey);
      } catch (jwtError) {
        console.error("JWT verification error:", jwtError);
        return new Response(
          JSON.stringify({error: "Invalid or expired token"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      userId = decoded.id || decoded.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({error: "Invalid token: user ID not found"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // Parse request body
      let body: any = {};
      try {
        body = await req.json();
      } catch (parseError) {
        console.log("⚠️ No body or invalid JSON, using empty object");
      }

      const {
        firstName,
        lastName,
        phone,
        phoneNumber, // Support both phone and phoneNumber
        email,
        profileImage,
        profileImageUrl,
        monthlyDonation,
        points,
        totalSavings,
        coworking,
        inviteType,
        invite_type, // Support snake_case
        sponsorAmount,
        sponsor_amount, // Support snake_case
        sponsorSource,
        sponsor_source, // Support snake_case
        externalBilled,
        external_billed, // Support snake_case
        extraDonationAmount,
        extra_donation_amount, // Support snake_case
        totalMonthlyDonation,
        total_monthly_donation, // Support snake_case
        // Beneficiary/charity selection
        beneficiary,
        charityId,
        preferredCharity,
        // Location fields
        address,
        city,
        state,
        zipCode,
        zip_code,
        street,
        latitude,
        longitude,
        locationPermissionGranted,
        location_permission_granted,
      } = body;

      // Build update object (only include fields that are provided)
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (firstName !== undefined)
        updateData.first_name = capitalizeName(firstName);
      if (lastName !== undefined)
        updateData.last_name = capitalizeName(lastName);
      if (phone !== undefined) updateData.phone = phone || null;
      if (phoneNumber !== undefined) updateData.phone = phoneNumber || null; // phoneNumber takes precedence
      if (email !== undefined && email) updateData.email = email;

      // Handle profile image (support both profileImage and profileImageUrl)
      const profileImageValue = profileImage || profileImageUrl;
      if (profileImageValue !== undefined) {
        updateData.profile_picture_url = profileImageValue || null;
      }

      if (monthlyDonation !== undefined)
        updateData.monthly_donation = monthlyDonation;

      // Handle coworking and sponsor fields (support both camelCase and snake_case)
      if (coworking !== undefined) {
        updateData.coworking =
          coworking === true || coworking === "Yes" || coworking === "yes";
      }
      const inviteTypeValue = inviteType || invite_type;
      if (inviteTypeValue !== undefined) {
        updateData.invite_type = inviteTypeValue || null;
      }
      const sponsorAmountValue = sponsorAmount || sponsor_amount;
      if (sponsorAmountValue !== undefined) {
        updateData.sponsor_amount =
          sponsorAmountValue !== "" && sponsorAmountValue !== null
            ? parseFloat(sponsorAmountValue)
            : null;
      }
      const sponsorSourceValue = sponsorSource || sponsor_source;
      if (sponsorSourceValue !== undefined) {
        updateData.sponsor_source = sponsorSourceValue || null;
      }
      const externalBilledValue = externalBilled || external_billed;
      if (externalBilledValue !== undefined) {
        updateData.external_billed =
          externalBilledValue === true || externalBilledValue === "true";
      }
      const extraDonationAmountValue =
        extraDonationAmount || extra_donation_amount;
      if (extraDonationAmountValue !== undefined) {
        updateData.extra_donation_amount =
          extraDonationAmountValue !== "" && extraDonationAmountValue !== null
            ? parseFloat(extraDonationAmountValue)
            : null;
      }
      const totalMonthlyDonationValue =
        totalMonthlyDonation || total_monthly_donation;
      if (totalMonthlyDonationValue !== undefined) {
        updateData.total_monthly_donation =
          totalMonthlyDonationValue !== "" && totalMonthlyDonationValue !== null
            ? parseFloat(totalMonthlyDonationValue)
            : null;
      }

      // Handle location/address fields
      // Support both address object and flat fields
      if (address) {
        if (address.city !== undefined) updateData.city = address.city || null;
        if (address.state !== undefined)
          updateData.state = address.state || null;
        if (address.zipCode !== undefined)
          updateData.zip_code = address.zipCode || null;
        if (address.zip_code !== undefined)
          updateData.zip_code = address.zip_code || null;
        if (address.street !== undefined)
          updateData.street_address = address.street || null;
        if (address.latitude !== undefined)
          updateData.latitude = address.latitude
            ? parseFloat(address.latitude)
            : null;
        if (address.longitude !== undefined)
          updateData.longitude = address.longitude
            ? parseFloat(address.longitude)
            : null;
      }

      // Also support flat fields (for backward compatibility)
      if (city !== undefined) updateData.city = city || null;
      if (state !== undefined) updateData.state = state || null;
      const zip = zipCode || zip_code;
      if (zip !== undefined) updateData.zip_code = zip || null;
      if (street !== undefined) updateData.street_address = street || null;

      // Handle GPS coordinates
      if (latitude !== undefined) {
        updateData.latitude = latitude ? parseFloat(latitude) : null;
      }
      if (longitude !== undefined) {
        updateData.longitude = longitude ? parseFloat(longitude) : null;
      }

      // Handle location permission
      const locationPermission =
        locationPermissionGranted || location_permission_granted;
      if (locationPermission !== undefined) {
        updateData.location_permission_granted = locationPermission === true;
        if (locationPermission === true) {
          updateData.location_updated_at = new Date().toISOString();
        }
      }

      // If location fields are provided but coordinates are missing, try to geocode
      if (
        (updateData.city || updateData.state) &&
        !updateData.latitude &&
        !updateData.longitude
      ) {
        try {
          const locationString = [
            updateData.city,
            updateData.state,
            updateData.zip_code,
          ]
            .filter(Boolean)
            .join(", ");
          if (locationString) {
            const geocodeResult = await geocodeAddress(locationString);
            if (geocodeResult.latitude && geocodeResult.longitude) {
              updateData.latitude = geocodeResult.latitude;
              updateData.longitude = geocodeResult.longitude;
              console.log(
                `✅ Geocoded location "${locationString}" to (${geocodeResult.latitude}, ${geocodeResult.longitude})`,
              );
            }
          }
        } catch (geocodeError) {
          // Geocoding is optional, so we don't fail the entire request if it fails
          console.warn(
            "⚠️ Geocoding failed (non-critical):",
            geocodeError?.message || String(geocodeError),
          );
        }
      }

      // Handle additional fields (store in preferences JSONB if they don't have dedicated columns)
      const preferences: any = {};
      if (monthlyDonation !== undefined)
        preferences.monthlyDonation = monthlyDonation;
      if (points !== undefined) preferences.points = points;
      if (totalSavings !== undefined) preferences.totalSavings = totalSavings;
      if (coworking !== undefined) preferences.coworking = coworking === true;
      if (inviteType !== undefined) preferences.inviteType = inviteType || null;
      if (sponsorAmount !== undefined)
        preferences.sponsorAmount = sponsorAmount;
      if (externalBilled !== undefined)
        preferences.externalBilled = externalBilled === true;
      if (extraDonationAmount !== undefined)
        preferences.extraDonationAmount = extraDonationAmount;
      if (totalMonthlyDonation !== undefined)
        preferences.totalMonthlyDonation = totalMonthlyDonation;

      // Handle beneficiary/charity selection - only update if explicitly provided
      const beneficiaryId = beneficiary || charityId || preferredCharity;
      if (
        beneficiaryId !== undefined &&
        beneficiaryId !== null &&
        beneficiaryId !== ""
      ) {
        preferences.preferredCharity = beneficiaryId;
        preferences.beneficiary = beneficiaryId;
        console.log("✅ Updating beneficiary preference:", beneficiaryId);
      } else if (beneficiaryId === null) {
        // Explicitly null means user wants to clear the selection
        preferences.preferredCharity = null;
        preferences.beneficiary = null;
        console.log("✅ Clearing beneficiary preference");
      }

      // If we have preferences to update, get existing preferences first
      if (Object.keys(preferences).length > 0) {
        try {
          const {data: existingUser, error: fetchError} = await supabase
            .from("users")
            .select("preferences")
            .eq("id", userId)
            .single();

          if (fetchError) {
            // If we can't fetch existing preferences, log but continue with new preferences only
            console.warn(
              "⚠️ Could not fetch existing preferences (non-critical):",
              fetchError.message,
            );
            updateData.preferences = preferences;
          } else {
            const existingPreferences = existingUser?.preferences || {};
            updateData.preferences = {...existingPreferences, ...preferences};
          }
        } catch (prefError) {
          // If preferences fetch fails, just use the new preferences
          console.warn(
            "⚠️ Preferences fetch error (non-critical):",
            prefError?.message || String(prefError),
          );
          updateData.preferences = preferences;
        }
      }

      // Update user profile in database
      // First attempt: try with all fields
      let {data: updatedUser, error: updateError} = await supabase
        .from("users")
        .update(updateData)
        .eq("id", userId)
        .select(
          "id, email, first_name, last_name, phone, profile_picture_url, city, state, zip_code, latitude, longitude, location_permission_granted, location_updated_at, preferences, coworking, invite_type, sponsor_amount, sponsor_source, external_billed, extra_donation_amount, total_monthly_donation",
        )
        .single();

      // If update fails due to missing columns, retry without location permission fields
      if (updateError && updateError.message?.includes("does not exist")) {
        console.warn(
          "⚠️ Column does not exist error detected, retrying without location permission fields",
        );

        // Remove location permission fields that might not exist
        const retryUpdateData = {...updateData};
        delete retryUpdateData.location_permission_granted;
        delete retryUpdateData.location_updated_at;

        // Also remove latitude/longitude if they don't exist
        if (
          updateError.message.includes("latitude") ||
          updateError.message.includes("longitude")
        ) {
          delete retryUpdateData.latitude;
          delete retryUpdateData.longitude;
        }

        // Retry update without problematic fields
        const retryResult = await supabase
          .from("users")
          .update(retryUpdateData)
          .eq("id", userId)
          .select(
            "id, email, first_name, last_name, phone, profile_picture_url, city, state, zip_code, preferences",
          )
          .single();

        if (retryResult.error) {
          // If retry also fails, return the original error
          updateError = retryResult.error;
          updatedUser = null;
        } else {
          // Retry succeeded
          updateError = null;
          updatedUser = retryResult.data;
          console.log(
            "✅ Profile updated successfully (without location permission fields)",
          );
        }
      }

      if (updateError) {
        console.error("❌ Profile update error:", {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
          userId: userId,
          updateData: updateData,
        });

        // Always return error message for debugging (not just in development)
        // This helps identify column mismatches, missing columns, type errors, etc.
        const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
        return new Response(
          JSON.stringify({
            error: "Failed to save profile",
            // Always include the error message so we can debug issues
            details: updateError.message || "Unknown database error",
            // Include code and hint in development for more context
            ...(isDevelopment
              ? {
                  code: updateError.code,
                  hint: updateError.hint,
                  details_full: updateError.details,
                }
              : {}),
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      if (!updatedUser) {
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Return success response
      // Handle missing location fields gracefully (in case migration hasn't been run)
      return new Response(
        JSON.stringify({
          success: true,
          message: "Profile saved successfully",
          profile: {
            id: updatedUser.id,
            email: updatedUser.email,
            firstName: updatedUser.first_name,
            lastName: updatedUser.last_name,
            phone: updatedUser.phone,
            profileImage: updatedUser.profile_picture_url,
            profileImageUrl: updatedUser.profile_picture_url,
            address: {
              city: updatedUser.city || "",
              state: updatedUser.state || "",
              zipCode: updatedUser.zip_code || "",
              latitude: updatedUser.latitude
                ? parseFloat(updatedUser.latitude)
                : null,
              longitude: updatedUser.longitude
                ? parseFloat(updatedUser.longitude)
                : null,
            },
            // Only include location permission fields if they exist in the response
            ...(updatedUser.location_permission_granted !== undefined && {
              locationPermissionGranted:
                updatedUser.location_permission_granted || false,
            }),
            ...(updatedUser.location_updated_at !== undefined && {
              locationUpdatedAt: updatedUser.location_updated_at || null,
            }),
            monthlyDonation: updatedUser.preferences?.monthlyDonation || null,
            points: updatedUser.preferences?.points || null,
            totalSavings: updatedUser.preferences?.totalSavings || null,
            preferredCharity:
              updatedUser.preferences?.preferredCharity ||
              updatedUser.preferences?.beneficiary ||
              null,
            beneficiary:
              updatedUser.preferences?.beneficiary ||
              updatedUser.preferences?.preferredCharity ||
              null,
            coworking: updatedUser.coworking || false,
            inviteType: updatedUser.invite_type || null,
            sponsorAmount: updatedUser.sponsor_amount || null,
            sponsorSource: updatedUser.sponsor_source || null,
            externalBilled: updatedUser.external_billed || false,
            extraDonationAmount: updatedUser.extra_donation_amount || null,
            totalMonthlyDonation: updatedUser.total_monthly_donation || null,
          },
        }),
        {
          status: 200,
          headers: {"Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Save profile unexpected error:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
        userId: userId || "unknown",
      });

      // Always return error message for debugging
      const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          // Always include the error message so we can debug issues
          details: error?.message || String(error) || "Unknown error occurred",
          // Include stack trace in development for more context
          ...(isDevelopment
            ? {
                stack: error?.stack,
                name: error?.name,
              }
            : {}),
        }),
        {
          status: 500,
          headers: {"Content-Type": "application/json"},
        },
      );
    }
  }

  // POST /auth/social-login - Social login (Apple, Google, Facebook)
  if (method === "POST" && route === "/auth/social-login") {
    try {
      const body = await req.json();
      const {
        provider,
        providerId,
        email,
        firstName,
        lastName,
        identityToken, // Apple
        authorizationCode, // Apple
        accessToken, // Google/Facebook
        idToken, // Google
        picture,
        city,
        state,
        zipCode,
        zip_code,
        referralToken,
        referrerId,
        loginOnly, // When true, reject if user doesn't exist (called from login screen)
        coworking,
        inviteType,
        invite_type,
      } = body;

      // Validate required fields
      if (!provider || !providerId) {
        return new Response(
          JSON.stringify({message: "Provider and providerId are required."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Validate provider
      const validProviders = ["apple", "google", "facebook"];
      if (!validProviders.includes(provider)) {
        return new Response(
          JSON.stringify({
            message: "Invalid provider. Must be apple, google, or facebook.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Verify OAuth token based on provider
      let verifiedUser: {sub?: string; id?: string; email?: string} | null =
        null;

      if (provider === "apple") {
        if (!identityToken) {
          return new Response(
            JSON.stringify({message: "Apple identityToken is required."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 400,
            },
          );
        }
        verifiedUser = await verifyAppleToken(identityToken);
        if (!verifiedUser || verifiedUser.sub !== providerId) {
          return new Response(
            JSON.stringify({message: "Invalid Apple token."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 401,
            },
          );
        }
      } else if (provider === "google") {
        if (!idToken) {
          return new Response(
            JSON.stringify({message: "Google idToken is required."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 400,
            },
          );
        }
        verifiedUser = await verifyGoogleToken(idToken);
        if (!verifiedUser || verifiedUser.sub !== providerId) {
          return new Response(
            JSON.stringify({message: "Invalid Google token."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 401,
            },
          );
        }
      } else if (provider === "facebook") {
        if (!accessToken) {
          return new Response(
            JSON.stringify({message: "Facebook accessToken is required."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 400,
            },
          );
        }
        verifiedUser = await verifyFacebookToken(accessToken);
        if (!verifiedUser || verifiedUser.id !== providerId) {
          return new Response(
            JSON.stringify({message: "Invalid Facebook token."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 401,
            },
          );
        }
      }

      // Use email from verified token if available, otherwise use provided email
      const userEmail = verifiedUser?.email || email;
      if (!userEmail) {
        return new Response(
          JSON.stringify({message: "Email is required for social login."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Check if user exists by provider_id or email
      const {data: existingUsers, error: findError} = await supabase
        .from("users")
        .select("*")
        .or(`provider_id.eq.${providerId},email.eq.${userEmail}`)
        .limit(2);

      if (findError) {
        console.error("❌ Error finding user:", findError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let user: any = null;
      let isNewUser = false;

      // Find existing user
      if (existingUsers && existingUsers.length > 0) {
        // Check for exact provider match first
        user = existingUsers.find(
          (u: any) => u.provider === provider && u.provider_id === providerId,
        );

        // If not found, check for email match
        if (!user) {
          user = existingUsers.find((u: any) => u.email === userEmail);

          // If user exists with different provider, link the provider
          if (user) {
            const {data: updatedUser, error: updateError} = await supabase
              .from("users")
              .update({
                provider,
                provider_id: providerId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", user.id)
              .select()
              .single();

            if (updateError) {
              console.error("❌ Error updating user provider:", updateError);
            } else {
              user = updatedUser;
            }
          }
        }
      }

      // If called from the login screen, reject unknown users instead of creating them
      if (!user && loginOnly) {
        return new Response(
          JSON.stringify({
            message:
              "No account found for this social login. Please sign up first.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      // Create new user if doesn't exist
      if (!user) {
        isNewUser = true;

        // Build user data
        const userData: any = {
          email: userEmail,
          provider,
          provider_id: providerId,
          is_verified: true, // OAuth emails are pre-verified
          role: "donor",
          account_status: "active",
          password_hash: null, // No password for OAuth users
        };

        // Add optional fields (with name capitalization)
        if (firstName) userData.first_name = capitalizeName(firstName);
        if (lastName) userData.last_name = capitalizeName(lastName);
        if (picture) userData.profile_picture_url = picture;
        if (city) userData.city = city;
        if (state) userData.state = state;
        const zip = zipCode || zip_code;
        if (zip) userData.zip_code = zip;

        const isCoworkingSocial =
          coworking === true || coworking === "Yes" || coworking === "yes";
        if (coworking !== undefined && coworking !== null) {
          userData.coworking = isCoworkingSocial;
        }
        const inviteTypeSocial = inviteType || invite_type;
        if (inviteTypeSocial !== undefined && inviteTypeSocial !== null && inviteTypeSocial !== "") {
          userData.invite_type = inviteTypeSocial;
        } else if (coworking !== undefined && coworking !== null) {
          userData.invite_type = isCoworkingSocial ? "coworking" : "standard";
        }

        // Handle referral
        if (referralToken || referrerId) {
          const referrer = await getReferrerFromToken(
            supabase,
            referralToken || referrerId?.toString() || "",
          );
          if (referrer) {
            // Will create referral record after user is created
          }
        }

        const {data: newUser, error: createError} = await supabase
          .from("users")
          .insert([userData])
          .select()
          .single();

        if (createError) {
          console.error("❌ Error creating user:", createError);
          return new Response(
            JSON.stringify({message: "Server error. Please try again later."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 500,
            },
          );
        }

        user = newUser;

        // Create referral record if applicable
        if (referralToken || referrerId) {
          const referrer = await getReferrerFromToken(
            supabase,
            referralToken || referrerId?.toString() || "",
          );
          if (referrer) {
            await createReferralRecord(
              supabase,
              referrer,
              user.id,
              referralToken,
            );
          }
        }
      } else {
        // Update last login
        await supabase
          .from("users")
          .update({updated_at: new Date().toISOString()})
          .eq("id", user.id);
      }

      // Generate JWT token
      if (!jwtSecret) {
        return new Response(
          JSON.stringify({message: "JWT_SECRET not configured"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const secretKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(jwtSecret),
        {name: "HMAC", hash: "SHA-256"},
        false,
        ["sign", "verify"],
      );

      const token = await createJWT(
        {alg: "HS256", typ: "JWT"},
        {
          id: user.id,
          email: user.email,
          role: user.role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        },
        secretKey,
      );

      // Check if user has completed onboarding.
      // Consider onboarding complete if user has either:
      // 1) a selected beneficiary in preferences, OR
      // 2) recurring donation setup/billing metadata.
      const hasBeneficiaryPreference = Boolean(
        user.preferences?.preferredCharity || user.preferences?.beneficiary,
      );
      const hasRecurringSetup =
        Number(user.total_monthly_donation || 0) > 0 ||
        Number(user.sponsor_amount || 0) > 0 ||
        user.external_billed === true;
      const needsOnboarding = !(hasBeneficiaryPreference || hasRecurringSetup);

      // Detailed logging for debugging
      console.log(
        "═══════════════════════════════════════════════════════════",
      );
      console.log("📋 [SOCIAL-LOGIN] Final decision data:");
      console.log(
        "═══════════════════════════════════════════════════════════",
      );
      console.log("🆔 [SOCIAL-LOGIN] User ID:", user.id);
      console.log("📧 [SOCIAL-LOGIN] Email:", user.email);
      console.log("👤 [SOCIAL-LOGIN] First Name:", user.first_name);
      console.log("👤 [SOCIAL-LOGIN] Last Name:", user.last_name);
      console.log("📞 [SOCIAL-LOGIN] Phone:", user.phone);
      console.log("🆕 [SOCIAL-LOGIN] isNewUser:", isNewUser);
      console.log(
        "👤 [SOCIAL-LOGIN] needsProfileSetup:",
        !user.first_name || !user.last_name,
      );
      console.log(
        "📋 [SOCIAL-LOGIN] user.preferences:",
        JSON.stringify(user.preferences),
      );
      console.log(
        "📋 [SOCIAL-LOGIN] preferredCharity:",
        user.preferences?.preferredCharity,
      );
      console.log(
        "📋 [SOCIAL-LOGIN] beneficiary:",
        user.preferences?.beneficiary,
      );
      console.log(
        "💳 [SOCIAL-LOGIN] total_monthly_donation:",
        user.total_monthly_donation,
      );
      console.log("💳 [SOCIAL-LOGIN] sponsor_amount:", user.sponsor_amount);
      console.log("💳 [SOCIAL-LOGIN] external_billed:", user.external_billed);
      console.log("📋 [SOCIAL-LOGIN] needsOnboarding:", needsOnboarding);
      console.log("✅ [SOCIAL-LOGIN] isVerified:", user.is_verified);
      console.log(
        "═══════════════════════════════════════════════════════════",
      );

      // Return response
      return new Response(
        JSON.stringify({
          success: true,
          token,
          isNewUser,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            needsProfileSetup: !user.first_name || !user.last_name,
            needsOnboarding: needsOnboarding,
            isVerified: user.is_verified,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      // Log detailed error for debugging (server-side only)
      console.error("❌ Social login error:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      // Return generic error message to client (don't expose internal details)
      return new Response(
        JSON.stringify({
          success: false,
          message: "Authentication failed. Please try again.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Auth route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Public vendor routes handler (for mobile app)
async function handleVendorRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /vendors (public - for mobile app)
  if (method === "GET" && route === "/vendors") {
    try {
      const {data: vendors, error} = await supabase
        .from("vendors")
        .select("*")
        .order("name", {ascending: true});

      if (error) {
        console.error("Error fetching vendors:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch vendors"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Format vendors for API response
      const formattedVendors = (vendors || []).map((vendor: any) => ({
        id: vendor.id,
        name: vendor.name,
        category: vendor.category,
        description: vendor.description,
        website: vendor.website,
        phone: vendor.phone,
        email: vendor.email,
        socialLinks: vendor.social_links || {},
        logoUrl: vendor.logo_url,
        address: vendor.address || null,
        hours: vendor.hours || null,
        createdAt: vendor.created_at,
        updatedAt: vendor.updated_at,
      }));

      return new Response(JSON.stringify({vendors: formattedVendors}), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching vendors:", error);
      return new Response(JSON.stringify({error: "Failed to fetch vendors"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // GET /vendors/:id (public - for mobile app)
  const vendorIdMatch = route.match(/^\/vendors\/(\d+)$/);
  if (method === "GET" && vendorIdMatch) {
    try {
      const vendorId = vendorIdMatch[1];

      const {data: vendor, error} = await supabase
        .from("vendors")
        .select("*")
        .eq("id", vendorId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(JSON.stringify({error: "Vendor not found"}), {
            headers: {"Content-Type": "application/json"},
            status: 404,
          });
        }
        console.error("Error fetching vendor:", error);
        return new Response(JSON.stringify({error: "Failed to fetch vendor"}), {
          headers: {"Content-Type": "application/json"},
          status: 500,
        });
      }

      // Format vendor for API response
      const formattedVendor = {
        id: vendor.id,
        name: vendor.name,
        category: vendor.category,
        description: vendor.description,
        website: vendor.website,
        phone: vendor.phone,
        email: vendor.email,
        socialLinks: vendor.social_links || {},
        logoUrl: vendor.logo_url,
        address: vendor.address || null,
        hours: vendor.hours || null,
        createdAt: vendor.created_at,
        updatedAt: vendor.updated_at,
      };

      return new Response(JSON.stringify(formattedVendor), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching vendor:", error);
      return new Response(JSON.stringify({error: "Failed to fetch vendor"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  return new Response(JSON.stringify({error: "Vendor route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Public discounts routes handler (for mobile app)
async function handleDiscountRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  console.log(`🔍 handleDiscountRoute: ${method} ${route}`);

  // GET /discounts (public - for mobile app)
  if (method === "GET" && route === "/discounts") {
    try {
      const url = new URL(req.url);
      const {category, location, search} = Object.fromEntries(url.searchParams);

      // Build query
      let query = supabase
        .from("discounts")
        .select(
          `
          *,
          vendor:vendors!vendor_id (
            id,
            name,
            category,
            description,
            website,
            phone,
            email,
            social_links,
            logo_url,
            address,
            hours
          )
        `,
        )
        .neq("is_active", false);

      // Filter by active and not expired
      const today = new Date().toISOString().split("T")[0];
      query = query.or(`end_date.is.null,end_date.gte.${today}`);

      // Filter by category
      if (category && category !== "All") {
        query = query.eq("category", category);
      }

      // Search functionality
      if (search) {
        query = query.or(
          `title.ilike.%${search}%,description.ilike.%${search}%`,
        );
      }

      // Order by created_at DESC
      query = query.order("created_at", {ascending: false});

      const {data: discounts, error} = await query;

      if (error) {
        console.error("Error fetching discounts:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch discounts"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Try to get user ID from JWT token (optional - discounts are public)
      let userId: number | null = null;
      const authHeader = getAppAuthHeader(req);
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.substring(7);
          const jwtSecret = Deno.env.get("JWT_SECRET");

          if (jwtSecret) {
            const secretKey = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(jwtSecret),
              {name: "HMAC", hash: "SHA-256"},
              false,
              ["sign", "verify"],
            );
            const decoded: any = await verifyJWT(token, secretKey);
            userId = decoded.id || decoded.userId || null;
          }
        } catch (authError) {
          // Not authenticated - that's okay, discounts are public
          console.log(
            "⚠️ Could not authenticate user for discount list (non-critical)",
          );
        }
      }

      // Get start of current month for usage calculations
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // If user is authenticated, get their redemption counts for all discounts
      let userRedemptions: Record<number, number> = {};
      if (userId) {
        try {
          const {data: redemptions, error: redemptionsError} = await supabase
            .from("redemptions")
            .select("discount_id")
            .eq("user_id", userId)
            .gte("redeemed_at", startOfMonth.toISOString());

          if (!redemptionsError && redemptions) {
            // Count redemptions per discount
            redemptions.forEach((redemption: any) => {
              const discountId = redemption.discount_id;
              userRedemptions[discountId] =
                (userRedemptions[discountId] || 0) + 1;
            });
          }
        } catch (redemptionError) {
          console.warn(
            "⚠️ Could not fetch user redemptions (non-critical):",
            redemptionError,
          );
        }
      }

      // Format discounts for API response
      const formattedDiscounts = (discounts || []).map((discount: any) => {
        const usageLimit = discount.usage_limit || "unlimited";
        let remainingUses: number | string | null = null;
        let availableCount: number | string | null = null;

        // Calculate remaining uses if user is authenticated
        if (userId && usageLimit !== "unlimited" && usageLimit !== null) {
          const limit = parseInt(usageLimit);
          if (!isNaN(limit) && limit > 0) {
            const used = userRedemptions[discount.id] || 0;
            remainingUses = Math.max(0, limit - used);
            availableCount = remainingUses;
          } else {
            remainingUses = "unlimited";
            availableCount = "unlimited";
          }
        } else if (usageLimit === "unlimited" || usageLimit === null) {
          remainingUses = "unlimited";
          availableCount = "unlimited";
        }

        const formatted: any = {
          id: discount.id,
          vendorId: discount.vendor_id,
          title: discount.title,
          description: discount.description,
          discountCode: discount.discount_code,
          discountType: discount.discount_type,
          discountValue: discount.discount_value,
          maxDiscount: discount.max_discount,
          usageLimit: usageLimit,
          category: discount.category,
          tags: discount.tags || [],
          imageUrl: discount.image_url,
          startDate: discount.start_date,
          endDate: discount.end_date,
          isActive: discount.is_active,
          terms: discount.terms,
          availability: discount.availability || null,
          createdAt: discount.created_at,
          updatedAt: discount.updated_at,
          vendor: discount.vendor || null,
        };

        // Add remaining uses if calculated (only if user is authenticated)
        if (remainingUses !== null) {
          formatted.remainingUses = remainingUses;
          formatted.availableCount = availableCount;
          // Override usageLimit to show remaining uses as a number (not "unlimited")
          // This ensures frontend shows the correct count if it's checking usageLimit
          if (typeof remainingUses === "number") {
            // Keep original usageLimit for reference, but add display fields
            formatted.usageLimitDisplay = `${remainingUses} remaining`;
            formatted.hasRemainingUses = true;
            // Also set a numeric version for frontend compatibility
            formatted.remainingUsesCount = remainingUses;
          } else {
            formatted.usageLimitDisplay = "unlimited";
            formatted.hasRemainingUses = false;
          }
        } else {
          // Not authenticated or couldn't calculate - show original usageLimit
          formatted.usageLimitDisplay = usageLimit || "unlimited";
          formatted.hasRemainingUses = false;
        }

        return formatted;
      });

      return new Response(JSON.stringify({discounts: formattedDiscounts}), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching discounts:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch discounts"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /discounts/:id (public - for mobile app)
  // If authenticated, also calculates remaining uses for the user
  const discountIdMatch = route.match(/^\/discounts\/(\d+)$/);
  if (method === "GET" && discountIdMatch) {
    try {
      const discountId = discountIdMatch[1];

      const {data: discount, error} = await supabase
        .from("discounts")
        .select(
          `
          *,
          vendor:vendors!vendor_id (
            id,
            name,
            category,
            description,
            website,
            phone,
            email,
            social_links,
            logo_url,
            address,
            hours
          )
        `,
        )
        .eq("id", discountId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(JSON.stringify({error: "Discount not found"}), {
            headers: {"Content-Type": "application/json"},
            status: 404,
          });
        }
        console.error("Error fetching discount:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch discount"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Calculate remaining uses if user is authenticated
      let remainingUses: number | string | null = null;
      let availableCount: number | string | null = null;

      // Try to get user ID from JWT token (optional - discount is public)
      const authHeader = getAppAuthHeader(req);
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.substring(7);
          const jwtSecret = Deno.env.get("JWT_SECRET");

          if (jwtSecret) {
            const secretKey = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(jwtSecret),
              {name: "HMAC", hash: "SHA-256"},
              false,
              ["sign", "verify"],
            );
            const decoded: any = await verifyJWT(token, secretKey);
            const userId = decoded.id || decoded.userId;

            if (userId) {
              // Calculate remaining uses for this user
              const usageLimit = discount.usage_limit;
              console.log(
                `📊 Calculating remaining uses for discount ${discountId}, user ${userId}, usageLimit: ${usageLimit}`,
              );

              if (
                usageLimit &&
                usageLimit !== "unlimited" &&
                usageLimit !== null
              ) {
                const limit = parseInt(usageLimit);
                if (!isNaN(limit) && limit > 0) {
                  // Get start of current month
                  const now = new Date();
                  const startOfMonth = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    1,
                  );

                  // Count redemptions for this user and discount in the current month
                  const {count, error: countError} = await supabase
                    .from("redemptions")
                    .select("*", {count: "exact", head: true})
                    .eq("user_id", userId)
                    .eq("discount_id", parseInt(discountId))
                    .gte("redeemed_at", startOfMonth.toISOString());

                  if (!countError && count !== null) {
                    const used = count || 0;
                    remainingUses = Math.max(0, limit - used);
                    availableCount = remainingUses;
                    console.log(
                      `✅ Calculated remaining uses: ${remainingUses} (limit: ${limit}, used: ${used})`,
                    );
                  } else {
                    // If we can't count, assume all uses available
                    remainingUses = limit;
                    availableCount = limit;
                    console.log(
                      `⚠️ Could not count redemptions, assuming all uses available: ${limit}`,
                    );
                  }
                } else {
                  remainingUses = "unlimited";
                  availableCount = "unlimited";
                  console.log(`ℹ️ Invalid limit format, treating as unlimited`);
                }
              } else {
                remainingUses = "unlimited";
                availableCount = "unlimited";
                console.log(`ℹ️ Usage limit is unlimited or null`);
              }
            } else {
              console.log(
                `⚠️ No userId found, cannot calculate remaining uses`,
              );
            }
          }
        } catch (authError) {
          // Not authenticated or token invalid - that's okay, discount is public
          // Just don't calculate remaining uses
          console.log(
            "⚠️ Could not authenticate user for discount details (non-critical)",
          );
        }
      }

      // Format discount for API response
      const formattedDiscount: any = {
        id: discount.id,
        vendorId: discount.vendor_id,
        title: discount.title,
        description: discount.description,
        discountCode: discount.discount_code,
        discountType: discount.discount_type,
        discountValue: discount.discount_value,
        maxDiscount: discount.max_discount,
        usageLimit: discount.usage_limit || "unlimited",
        category: discount.category,
        tags: discount.tags || [],
        imageUrl: discount.image_url,
        startDate: discount.start_date,
        endDate: discount.end_date,
        isActive: discount.is_active,
        terms: discount.terms,
        createdAt: discount.created_at,
        updatedAt: discount.updated_at,
        vendor: discount.vendor || null,
      };

      // Add remaining uses if calculated (only if user is authenticated)
      if (remainingUses !== null) {
        formattedDiscount.remainingUses = remainingUses;
        formattedDiscount.availableCount = availableCount;
        // Override usageLimit to show remaining uses as a number (not "unlimited")
        // This ensures frontend shows the correct count if it's checking usageLimit
        if (typeof remainingUses === "number") {
          // Keep original usageLimit for reference, but add display fields
          formattedDiscount.usageLimitDisplay = `${remainingUses} remaining`;
          formattedDiscount.hasRemainingUses = true;
          // Also set a numeric version for frontend compatibility
          formattedDiscount.remainingUsesCount = remainingUses;
        } else {
          formattedDiscount.usageLimitDisplay = "unlimited";
          formattedDiscount.hasRemainingUses = false;
        }
      } else {
        // Not authenticated or couldn't calculate - show original usageLimit
        formattedDiscount.usageLimitDisplay =
          discount.usage_limit || "unlimited";
        formattedDiscount.hasRemainingUses = false;
      }

      return new Response(JSON.stringify(formattedDiscount), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching discount:", error);
      return new Response(JSON.stringify({error: "Failed to fetch discount"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // POST /discounts/:id/redeem (requires authentication)
  // Match both /discounts/:id/redeem and /discounts/:id/redeem/ (with trailing slash)
  // Also matches /api/discounts/:id/redeem (the /api prefix is stripped by the router)
  const redeemMatch = route.match(/^\/discounts\/([^\/]+)\/redeem\/?$/);
  if (method === "POST" && redeemMatch) {
    try {
      console.log(
        `🔍 Redeem route matched: ${route}, discountId: ${redeemMatch[1]}`,
      );

      // Extract discount ID from URL
      const discountId = redeemMatch[1];
      if (!discountId) {
        return new Response(
          JSON.stringify({error: "Discount ID is required"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // 1. Verify JWT token (required for this endpoint)
      const authHeader = getAppAuthHeader(req);
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("❌ Missing or invalid Authorization header");
        return new Response(
          JSON.stringify({error: "Unauthorized - Missing or invalid token"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const token = authHeader.replace("Bearer ", "");

      // Verify JWT token (custom JWT, not Supabase auth token)
      const jwtSecret = Deno.env.get("JWT_SECRET");

      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return new Response(
          JSON.stringify({error: "Server configuration error"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let decoded: any;
      try {
        // Convert secret string to CryptoKey for djwt v2.9 (same as when creating token)
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );
        decoded = await verifyJWT(token, secretKey);
      } catch (jwtError) {
        console.error("JWT verification error:", jwtError);
        return new Response(
          JSON.stringify({error: "Unauthorized - Invalid token"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const userId = decoded.id || decoded.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({error: "Invalid token: user ID not found"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // 2. Parse request body (optional fields)
      let requestBody: any = {};
      try {
        const bodyText = await req.text();
        if (bodyText) {
          requestBody = JSON.parse(bodyText);
        }
      } catch (e) {
        // Body is optional, so we can continue
        console.log("⚠️ No body or invalid JSON, using empty object");
      }

      const {totalBill, totalSavings} = requestBody;

      // 3. Find the discount in the database
      const {data: discount, error: discountError} = await supabase
        .from("discounts")
        .select(
          `
          *,
          vendors (
            id,
            name,
            logo_url
          )
        `,
        )
        .eq("id", discountId)
        .single();

      if (discountError || !discount) {
        if (discountError?.code === "PGRST116") {
          return new Response(JSON.stringify({error: "Discount not found"}), {
            headers: {"Content-Type": "application/json"},
            status: 404,
          });
        }
        console.error("Error fetching discount:", discountError);
        return new Response(JSON.stringify({error: "Discount not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // 4. Validate discount is active and not expired
      if (!discount.is_active) {
        return new Response(JSON.stringify({error: "Discount is not active"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Check if discount has expired
      if (discount.end_date) {
        const endDate = new Date(discount.end_date);
        const now = new Date();
        if (endDate < now) {
          return new Response(JSON.stringify({error: "Discount has expired"}), {
            headers: {"Content-Type": "application/json"},
            status: 400,
          });
        }
      }

      // 5. Check usage limits (optional - if you have this feature)
      // Uncomment and modify if you want to enforce usage limits
      if (discount.usage_limit && discount.usage_limit !== "unlimited") {
        const limit = parseInt(discount.usage_limit);

        if (!isNaN(limit) && limit > 0) {
          // Get start of current month
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          // Count redemptions for this user and discount in the current month
          const {count, error: countError} = await supabase
            .from("redemptions")
            .select("*", {count: "exact", head: true})
            .eq("user_id", userId)
            .eq("discount_id", discountId)
            .gte("redeemed_at", startOfMonth.toISOString());

          if (countError) {
            console.error("Error checking usage limit:", countError);
            // Continue if we can't check the limit (don't block redemption)
          } else if (count && count >= limit) {
            return new Response(
              JSON.stringify({
                error: `Monthly usage limit reached. You can redeem this discount ${limit} time(s) per month.`,
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 400,
              },
            );
          }
        }
      }

      // 6. Create redemption record (optional - if you have a redemptions table)
      // This tracks redemption history
      const redemptionData: any = {
        discount_id: parseInt(discountId),
        user_id: userId,
        vendor_id: discount.vendor_id || null,
        redemption_code:
          discount.discount_code || `REDEEM-${discountId}-${Date.now()}`,
        redeemed_at: new Date().toISOString(),
      };

      // Add optional fields if provided
      if (totalBill !== undefined && totalBill !== null) {
        redemptionData.total_bill = parseFloat(totalBill);
      }
      if (totalSavings !== undefined && totalSavings !== null) {
        redemptionData.total_savings = parseFloat(totalSavings);
      }

      const {data: redemption, error: redemptionError} = await supabase
        .from("redemptions")
        .insert([redemptionData])
        .select()
        .single();

      if (redemptionError) {
        console.error("Error creating redemption record:", redemptionError);
        // Don't fail the request if redemption tracking fails
      }

      // Transaction record is created by the client (DiscountApproved screen)
      // after the user enters their actual bill amount, so we don't create a
      // skeleton record here to avoid duplicate entries in transaction history.

      // 7. Calculate remaining uses after redemption
      let remainingUses: number | string | null = null;
      let availableCount: number | string | null = null;

      const usageLimit = discount.usage_limit;
      console.log(
        `📊 Calculating remaining uses after redemption for discount ${discountId}, user ${userId}, usageLimit: ${usageLimit}`,
      );

      if (usageLimit && usageLimit !== "unlimited" && usageLimit !== null) {
        const limit = parseInt(usageLimit);
        if (!isNaN(limit) && limit > 0) {
          // Get start of current month
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          // Count redemptions for this user and discount in the current month (including the one we just created)
          const {count, error: countError} = await supabase
            .from("redemptions")
            .select("*", {count: "exact", head: true})
            .eq("user_id", userId)
            .eq("discount_id", parseInt(discountId))
            .gte("redeemed_at", startOfMonth.toISOString());

          if (!countError && count !== null) {
            const used = count || 0;
            remainingUses = Math.max(0, limit - used);
            availableCount = remainingUses;
            console.log(
              `✅ Calculated remaining uses after redemption: ${remainingUses} (limit: ${limit}, used: ${used})`,
            );
          } else {
            // If we can't count, calculate based on limit
            remainingUses = Math.max(0, limit - 1); // Assume we just used one
            availableCount = remainingUses;
            console.log(
              `⚠️ Could not count redemptions, assuming remaining: ${remainingUses} (limit: ${limit} - 1)`,
            );
          }
        } else {
          remainingUses = "unlimited";
          availableCount = "unlimited";
          console.log(`ℹ️ Invalid limit format, treating as unlimited`);
        }
      } else {
        remainingUses = "unlimited";
        availableCount = "unlimited";
        console.log(`ℹ️ Usage limit is unlimited or null`);
      }

      // 8. Return success response with updated discount info
      const responseData: any = {
        success: true,
        discountCode: discount.discount_code || "N/A",
        message: "Discount redeemed successfully",
        savings: totalSavings || null,
        usageLimit: usageLimit || "unlimited",
      };

      // Add remaining uses if calculated
      if (remainingUses !== null) {
        responseData.remainingUses = remainingUses;
        responseData.availableCount = availableCount;
        // Add display fields for frontend compatibility
        if (typeof remainingUses === "number") {
          responseData.usageLimitDisplay = `${remainingUses} remaining`;
          responseData.remainingUsesCount = remainingUses;
          responseData.hasRemainingUses = true;
        } else {
          responseData.usageLimitDisplay = "unlimited";
          responseData.hasRemainingUses = false;
        }
      } else {
        responseData.usageLimitDisplay = usageLimit || "unlimited";
        responseData.hasRemainingUses = false;
      }

      // Also include full discount info for the "Discount Redeemed" page
      responseData.discount = {
        id: discount.id,
        title: discount.title,
        description: discount.description,
        discountCode: discount.discount_code,
        discountType: discount.discount_type,
        discountValue: discount.discount_value,
        usageLimit: usageLimit || "unlimited",
        remainingUses: remainingUses,
        availableCount: availableCount,
        usageLimitDisplay: responseData.usageLimitDisplay,
        remainingUsesCount:
          typeof remainingUses === "number" ? remainingUses : null,
        hasRemainingUses: responseData.hasRemainingUses,
      };

      return new Response(JSON.stringify(responseData), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error redeeming discount:", error);
      return new Response(
        JSON.stringify({error: error.message || "Internal server error"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // No route matched - return 404
  console.log(`❌ Discount route not matched: ${method} ${route}`);
  return new Response(JSON.stringify({error: "Discount route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Charities routes handler
// Referral route handler
async function handleReferralRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // Get user ID from JWT token
  const authHeader = getAppAuthHeader(req);
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({error: "Unauthorized"}), {
      headers: {"Content-Type": "application/json"},
      status: 401,
    });
  }

  const token = authHeader.substring(7);
  const jwtSecret = Deno.env.get("JWT_SECRET");

  if (!jwtSecret) {
    return new Response(JSON.stringify({error: "Server configuration error"}), {
      headers: {"Content-Type": "application/json"},
      status: 500,
    });
  }

  let userId: number | null = null;
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
    return new Response(JSON.stringify({error: "Invalid token"}), {
      headers: {"Content-Type": "application/json"},
      status: 401,
    });
  }

  // GET /referrals/info - Get referral information
  if (method === "GET" && route === "/referrals/info") {
    try {
      // Get paid referrals count
      const {data: paidReferrals, error: paidError} = await supabase
        .from("referrals")
        .select(
          "id, referred_user_id, status, monthly_donation_amount, first_payment_at",
        )
        .eq("referrer_id", userId)
        .eq("status", "paid");

      if (paidError) {
        console.error("❌ Error fetching paid referrals:", paidError);
      }

      const paidCount = paidReferrals?.length || 0;

      // Get all referrals count
      const {data: allReferrals, error: allError} = await supabase
        .from("referrals")
        .select("id")
        .eq("referrer_id", userId);

      if (allError) {
        console.error("❌ Error fetching all referrals:", allError);
      }

      const totalCount = allReferrals?.length || 0;

      const milestoneTypes = REFERRAL_TIERS.map((t) => t.milestoneType);
      const {data: milestoneRows, error: milestonesError} = await supabase
        .from("user_milestones")
        .select(
          "milestone_type, milestone_count, badge_name, reward_description, unlocked_at",
        )
        .eq("user_id", userId)
        .in("milestone_type", milestoneTypes);

      if (milestonesError) {
        console.error("❌ Error fetching milestones:", milestonesError);
      }

      const byMilestoneType = new Map<string, {unlocked_at: string | null}>(
        (milestoneRows || []).map((r: any) => [
          r.milestone_type,
          {unlocked_at: r.unlocked_at},
        ]),
      );

      const tierPayload = REFERRAL_TIERS.map((t) => {
        const row = byMilestoneType.get(t.milestoneType);
        return {
          threshold: t.threshold,
          count: t.threshold,
          badgeName: t.badgeName,
          title: t.title,
          description: t.description,
          unlocked: !!row,
          earnedAt: row ? row.unlocked_at : null,
        };
      });

      const tiersUnlocked = tierPayload.filter((x) => x.unlocked).length;

      // Generate referral link
      const appBaseUrl =
        Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";
      const referralLink = `${appBaseUrl}/signup?ref=${userId}`;

      return new Response(
        JSON.stringify({
          referralLink,
          friendsCount: totalCount,
          paidFriendsCount: paidCount,
          totalEarned: "0",
          tiersTotal: REFERRAL_TIERS.length,
          tiersUnlocked,
          tiers: tierPayload,
          milestones: tierPayload,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Referral Info Error:", error);
      return new Response(
        JSON.stringify({error: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /referrals/friends - Get list of referred friends
  if (method === "GET" && route === "/referrals/friends") {
    try {
      // Get all referrals with user details
      const {data: referrals, error: referralsError} = await supabase
        .from("referrals")
        .select(
          `
          id,
          referred_user_id,
          status,
          monthly_donation_amount,
          first_payment_at,
          last_payment_at,
          created_at,
          referred_user:referred_user_id (
            id,
            email,
            first_name,
            last_name
          )
        `,
        )
        .eq("referrer_id", userId)
        .order("created_at", {ascending: false});

      if (referralsError) {
        console.error("❌ Error fetching referrals:", referralsError);
        return new Response(
          JSON.stringify({error: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Format friends list
      const friends = (referrals || []).map((ref: any) => {
        const user = ref.referred_user || {};
        return {
          id: user.id || ref.referred_user_id,
          name:
            user.first_name && user.last_name
              ? `${user.first_name} ${user.last_name}`
              : user.email?.split("@")[0] || "Unknown",
          email: user.email || "N/A",
          status: ref.status, // 'pending', 'signed_up', 'payment_setup', 'paid', 'cancelled'
          monthlyDonation: ref.monthly_donation_amount
            ? parseFloat(ref.monthly_donation_amount)
            : null,
          joinedAt: ref.created_at,
          firstPaymentAt: ref.first_payment_at,
        };
      });

      return new Response(JSON.stringify({friends}), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("❌ Referral Friends Error:", error);
      return new Response(
        JSON.stringify({error: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // 404 for referral routes
  return new Response(JSON.stringify({error: "Referral route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Stripe payment sheet route handler
async function handleStripePaymentSheetRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
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
      const {beneficiary_id, amount, currency = "USD"} = body;

      if (!beneficiary_id || !amount) {
        return new Response(
          JSON.stringify({error: "beneficiary_id and amount are required"}),
          {headers: {"Content-Type": "application/json"}, status: 400},
        );
      }

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

      // Create PaymentIntent attached to the customer
      const piFormData = new URLSearchParams();
      piFormData.append("amount", Math.round(parseFloat(amount) * 100).toString());
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

// One-time gift route handler
async function handleOneTimeGiftRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // Get user ID from JWT token (for user endpoints)
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
      } catch (error) {
        // Invalid token - will be handled per endpoint
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

      // Build query (try beneficiaries first, fallback to charities)
      let query = supabase
        .from("one_time_gifts")
        .select("*, beneficiaries!inner(id, name, logo_url)", {count: "exact"})
        .eq("user_id", userId)
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      if (beneficiaryId) {
        query = query.eq("beneficiary_id", beneficiaryId);
      }

      // Try beneficiaries query first
      let {data: gifts, error: giftsError, count} = await query;
      let finalGifts = gifts;
      let finalCount = count;

      // If beneficiaries query fails, try charities table
      if (
        giftsError &&
        (giftsError.message?.includes("beneficiaries") ||
          giftsError.message?.includes("relation") ||
          giftsError.code === "PGRST116")
      ) {
        const charitiesQuery = supabase
          .from("one_time_gifts")
          .select("*, charities!inner(id, name, logo_url)", {count: "exact"})
          .eq("user_id", userId)
          .order("created_at", {ascending: false})
          .range(offset, offset + limit - 1);

        if (beneficiaryId) {
          charitiesQuery.eq("beneficiary_id", beneficiaryId);
        }

        const charitiesResult = await charitiesQuery;
        finalGifts = charitiesResult.data;
        finalCount = charitiesResult.count;
        giftsError = charitiesResult.error;
      }

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

      // Format gifts
      const formattedGifts = (finalGifts || []).map((gift: any) => ({
        id: gift.id,
        beneficiary_id: gift.beneficiary_id,
        beneficiary_name:
          gift.beneficiaries?.name || gift.charities?.name || "Unknown",
        beneficiary_image_url:
          gift.beneficiaries?.logo_url || gift.charities?.logo_url || null,
        amount: parseFloat(gift.amount),
        net_amount: parseFloat(gift.net_amount),
        status: gift.status,
        date: new Date(gift.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
        donor_message: gift.donor_message,
        is_anonymous: gift.is_anonymous,
      }));

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

// Webhook route handler
async function handleWebhookRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // POST /webhooks/stripe - Stripe webhook handler
  if (method === "POST" && route === "/webhooks/stripe") {
    try {
      const stripeSignature = req.headers.get("stripe-signature");
      const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

      if (!stripeSignature || !webhookSecret) {
        return new Response(
          JSON.stringify({error: "Missing webhook signature or secret"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Get raw body for signature verification
      const body = await req.text();

      // Note: In production, you should verify the Stripe signature
      // For now, we'll process the event (you can add signature verification later)
      const event = JSON.parse(body);

      console.log("📥 Stripe webhook received:", event.type);

      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;

          // Find gift by payment intent ID (try beneficiaries first, fallback to charities)
          let gift: any = null;
          let giftError: any = null;

          const beneficiariesGift = await supabase
            .from("one_time_gifts")
            .select("*, beneficiaries!inner(id, name)")
            .eq("stripe_payment_intent_id", paymentIntent.id)
            .single();

          if (!beneficiariesGift.error && beneficiariesGift.data) {
            gift = beneficiariesGift.data;
          } else {
            const charitiesGift = await supabase
              .from("one_time_gifts")
              .select("*, charities!inner(id, name)")
              .eq("stripe_payment_intent_id", paymentIntent.id)
              .single();
            gift = charitiesGift.data;
            giftError = charitiesGift.error;
          }

          if (giftError || !gift) {
            console.error(
              "❌ Gift not found for payment intent:",
              paymentIntent.id,
            );
            break;
          }

          // Only update if not already succeeded
          if (gift.status !== "succeeded") {
            const charge =
              paymentIntent.charges?.data?.[0] || paymentIntent.latest_charge;
            const chargeId = typeof charge === "string" ? charge : charge?.id;

            // Extract payment method details
            const paymentMethod = paymentIntent.payment_method;
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
            await supabase
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

            // Update beneficiary totals (try beneficiaries first, fallback to charities)
            const beneficiaryTable = gift.beneficiaries
              ? "beneficiaries"
              : "charities";
            const {data: charity} = await supabase
              .from(beneficiaryTable)
              .select("total_one_time_gifts, one_time_gifts_count")
              .eq("id", gift.beneficiary_id)
              .single();

            if (charity) {
              await supabase
                .from(beneficiaryTable)
                .update({
                  total_one_time_gifts:
                    parseFloat(charity.total_one_time_gifts || 0) +
                    parseFloat(gift.net_amount),
                  one_time_gifts_count:
                    parseInt(charity.one_time_gifts_count || 0) + 1,
                  last_one_time_gift_at: new Date().toISOString(),
                })
                .eq("id", gift.beneficiary_id);
            }

            // Update user totals
            const {data: user} = await supabase
              .from("users")
              .select("total_one_time_gifts_given, one_time_gifts_count")
              .eq("id", gift.user_id)
              .single();

            if (user) {
              await supabase
                .from("users")
                .update({
                  total_one_time_gifts_given:
                    parseFloat(user.total_one_time_gifts_given || 0) +
                    parseFloat(gift.amount),
                  one_time_gifts_count:
                    parseInt(user.one_time_gifts_count || 0) + 1,
                  last_one_time_gift_at: new Date().toISOString(),
                })
                .eq("id", gift.user_id);
            }

            // Create transaction record — upsert on gift_id to be idempotent
            await supabase.from("transactions").upsert(
              [
                {
                  user_id: gift.user_id,
                  type: "one_time_gift",
                  amount: parseFloat(gift.amount),
                  description: `One-time gift to beneficiary ${gift.beneficiary_id}`,
                  reference_id: gift.id,
                  reference_type: "gift",
                  gift_id: gift.id,
                  beneficiary_id: gift.beneficiary_id,
                  status: "completed",
                },
              ],
              { onConflict: "gift_id", ignoreDuplicates: true },
            );

            console.log("✅ Gift updated to succeeded:", gift.id);
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object;

          // Find gift by payment intent ID
          const {data: gift, error: giftError} = await supabase
            .from("one_time_gifts")
            .select("id")
            .eq("stripe_payment_intent_id", paymentIntent.id)
            .single();

          if (!giftError && gift) {
            const failureReason =
              paymentIntent.last_payment_error?.message || "Payment failed";

            await supabase
              .from("one_time_gifts")
              .update({
                status: "failed",
                failure_reason: failureReason,
                failed_at: new Date().toISOString(),
              })
              .eq("id", gift.id);

            console.log("❌ Gift marked as failed:", gift.id);
          }
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object;

          // Find gift by charge ID
          const {data: gift, error: giftError} = await supabase
            .from("one_time_gifts")
            .select("id, amount, beneficiary_id, user_id")
            .eq("stripe_charge_id", charge.id)
            .single();

          if (!giftError && gift) {
            const refundAmount = charge.amount_refunded / 100; // Convert from cents

            await supabase
              .from("one_time_gifts")
              .update({
                status: "refunded",
                refund_amount: refundAmount,
                refunded_at: new Date().toISOString(),
              })
              .eq("id", gift.id);

            // Update beneficiary totals (subtract refunded amount) - try beneficiaries first
            const beneficiaryTable = gift.beneficiaries
              ? "beneficiaries"
              : "charities";
            const {data: charity} = await supabase
              .from(beneficiaryTable)
              .select("total_one_time_gifts")
              .eq("id", gift.beneficiary_id)
              .single();

            if (charity) {
              await supabase
                .from(beneficiaryTable)
                .update({
                  total_one_time_gifts: Math.max(
                    0,
                    parseFloat(charity.total_one_time_gifts || 0) -
                      refundAmount,
                  ),
                })
                .eq("id", gift.beneficiary_id);
            }

            // Update user totals (subtract refunded amount)
            const {data: user} = await supabase
              .from("users")
              .select("total_one_time_gifts_given")
              .eq("id", gift.user_id)
              .single();

            if (user) {
              await supabase
                .from("users")
                .update({
                  total_one_time_gifts_given: Math.max(
                    0,
                    parseFloat(user.total_one_time_gifts_given || 0) -
                      refundAmount,
                  ),
                })
                .eq("id", gift.user_id);
            }

            console.log("💰 Gift refunded:", gift.id);
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;

          if (subscriptionId) {
            // Find monthly donation by subscription ID
            const {data: donation, error: donationError} = await supabase
              .from("monthly_donations")
              .select("*")
              .eq("stripe_subscription_id", subscriptionId)
              .single();

            if (!donationError && donation) {
              const amount = invoice.amount_paid / 100; // Convert from cents
              const nextPaymentDate = new Date();
              nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

              // Update monthly donation
              await supabase
                .from("monthly_donations")
                .update({
                  status: "active",
                  last_payment_date: new Date().toISOString().split("T")[0],
                  last_payment_amount: amount,
                  next_payment_date: nextPaymentDate
                    .toISOString()
                    .split("T")[0],
                })
                .eq("id", donation.id);

              // Create transaction record — upsert on stripe_invoice_id to be idempotent
              await supabase.from("transactions").upsert(
                [
                  {
                    user_id: donation.user_id,
                    type: "monthly_donation",
                    amount: amount,
                    description: `Monthly donation to beneficiary ${donation.beneficiary_id}`,
                    reference_id: invoice.id,
                    reference_type: "donation",
                    donation_id: donation.id,
                    beneficiary_id: donation.beneficiary_id,
                    status: "completed",
                  },
                ],
                { onConflict: "reference_id", ignoreDuplicates: true },
              );

              console.log(
                "✅ Monthly donation payment succeeded:",
                donation.id,
              );

              // First successful subscription payment → mark referral paid and run milestone RPC once
              const {data: referralRow} = await supabase
                .from("referrals")
                .select("status")
                .eq("referred_user_id", donation.user_id)
                .maybeSingle();

              if (referralRow && referralRow.status !== "paid") {
                await updateReferralStatus(
                  supabase,
                  donation.user_id,
                  "paid",
                  amount,
                  typeof subscriptionId === "string"
                    ? subscriptionId
                    : String(subscriptionId),
                );
              }
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;

          if (subscriptionId) {
            const {data: donation} = await supabase
              .from("monthly_donations")
              .select("id")
              .eq("stripe_subscription_id", subscriptionId)
              .single();

            if (donation) {
              await supabase
                .from("monthly_donations")
                .update({
                  status: "past_due",
                })
                .eq("id", donation.id);

              console.log("❌ Monthly donation payment failed:", donation.id);
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object;

          const {data: donation} = await supabase
            .from("monthly_donations")
            .select("id")
            .eq("stripe_subscription_id", subscription.id)
            .single();

          if (donation) {
            const statusMap: Record<string, string> = {
              active: "active",
              past_due: "past_due",
              canceled: "cancelled",
              unpaid: "past_due",
              trialing: "active",
              paused: "paused",
            };

            await supabase
              .from("monthly_donations")
              .update({
                status: statusMap[subscription.status] || subscription.status,
              })
              .eq("id", donation.id);

            console.log(
              "📝 Subscription updated:",
              subscription.id,
              subscription.status,
            );
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;

          const {data: donation} = await supabase
            .from("monthly_donations")
            .select("id")
            .eq("stripe_subscription_id", subscription.id)
            .single();

          if (donation) {
            await supabase
              .from("monthly_donations")
              .update({
                status: "cancelled",
              })
              .eq("id", donation.id);

            console.log("🗑️ Subscription cancelled:", subscription.id);
          }
          break;
        }

        default:
          console.log("⚠️ Unhandled webhook event type:", event.type);
      }

      return new Response(JSON.stringify({received: true}), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("❌ Webhook Error:", error);
      return new Response(
        JSON.stringify({error: "Webhook processing failed"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // 404 for webhook routes
  return new Response(JSON.stringify({error: "Webhook route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

async function handleCharityRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /charities (public)
  if (method === "GET" && route === "/charities") {
    try {
      // Get query parameters for filtering
      const url = new URL(req.url);
      const category = url.searchParams.get("category");
      const isActive = url.searchParams.get("isActive");

      let query = supabase.from("charities").select("*");

      // Filter by category if provided
      if (category && category !== "All") {
        query = query.eq("category", category);
      }

      // Only show active charities (is_active = true); exclude soft-deleted ones (is_active = false)
      if (isActive === "false") {
        query = query.eq("is_active", false);
      } else {
        query = query.eq("is_active", true);
      }

      const {data: charities, error} = await query.order("name", {
        ascending: true,
      });

      console.log(`📊 GET /charities active count: ${charities?.length ?? 0}`);

      if (error) {
        console.error("Error fetching charities:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch charities"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log(
        `📊 GET /charities - Found ${charities?.length || 0} active, verified charities`,
      );

      // Use formatCharityResponse for consistency (includes all fields including impact metrics)
      const formattedCharities = (charities || []).map((charity: any) =>
        formatCharityResponse(charity),
      );

      return new Response(JSON.stringify({charities: formattedCharities}), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching charities:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch charities"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /charities/:id (public)
  const charityIdMatch = route.match(/^\/charities\/(\d+)$/);
  if (method === "GET" && charityIdMatch) {
    try {
      const charityId = charityIdMatch[1];

      const {data: charity, error} = await supabase
        .from("charities")
        .select("*")
        .eq("id", charityId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(JSON.stringify({error: "Charity not found"}), {
            headers: {"Content-Type": "application/json"},
            status: 404,
          });
        }
        console.error("Error fetching charity:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch charity"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Use formatCharityResponse for consistency (includes all fields including impact metrics, stories, etc.)
      const formattedCharity = formatCharityResponse(charity);

      return new Response(JSON.stringify(formattedCharity), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching charity:", error);
      return new Response(JSON.stringify({error: "Failed to fetch charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // POST /charities (requires auth - will be handled by middleware)
  if (method === "POST" && route === "/charities") {
    try {
      const body = await req.json();
      const {
        name,
        category,
        type,
        description,
        about,
        website,
        email,
        phone,
        social,
        location,
        latitude,
        longitude,
        ein,
        imageUrl,
        logoUrl,
        likes,
        mutual,
        isActive,
        address,
      } = body;

      if (!name) {
        return new Response(
          JSON.stringify({error: "Charity name is required"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const charityData: any = {
        name,
        category: category || null,
        type: type || null,
        description: description || null,
        about: about || description || null,
        website: website || null,
        email: email || null,
        phone: phone || null,
        social: social || null,
        location: location || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        ein: ein || null,
        image_url: imageUrl || logoUrl || null,
        logo_url: logoUrl || imageUrl || null,
        likes: likes ? parseInt(likes) : 0,
        mutual: mutual ? parseInt(mutual) : 0,
        is_active: isActive !== false,
        address: address || null,
      };

      const {data: newCharity, error: insertError} = await supabase
        .from("charities")
        .insert([charityData])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating charity:", insertError);
        return new Response(JSON.stringify({error: insertError.message}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      return new Response(JSON.stringify(newCharity), {
        headers: {"Content-Type": "application/json"},
        status: 201,
      });
    } catch (error) {
      console.error("Error creating charity:", error);
      return new Response(JSON.stringify({error: "Failed to create charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // DELETE /charities/:id (requires auth)
  const deleteCharityMatch = route.match(/^\/charities\/(\d+)$/);
  if (method === "DELETE" && deleteCharityMatch) {
    try {
      const charityId = deleteCharityMatch[1];

      const {error} = await supabase
        .from("charities")
        .delete()
        .eq("id", charityId);

      if (error) {
        console.error("Error deleting charity:", error);
        return new Response(JSON.stringify({error: error.message}), {
          headers: {"Content-Type": "application/json"},
          status: 500,
        });
      }

      return new Response(
        JSON.stringify({message: "Charity deleted successfully"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error deleting charity:", error);
      return new Response(JSON.stringify({error: "Failed to delete charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // GET /charities/:id/one-time-gifts/stats
  const statsMatch = route.match(/^\/charities\/(\d+)\/one-time-gifts\/stats$/);
  if (method === "GET" && statsMatch) {
    try {
      const charityId = parseInt(statsMatch[1]);

      if (!charityId) {
        return new Response(JSON.stringify({error: "Invalid charity ID"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Get charity/beneficiary info (try beneficiaries first, fallback to charities)
      let charity: any = null;
      let charityError: any = null;

      const beneficiariesResult = await supabase
        .from("beneficiaries")
        .select("id, name")
        .eq("id", charityId)
        .single();

      if (!beneficiariesResult.error && beneficiariesResult.data) {
        charity = beneficiariesResult.data;
      } else {
        const charitiesResult = await supabase
          .from("charities")
          .select("id, name")
          .eq("id", charityId)
          .single();
        charity = charitiesResult.data;
        charityError = charitiesResult.error;
      }

      if (charityError || !charity) {
        return new Response(JSON.stringify({error: "Charity not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Get all successful gifts for this beneficiary
      const {data: gifts, error: giftsError} = await supabase
        .from("one_time_gifts")
        .select("amount, net_amount, created_at, is_anonymous")
        .eq("beneficiary_id", charityId)
        .eq("status", "succeeded")
        .order("created_at", {ascending: false});

      if (giftsError) {
        console.error("❌ Error fetching gift stats:", giftsError);
        return new Response(
          JSON.stringify({error: "Failed to fetch gift stats"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisYear = new Date(now.getFullYear(), 0, 1);

      const totalReceived =
        gifts?.reduce((sum, g) => sum + parseFloat(g.net_amount || 0), 0) || 0;
      const totalCount = gifts?.length || 0;
      const averageGift = totalCount > 0 ? totalReceived / totalCount : 0;
      const thisMonthGifts =
        gifts?.filter((g) => new Date(g.created_at) >= thisMonth) || [];
      const thisYearGifts =
        gifts?.filter((g) => new Date(g.created_at) >= thisYear) || [];
      const thisMonthTotal = thisMonthGifts.reduce(
        (sum, g) => sum + parseFloat(g.net_amount || 0),
        0,
      );
      const thisYearTotal = thisYearGifts.reduce(
        (sum, g) => sum + parseFloat(g.net_amount || 0),
        0,
      );
      const largestGift =
        gifts?.length > 0
          ? Math.max(...gifts.map((g) => parseFloat(g.amount || 0)))
          : 0;

      // Get recent gifts (last 10)
      const recentGifts = (gifts || []).slice(0, 10).map((gift: any) => ({
        amount: parseFloat(gift.amount),
        date: new Date(gift.created_at).toISOString().split("T")[0],
        is_anonymous: gift.is_anonymous,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          beneficiary_id: charityId,
          beneficiary_name: charity.name,
          stats: {
            total_received: totalReceived.toFixed(2),
            total_count: totalCount,
            average_gift: averageGift.toFixed(2),
            this_month: thisMonthTotal.toFixed(2),
            this_year: thisYearTotal.toFixed(2),
            largest_gift: largestGift.toFixed(2),
            recent_gifts: recentGifts,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Beneficiary Stats Error:", error);
      return new Response(
        JSON.stringify({error: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Charity route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Donations routes handler
async function handleDonationRoute(
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

      // Persist the chosen beneficiary on the user record so the admin and
      // profile endpoint always reflect the current preferred charity.
      try {
        const updatedPreferences = {
          ...(user.preferences || {}),
          preferredCharity: beneficiary_id,
        };
        await supabase
          .from("users")
          .update({preferences: updatedPreferences})
          .eq("id", userId);
      } catch (e) {
        console.warn("Could not update preferred charity on user:", e);
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

  // DELETE /donations/monthly/subscription/:id
  const deleteSubscriptionMatch = route.match(
    /^\/donations\/monthly\/subscription\/(\d+)$/,
  );
  if (method === "DELETE" && deleteSubscriptionMatch) {
    if (!userId) {
      return new Response(JSON.stringify({error: "Unauthorized"}), {
        headers: {"Content-Type": "application/json"},
        status: 401,
      });
    }

    try {
      const subscriptionId = parseInt(deleteSubscriptionMatch[1]);

      // Get subscription
      const {data: subscription, error: fetchError} = await supabase
        .from("monthly_donations")
        .select("*")
        .eq("id", subscriptionId)
        .eq("user_id", userId)
        .single();

      if (fetchError || !subscription) {
        return new Response(JSON.stringify({error: "Subscription not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Cancel Stripe subscription
      if (subscription.stripe_subscription_id) {
        const stripe = getStripeClient();
        await fetch(
          `${stripe.baseUrl}/subscriptions/${subscription.stripe_subscription_id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${stripe.secretKey}`,
            },
          },
        );
      }

      // Update status in database
      await supabase
        .from("monthly_donations")
        .update({status: "cancelled"})
        .eq("id", subscriptionId);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription cancelled successfully",
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
async function handleTransactionRoute(
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

  // GET /transactions
  if (method === "GET" && route === "/transactions") {
    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const type = url.searchParams.get("type");
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");

      let query = supabase
        .from("transactions")
        .select("*, vendors(id, name, logo_url)", {count: "exact"})
        .eq("user_id", userId)
        .order("created_at", {ascending: false})
        .range((page - 1) * limit, page * limit - 1);

      if (type) {
        query = query.eq("type", type);
      }
      if (startDate) {
        query = query.gte("created_at", startDate);
      }
      if (endDate) {
        query = query.lte("created_at", endDate);
      }

      const {data: transactions, error, count} = await query;

      if (error) {
        return new Response(
          JSON.stringify({error: "Failed to fetch transactions"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          transactions: transactions || [],
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch transactions"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /transactions
  if (method === "POST" && route === "/transactions") {
    try {
      const body = await req.json();
      const {
        type,
        amount,
        description,
        reference_id,
        reference_type,
        metadata,
        ...otherFields
      } = body;

      if (!type) {
        return new Response(JSON.stringify({error: "type is required"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      const {data: transaction, error} = await supabase
        .from("transactions")
        .insert([
          {
            user_id: userId,
            type,
            amount: amount ? parseFloat(amount) : null,
            description,
            reference_id,
            reference_type,
            metadata: metadata || {},
            ...otherFields,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creating transaction:", error);
        return new Response(
          JSON.stringify({error: "Failed to create transaction"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          transaction,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating transaction:", error);
      return new Response(
        JSON.stringify({error: "Failed to create transaction"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /transactions/summary
  if (method === "GET" && route === "/transactions/summary") {
    try {
      const {data: transactions, error} = await supabase
        .from("transactions")
        .select("type, amount, status")
        .eq("user_id", userId);

      if (error) {
        return new Response(
          JSON.stringify({error: "Failed to fetch transactions"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const summary: any = {
        total: 0,
        by_type: {},
      };

      (transactions || []).forEach((t: any) => {
        if (t.status === "completed" && t.amount) {
          summary.total += parseFloat(t.amount);
          if (!summary.by_type[t.type]) {
            summary.by_type[t.type] = 0;
          }
          summary.by_type[t.type] += parseFloat(t.amount);
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          summary,
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

  return new Response(JSON.stringify({error: "Transaction route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Payment method route handler (placeholder - uses Stripe directly)
async function handlePaymentMethodRoute(
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
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (!user?.stripe_customer_id) {
    return new Response(
      JSON.stringify({
        error: "No Stripe customer found. Please create a subscription first.",
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 404,
      },
    );
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
async function handleUserPointsRoute(
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

  // GET /user/points
  if (method === "GET" && route === "/user/points") {
    try {
      const {data: user} = await supabase
        .from("users")
        .select("points")
        .eq("id", userId)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          points: user?.points || 0,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      return new Response(JSON.stringify({error: "Failed to fetch points"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // POST /user/points/add
  if (method === "POST" && route === "/user/points/add") {
    try {
      const body = await req.json();
      const {
        points,
        type = "earned",
        description,
        reference_id,
        reference_type,
      } = body;

      if (!points || points <= 0) {
        return new Response(
          JSON.stringify({error: "points must be a positive number"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Create points transaction
      const {error: txError} = await supabase
        .from("points_transactions")
        .insert([
          {
            user_id: userId,
            points: parseInt(points),
            type,
            description,
            reference_id,
            reference_type,
          },
        ]);

      if (txError) {
        console.error("Error creating points transaction:", txError);
        return new Response(JSON.stringify({error: "Failed to add points"}), {
          headers: {"Content-Type": "application/json"},
          status: 500,
        });
      }

      // Update user's points balance
      const {data: user} = await supabase
        .from("users")
        .select("points")
        .eq("id", userId)
        .single();

      const newBalance = (user?.points || 0) + parseInt(points);

      await supabase
        .from("users")
        .update({points: newBalance})
        .eq("id", userId);

      return new Response(
        JSON.stringify({
          success: true,
          points: newBalance,
          added: parseInt(points),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error adding points:", error);
      return new Response(JSON.stringify({error: "Failed to add points"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // GET /user/points/history
  if (method === "GET" && route === "/user/points/history") {
    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const type = url.searchParams.get("type");

      let query = supabase
        .from("points_transactions")
        .select("*", {count: "exact"})
        .eq("user_id", userId)
        .order("created_at", {ascending: false})
        .range((page - 1) * limit, page * limit - 1);

      if (type) {
        query = query.eq("type", type);
      }

      const {data: transactions, error, count} = await query;

      if (error) {
        return new Response(
          JSON.stringify({error: "Failed to fetch points history"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          transactions: transactions || [],
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching points history:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch points history"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Points route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Invitation route handler
async function handleInvitationRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // Get user ID from JWT token (optional - allows unauthenticated requests for beneficiary requests)
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
        // Invalid token - continue without userId (for unauthenticated requests)
      }
    }
  }

  // For vendor invitations, require authentication
  if (method === "POST" && route === "/invitations/vendor" && !userId) {
    return new Response(JSON.stringify({error: "Unauthorized"}), {
      headers: {"Content-Type": "application/json"},
      status: 401,
    });
  }

  // For GET /invitations, require authentication (users viewing their own invitations)
  if (method === "GET" && route === "/invitations" && !userId) {
    return new Response(JSON.stringify({error: "Unauthorized"}), {
      headers: {"Content-Type": "application/json"},
      status: 401,
    });
  }

  // For GET /invitations/:id/status, require authentication
  const statusRouteMatch = route.match(/^\/invitations\/(\d+)\/status$/);
  if (method === "GET" && statusRouteMatch && !userId) {
    return new Response(JSON.stringify({error: "Unauthorized"}), {
      headers: {"Content-Type": "application/json"},
      status: 401,
    });
  }

  // Beneficiary invitations allow unauthenticated requests (for signup flow and home page)

  // POST /invitations/vendor
  if (method === "POST" && route === "/invitations/vendor") {
    try {
      const body = await req.json();
      const {contact_name: bodyContactName, company_name, email: bodyEmail, phone, website, message} = body;

      // Auto-populate contact info from authenticated user if not supplied
      let contact_name = bodyContactName;
      let email = bodyEmail;
      if (userId && (!contact_name || !email)) {
        const {data: userData} = await supabase
          .from("users")
          .select("first_name, last_name, email")
          .eq("id", userId)
          .single();
        if (userData) {
          contact_name = contact_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim();
          email = email || userData.email;
        }
      }

      if (!contact_name || !email) {
        return new Response(
          JSON.stringify({error: "contact_name and email are required"}),
          {headers: {"Content-Type": "application/json"}, status: 400},
        );
      }

      const {data: invitation, error} = await supabase
        .from("invitations")
        .insert([
          {
            user_id: userId,
            type: "vendor",
            contact_name,
            company_name,
            email,
            phone,
            website,
            message,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creating invitation:", error);
        return new Response(
          JSON.stringify({error: "Failed to create invitation"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitation,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating vendor invitation:", error);
      return new Response(
        JSON.stringify({error: "Failed to create invitation"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /invitations/beneficiary
  // Allow unauthenticated requests (for signup flow and home page)
  if (method === "POST" && route === "/invitations/beneficiary") {
    try {
      const body = await req.json();
      const {contact_name: bodyContactName, company_name, email: bodyEmail, phone, website, message} = body;

      // Auto-populate contact info from authenticated user if not supplied
      let contact_name = bodyContactName;
      let email = bodyEmail;
      if (userId && (!contact_name || !email)) {
        const {data: userData} = await supabase
          .from("users")
          .select("first_name, last_name, email")
          .eq("id", userId)
          .single();
        if (userData) {
          contact_name = contact_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim();
          email = email || userData.email;
        }
      }

      if (!contact_name || !email) {
        return new Response(
          JSON.stringify({error: "contact_name and email are required"}),
          {headers: {"Content-Type": "application/json"}, status: 400},
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({error: "Invalid email format"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // userId is optional - if not authenticated, set to null
      // This allows requests from signup flow and home page
      const {data: invitation, error} = await supabase
        .from("invitations")
        .insert([
          {
            user_id: userId, // null if not authenticated, user_id if authenticated
            type: "beneficiary",
            contact_name: capitalizeName(contact_name),
            company_name: company_name ? capitalizeName(company_name) : null,
            email: email.toLowerCase().trim(),
            phone: phone || null,
            website: website || null,
            message: message || null,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creating invitation:", error);
        return new Response(
          JSON.stringify({error: "Failed to create invitation"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitation,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating beneficiary invitation:", error);
      return new Response(
        JSON.stringify({error: "Failed to create invitation"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /invitations
  if (method === "GET" && route === "/invitations") {
    try {
      const url = new URL(req.url);
      const type = url.searchParams.get("type");
      const status = url.searchParams.get("status");

      let query = supabase
        .from("invitations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", {ascending: false});

      if (type) {
        query = query.eq("type", type);
      }
      if (status) {
        query = query.eq("status", status);
      }

      const {data: invitations, error} = await query;

      if (error) {
        return new Response(
          JSON.stringify({error: "Failed to fetch invitations"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitations: invitations || [],
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching invitations:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch invitations"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /invitations/:id/status
  const statusMatch = route.match(/^\/invitations\/(\d+)\/status$/);
  if (method === "GET" && statusMatch) {
    try {
      const invitationId = parseInt(statusMatch[1]);

      const {data: invitation, error} = await supabase
        .from("invitations")
        .select("id, status, created_at, updated_at")
        .eq("id", invitationId)
        .eq("user_id", userId)
        .single();

      if (error || !invitation) {
        return new Response(JSON.stringify({error: "Invitation not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitation: {
            id: invitation.id,
            status: invitation.status,
            created_at: invitation.created_at,
            updated_at: invitation.updated_at,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching invitation status:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch invitation status"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Invitation route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

async function handleUploadRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  if (method === "POST" && route === "/uploads") {
    try {
      const {bucket, path, file, contentType} = await req.json();

      if (!bucket || !path || !file || !contentType) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing required fields: bucket, path, file, contentType",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      let fileData: Uint8Array;
      try {
        const base64Data = file.includes(",") ? file.split(",")[1] : file;
        fileData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid base64 file data",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {error: uploadError} = await supabase.storage
        .from(bucket)
        .upload(path, fileData, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("❌ Storage upload error:", uploadError);
        return new Response(
          JSON.stringify({
            success: false,
            error: uploadError.message || "Failed to upload file",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const {data: urlData} = supabase.storage.from(bucket).getPublicUrl(path);

      return new Response(
        JSON.stringify({success: true, url: urlData.publicUrl}),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Storage upload error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error. Please try again later.",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Upload route not found"}), {
    headers: {...corsHeaders, "Content-Type": "application/json"},
    status: 404,
  });
}
