// Supabase Edge Function - Main API Router
// Handles all API routes: vendors, admin, auth, discounts, charities, donations

import {serve} from "https://deno.land/std@0.208.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {
  create as createJWT,
  verify as verifyJWT,
} from "https://deno.land/x/djwt@v2.9/mod.ts";

import { corsHeaders } from "./lib/cors.ts";
import { bcryptHash, bcryptCompare } from "./lib/password.ts";
import { capitalizeName } from "./lib/strings.ts";
import { geocodeAddress } from "./lib/geocoding.ts";
import { getAppAuthHeader, getJwtPayload } from "./lib/jwt-app.ts";
import {
  getStripeClient,
  createStripePaymentIntent,
  confirmStripePaymentIntent,
  getStripePaymentIntent,
  createStripeRefund,
  createOrGetStripeCustomer,
  createStripeSubscriptionSetup,
} from "./lib/stripe.ts";
import { handleFeedbackRoute } from "./routes/feedback.ts";
import { handleWebhookRoute } from "./routes/webhooks.ts";
import { handleStripePaymentSheetRoute } from "./routes/stripePaymentSheet.ts";
import { handleOneTimeGiftRoute } from "./routes/oneTimeGift.ts";
import { handleCharityRoute } from "./routes/charities.ts";
import { handleDonationRoute } from "./routes/donations.ts";
import { handleTransactionRoute } from "./routes/transactions.ts";
import { handlePaymentMethodRoute } from "./routes/paymentMethods.ts";
import { handleUserPointsRoute } from "./routes/userPoints.ts";
import { handleInvitationRoute } from "./routes/invitations.ts";
import { handleUploadRoute } from "./routes/uploads.ts";
import { handleReferralRoute } from "./routes/referrals.ts";
import { handleVendorRoute } from "./routes/vendors.ts";
import { handleVendorPortalRoute } from "./routes/vendorPortal.ts";
import { handleDiscountRoute } from "./routes/discounts.ts";
import { handleDataDeletionRoute } from "./routes/dataDeletion.ts";
import { handleAuthRoute } from "./routes/auth.ts";
import { handleAdminStorageRoute } from "./routes/adminStorage.ts";
import { handleAdminNotifications } from "./routes/adminNotifications.ts";
import { handleAdminSettings } from "./routes/adminSettings.ts";
import { handleAdminOneTimeGifts } from "./routes/adminOneTimeGifts.ts";
import { handleAdminCharities } from "./routes/adminCharities.ts";
import { handleAdminCredits } from "./routes/adminCredits.ts";
import { handleAdminInvitations } from "./routes/adminInvitations.ts";
import { handleAdminUsers } from "./routes/adminUsers.ts";
import { handleAdminReporting } from "./routes/adminReporting.ts";
import { handleAccountDeletionPage } from "./routes/accountDeletionPage.ts";
import { handleAdminRoute } from "./routes/adminRouter.ts";
import { handleAdminDonors } from "./routes/adminDonors.ts";
import { handleAdminAnalytics } from "./routes/adminAnalytics.ts";
import { handleAdminDiscounts } from "./routes/adminDiscounts.ts";
import { handleAdminVendors } from "./routes/adminVendors.ts";
import {
  sendInvitationEmail,
  sendReferralReminderEmail,
  sendAdminTempPasswordEmail,
  sendNotificationEmail,
  sendPasswordResetEmail,
} from "./lib/email.ts";

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

