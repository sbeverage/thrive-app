import AsyncStorage from "@react-native-async-storage/async-storage";

function pickParam(raw) {
  if (raw == null) return undefined;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "" || v === undefined || v === null) return undefined;
  return String(v);
}

/**
 * Persist current signup route so app/index.js can resume after a cold start.
 * @param {string} route — Expo pathname, e.g. '/verifyEmail'
 * @param {Record<string, string | undefined>} [params]
 * @returns {Promise<void>}
 */
export function persistSignupFlowCheckpoint(route, params = {}) {
  const cleaned = {};
  for (const [k, v] of Object.entries(params)) {
    const p = pickParam(v);
    if (p !== undefined) cleaned[k] = p;
  }
  return AsyncStorage.setItem(
    "signupFlowPending",
    JSON.stringify({ route, params: cleaned }),
  ).catch(() => {});
}

/**
 * Same as persistSignupFlowCheckpoint but reads shallow keys from expo useLocalSearchParams().
 * @param {string} route
 * @param {object} rawParams
 */
export function persistSignupFlowCheckpointFromParams(route, rawParams) {
  if (!rawParams || typeof rawParams !== "object") {
    return persistSignupFlowCheckpoint(route, {});
  }
  const cleaned = {};
  for (const key of Object.keys(rawParams)) {
    const p = pickParam(rawParams[key]);
    if (p !== undefined) cleaned[key] = p;
  }
  return persistSignupFlowCheckpoint(route, cleaned);
}

/**
 * @returns {Promise<{ route: string, params: Record<string, string> } | null>}
 */
export async function readSignupFlowPending() {
  try {
    const raw = await AsyncStorage.getItem("signupFlowPending");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const route = typeof parsed?.route === "string" ? parsed.route.trim() : "";
    if (!route) return null;
    const params =
      parsed.params &&
      typeof parsed.params === "object" &&
      !Array.isArray(parsed.params)
        ? parsed.params
        : {};
    return { route, params };
  } catch {
    return null;
  }
}

/**
 * When pending includes `params.email`, require a match after login (stale checkpoint from another account).
 * If the checkpoint has no email (e.g. some flow params), treat as belonging to the current session.
 */
export function signupPendingMatchesLoggedInEmail(pending, loggedInEmail) {
  if (!pending?.route) return false;
  const e = String(loggedInEmail || "").trim().toLowerCase();
  if (!e) return false;
  const pe = pending.params?.email;
  if (pe === undefined || pe === null || String(pe).trim() === "") return true;
  return String(pe).trim().toLowerCase() === e;
}
