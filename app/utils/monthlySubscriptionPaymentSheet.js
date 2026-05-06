import { Platform } from "react-native";
import Constants from "expo-constants";
import { PlatformPay } from "@stripe/stripe-react-native";
import {
  STRIPE_MERCHANT_IDENTIFIER,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_PAYMENT_RETURN_URL,
} from "./constants";

/**
 * Expo Go is not the real app binary — Stripe Apple Pay / Google Pay bind to the host
 * client and can glitch the Payment Sheet. Dev / preview builds use a real bundleId.
 */
export function isStripeExpoGoHost() {
  try {
    return Constants.appOwnership === "expo";
  } catch {
    return false;
  }
}

function isExpoGoHost() {
  return isStripeExpoGoHost();
}

/**
 * Stripe-recommended mobile flow: Payment Sheet (initPaymentSheet → presentPaymentSheet).
 * Apple Pay / Google Pay are enabled via `applePay` / `googlePay` on initPaymentSheet.
 * @see https://stripe.com/docs/payments/accept-a-payment?platform=react-native
 */

/**
 * Backend may return secrets at the top level, under `data`, or under `subscription`.
 */
export function extractMonthlySubscriptionPaymentSecrets(response) {
  if (!response || typeof response !== "object") {
    return {
      paymentIntentClientSecret: null,
      customerId: null,
      customerEphemeralKeySecret: null,
    };
  }
  const nested = response.data;
  const r =
    nested &&
    typeof nested === "object" &&
    (nested.paymentIntentClientSecret ||
      nested.payment_intent_client_secret ||
      nested.clientSecret)
      ? { ...response, ...nested }
      : response;
  const sub =
    r.subscription && typeof r.subscription === "object"
      ? r.subscription
      : {};

  const paymentIntentClientSecret =
    r.paymentIntentClientSecret ||
    r.payment_intent_client_secret ||
    r.clientSecret ||
    sub.clientSecret ||
    sub.paymentIntentClientSecret ||
    sub.payment_intent_client_secret;

  const customerId =
    r.customerId || r.customer_id || sub.customerId || sub.customer_id;
  const customerEphemeralKeySecret =
    r.customerEphemeralKeySecret ||
    r.customer_ephemeral_key_secret ||
    sub.customerEphemeralKeySecret ||
    sub.customer_ephemeral_key_secret;

  return {
    paymentIntentClientSecret,
    customerId,
    customerEphemeralKeySecret,
  };
}

export function hasMonthlySubscriptionPaymentSheet(response) {
  return !!extractMonthlySubscriptionPaymentSecrets(response)
    .paymentIntentClientSecret;
}

/**
 * @param {{ initPaymentSheet: Function, presentPaymentSheet: Function }} stripe
 * @param {object} apiResponse — body from createMonthlySubscription / updateMonthlyDonationAmount
 * @param {{ merchantDisplayName?: string, cardOnly?: boolean }} options
 *   - cardOnly: true = omit applePay/googlePay (card & other PMs only). false = wallet methods in sheet.
 */
export async function presentMonthlySubscriptionPaymentSheet(
  stripe,
  apiResponse,
  options = {},
) {
  const { initPaymentSheet, presentPaymentSheet } = stripe;
  const {
    merchantDisplayName = "Thrive Initiative",
    cardOnly = false,
    // When true, omits customerId / ephemeral key (no saved cards or Link on file).
    skipSavedPaymentMethods = false,
  } = options;

  const cardOnlyForRuntime = cardOnly || isExpoGoHost();

  const {
    paymentIntentClientSecret,
    customerId,
    customerEphemeralKeySecret,
  } = extractMonthlySubscriptionPaymentSecrets(apiResponse);

  if (!paymentIntentClientSecret) {
    return {
      ok: false,
      canceled: false,
      error: new Error("Missing paymentIntentClientSecret"),
    };
  }

  const googlePayTestEnv =
    typeof STRIPE_PUBLISHABLE_KEY === "string" &&
    STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_");

  const config = {
    merchantDisplayName,
    paymentIntentClientSecret,
    allowsDelayedPaymentMethods: true,
    returnURL: STRIPE_PAYMENT_RETURN_URL,
    ...(!cardOnlyForRuntime && Platform.OS === "ios" && STRIPE_MERCHANT_IDENTIFIER
      ? {
          applePay: {
            merchantCountryCode: "US",
          },
        }
      : {}),
    ...(!cardOnlyForRuntime && Platform.OS === "android"
      ? {
          googlePay: {
            merchantCountryCode: "US",
            testEnv: googlePayTestEnv,
          },
        }
      : {}),
  };

  if (!skipSavedPaymentMethods && customerId && customerEphemeralKeySecret) {
    config.customerId = customerId;
    config.customerEphemeralKeySecret = customerEphemeralKeySecret;
  }

  const { error: initError } = await initPaymentSheet(config);
  if (initError) {
    console.warn("[PaymentSheet] initPaymentSheet failed:", {
      code: initError.code,
      message: initError.message,
      type: initError.type,
    });
    return { ok: false, canceled: false, error: initError };
  }

  const { error: presentError } = await presentPaymentSheet();
  if (presentError) {
    console.warn("[PaymentSheet] presentPaymentSheet failed:", {
      code: presentError.code,
      message: presentError.message,
      type: presentError.type,
    });
    const canceled = presentError.code === "Canceled";
    return { ok: false, canceled, error: presentError };
  }

  return { ok: true, canceled: false };
}

