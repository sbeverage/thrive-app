import AsyncStorage from "@react-native-async-storage/async-storage";

function normalizeParamId(value) {
  if (value == null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const s = String(raw).trim();
  if (!s || s === "undefined" || s === "null") return null;
  return s;
}

/**
 * @param {unknown} obj — beneficiary from context, AsyncStorage, or API
 * @returns {string|null}
 */
export function extractBeneficiaryIdFromObject(obj) {
  if (obj == null) return null;
  if (typeof obj === "string") return normalizeParamId(obj);
  const id =
    obj.id ??
    obj.beneficiary_id ??
    obj.beneficiaryId ??
    obj.charity_id ??
    obj.charityId;
  if (id == null || id === "") return null;
  return String(id).trim() || null;
}

/**
 * Route params → context → persisted selected beneficiary (AsyncStorage).
 * @param {{ params?: object, selectedBeneficiary?: unknown }} input
 * @returns {Promise<string|null>}
 */
export async function resolveCheckoutBeneficiaryId({ params, selectedBeneficiary }) {
  const fromParams = normalizeParamId(
    params?.beneficiaryId ??
      params?.beneficiary_id ??
      params?.charityId ??
      params?.charity_id,
  );
  if (fromParams) return fromParams;

  const fromContext = extractBeneficiaryIdFromObject(selectedBeneficiary);
  if (fromContext) return fromContext;

  try {
    const raw = await AsyncStorage.getItem("selectedBeneficiary");
    if (raw) {
      const parsed = JSON.parse(raw);
      return extractBeneficiaryIdFromObject(parsed);
    }
  } catch (e) {
    console.warn("resolveCheckoutBeneficiaryId:", e?.message);
  }

  return null;
}
