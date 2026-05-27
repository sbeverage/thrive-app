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


