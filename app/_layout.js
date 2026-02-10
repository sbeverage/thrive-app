// file: app/_layout.js
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';
import { BeneficiaryProvider } from './context/BeneficiaryContext';
import { UserProvider } from './context/UserContext';
import { BeneficiaryFilterProvider } from './context/BeneficiaryFilterContext';
import { LocationProvider } from './context/LocationContext';
import { DiscountProvider } from './context/DiscountContext';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from './utils/constants';

export default function Layout() {
  const router = useRouter();

  useEffect(() => {
    // Handle deep links when app is already running
    // Skip if running in web browser (Safari) - only handle in native app
    const handleDeepLink = (event) => {
      // Extract URL from event object
      const url = event?.url || event;
      console.log('🔗 Deep link received:', url);
      
      if (!url) return;
      
      // Skip deep link handling in web browser (Safari)
      // In Safari, the verify.js screen will handle the URL directly via useLocalSearchParams
      if (typeof window !== 'undefined' && window.location) {
        // Running in web browser - don't process deep links here
        // The verify.js screen will handle the URL via URL params
        console.log('🌐 Running in web browser - skipping deep link handler');
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
        
        console.log('🔗 Parsed URL - Path:', pathname, 'Token:', token);
        
        // Handle original email verification flow - /verify?token=...&email=...
        // This is the original working flow from before resend email was added
        // Also handles custom scheme redirects from Safari: thriveapp://verify?token=...&email=...&verified=true
        if (pathname.includes('verify') && !pathname.includes('verify-email') && token) {
          const verified = searchParams.get('verified');
          
          // If verified=true (from Safari redirect or direct deep link), navigate directly to explainerDonate
          if (verified === 'true') {
            console.log('🔗 Email verified - navigating to explainerDonate (from Safari redirect)');
            router.replace('/signupFlow/explainerDonate');
            return;
          }
          
          // If not verified yet, route to verify screen to handle verification
          // Original flow: verify screen will verify token, then navigate to explainerDonate
          console.log('🔗 Email verification link detected - routing to verify screen');
          const emailParam = searchParams.get('email') || '';
          router.push(`/verify?token=${token}&email=${encodeURIComponent(emailParam)}`);
          return;
        }
        
        // Handle donor invitation links (new flow)
        // Format: thriveapp://verify-email?token=... or https://thrive-web-jet.vercel.app/verify-email?token=...
        if ((pathname.includes('verify-email') || pathname.includes('donor-invitation')) && token) {
          // Check if this is an invitation (64-char token) or self-signup (40-char token)
          const isInvitationToken = token.length === 64;
          
          if (isInvitationToken) {
            console.log('🔗 Donor invitation verification link detected');
            router.push(`/donorInvitationVerify?token=${token}`);
          } else {
            console.log('🔗 Self-signup verification link detected');
            router.push(`/verify?token=${token}`);
          }
          return;
        }
        
        // Handle regular email verification success redirect (custom scheme)
        if (url.startsWith('thriveapp://verify-success')) {
          console.log('🔗 Email verification success redirect received!');
          router.replace('/signupFlow/explainerDonate');
          return;
        }
        
        console.log('🔗 Deep link not matched to any handler');
      } catch (error) {
        console.error('❌ Error parsing deep link:', error);
      }
    };

    // Only set up deep link listeners in native app (not in web browser)
    // In web browser (Safari), the verify.js screen handles URL params directly
    if (typeof window !== 'undefined' && window.location) {
      // Running in web browser (Safari) - don't set up deep link listeners
      // The verify.js screen will handle URL params directly via useLocalSearchParams
      console.log('🌐 Running in web browser - skipping deep link setup');
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
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <UserProvider>
        <BeneficiaryProvider>
          <BeneficiaryFilterProvider>
            <LocationProvider>
              <DiscountProvider>
                    <SafeAreaView style={styles.safeArea}>
                      <View style={styles.container}>
                        <Stack 
                          screenOptions={{ 
                            headerShown: false,
                            gestureEnabled: false, // Disable swipe-back gesture to prevent accidental logout
                            animationEnabled: true,
                            gestureDirection: 'horizontal', // Explicitly set direction
                            fullScreenGestureEnabled: false, // Disable full screen gesture
                          }} 
                        />
                      </View>
                    </SafeAreaView>
              </DiscountProvider>
            </LocationProvider>
          </BeneficiaryFilterProvider>
        </BeneficiaryProvider>
      </UserProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
});