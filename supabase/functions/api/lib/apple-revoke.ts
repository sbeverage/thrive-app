/**
 * Sign in with Apple — token exchange + revocation.
 *
 * Per App Store Review Guideline 5.1.1(v): apps that support Sign in with Apple
 * must revoke the user's Apple token when they delete their account.
 *
 * Required Supabase Edge Function secrets:
 *   - APPLE_TEAM_ID           10-character Apple Developer Team ID
 *   - APPLE_SIGN_IN_SERVICE_ID  Service ID (e.g. com.thriveinitiative.app.signin)
 *   - APPLE_SIGN_IN_KEY_ID    Key ID associated with the private key
 *   - APPLE_SIGN_IN_PRIVATE_KEY  PEM-encoded P-256 private key (the .p8 file
 *                                contents). Newlines may be escaped as \n.
 *
 * If any of these are missing, the helpers no-op gracefully — the rest of the
 * account flows still work, the SIWA revocation is just skipped.
 */

import { create as createJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";

const APPLE_AUDIENCE = "https://appleid.apple.com";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

interface AppleConfig {
  teamId: string;
  serviceId: string;
  keyId: string;
  privateKeyPem: string;
}

function loadAppleConfig(): AppleConfig | null {
  const teamId = Deno.env.get("APPLE_TEAM_ID");
  const serviceId = Deno.env.get("APPLE_SIGN_IN_SERVICE_ID");
  const keyId = Deno.env.get("APPLE_SIGN_IN_KEY_ID");
  const rawKey = Deno.env.get("APPLE_SIGN_IN_PRIVATE_KEY");
  if (!teamId || !serviceId || !keyId || !rawKey) return null;
  // Allow the user to paste a key with literal \n escapes (common when copy-
  // pasting from Apple's .p8 file into an env var UI).
  const privateKeyPem = rawKey.replace(/\\n/g, "\n").trim();
  return { teamId, serviceId, keyId, privateKeyPem };
}

/** Parse a PEM-encoded PKCS#8 private key into raw DER bytes for crypto.subtle. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Build a short-lived (10 min) client_secret JWT signed with the SIWA key.
 * Apple requires ES256 / P-256 ECDSA signatures and a max 6-month expiry.
 */
async function buildClientSecret(cfg: AppleConfig): Promise<string> {
  const der = pemToArrayBuffer(cfg.privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  return await createJWT(
    { alg: "ES256", kid: cfg.keyId, typ: "JWT" },
    {
      iss: cfg.teamId,
      iat: now,
      exp: now + 10 * 60,
      aud: APPLE_AUDIENCE,
      sub: cfg.serviceId,
    },
    cryptoKey,
  );
}

/**
 * Exchanges an authorization code from Sign in with Apple for a refresh token
 * we can later revoke. Returns null if SIWA secrets aren't configured or the
 * exchange fails — caller should handle null gracefully.
 */
export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
): Promise<string | null> {
  const cfg = loadAppleConfig();
  if (!cfg) {
    console.log("⚠️ Apple SIWA secrets not configured — skipping token exchange");
    return null;
  }
  try {
    const clientSecret = await buildClientSecret(cfg);
    const body = new URLSearchParams({
      client_id: cfg.serviceId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    });
    const res = await fetch(APPLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn("⚠️ Apple token exchange failed:", res.status, text);
      return null;
    }
    const data = JSON.parse(text);
    return data.refresh_token || data.access_token || null;
  } catch (e) {
    console.warn("⚠️ Apple token exchange threw:", e);
    return null;
  }
}

/**
 * Revokes a previously-issued Sign in with Apple refresh token. Per Apple's
 * 5.1.1(v) requirement, called from /auth/delete-user. Best-effort — returns
 * false on failure (caller continues with account deletion either way).
 */
export async function revokeAppleRefreshToken(refreshToken: string): Promise<boolean> {
  if (!refreshToken) return false;
  const cfg = loadAppleConfig();
  if (!cfg) {
    console.log("⚠️ Apple SIWA secrets not configured — skipping token revocation");
    return false;
  }
  try {
    const clientSecret = await buildClientSecret(cfg);
    const body = new URLSearchParams({
      client_id: cfg.serviceId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    const res = await fetch(APPLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("⚠️ Apple token revoke returned non-2xx:", res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("⚠️ Apple token revoke threw:", e);
    return false;
  }
}
