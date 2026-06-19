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
export async function sendInvitationEmail({
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
    const appName = "THRIVE Initiative";

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
        "https://apps.apple.com/app/thrive-initiative/id6744030078",
      android:
        Deno.env.get("APP_STORE_ANDROID_URL") ||
        "https://play.google.com/store/apps/details?id=com.thriveinitiative.app",
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
        ${
          isInvitation
            ? `
        <p><strong>Here's how to get started — just 3 steps:</strong></p>
        <ol style="color:#555;font-size:16px;line-height:1.8;padding-left:20px;margin:20px 0;">
          <li><a href="${appStoreLinks.ios}" style="color:#324E58;font-weight:600;text-decoration:underline;">Download the iOS app</a></li>
          <li>Come back to this email and tap the button below to verify</li>
          <li>Done! 🎉</li>
        </ol>

        <div class="button-container">
          <a href="${verificationLink}" class="button">Verify Email &amp; Open App</a>
        </div>
        `
            : `
        <p>Click the button below to verify your email address and get started:</p>

        <div class="button-container">
          <a href="${verificationLink}" class="button">Verify Email</a>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center;">
          This link will open in the ${appName} app to verify your email and continue with signup.
        </p>

        <p style="font-size: 14px; color: #666; text-align: center;">
          If the app doesn't open automatically, tap the button above or paste this link into your browser:<br>
          <span style="font-size: 12px; color: #999; word-break: break-all;">${verificationLink}</span>
        </p>
        `
        }
      </div>

      <div class="footer">
        ${
          isInvitation
            ? `<p style="color:#555;">Not on an iPhone? Reply to this email or contact your community manager and we'll help you get set up.</p>`
            : `<p>If you didn't request this account, you can safely ignore this email.</p>`
        }
        <p>Need help? Contact <a href="mailto:info@jointhriveinitiative.org">info@jointhriveinitiative.org</a></p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const emailText = isInvitation
      ? `
Welcome to ${appName}, ${name}!

You've been invited to join as a donor. We're excited to have you join our community of changemakers.

Here's how to get started — just 3 steps:

  1. Download the iOS app: ${appStoreLinks.ios}
  2. Come back to this email and tap the link below to verify
  3. Done!

Verify your email and open the app:
${verificationLink}

Not on an iPhone? Reply to this email or contact your community manager and we'll help you get set up.

Need help? Contact info@jointhriveinitiative.org
    `.trim()
      : `
Thank you for signing up for ${appName}, ${name}!

Please verify your email to complete your account setup:
${verificationLink}

This link will open in the ${appName} app to complete your verification.

If you didn't create this account, you can safely ignore this email.

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
export async function sendReferralReminderEmail({
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
    const appName = "THRIVE Initiative";
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

export async function sendAdminTempPasswordEmail({
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
    const appName = "THRIVE Initiative";
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

export async function sendNotificationEmail({
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
    const appName = "THRIVE Initiative";
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

export async function sendPasswordResetEmail({
  to,
  name,
  resetToken,
  portal = "donor",
}: {
  to: string;
  name: string;
  resetToken: string;
  portal?: "donor" | "vendor";
}): Promise<void> {
  try {
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
    const appName = portal === "vendor" ? "THRIVE Vendor Portal" : "THRIVE Initiative";
    const fromEmail = Deno.env.get("EMAIL_FROM") || "noreply@yourapp.com";
    const baseUrl =
      portal === "vendor"
        ? vendorPortalUrl()
        : Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";

    const resetLink = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(to)}`;
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

// ============================================================================
// Vendor Portal transactional emails (submission, approval, rejection, rotation)
// ============================================================================

type VendorEmailKind = "submitted" | "approved" | "rejected" | "rotation_reminder" | "verify_email";

function vendorPortalUrl(): string {
  return Deno.env.get("VENDOR_PORTAL_URL") || "https://thrive-vendor-portal.vercel.app";
}

function vendorEmailContent(kind: VendorEmailKind, name: string, businessName: string, extras: Record<string, string> = {}) {
  const portal = vendorPortalUrl();
  switch (kind) {
    case "submitted":
      return {
        subject: `THRIVE Initiative — We received your application`,
        title: "Application received",
        body: `Thanks for submitting <strong>${businessName}</strong> to the THRIVE Initiative. Our team reviews new vendors within 1–2 business days. You'll get an email the moment you're approved.`,
        cta: { href: `${portal}/pending`, label: "View status" },
      };
    case "approved":
      return {
        subject: `🎉 Welcome to THRIVE — ${businessName} is now live!`,
        title: `Congratulations — you're in! 🎉`,
        body: `<p>Welcome to the THRIVE Initiative family! <strong>${businessName}</strong> is now live in the THRIVE app, and donors can find you, save you, and start using your discounts today.</p>
<p>What's next:</p>
<ul style="padding-left:20px;margin:12px 0;">
  <li><strong>Watch your stats</strong> — the dashboard tracks profile views, saves, redemptions, and savings delivered to your customers.</li>
  <li><strong>Add more discounts</strong> — vendors with multiple active offers see meaningfully higher engagement.</li>
  <li><strong>Refresh your code monthly</strong> — we'll email you a reminder on the 1st of each month.</li>
</ul>
<p>Thank you for partnering with THRIVE to make giving back something every donor can do every day.</p>`,
        cta: { href: `${portal}/dashboard`, label: "Open your dashboard" },
      };
    case "rejected":
      return {
        subject: `THRIVE Initiative — Changes needed on your application`,
        title: "Changes needed before we can list you",
        body: `Our team reviewed <strong>${businessName}</strong> and asked for some changes:<br><br><em>"${extras.reason || "Please review your profile and resubmit."}"</em><br><br>Update your profile in the portal and resubmit for review.`,
        cta: { href: `${portal}/pending`, label: "Edit & resubmit" },
      };
    case "rotation_reminder":
      return {
        subject: `Time to rotate your THRIVE discount codes`,
        title: "Monthly code rotation reminder",
        body: `It's the start of a new month. To keep your codes unique and reduce sharing, consider rotating the codes on your active discounts at <strong>${businessName}</strong>.`,
        cta: { href: `${portal}/discounts`, label: "Rotate codes" },
      };
    case "verify_email":
      return {
        subject: `Verify your email for THRIVE Vendor Portal`,
        title: "Verify your email",
        body: `Thanks for submitting <strong>${businessName}</strong>! Click the button below to confirm this is your email address. This helps us reach you about your approval status, code rotations, and important updates.`,
        cta: { href: extras.verifyUrl || `${portal}`, label: "Verify email" },
      };
  }
}

export async function sendVendorEmail({
  to,
  name,
  businessName,
  kind,
  reason,
  verifyUrl,
}: {
  to: string;
  name: string;
  businessName: string;
  kind: VendorEmailKind;
  reason?: string;
  verifyUrl?: string;
}): Promise<void> {
  try {
    if (!to) return;
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
    const fromEmail = buildResendVerificationFromHeader();
    const { subject, title, body, cta } = vendorEmailContent(kind, name, businessName, {
      reason: reason || "",
      verifyUrl: verifyUrl || "",
    });

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#324E58;background:#F5F5FA;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
    <div style="text-align:center;margin-bottom:24px;"><div style="font-size:22px;font-weight:700;letter-spacing:0.5px;color:#324E58;">THRIVE</div><div style="font-size:11px;color:#8C8C8C;letter-spacing:1.5px;">VENDOR PORTAL</div></div>
    <h2 style="font-size:22px;font-weight:700;margin:0 0 16px;color:#324E58;">${title}</h2>
    <p style="font-size:15px;color:#555;margin:0 0 24px;">Hi ${name || "there"},</p>
    <div style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">${body}</div>
    <div style="text-align:center;margin:32px 0;">
      <a href="${cta.href}" style="display:inline-block;background:#DB8633;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">${cta.label}</a>
    </div>
    <p style="font-size:12px;color:#8C8C8C;text-align:center;margin-top:32px;">THRIVE Initiative · Atlanta, GA</p>
  </div>
</body></html>`;

    const emailText = `${title}\n\nHi ${name || "there"},\n\n${body.replace(/<[^>]+>/g, "")}\n\n${cta.label}: ${cta.href}\n\n— THRIVE Initiative`;

    if (emailService === "resend") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn(`⚠️ RESEND_API_KEY not set — skipping vendor email (${kind}) to ${to}`);
        return;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromEmail, to: [to], subject, html: emailHtml, text: emailText }),
      });
      if (!res.ok) {
        console.error(`❌ Resend vendor email error (${kind}, ${to}):`, await res.text());
      } else {
        console.log(`✅ Vendor email sent (${kind}) to ${to}`);
      }
    } else {
      console.log(`📧 Vendor email fallback (${kind}) for ${to}: ${subject}`);
    }
  } catch (error) {
    console.error(`❌ Error sending vendor email (${kind}):`, error);
  }
}
