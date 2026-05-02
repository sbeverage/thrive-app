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
