import { useApplePay as _useApplePay } from "@stripe/stripe-react-native";

const unavailable = {
  isApplePaySupported: false,
  presentApplePay: async () => ({ error: { code: "Unavailable", message: "Apple Pay not available" } }),
  confirmApplePayPayment: async () => ({ error: { code: "Unavailable", message: "Apple Pay not available" } }),
};

// useApplePay is undefined in Expo Go (native module not compiled in).
// Resolve once at module load so the exported symbol is always a valid hook.
export const useSafeApplePay =
  typeof _useApplePay === "function" ? _useApplePay : () => unavailable;
