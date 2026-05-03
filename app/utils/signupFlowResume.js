import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../lib/api";
import {
  extractIsVerifiedFromApiProfile,
  isVerifyEmailCheckpointRoute,
} from "./extractIsVerifiedFromApiProfile";
import {
  persistSignupFlowCheckpoint,
  signupPendingMatchesLoggedInEmail,
} from "./signupFlowCheckpoint";

/**
 * Resume saved signup route (cold start on index, or right after login).
 *
 * @param {import('expo-router').Router} router
 * @param {{ loggedInEmail?: string, gatePendingEmailAgainstStoredUserData?: boolean }} [options]
 *   — `loggedInEmail`: after login, ignore or clear pending when it belongs to another account.
 *   — `gatePendingEmailAgainstStoredUserData`: for index, compare pending.params.email to userData.email.
 * @returns {Promise<boolean>} true if navigation was performed and caller should stop
 */
export async function resumeSignupFlowPendingIfAny(router, options = {}) {
  const { loggedInEmail, gatePendingEmailAgainstStoredUserData } = options;

  const pendingRaw = await AsyncStorage.getItem("signupFlowPending");
  if (!pendingRaw) return false;

  let pending;
  try {
    pending = JSON.parse(pendingRaw);
  } catch {
    await AsyncStorage.removeItem("signupFlowPending");
    return false;
  }

  const route = typeof pending?.route === "string" ? pending.route.trim() : "";
  if (!route) {
    await AsyncStorage.removeItem("signupFlowPending");
    return false;
  }

  const params =
    pending.params &&
    typeof pending.params === "object" &&
    !Array.isArray(pending.params)
      ? pending.params
      : {};

  const unified = { route, params };

  if (loggedInEmail != null && String(loggedInEmail).trim() !== "") {
    if (!signupPendingMatchesLoggedInEmail(unified, loggedInEmail)) {
      await AsyncStorage.removeItem("signupFlowPending");
      return false;
    }
  }

  if (gatePendingEmailAgainstStoredUserData && params.email) {
    let storedEmail = "";
    try {
      const raw = await AsyncStorage.getItem("userData");
      const u = raw ? JSON.parse(raw) : {};
      storedEmail = (u.email || "").trim();
    } catch {
      /* ignore */
    }
    if (
      storedEmail &&
      !signupPendingMatchesLoggedInEmail(unified, storedEmail)
    ) {
      await AsyncStorage.removeItem("signupFlowPending");
      return false;
    }
  }

  if (isVerifyEmailCheckpointRoute(route)) {
    try {
      const profile = await API.getProfile();
      if (!profile) {
        console.warn(
          "📱 Verify resume: no profile (deleted user?) — clearing auth + pending",
        );
        await AsyncStorage.multiRemove([
          "signupFlowPending",
          "authToken",
          "userData",
        ]);
        router.replace("/");
        return true;
      }
      if (extractIsVerifiedFromApiProfile(profile, false)) {
        console.log(
          "📱 Server says verified — skipping stale /verifyEmail checkpoint",
        );
        try {
          const raw = await AsyncStorage.getItem("userData");
          const parsed = raw ? JSON.parse(raw) : {};
          const pd = profile.profile || profile;
          await AsyncStorage.setItem(
            "userData",
            JSON.stringify({
              ...parsed,
              isVerified: true,
              isLoggedIn: true,
              email: (parsed.email || pd.email || "").trim(),
            }),
          );
        } catch {
          /* non-fatal */
        }
        await persistSignupFlowCheckpoint("/signupFlow/explainerDonate", {});
        router.replace({
          pathname: "/signupFlow/explainerDonate",
          params: {},
        });
        return true;
      }
    } catch (resumeErr) {
      const status = resumeErr?.response?.status;
      if (status === 401 || status === 404) {
        console.warn(
          "📱 Verify resume: profile error",
          status,
          "— clearing auth + pending",
        );
        await AsyncStorage.multiRemove([
          "signupFlowPending",
          "authToken",
          "userData",
        ]);
        router.replace("/");
        return true;
      }
    }
  }

  console.log("📱 Resuming pending signup flow:", route);
  router.replace({
    pathname: route,
    params: params || {},
  });
  return true;
}
