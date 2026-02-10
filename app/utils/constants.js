import { Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Backend API Configuration - ✅ Supabase Edge Functions
// Note: Endpoints in api.js start with /api/, so base URL should NOT include /api
export const BACKEND_URL = 'https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1';

// Supabase Anon Key - Required for all Edge Function requests (not user authentication)
// This identifies the Supabase project, not the user
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kcWduZHloemxud29qdHVib3VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5NjE3MTksImV4cCI6MjA3NzUzNzcxOX0.EtIyUJ3kFILYV6bAIETAk6RE-ra7sEDd14bDG7PDVfg';

// Stripe Publishable Key - Get this from your Stripe Dashboard
// For testing, use: pk_test_... (test mode)
// For production, use: pk_live_... (live mode)
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_51I1hawHeCafBpXfQZYUqZqKNh2pIiQ975wm9xUMvAdCnYhlmS8Glm9sDCyRZjzzJ6lazR4JChRu4rhJ4ZeOpnW3b00kbYiafyl';

export { screenWidth, screenHeight };
