import { corsHeaders } from "../lib/cors.ts";

export async function handleAccountDeletionPage(): Promise<Response> {
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
