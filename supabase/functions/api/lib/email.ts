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
  inviteType = "standard",
}: {
  to: string;
  name: string;
  verificationToken: string;
  donorId: number;
  /**
   * 'standard' | 'coworking' | 'team'. Previously absent, so a coworking
   * member and an internal team account both received "you've been invited to
   * join as a donor" and were told to set up a payment method they will never
   * be asked for.
   */
  inviteType?: string;
}): Promise<void> {
  try {
    // Get email service configuration from environment variables
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend"; // 'resend', 'sendgrid', 'supabase'
    const appName = "THRIVE Initiative";

    // Determine if this is an invitation (64-char token) or self-signup
    const isInvitationToken = verificationToken.length === 64;

    const membership = String(inviteType || "standard").trim().toLowerCase();
    const isTeamInvite = membership === "team";
    const isCoworkingInvite = membership === "coworking";

    // What the account actually is, in the recipient's terms. Plain sentences
    // now, not markup — the template wraps them itself.
    const inviteIntro = isTeamInvite
      ? `You've been given a ${appName} team account. It works exactly like a donor account so you can see what donors see — with no payment required and nothing charged.`
      : isCoworkingInvite
        ? `Your ${appName} membership is included with your coworking space, so there's nothing to pay — you just choose the cause your monthly giving supports.`
        : `You've been invited to join ${appName} as a donor, and we're glad you're here.`;

    // What happens once both steps are done. Neither comped type is asked for
    // a card, so don't imply otherwise.
    const inviteLastStep = isTeamInvite
      ? "pick a cause and you're in — discounts included."
      : isCoworkingInvite
        ? "choose the cause your giving supports."
        : "choose your cause and set up your monthly gift.";

    const heroSub = isTeamInvite || isCoworkingInvite
      ? "Two steps and you're in — no payment details needed."
      : "Two steps and you're in. That's it.";

    /**
     * White wordmark — the same asset the app's home tab renders, so the email
     * and the app open on the same image. Must be an absolute URL: a bundled
     * require() asset has no meaning once the HTML is in someone's inbox.
     */
    const logoUrl =
      Deno.env.get("EMAIL_LOGO_URL") ||
      "https://mdqgndyhzlnwojtubouh.supabase.co/storage/v1/object/public/app-assets/assets/logos/initiative-logo-no-web-white.png";

    /** Repeated inline on every text node — see the note above emailHtml. */
    const font =
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

    // Build verification link - Use Universal Link (Vercel frontend URL) so iOS intercepts it
    // and opens the app directly instead of showing a web page in Safari.
    // APP_BASE_URL is registered in the app's associatedDomains (applinks:thrive-web-jet.vercel.app).
    const appBaseUrl =
      Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";

    const verificationLink = isInvitationToken
      ? `${appBaseUrl}/donorInvitationVerify?token=${verificationToken}`
      : `${appBaseUrl}/verify?token=${verificationToken}&email=${encodeURIComponent(to)}`;

    // App Store id 6759223641, verified against the iTunes lookup API.
    // The previous id (6744030078) resolved to NO app at all, so every
    // invitation email sent recipients to a dead App Store page and iOS Mail
    // refused the link outright with "Unable to verify this link".
    // NOTE: APP_STORE_IOS_URL overrides this. If that secret is set to the old
    // id it must be corrected in the Supabase dashboard too — the fallback
    // below cannot fix it.
    const appStoreLinks = {
      ios:
        Deno.env.get("APP_STORE_IOS_URL") ||
        "https://apps.apple.com/us/app/thrive-initiative/id6759223641",
      android:
        Deno.env.get("APP_STORE_ANDROID_URL") ||
        "https://play.google.com/store/apps/details?id=com.thriveinitiative.app",
    };

    // Email content (adapt subject based on context)
    const isInvitation = donorId && isInvitationToken;
    const emailSubject = isInvitation
      ? `Welcome to ${appName} - Verify Your Email`
      : `Verify Your ${appName} Account`;
    // Recipients were tapping "Verify Email & Open App" first, before
    // installing anything. The universal link then had no app to open, fell
    // through to the browser, and looked broken — so the invitation's job is
    // now to make the ORDER the loudest thing in it: two numbered cards, step
    // one holding the only bright button, and step two saying outright that it
    // does nothing until step one is done.
    //
    // Table layout with inline styles on every node. Outlook renders through
    // Word (no flexbox, no divs it respects for layout) and Gmail's web client
    // strips <style> blocks, so anything that only exists in CSS is a colour
    // or a position that some fraction of recipients will not get.
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${emailSubject}</title>
  <style>
    /* The design is light on purpose, so dark-mode clients darken only the
       backdrop behind the cards. The cards stay white with dark text, which
       reads correctly either way — and every one of those colours is set
       inline as well, for the clients that never see this block. */
    @media (prefers-color-scheme: dark) {
      .backdrop { background-color: #16242a !important; }
      /* Text on the backdrop, not on a card. Its inline colours are tuned for
         the light backdrop and go unreadable against the dark one. */
      .on-backdrop { color: #c3d1d6 !important; }
      .on-backdrop a { color: #f0b072 !important; }
    }
    @media only screen and (max-width: 480px) {
      .hero-pad { padding: 30px 22px !important; }
      .card-pad { padding: 22px 20px !important; }
      .h1 { font-size: 24px !important; }
      .cta { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eef3f5;font-family:${font};">
  <!-- Preheader: the grey line inbox lists show beside the subject. It gets
       the ordering across before the email is even opened. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Step 1 &mdash; get the app. Step 2 &mdash; verify your email. In that order.</div>

  <table role="presentation" class="backdrop" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef3f5;">
    <tr>
      <td align="center" style="padding:26px 12px 34px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

          <!-- Gradient hero, the same #2C3E50 → #4CA1AF the app's home tab
               uses. Solid colour first and gradient second: clients that drop
               CSS gradients still get a background, so the white wordmark is
               never white-on-white. -->
          <tr>
            <td class="hero-pad" align="center" style="background-color:#2C3E50;background:#2C3E50 linear-gradient(135deg,#2C3E50 0%,#4CA1AF 100%);border-radius:18px;padding:36px 32px;">
              <img src="${logoUrl}" width="200" alt="${appName}" style="display:block;width:200px;max-width:74%;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto 20px auto;" />
              <div class="h1" style="color:#ffffff;font-family:${font};font-size:27px;line-height:1.25;font-weight:700;">Welcome, ${name}!</div>
              <div style="color:#dceff3;font-family:${font};font-size:16px;line-height:1.55;margin-top:10px;">${
                isInvitation ? heroSub : "One step and your account is ready."
              }</div>
            </td>
          </tr>

          <tr><td style="height:20px;line-height:20px;font-size:0;">&nbsp;</td></tr>
${
  isInvitation
    ? `
          <!-- Intro card -->
          <tr>
            <td class="card-pad" style="background-color:#ffffff;border-radius:16px;padding:24px 26px;">
              <div style="color:#22333B;font-family:${font};font-size:16px;line-height:1.65;">${inviteIntro}</div>
              <div style="color:#2C3E50;font-family:${font};font-size:16px;line-height:1.65;font-weight:700;margin-top:14px;">It takes 2 steps &mdash; in this order:</div>
            </td>
          </tr>

          <tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>

          <!-- STEP 1 — the only bright button in the email -->
          <tr>
            <td class="card-pad" style="background-color:#ffffff;border-radius:16px;border-left:5px solid #DB8633;padding:26px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="48" valign="top" style="width:48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" valign="middle" width="34" height="34" style="width:34px;height:34px;background-color:#DB8633;border-radius:17px;color:#ffffff;font-family:${font};font-size:17px;font-weight:700;line-height:34px;text-align:center;">1</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top">
                    <div style="color:#DB8633;font-family:${font};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Do this first</div>
                    <div style="color:#22333B;font-family:${font};font-size:20px;font-weight:700;line-height:1.3;margin-top:5px;">First, click here to get the app</div>
                    <div style="color:#5A7079;font-family:${font};font-size:15px;line-height:1.6;margin-top:9px;">Install THRIVE from the App Store &mdash; it's free. Then come back to this email.</div>
                    <div style="margin-top:18px;">
                      <a href="${appStoreLinks.ios}" class="cta" style="display:inline-block;background-color:#DB8633;color:#ffffff;font-family:${font};font-size:16px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;">Download the App</a>
                    </div>
                    <div style="color:#8a9ba1;font-family:${font};font-size:13px;line-height:1.5;margin-top:12px;">Already installed it? Go straight to step 2.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>

          <!-- STEP 2 — deliberately the quieter of the two buttons -->
          <tr>
            <td class="card-pad" style="background-color:#ffffff;border-radius:16px;border-left:5px solid #4CA1AF;padding:26px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="48" valign="top" style="width:48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" valign="middle" width="34" height="34" style="width:34px;height:34px;background-color:#31788A;border-radius:17px;color:#ffffff;font-family:${font};font-size:17px;font-weight:700;line-height:34px;text-align:center;">2</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top">
                    <div style="color:#31788A;font-family:${font};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Then do this</div>
                    <div style="color:#22333B;font-family:${font};font-size:20px;font-weight:700;line-height:1.3;margin-top:5px;">Then, click here to verify</div>
                    <div style="color:#5A7079;font-family:${font};font-size:15px;line-height:1.6;margin-top:9px;">Come back to this email and tap below. It confirms your address and opens the app to your account.</div>
                    <div style="background-color:#FDF3E4;border-radius:8px;padding:12px 14px;margin-top:14px;color:#8a5a1a;font-family:${font};font-size:14px;line-height:1.5;">
                      Tapping this <strong>before</strong> the app is installed won't work &mdash; that's why it's step 2.
                    </div>
                    <div style="margin-top:18px;">
                      <a href="${verificationLink}" class="cta" style="display:inline-block;background-color:#31788A;color:#ffffff;font-family:${font};font-size:16px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;">Verify My Email</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 26px 0 26px;">
              <div class="on-backdrop" style="color:#5A7079;font-family:${font};font-size:15px;line-height:1.6;">Once you've verified, ${inviteLastStep}</div>
            </td>
          </tr>
`
    : `
          <tr>
            <td class="card-pad" style="background-color:#ffffff;border-radius:16px;padding:26px;">
              <div style="color:#22333B;font-family:${font};font-size:16px;line-height:1.65;">Thanks for signing up for ${appName}. Confirm your email address and you're ready to go.</div>
              <div style="margin-top:20px;">
                <a href="${verificationLink}" class="cta" style="display:inline-block;background-color:#DB8633;color:#ffffff;font-family:${font};font-size:16px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;">Verify My Email</a>
              </div>
              <div style="color:#8a9ba1;font-family:${font};font-size:13px;line-height:1.6;margin-top:16px;">This opens the ${appName} app to finish your signup. If nothing happens, paste this into your browser:<br /><span style="color:#8a9ba1;font-size:12px;word-break:break-all;">${verificationLink}</span></div>
            </td>
          </tr>
`
}
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 26px 0 26px;">
              ${
                isInvitation
                  ? `<div class="on-backdrop" style="color:#7d8f96;font-family:${font};font-size:13px;line-height:1.6;">Not on an iPhone? Reply to this email or contact your community manager and we'll get you set up.</div>`
                  : `<div class="on-backdrop" style="color:#7d8f96;font-family:${font};font-size:13px;line-height:1.6;">If you didn't create this account, you can safely ignore this email.</div>`
              }
              <div class="on-backdrop" style="color:#7d8f96;font-family:${font};font-size:13px;line-height:1.6;margin-top:8px;">Need help? <a href="mailto:info@jointhriveinitiative.org" style="color:#31788A;text-decoration:underline;">info@jointhriveinitiative.org</a></div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const emailText = isInvitation
      ? `
Welcome to ${appName}, ${name}!

${inviteIntro}

It takes 2 steps — in this order:

STEP 1 — First, get the app:
${appStoreLinks.ios}

STEP 2 — Then, verify your email.
Tapping this before the app is installed won't work, which is why it's second:
${verificationLink}

Once you've verified, ${inviteLastStep}

Not on an iPhone? Reply to this email or contact your community manager and we'll get you set up.

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
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
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

    // Where they actually sign in. The email previously gave a temporary
    // password and no URL at all, so a new team member had a credential and
    // nowhere to use it. Overridable, because the panel answers on several
    // hostnames and one of them (admin.jointhriveinitiative.org) does not
    // resolve — verified 2026-09-04 that this one serves the panel.
    const portalUrl =
      Deno.env.get("ADMIN_PORTAL_URL") || "https://admin.forpurposetechnologies.com";

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
    .cta {
      display: inline-block;
      margin: 8px 0 4px;
      padding: 12px 24px;
      background-color: #DB8633;
      color: #ffffff !important;
      font-weight: 700;
      font-size: 15px;
      text-decoration: none;
      border-radius: 8px;
    }
    .field {
      background: #f7f9fa;
      border: 1px solid #e4e9eb;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 15px;
      margin: 8px 0;
      word-break: break-all;
    }
    /* Colours are set explicitly so a client that switches to dark mode does
       not leave dark text on a dark card — the same failure that made the
       donor invitation's download link invisible. */
    @media (prefers-color-scheme: dark) {
      body { background: #1c2b31 !important; color: #e8eef0 !important; }
      .container { background-color: #24363d !important; }
      p, .title { color: #e8eef0 !important; }
      .hint { color: #b8c6cc !important; }
      .field { background: #1f3038 !important; border-color: #2f4650 !important; color: #e8eef0 !important; }
      .password-box { background: #33240f !important; border-color: #6b4a20 !important; color: #f0b072 !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="title">Hi ${name},</div>
    <p>You have been added to the ${appName} admin team.</p>

    <p style="margin-bottom:4px;"><strong>Sign in here:</strong></p>
    <a href="${portalUrl}" class="cta">Open the admin portal</a>
    <div class="field">${portalUrl}</div>

    <p style="margin-bottom:4px;"><strong>Your username</strong> is this email address:</p>
    <div class="field">${to}</div>

    <p style="margin-bottom:4px;"><strong>Temporary password:</strong></p>
    <div class="password-box">${tempPassword}</div>

    <p class="hint">For security, please change this password after your first login — Settings &rarr; Profile.</p>
  </div>
</body>
</html>`;

    const emailText = `Hi ${name},

You have been added to the ${appName} admin team.

Sign in here: ${portalUrl}
Username: ${to}
Temporary password: ${tempPassword}

For security, please change this password after your first login (Settings > Profile).`;

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

type VendorEmailKind = "submitted" | "approved" | "rejected" | "rotation_reminder" | "verify_email" | "portal_invite" | "reactivated" | "reactivation_denied" | "deactivated";

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
    case "deactivated":
      return {
        subject: `${businessName} — your THRIVE profile has been paused`,
        title: "Your profile is paused on THRIVE",
        body: `<p>Hi ${name || "there"} — we wanted to let you know that <strong>${businessName}</strong> has been paused on the THRIVE app. Donors won't see your profile or your discounts for now.</p>
${extras.reason ? `<p><strong>Why:</strong> <em>${extras.reason}</em></p>` : ''}
<p>When you're ready to come back, log into the vendor portal and click <strong>Request reactivation</strong>. Our team will review and re-enable your profile.</p>`,
        cta: { href: `${portal}/dashboard`, label: "Open the vendor portal" },
      };
    case "reactivated":
      return {
        subject: `${businessName} is back on THRIVE 🎉`,
        title: "You're live on THRIVE again",
        body: `<p>Good news — we've reviewed your reactivation request and <strong>${businessName}</strong> is live on the THRIVE app again. Donors can now find you and redeem your discounts.</p>
<p>Head to your dashboard to make sure your discounts, hours and photos are still current.</p>`,
        cta: { href: `${portal}/dashboard`, label: "Open your dashboard" },
      };
    case "reactivation_denied":
      return {
        subject: `THRIVE Vendor Portal — Update on your reactivation request`,
        title: "We couldn't reactivate your profile yet",
        body: `We reviewed your reactivation request for <strong>${businessName}</strong> and couldn't reinstate the profile at this time:<br><br><em>"${extras.reason || "Please review your profile and reach out with any questions."}"</em><br><br>You can update your profile in the portal and request reactivation again once the issue is resolved.`,
        cta: { href: `${portal}/dashboard`, label: "Open your dashboard" },
      };
    case "portal_invite":
      return {
        subject: `Your THRIVE Vendor Portal login for ${businessName}`,
        title: `Welcome to THRIVE, ${businessName}!`,
        body: `<p>We've added <strong>${businessName}</strong> to the THRIVE Initiative and set up your vendor portal account. Sign in below to add discounts, upload your logo, and start reaching donors.</p>
<div style="background:#F5F5FA;border:1px solid #E5E5EA;border-radius:8px;padding:16px;margin:16px 0;font-family:'SF Mono',Menlo,monospace;font-size:14px;">
  <div style="margin-bottom:8px;"><span style="color:#8C8C8C;">Username:</span> <strong style="color:#324E58;">${extras.loginEmail || ""}</strong></div>
  <div><span style="color:#8C8C8C;">Temporary password:</span> <strong style="color:#324E58;">${extras.tempPassword || ""}</strong></div>
</div>
<p style="font-size:13px;color:#8C8C8C;">You'll be asked to change this temporary password the first time you sign in. Please don't share it.</p>`,
        cta: { href: `${portal}/login`, label: "Sign in to the portal" },
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
  loginEmail,
  tempPassword,
}: {
  to: string;
  name: string;
  businessName: string;
  kind: VendorEmailKind;
  reason?: string;
  verifyUrl?: string;
  loginEmail?: string;
  tempPassword?: string;
}): Promise<void> {
  try {
    if (!to) return;
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";
    const fromEmail = buildResendVerificationFromHeader();
    const { subject, title, body, cta } = vendorEmailContent(kind, name, businessName, {
      reason: reason || "",
      verifyUrl: verifyUrl || "",
      loginEmail: loginEmail || "",
      tempPassword: tempPassword || "",
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
