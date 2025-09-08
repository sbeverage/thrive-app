// file: app/_layout.js
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';
import { BeneficiaryProvider } from './context/BeneficiaryContext';
import { UserProvider } from './context/UserContext';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';

export default function Layout() {
  const router = useRouter();

  useEffect(() => {
    // Handle deep links when app is already running
    const handleDeepLink = (url) => {
      console.log('�� Deep link received:', url);
      
      if (url && url.startsWith('thriveapp://verify-success')) {
        console.log('�� Email verification success redirect received!');
        // Mark user as verified and navigate to home
        // We'll need to access the UserContext here
        router.replace('/(tabs)/home');
        return;
      }
      
      if (url && (url.startsWith('thriveapp://verify') || url.includes('thriveapp://verify'))) {
        console.log('🔗 Processing thriveapp://verify link');
        
        try {
          // Handle different URL formats
          let queryString = '';
          if (url.includes('?')) {
            queryString = url.split('?')[1];
          } else if (url.includes('verify/')) {
            // Handle format: thriveapp://verify/token?email=...
            const parts = url.split('verify/')[1];
            if (parts.includes('?')) {
              const [token, ...emailParts] = parts.split('?');
              queryString = `token=${token}&${emailParts.join('?')}`;
            } else {
              queryString = `token=${parts}`;
            }
          }
          
          console.log('🔗 Query string:', queryString);
          
          // Extract token and email from URL
          const urlParams = new URLSearchParams(queryString);
          const token = urlParams.get('token');
          const email = urlParams.get('email');
          
          console.log('�� Parsed deep link - Token:', token, 'Email:', email);
          
          if (token) {
            console.log('🔗 Navigating to verify page with token');
            // Navigate to verify page with parameters
            router.push(`/verify?token=${token}&email=${encodeURIComponent(email || '')}`);
          } else {
            console.log('🔗 No token found in deep link');
          }
        } catch (error) {
          console.log('�� Error parsing deep link:', error);
        }
      } else {
        console.log('�� Not a thriveapp://verify link, ignoring');
      }
    };

    // Listen for deep links when app is running
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
  }, []);

  return (
    <UserProvider>
      <BeneficiaryProvider>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <Stack initialRouteName="splashScreen" screenOptions={{ headerShown: false }} />
          </View>
        </SafeAreaView>
      </BeneficiaryProvider>
    </UserProvider>
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