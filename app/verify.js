// Universal verification handler - works for both mobile and web
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AntDesign } from '@expo/vector-icons';
import API from './lib/api';
import { useUser } from './context/UserContext';

// Web-compatible imports
const Linking = Platform.OS === 'web' ? null : require('react-native').Linking;
const Alert = Platform.OS === 'web' ? {
  alert: (title, message, buttons) => {
    if (typeof window !== 'undefined' && window.confirm) {
      const result = window.confirm(`${title}\n\n${message}`);
      if (result && buttons && buttons[1]) {
        buttons[1].onPress && buttons[1].onPress();
      }
    }
  }
} : require('react-native').Alert;

export default function UniversalVerifyHandler() {
  const router = useRouter();
  const { token, email } = useLocalSearchParams();
  const { markAsVerified } = useUser();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('pending'); // 'pending', 'verifying', 'success', 'error'
  const [isMobile, setIsMobile] = useState(Platform.OS !== 'web');

  // Auto-verify if token is provided
  useEffect(() => {
    if (token && verificationStatus === 'pending') {
      handleVerification();
    }
  }, [token]);

  const handleVerification = async () => {
    if (!token) {
      setVerificationStatus('error');
      return;
    }
    
    setIsVerifying(true);
    setVerificationStatus('verifying');

    try {
      console.log('🔗 Universal verification - Token:', token);
      console.log('🔗 Universal verification - Email:', email);
      console.log('🔗 Universal verification - Platform:', Platform.OS);

      const response = await API.verifyEmail(token);
      
      // Check if verification was successful (backend returns success or message)
      if (response.success || response.message?.includes('verified') || response.message?.includes('success')) {
        // Mark user as verified in context
        await markAsVerified();
        setVerificationStatus('success');
        console.log('✅ Email verified via universal link');
        
        // Original simple verification flow
        // Resend email functionality is kept (button available for errors)
        // If in app, navigate directly. If in Safari/web, try to open app automatically
        setTimeout(() => {
          if (Platform.OS !== 'web') {
            // Running in app - navigate directly (original simple flow)
            console.log('🔗 Navigating to /signupFlow/explainerDonate (original simple flow)');
            router.replace('/signupFlow/explainerDonate');
          } else {
            // If in Safari/web, redirect to the same HTTPS Universal Link with verified=true
            // This works with Resend emails because it's still an HTTPS link
            // Universal Links will catch it and open the app automatically
            console.log('🌐 Running in Safari/web - redirecting to Universal Link with verified=true');
            setTimeout(() => {
              try {
                // Use the same HTTPS Universal Link format but with verified=true
                // This is the same approach that worked with the original Gmail setup
                const universalLink = `https://thrive-web-jet.vercel.app/verify?token=${token || ''}&email=${encodeURIComponent(email || '')}&verified=true`;
                console.log('🔗 Redirecting to Universal Link:', universalLink);
                
                if (typeof window !== 'undefined') {
                  // Redirect to the Universal Link - Universal Links will handle opening the app
                  window.location.href = universalLink;
                }
              } catch (error) {
                console.error('❌ Redirect failed:', error);
                // Fallback: Try custom scheme
                try {
                  const deepLink = `thriveapp://verify?token=${token || ''}&email=${email || ''}&verified=true`;
                  window.location.href = deepLink;
                } catch (fallbackError) {
                  console.error('❌ Fallback redirect also failed:', fallbackError);
                  // User will see the "Continue in App" button to manually open
                }
              }
            }, 1500); // Wait 1.5 seconds before redirect
          }
        }, 1500);
      } else {
        throw new Error(response.message || 'Verification failed');
      }
    } catch (error) {
      console.error('❌ Universal verification failed:', error);
      setVerificationStatus('error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRetry = () => {
    if (isMobile) {
      router.replace('/verifyEmail');
    } else {
      // On web, try to open mobile app
      if (Platform.OS === 'web') {
        window.open('https://apps.apple.com/app/thrive-app', '_blank');
      } else {
        const deepLink = `thriveapp://verify?token=${token}&email=${email}`;
        Linking.openURL(deepLink).catch(() => {
          Alert.alert('App Not Found', 'Please install the Thrive app to continue.');
        });
      }
    }
  };

  const handleResendEmail = async () => {
    if (!email) {
      Alert.alert('Oops!', 'No email provided. Please make sure you are logged in.');
      console.error('❌ No email available for resend');
      return;
    }

    console.log('📧 Resending verification email to:', email);
    try {
      const response = await API.resendVerification(email);
      console.log('✅ Resend response:', response);
      Alert.alert('✅ Email Sent!', 'Check your inbox for a new verification link.');
    } catch (error) {
      console.error('❌ Resend error:', error);
      const errorMessage = error.message || 'Something went wrong. Please try again.';
      Alert.alert('Error', errorMessage);
    }
  };

  return (
    <View style={styles.container}>
      {/* Blue Gradient Background */}
      <LinearGradient
        colors={["#2C3E50", "#4CA1AF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBackground}
      />
      
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Email Verification</Text>
          <Text style={styles.subtitle}>Thrive Initiative</Text>
        </View>

        {/* Status Display */}
        {verificationStatus === 'verifying' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color="#4CA1AF" />
            <Text style={styles.statusText}>Verifying your email...</Text>
          </View>
        )}

        {verificationStatus === 'success' && (
          <View style={styles.statusContainer}>
            <Image 
              source={require('../assets/icons/check-circle.png')} 
              style={{ width: 60, height: 60, tintColor: '#4CAF50' }} 
            />
            <Text style={styles.successText}>Email Verified!</Text>
            <Text style={styles.successSubtext}>
              {Platform.OS === 'web' 
                ? 'Your email has been verified! Please open the Thrive app to continue.'
                : 'Redirecting to app...'}
            </Text>
            {Platform.OS === 'web' && typeof window !== 'undefined' && (
              <>
                <TouchableOpacity 
                  style={styles.openAppButton}
                  onPress={() => {
                    // Use the same HTTPS Universal Link approach that worked with Gmail
                    // This works with Resend emails because it's still an HTTPS link
                    try {
                      const universalLink = `https://thrive-web-jet.vercel.app/verify?token=${token || ''}&email=${encodeURIComponent(email || '')}&verified=true`;
                      console.log('🔗 Redirecting to Universal Link:', universalLink);
                      
                      // Redirect to Universal Link - Universal Links will handle opening the app
                      window.location.href = universalLink;
                      
                      // Fallback: Also try custom scheme if Universal Link doesn't work
                      setTimeout(() => {
                        try {
                          const deepLink = `thriveapp://verify?token=${token || ''}&email=${email || ''}&verified=true`;
                          window.open(deepLink, '_blank');
                        } catch (fallbackError) {
                          console.error('❌ Fallback redirect failed:', fallbackError);
                        }
                      }, 500);
                    } catch (error) {
                      console.error('❌ Error redirecting:', error);
                      Alert.alert(
                        'Email Verified!',
                        'Your email has been verified. Please open the Thrive app on your device to continue.',
                        [{ text: 'OK' }]
                      );
                    }
                  }}
                >
                  <Text style={styles.openAppButtonText}>Continue in App</Text>
                </TouchableOpacity>
                <Text style={styles.helpText}>
                  If the app doesn't open automatically, tap the button above or open the Thrive app manually.
                </Text>
              </>
            )}
          </View>
        )}

        {verificationStatus === 'error' && (
          <View style={styles.statusContainer}>
            <AntDesign name="closecircle" size={60} color="#f44336" />
            <Text style={styles.errorText}>Verification Failed</Text>
            <Text style={styles.errorSubtext}>
              {!token ? 'No verification token provided.' : 'The verification link is invalid or expired.'}
            </Text>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
                {Platform.OS === 'web' ? (
                  <Text style={{ marginRight: 8 }}>{isMobile ? '←' : '📱'}</Text>
                ) : (
                  <AntDesign name={isMobile ? "left" : "mobile1"} size={20} color="#fff" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.primaryButtonText}>
                  {isMobile ? 'Back to App' : 'Open in Thrive App'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.secondaryButton} onPress={handleResendEmail}>
                {Platform.OS === 'web' ? (
                  <Text style={{ marginRight: 8 }}>✉️</Text>
                ) : (
                  <AntDesign name="mail" size={20} color="#2C3E50" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.secondaryButtonText}>Resend Email</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Pending State */}
        {verificationStatus === 'pending' && !token && (
          <View style={styles.statusContainer}>
            <Text style={styles.pendingText}>Waiting for verification link...</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleResendEmail}>
              {Platform.OS === 'web' ? (
                <Text style={{ marginRight: 8 }}>✉️</Text>
              ) : (
                <AntDesign name="mail" size={20} color="#2C3E50" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.secondaryButtonText}>Resend Email</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Skip Verification Button (for testing) */}
        {(verificationStatus === 'pending' || verificationStatus === 'verifying' || verificationStatus === 'error') && (
          <View style={styles.skipContainer}>
            <TouchableOpacity 
              style={styles.skipButton}
              onPress={() => {
                Alert.alert(
                  'Skip Verification',
                  'This will skip email verification for testing purposes. Continue?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Skip',
                      onPress: () => {
                        console.log('⚠️ Skipping verification for testing');
                        // Mark as verified for testing
                        markAsVerified().then(() => {
                          // Navigate to next screen
                          if (Platform.OS !== 'web') {
                            router.replace('/signupFlow/explainerDonate');
                          } else {
                            Alert.alert(
                              'Verification Skipped',
                              'Verification skipped for testing. Please open the app to continue.',
                              [{ text: 'OK' }]
                            );
                          }
                        });
                      }
                    }
                  ]
                );
              }}
            >
              <Text style={styles.skipButtonText}>Skip Verification (Testing)</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5fa',
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#4CA1AF',
    fontWeight: '600',
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  statusText: {
    marginTop: 16,
    fontSize: 16,
    color: '#4CA1AF',
    fontWeight: '500',
  },
  successText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 16,
    textAlign: 'center',
  },
  successSubtext: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f44336',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    marginBottom: 20,
  },
  pendingText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#2C3E50',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2C3E50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2C3E50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  secondaryButtonText: {
    color: '#2C3E50',
    fontSize: 16,
    fontWeight: '700',
  },
  openAppButton: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 24,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  openAppButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  skipContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  skipButtonText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  emojiIcon: {
    fontSize: 60,
    textAlign: 'center',
  },
});

