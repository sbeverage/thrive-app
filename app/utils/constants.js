import { Dimensions } from "react-native";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// Backend API Configuration - ✅ Supabase Edge Functions
// Note: Endpoints in api.js start with /api/, so base URL should NOT include /api
export const BACKEND_URL =
  "https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1";
// Supabase Anon Key - Required for all Edge Function requests (not user authentication)
// This identifies the Supabase project, not the user
// Set EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file or EAS Secrets
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Stripe Publishable Key - Get this from your Stripe Dashboard
// For testing, use: pk_test_... (test mode)
// For production, use: pk_live_... (live mode)
// Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in your .env file or EAS Secrets
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  "pk_test_51I1hawHeCafBpXfQZYUqZqKNh2pIiQ975wm9xUMvAdCnYhlmS8Glm9sDCyRZjzzJ6lazR4JChRu4rhJ4ZeOpnW3b00kbYiafyl";

/** Apple Pay — must match Apple Developer Merchant ID + Xcode entitlements */
export const STRIPE_MERCHANT_IDENTIFIER =
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER ||
  "merchant.com.thrive-initiative";

// Fee structure
// Flat service fee charged on every transaction
export const SERVICE_FEE = 3.00;
// Stripe's standard card processing rate (2.9% + $0.30 per transaction)
export const STRIPE_CC_FEE_RATE = 0.029;
export const STRIPE_CC_FEE_FIXED = 0.30;

export { screenWidth, screenHeight };
