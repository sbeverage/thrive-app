import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AntDesign } from '@expo/vector-icons';
import API from './lib/api';
import { useUser } from './context/UserContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function VerifyEmailScreen() {
  const { email: paramEmail, token } = useLocalSearchParams();
  const { user, markAsVerified } = useUser();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Get email from params or user context
  const email = paramEmail || user.email;

  console.log('📧 VerifyEmail - Email parameter:', paramEmail);
  console.log('📧 VerifyEmail - User email:', user.email);
  console.log('📧 VerifyEmail - Final email:', email);
  console.log('📧 VerifyEmail - Token parameter:', token);

  // Auto-verify if token is provided
  useEffect(() => {
    if (token && email) {
      handleVerification();
    }
  }, [token, email]);

  // Auto-redirect if already verified (e.g. social login)
  useEffect(() => {
    if (user?.isVerified) {
      console.log('✅ User already verified, redirecting to onboarding...');
      router.replace('/signupFlow/explainerDonate');
    }
  }, [user?.isVerified]);

  const handleVerification = async () => {
    if (!token || !email) return;

    console.log('🔍 Starting verification process...');
    setIsLoading(true);

    try {
      const response = await API.verifyEmail(email, token);
      console.log('✅ Verification response:', response);

      // Check if verification was successful
      if (response.success || response.message?.includes('verified') || response.message?.includes('success')) {
        console.log('✅ Email verification successful!');
        markAsVerified();
        Alert.alert(
          'Email Verified! 🎉',
          'Your email has been successfully verified. Let\'s set up your giving preferences!',
          [
            {
              text: 'Continue',
              onPress: () => router.replace('/signupFlow/explainerDonate'),
            },
          ]
        );
      } else {
        console.log('❌ Verification failed:', response.message);
        Alert.alert('Verification Failed', response.message || 'Email verification failed. Please try again.');
      }
    } catch (error) {
      console.log('❌ Verification error:', error.message);
      Alert.alert('Verification Error', error.message || 'An error occurred during verification. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#4CA1AF', '#2C3E50']}
        style={styles.gradientBackground}
      />
      
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <View style={styles.backButtonContainer}>
          <Image 
            source={require('../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#333' }} 
          />
        </View>
      </TouchableOpacity>

      <ScrollView 
        style={styles.scrollContent} 
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentCard}>
          <View style={styles.iconContainer}>
            <Image 
              source={require('../assets/images/piggy-email-verified.png')}
              style={styles.piggyImage}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            We've sent a verification link to:
          </Text>
          <Text style={styles.emailText}>{email}</Text>

          <Text style={styles.description}>
            Please check your email and click the verification link to activate your account. 
            The link will open in your web browser.
          </Text>

          <View style={styles.buttonContainer}>
            {/* Resend verification email */}
            <TouchableOpacity
              style={[
                styles.resendButton, 
                { 
                  backgroundColor: '#DB8633', 
                  marginTop: 16,
                  opacity: !email ? 0.5 : 1
                }
              ]}
              disabled={!email || isLoading}
              onPress={async () => {
                if (!email) {
                  Alert.alert('Error', 'Email address is required. Please make sure you are logged in.');
                  return;
                }
                
                console.log('📧 Resending verification email to:', email);
                setIsLoading(true);
                try {
                  const response = await API.resendVerification(email);
                  console.log('✅ Resend response:', response);
                  Alert.alert(
                    'Success', 
                    'Verification email sent! Please check your inbox and click the verification link.',
                    [{ text: 'OK' }]
                  );
                } catch (error) {
                  console.error('❌ Resend email error:', error);
                  // Show user-friendly error message
                  const errorMessage = error.message || 'Unable to resend verification email at this time.';
                  Alert.alert(
                    'Verification Email',
                    errorMessage + '\n\nPlease check your inbox for the original verification email, or contact support if you need assistance.',
                    [{ text: 'OK' }]
                  );
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              {Platform.OS === 'web' ? (
                <Text style={{ marginRight: 8, color: '#fff' }}>✉️</Text>
              ) : (
                <AntDesign name="mail" size={20} color="#fff" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.resendButtonText}>Resend Verification Email</Text>
            </TouchableOpacity>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#4CA1AF" size="small" />
                <Text style={styles.checkingText}>Verifying your email...</Text>
              </View>
            )}

            {/* Skip Verification Button (for testing) */}
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
                        markAsVerified();
                        // Navigate to next step in signup flow
                        router.replace('/signupFlow/explainerDonate');
                      }
                    }
                  ]
                );
              }}
            >
              <Text style={styles.skipButtonText}>Skip Verification (Testing)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
    height: SCREEN_HEIGHT * 0.4,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
  },
  backButtonContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    paddingTop: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'visible',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
    position: 'absolute',
    top: -80,
    left: 0,
    right: 0,
    overflow: 'visible',
  },
  piggyImage: {
    width: 160,
    height: 160,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginTop: 30,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    marginBottom: 8,
  },
  emailText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4CA1AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    color: '#5D6D7E',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  buttonContainer: {
    width: '100%',
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  checkingText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#4CA1AF',
    fontWeight: '500',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 24,
    alignSelf: 'center',
  },
  skipButtonText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});