/**
 * GET /auth/profile returns `{ success, profile: { isVerified, ... } }` (not top-level `is_verified`).
 */
export function extractIsVerifiedFromApiProfile(backendProfile, fallback) {
  const fb = fallback === undefined ? false : fallback;
  if (!backendProfile || typeof backendProfile !== "object") return fb;
  const profileData = backendProfile.profile || backendProfile;
  const raw =
    profileData.isVerified ??
    profileData.is_verified ??
    backendProfile.is_verified ??
    backendProfile.isVerified;
  if (raw === undefined || raw === null) return fb;
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

/** Used by app/index.js when resuming signupFlowPending to /verifyEmail */
export function isVerifyEmailCheckpointRoute(route) {
  const r = String(route || "").replace(/^\//, "");
  return r === "verifyEmail";
}
