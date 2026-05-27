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
      response = await handleAdminRoute(req, supabase, route, method);
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
      response = await handleCharityRoute(
        req,
        supabase,
        route,
        method,
        formatCharityResponse,
      );
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
    return await handleAdminSettings(req, supabase, route, method, {
      sendAdminTempPasswordEmail,
    });
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

