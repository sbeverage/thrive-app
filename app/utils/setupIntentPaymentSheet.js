import { Platform } from "react-native";

/**
 * Setup intent responses may vary by backend shape.
 * @returns {{ setupIntentClientSecret: string|null, customerId: string|null, customerEphemeralKeySecret: string|null }}
 */
export function extractSetupIntentPaymentSecrets(response) {
  if (!response || typeof response !== "object") {
    return {
      setupIntentClientSecret: null,
      customerId: null,
      customerEphemeralKeySecret: null,
    };
  }

  const r = response;
  const setupIntent =
    r.setup_intent && typeof r.setup_intent === "object" ? r.setup_intent : {};

  const setupIntentClientSecret =
    r.setupIntentClientSecret ||
    r.setup_intent_client_secret ||
    r.client_secret ||
    r.clientSecret ||
    setupIntent.client_secret ||
    setupIntent.clientSecret;

  const customerId =
    r.customerId || r.customer_id || setupIntent.customer || null;
  const customerEphemeralKeySecret =
    r.customerEphemeralKeySecret ||
    r.customer_ephemeral_key_secret ||
    null;

  return {
    setupIntentClientSecret,
    customerId,
    customerEphemeralKeySecret,
  };
}

export function hasSetupIntentPaymentSheet(response) {
  return !!extractSetupIntentPaymentSecrets(response).setupIntentClientSecret;
}

/**
 * @param {{ initPaymentSheet: Function, presentPaymentSheet: Function }} stripe
 * @param {object} apiResponse
 * @param {{ merchantDisplayName?: string }} options
 * @returns {Promise<{ ok: boolean, canceled: boolean, error?: object }>}
 */
export async function presentSetupIntentPaymentSheet(
  stripe,
  apiResponse,
  options = {},
) {
  const { initPaymentSheet, presentPaymentSheet } = stripe;
  const { merchantDisplayName = "Thrive Initiative" } = options;
  const {
    setupIntentClientSecret,
    customerId,
    customerEphemeralKeySecret,
  } = extractSetupIntentPaymentSecrets(apiResponse);

  if (!setupIntentClientSecret) {
    return {
      ok: false,
      canceled: false,
      error: new Error("Missing setupIntentClientSecret"),
    };
  }

  const config = {
    merchantDisplayName,
    setupIntentClientSecret,
    allowsDelayedPaymentMethods: true,
    ...(Platform.OS === "android"
      ? { googlePay: { merchantCountryCode: "US", testEnv: true } }
      : {}),
  };

  if (customerId && customerEphemeralKeySecret) {
    config.customerId = customerId;
    config.customerEphemeralKeySecret = customerEphemeralKeySecret;
  }

  const { error: initError } = await initPaymentSheet(config);
  if (initError) {
    return { ok: false, canceled: false, error: initError };
  }

  const { error: presentError } = await presentPaymentSheet();
  if (presentError) {
    const canceled = presentError.code === "Canceled";
    return { ok: false, canceled, error: presentError };
  }

  return { ok: true, canceled: false };
}
