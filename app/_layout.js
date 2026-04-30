// file: app/_layout.js
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';
import { BeneficiaryProvider } from './context/BeneficiaryContext';
import { UserProvider } from './context/UserContext';
import { BeneficiaryFilterProvider } from './context/BeneficiaryFilterContext';
import { LocationProvider } from './context/LocationContext';
import { DiscountProvider } from './context/DiscountContext';
import { DiscountFilterProvider } from './context/DiscountFilterContext';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY, STRIPE_MERCHANT_IDENTIFIER } from './utils/constants';
import ErrorBoundary from '../components/ErrorBoundary';


// Initialize Sentry as early as possible so it captures all errors
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://680cba8ad82311de70f4819ab349b969@o4511214501363712.ingest.us.sentry.io/4511214507786241',
  debug: false,
  tracesSampleRate: 0.2,
  enableAutoSessionTracking: true,
  attachStacktrace: true,
});

function Layout() {
  const router = useRouter();

  // Check for OTA updates on every launch and apply immediately
  useEffect(() => {
    const checkForUpdate = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        // Silently ignore — fails gracefully in local dev / Expo Go
      }
    };
    checkForUpdate();
  }, []);

  useEffect(() => {
    // Handle deep links when app is already running
    // Skip if running in web browser (Safari) - only handle in native app
    const handleDeepLink = (event) => {
      const url = event?.url || event;
      if (!url) return;

      // Skip deep link handling in web browser — verify.js handles URL params directly
      if (typeof window !== 'undefined' && window.location) {
        return;
      }

      try {
        // Parse URL
        let parsedUrl;
        try {
          parsedUrl = new URL(url);
        } catch {
          // Handle custom scheme URLs that don't parse as standard URLs
          if (url.startsWith('thriveapp://')) {
            const urlWithoutScheme = url.replace('thriveapp://', '');
            parsedUrl = {
              pathname: urlWithoutScheme.split('?')[0],
              search: url.includes('?') ? '?' + url.split('?')[1] : '',
              searchParams: new URLSearchParams(url.includes('?') ? url.split('?')[1] : ''),
            };
          } else {
            parsedUrl = new URL(url);
          }
        }

        const pathname = parsedUrl.pathname || '';
        const searchParams = parsedUrl.searchParams || new URLSearchParams(parsedUrl.search || '');
        const token = searchParams.get('token');

        // Password reset: /reset-password?token=...&email=...
        if (pathname.includes('reset-password') && token) {
          const emailParam = searchParams.get('email') || '';
          router.replace(`/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(emailParam)}`);
          return;
        }

        // Email verification: /verify?token=...&email=...
        // Also handles thriveapp://verify?token=...&verified=true (custom scheme fallback)
        if (pathname.includes('verify') && !pathname.includes('verify-email') && !pathname.includes('donorInvitationVerify') && token) {
          const verified = searchParams.get('verified');
          if (verified === 'true') {
            router.replace('/signupFlow/explainerDonate');
            return;
          }
          const emailParam = searchParams.get('email') || '';
          router.push(`/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(emailParam)}`);
          return;
        }

        // Referral signup: /signup?ref=xxx
        const ref = searchParams.get('ref');
        if ((pathname.includes('signup') || pathname === 'signup') && ref) {
          router.replace(`/signup?ref=${encodeURIComponent(ref)}`);
          return;
        }

        // Handle donor invitation links
        // Universal Link: https://thrive-web-jet.vercel.app/donorInvitationVerify?token=...
        // Legacy custom scheme: thriveapp://verify-email?token=...
        if ((pathname.includes('donorInvitationVerify') || pathname.includes('verify-email') || pathname.includes('donor-invitation')) && token) {
          const isInvitationToken = token.length === 64;
          if (isInvitationToken) {
            router.push(`/donorInvitationVerify?token=${token}`);
          } else {
            router.push(`/verify?token=${encodeURIComponent(token)}`);
          }
          return;
        }

        // Custom scheme verification success fallback
        if (url.startsWith('thriveapp://verify-success')) {
          router.replace('/signupFlow/explainerDonate');
          return;
        }
      } catch (error) {
        console.error('❌ Error parsing deep link:', error);
      }
    };

    // Only set up deep link listeners in native app (not in web browser)
    // In web browser (Safari), the verify.js screen handles URL params directly
    if (typeof window !== 'undefined' && window.location) {
      return () => {};
    }

    // Running in native app - set up deep link listeners
    try {
      const subscription = Linking.addEventListener('url', handleDeepLink);

      // Check if app was opened with a deep link
      Linking.getInitialURL().then((url) => {
        if (url) {
          handleDeepLink(url);
        }
      }).catch((err) => {
        console.error('❌ Error getting initial URL:', err);
      });

      return () => {
        subscription?.remove();
      };
    } catch (error) {
      console.error('❌ Error setting up deep link listeners:', error);
      return () => {};
    }
  }, [router]);

  return (
    <ErrorBoundary>
      <StripeProvider
        publishableKey={STRIPE_PUBLISHABLE_KEY}
        merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER}
      >
        <UserProvider>
          <BeneficiaryProvider>
            <BeneficiaryFilterProvider>
              <LocationProvider>
                <DiscountProvider>
                  <DiscountFilterProvider>
                    <SafeAreaView style={styles.safeArea}>
                      <View style={styles.container}>
                        <Stack
                          screenOptions={{
                            headerShown: false,
                            gestureEnabled: false,
                            animationEnabled: true,
                            gestureDirection: 'horizontal',
                            fullScreenGestureEnabled: false,
                          }}
                        />
                      </View>
                    </SafeAreaView>
                  </DiscountFilterProvider>
                </DiscountProvider>
              </LocationProvider>
            </BeneficiaryFilterProvider>
          </BeneficiaryProvider>
        </UserProvider>
      </StripeProvider>
    </ErrorBoundary>
  );
}

// Wrap with Sentry so all unhandled JS errors are captured automatically
export default Sentry.wrap(Layout);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
});