async function reconcileReferralStatusesForReferrer(
  supabase: any,
  referrerId: number,
): Promise<void> {
  try {
    const {data: referrals, error: referralsError} = await supabase
      .from("referrals")
      .select(
        "id, referred_user_id, status, first_payment_at, monthly_donation_amount",
      )
      .eq("referrer_id", referrerId);

    if (referralsError || !referrals?.length) {
      if (referralsError) {
        console.error("❌ Error loading referrals for reconciliation:", referralsError);
      }
      return;
    }

    const referredUserIds = referrals
      .map((r: any) => r.referred_user_id)
      .filter((id: any) => Number.isFinite(id));

    if (referredUserIds.length === 0) return;

    const [{data: referredUsers}, {data: monthlyDonations}, {data: paidTxs}] =
      await Promise.all([
        supabase.from("users").select("id").in("id", referredUserIds),
        supabase
          .from("monthly_donations")
          .select("user_id, amount, status, last_payment_amount, last_payment_date")
          .in("user_id", referredUserIds),
        supabase
          .from("transactions")
          .select("user_id, amount, created_at")
          .in("user_id", referredUserIds)
          .eq("type", "monthly_donation")
          .eq("status", "completed")
          .order("created_at", {ascending: false}),
      ]);

    const userIds = new Set((referredUsers || []).map((u: any) => u.id));
    const paidTxByUser = new Map<number, any>();
    (paidTxs || []).forEach((tx: any) => {
      if (!paidTxByUser.has(tx.user_id)) {
        paidTxByUser.set(tx.user_id, tx);
      }
    });

    const donationByUser = new Map<number, any>();
    (monthlyDonations || []).forEach((donation: any) => {
      const existing = donationByUser.get(donation.user_id);
      if (!existing) {
        donationByUser.set(donation.user_id, donation);
        return;
      }
      const rank = (s: string) =>
        s === "active" ? 3 : s === "trialing" ? 2 : s === "past_due" ? 1 : 0;
      if (rank(donation.status) > rank(existing.status)) {
        donationByUser.set(donation.user_id, donation);
      }
    });

    for (const ref of referrals) {
      const referredUserId = Number(ref.referred_user_id);
      if (!Number.isFinite(referredUserId)) continue;

      const paidTx = paidTxByUser.get(referredUserId);
      const donation = donationByUser.get(referredUserId);

      if (paidTx) {
        if (ref.status !== "paid") {
          await updateReferralStatus(
            supabase,
            referredUserId,
            "paid",
            parseFloat(paidTx.amount || 0),
          );
        }
        continue;
      }

      const hasSignedUp = userIds.has(referredUserId);
      const donationSetupStatuses = new Set([
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
      ]);
      const hasDonationSetup =
        !!donation && donationSetupStatuses.has(String(donation.status || ""));

      let targetStatus: string = "pending";
      if (hasDonationSetup) targetStatus = "payment_setup";
      else if (hasSignedUp) targetStatus = "signed_up";

      if (ref.status !== targetStatus && ref.status !== "paid") {
        const patch: any = {status: targetStatus};
        if (
          targetStatus === "payment_setup" &&
          donation?.amount != null &&
          ref.monthly_donation_amount == null
        ) {
          patch.monthly_donation_amount = parseFloat(donation.amount);
        }
        await supabase.from("referrals").update(patch).eq("id", ref.id);
      }
    }
  } catch (error) {
    console.error("❌ Error reconciling referral statuses:", error);
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

    // Normalize trailing slashes so handlers can use exact matches
    route = route.replace(/\/+$/, "") || "/";

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
      response = await handleAdminRoute(req, supabase, route, method, {
        handleAdminVendors,
        handleAdminDiscounts,
        handleAdminAnalytics,
        handleAdminNotifications,
        handleAdminSettings,
        handleAdminDonors,
        handleAdminCharities,
        handleAdminOneTimeGifts,
        handleAdminStorageRoute,
        handleAdminUsers,
        handleAdminCredits,
        handleAdminReporting,
        handleAdminInvitations,
        sendReferralReminderEmail,
        sendAdminTempPasswordEmail,
        sendInvitationEmail,
      });
    }
    // Vendor Portal — authenticated, vendor-scoped routes (must come BEFORE
    // the public /vendors prefix check since /vendor/* is its own prefix).
    else if (route.startsWith("/vendor/")) {
      response = await handleVendorPortalRoute(req, supabase, route, method);
    }
    // Vendor routes (public API)
    else if (route.startsWith("/vendors")) {
      response = await handleVendorRoute(req, supabase, route, method);
    }
    // Auth routes
    else if (route.startsWith("/auth")) {
      response = await handleAuthRoute(req, supabase, route, method, {
        createReferralRecord,
        getReferrerFromToken,
        sendInvitationEmail,
        sendPasswordResetEmail,
      });
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
      response = await handleReferralRoute(
        req,
        supabase,
        route,
        method,
        reconcileReferralStatusesForReferrer,
        REFERRAL_TIERS,
      );
    }
    // Stripe payment sheet routes
    else if (route.startsWith("/stripe")) {
      response = await handleStripePaymentSheetRoute(
        req,
        supabase,
        route,
        method,
        calculateProcessingFee,
      );
    }
    // One-time gifts routes
    else if (route.startsWith("/one-time-gifts")) {
      response = await handleOneTimeGiftRoute(
        req,
        supabase,
        route,
        method,
        calculateProcessingFee,
        userId,
      );
    }
    // Webhooks routes
    else if (route.startsWith("/webhooks")) {
      response = await handleWebhookRoute(
        req,
        supabase,
        route,
        method,
        updateReferralStatus,
      );
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


