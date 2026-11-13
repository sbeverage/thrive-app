/**
 * Admin panel authentication.
 *
 * The panel used to authenticate every request with ADMIN_SECRET_KEY, sent as
 * X-Admin-Secret. That secret reached the browser because Create React App
 * inlines REACT_APP_* at build time, so the working key was a string literal
 * in the public JS at admin.forpurposetechnologies.com, and it was the only
 * gate on donor names, emails, giving history and DELETE /admin/donors/:id.
 *
 * It could not simply be removed, because the login endpoint itself sat behind
 * that same check: you needed the secret to log in, so the secret had to ship
 * to the browser, so the login could not protect anything. That circle is what
 * this file breaks. The login route is now reachable without the secret (it
 * does its own bcrypt check), and it hands back a short-lived token that
 * authenticates every later request.
 *
 * The token is an HMAC JWT signed with JWT_SECRET, the same secret and the
 * same djwt primitives the donor app already uses. `kind: "admin"` is checked
 * on the way back in so a donor's app token can never be presented as an admin
 * token: both are signed with the same key, and without that claim a valid
 * donor JWT would authenticate as an admin.
 */
import {
  create as createJWT,
  verify as verifyJWT,
} from "https://deno.land/x/djwt@v2.9/mod.ts";

/** Eight hours: a working day, short enough that a stolen token expires. */
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

export type AdminTokenPayload = {
  sub: number;
  email: string;
  name: string | null;
  role: string | null;
  is_super_admin: boolean;
  kind: "admin";
  exp: number;
};

async function hmacKey(usage: "sign" | "verify"): Promise<CryptoKey | null> {
  const jwtSecret = Deno.env.get("JWT_SECRET");
  if (!jwtSecret) {
    console.error("JWT_SECRET not configured — admin tokens unavailable");
    return null;
  }
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/** Mint a token for a verified admin_team_members row. */
export async function createAdminToken(member: {
  id: number;
  email: string;
  name?: string | null;
  role?: string | null;
}): Promise<{ token: string; expiresAt: string } | null> {
  const key = await hmacKey("sign");
  if (!key) return null;

  // Seconds since the epoch, computed the same way routes/auth.ts does.
  // djwt exports getNumericDate for this, but nothing else in this function
  // imports it, and a wrong import here would stop the whole function
  // booting rather than failing one route.
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = await createJWT(
    { alg: "HS256", typ: "JWT" },
    {
      sub: member.id,
      email: member.email,
      name: member.name ?? null,
      role: member.role ?? null,
      is_super_admin:
        String(member.role || "").trim().toLowerCase() === "super admin",
      kind: "admin",
      exp,
    },
    key,
  );

  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/**
 * Verify an admin token from the Authorization header.
 *
 * Returns null for anything that is not a currently valid admin token,
 * including a perfectly valid donor app token, which is signed with the same
 * key but carries no `kind: "admin"`.
 */
export async function verifyAdminToken(
  req: Request,
): Promise<AdminTokenPayload | null> {
  const header = req.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;

  const token = header.substring(7).trim();
  // The panel sends the Supabase anon key on some paths. It is a JWT, it is
  // not ours, and failing it here is noise rather than a problem.
  if (!token) return null;

  const key = await hmacKey("verify");
  if (!key) return null;

  try {
    const payload = await verifyJWT(token, key) as Record<string, unknown>;
    if (payload?.kind !== "admin") return null;
    if (typeof payload.sub !== "number") return null;
    return payload as unknown as AdminTokenPayload;
  } catch (_err) {
    // Expired or forged. Both are "not authenticated", and logging the token
    // would put a working credential in the logs.
    return null;
  }
}
