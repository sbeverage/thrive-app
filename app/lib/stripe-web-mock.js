// Web stub for @stripe/stripe-react-native — native module not available on web
import React from 'react';

export const StripeProvider = ({ children }) => children;
export const useStripe = () => ({
  initPaymentSheet: async () => ({ error: { message: 'Stripe not available on web' } }),
  presentPaymentSheet: async () => ({ error: { message: 'Stripe not available on web' } }),
  confirmPayment: async () => ({ error: { message: 'Stripe not available on web' } }),
  createPaymentMethod: async () => ({ error: { message: 'Stripe not available on web' } }),
  handleNextAction: async () => ({ error: { message: 'Stripe not available on web' } }),
});
export const CardField = () => null;
export const CardForm = () => null;
export const ApplePay = {};
export const useApplePay = () => ({
  isApplePaySupported: false,
  presentApplePay: async () => {},
  confirmApplePayPayment: async () => {},
});
export const useConfirmPayment = () => ({ confirmPayment: async () => ({}) });
export const usePaymentSheet = () => ({
  initPaymentSheet: async () => {},
  presentPaymentSheet: async () => {},
  loading: false,
});
export default { StripeProvider, useStripe, CardField };
