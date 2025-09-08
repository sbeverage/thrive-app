// Universal verification handler - works for both mobile and web
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
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
        
        // Show success and navigate
        setTimeout(() => {
          if (isMobile) {
            router.replace('/(tabs)/home');
          } else {
            // On web, show success and offer to open app
            Alert.alert(
              '✅ Email Verified!',
              'Your email has been successfully verified. Would you like to open the Thrive app?',
              [
                { text: 'Stay on Web', style: 'cancel' },
                { 
                  text: 'Open Thrive App', 
                  onPress: () => {
                    if (Platform.OS === 'web') {
                      // On web, redirect to the mobile app store or show instructions
                      window.open('https://apps.apple.com/app/thrive-app', '_blank');
                    } else {
                      const deepLink = `thriveapp://verify?token=${token}&email=${email}`;
                      Linking.openURL(deepLink).catch(() => {
                        Alert.alert('App Not Found', 'Please install the Thrive app to continue.');
                      });
                    }
                  }
                }
              ]
            );
          }
        }, 2000);
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
      Alert.alert('Oops!', 'No email provided.');
      return;
    }

    try {
      await API.resendVerification(email);
      Alert.alert('✅ Email Sent!', 'Check your inbox for a new verification link.');
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
      console.error('❌ Resend error:', error);
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
            <AntDesign name="checkcircle" size={60} color="#4CAF50" />
            <Text style={styles.successText}>Email Verified!</Text>
            <Text style={styles.successSubtext}>
              {isMobile ? 'Redirecting to app...' : 'Your account is now verified.'}
            </Text>
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
                <AntDesign name={isMobile ? "arrowleft" : "mobile1"} size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>
                  {isMobile ? 'Back to App' : 'Open in Thrive App'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.secondaryButton} onPress={handleResendEmail}>
                <AntDesign name="mail" size={20} color="#2C3E50" style={{ marginRight: 8 }} />
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
              <AntDesign name="mail" size={20} color="#2C3E50" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Resend Email</Text>
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
});