/**
 * Apple Pay / Google Pay only — skips Stripe Payment Sheet (“pick wallet” step).
 * @param {{ confirmPlatformPayPayment: Function }} stripe
 * @param {object} apiResponse — body from createMonthlySubscription
 * @param {{ amountUsd?: number, merchantDisplayName?: string }} options — amountUsd must match the Payment Intent total (dollars)
 */
export async function presentMonthlySubscriptionNativeWallet(
  stripe,
  apiResponse,
  options = {},
) {
  const { confirmPlatformPayPayment } = stripe;
  const merchantDisplayName = options.merchantDisplayName || "Thrive Initiative";
  const { paymentIntentClientSecret } =
    extractMonthlySubscriptionPaymentSecrets(apiResponse);

  if (
    !paymentIntentClientSecret ||
    typeof confirmPlatformPayPayment !== "function"
  ) {
    return {
      ok: false,
      canceled: false,
      error: new Error(
        "Missing paymentIntentClientSecret or confirmPlatformPayPayment",
      ),
    };
  }

  const amountUsd = Number(options.amountUsd);
  const safeUsd = Number.isFinite(amountUsd) ? Math.max(amountUsd, 0) : 0;
  /** Must match Stripe PaymentIntent currency amount (Stripe cart uses USD strings here). */
  const amountStr = (Math.round(safeUsd * 100) / 100).toFixed(2);

  try {
    if (Platform.OS === "ios") {
      if (!STRIPE_MERCHANT_IDENTIFIER) {
        return {
          ok: false,
          canceled: false,
          error: new Error("Missing STRIPE_MERCHANT_IDENTIFIER for Apple Pay"),
        };
      }
      const cartItems = [
        {
          paymentType: PlatformPay.PaymentType.Immediate,
          label: "Monthly subscription (incl. fees)",
          amount: amountStr,
        },
      ];
      const applePay = {
        merchantCountryCode: "US",
        currencyCode: "USD",
        cartItems,
        merchantCapabilities: [PlatformPay.ApplePayMerchantCapability.Supports3DS],
      };

      const { error } = await confirmPlatformPayPayment(
        paymentIntentClientSecret,
        { applePay },
      );

      if (error) {
        const canceled =
          error.code === "Canceled" ||
          String(error.declineCode || "").toLowerCase() === "cancel" ||
          /cancel|cancell?ed/i.test(String(error.message || ""));
        return { ok: false, canceled, error };
      }
      return { ok: true, canceled: false };
    }

    if (Platform.OS === "android") {
      const googlePayTestEnv =
        typeof STRIPE_PUBLISHABLE_KEY === "string" &&
        STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_");

      const { error } = await confirmPlatformPayPayment(
        paymentIntentClientSecret,
        {
          googlePay: {
            testEnv: googlePayTestEnv,
            merchantCountryCode: "US",
            currencyCode: "USD",
            merchantName: merchantDisplayName,
            label: options.googlePayLabel || "Monthly donation",
            amount: Math.round(safeUsd * 100),
          },
        },
      );

      if (error) {
        const canceled =
          error.code === "Canceled" ||
          /cancel|cancell?ed/i.test(String(error.message || ""));
        return { ok: false, canceled, error };
      }
      return { ok: true, canceled: false };
    }

    return {
      ok: false,
      canceled: false,
      error: new Error("Native wallet is only supported on iOS and Android."),
    };
  } catch (e) {
    return { ok: false, canceled: false, error: e };
  }
}
