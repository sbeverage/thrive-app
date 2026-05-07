/**
 * THRIVE app JWT (HMAC) — Authorization / X-App-Authorization bearer token.
 * OAuth / IdP JWKS verification stays in index until extracted to lib/jwks.ts.
 */
import { verify as verifyAppJwt } from "https://deno.land/x/djwt@v2.9/mod.ts";

export function getAppAuthHeader(req: Request): string | null {
  return req.headers.get("X-App-Authorization") || req.headers.get("Authorization");
}

export async function getJwtPayload(authHeader: string | null): Promise<any | null> {
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
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const decoded = await verifyAppJwt(token, secretKey);
    return decoded;
  } catch (error) {
    console.error("❌ JWT verification failed:", error);
    return null;
  }
}
