import { usePlatformPay as _usePlatformPay } from "@stripe/stripe-react-native";

const unavailable = {
  loading: false,
  isPlatformPaySupported: async () => false,
  confirmPlatformPaySetupIntent: async () => ({
    error: { code: "Unavailable", message: "Apple Pay not available" },
  }),
  confirmPlatformPayPayment: async () => ({
    error: { code: "Unavailable", message: "Apple Pay not available" },
  }),
};

// usePlatformPay replaces the deprecated useApplePay in stripe-react-native ≥0.40.
// Guard against Expo Go where the native module may not be compiled in.
export const useSafeApplePay =
  typeof _usePlatformPay === "function" ? _usePlatformPay : () => unavailable;
