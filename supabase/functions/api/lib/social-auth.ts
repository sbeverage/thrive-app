// OAuth token verification for Apple, Google, and Facebook sign-in
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

export async function verifyAppleToken(
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

export async function verifyGoogleToken(
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

export async function verifyFacebookToken(
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
