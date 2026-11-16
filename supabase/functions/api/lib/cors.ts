/** CORS headers for Edge Function responses and OPTIONS preflight. */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    // x-admin-secret is no longer read by anything (see lib/adminAuth.ts).
    // It stays in the allow-list on purpose: historical panel bundles are
    // still reachable at their own Vercel URLs and some of them send it, and
    // a header missing from this list fails CORS preflight in the browser.
    // Allowing it means those requests reach the gate and get a clean 401
    // rather than an unexplained network error.
    "authorization, x-app-authorization, x-client-info, apikey, content-type, x-admin-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
