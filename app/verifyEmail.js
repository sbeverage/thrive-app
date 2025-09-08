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
  Linking,
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

  useEffect(() => {
    if (token && email) {
      handleVerification();
    }
  }, [token, email]);

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
          'Your email has been successfully verified. You can now access all features of the app.',
          [
            {
              text: 'Continue',
              onPress: () => router.replace('/(tabs)/home'),
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
          <AntDesign name="arrowleft" size={24} color="#333" />
        </View>
      </TouchableOpacity>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.contentCard}>
          <View style={styles.iconContainer}>
            <AntDesign name="mail" size={60} color="#4CA1AF" />
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
              style={[styles.resendButton, { backgroundColor: '#4CA1AF', marginTop: 16 }]}
              onPress={async () => {
                console.log('📧 Resending verification email...');
                setIsLoading(true);
                try {
                  const response = await API.resendVerification(email);
                  console.log('✅ Resend response:', response);
                  Alert.alert('Success', 'Verification email sent! Please check your inbox and click the verification link.');
                } catch (error) {
                  console.log('❌ Resend verification failed:', error.message);
                  Alert.alert('Error', `Failed to resend verification email: ${error.message}`);
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              <AntDesign name="mail" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.resendButtonText}>Resend Verification Email</Text>
            </TouchableOpacity>

            {/* Open web verification */}
            <TouchableOpacity
              style={[styles.resendButton, { backgroundColor: '#FF9800', marginTop: 16 }]}
              onPress={() => {
                console.log('🌐 Opening web verification');
                const verificationLink = `https://thrive-web-jet.vercel.app/verify?email=${encodeURIComponent(email)}`;
                
                Alert.alert(
                  'Web Verification', 
                  'This will open the verification page in your browser. You can also check your email for the verification link.',
                  [
                    {
                      text: 'Open in Browser',
                      onPress: () => {
                        Linking.openURL(verificationLink).catch(err => {
                          console.log('🌐 Web link error:', err);
                          Alert.alert('Error', 'Could not open web browser. Please check your email for the verification link.');
                        });
                      }
                    },
                    { text: 'Cancel' }
                  ]
                );
              }}
            >
              <AntDesign name="link" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.resendButtonText}>Open Web Verification</Text>
            </TouchableOpacity>

            {/* Temporary bypass for testing */}
            <TouchableOpacity
              style={[styles.resendButton, { backgroundColor: '#9C27B0', marginTop: 16 }]}
              onPress={async () => {
                console.log('🚀 Temporary verification bypass');
                Alert.alert(
                  'Skip Verification (Testing)', 
                  'This will mark your email as verified for testing purposes. Use this only during development.',
                  [
                    {
                      text: 'Skip Verification',
                      onPress: () => {
                        markAsVerified();
                        Alert.alert('Success', 'Email marked as verified for testing. You can now access all features.');
                        router.replace('/(tabs)/home');
                      }
                    },
                    { text: 'Cancel' }
                  ]
                );
              }}
            >
              <AntDesign name="checkcircle" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.resendButtonText}>Skip Verification (Testing)</Text>
            </TouchableOpacity>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#4CA1AF" size="small" />
                <Text style={styles.checkingText}>Verifying your email...</Text>
              </View>
            )}
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
    flexGrow: 1,
    paddingTop: 100,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
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
});