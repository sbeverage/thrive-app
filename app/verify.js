// Universal verification handler - works for both mobile and web
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AntDesign } from '@expo/vector-icons';
import API from './lib/api';
import { useUser } from './context/UserContext';

// Web-compatible imports
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function UniversalVerifyHandler() {
  const router = useRouter();
  const { token, email } = useLocalSearchParams();
  const { markAsVerified } = useUser();
  const [verificationStatus, setVerificationStatus] = useState('pending'); // 'pending', 'verifying', 'success', 'error'

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

    setVerificationStatus('verifying');

    try {
      console.log('🔗 Universal verification - Token:', token?.substring(0, 10) + '...');
      console.log('🔗 Universal verification - Platform:', Platform.OS);

      const response = await API.verifyEmail(token);

      if (response.success || response.message?.includes('verified') || response.message?.includes('success')) {
        await markAsVerified();
        setVerificationStatus('success');
        console.log('✅ Email verified via universal link');

        setTimeout(() => {
          if (Platform.OS !== 'web') {
            router.replace('/signupFlow/explainerDonate');
          } else {
            setTimeout(() => {
              try {
                const universalLink = `https://thrive-web-jet.vercel.app/verify?token=${token || ''}&email=${encodeURIComponent(email || '')}&verified=true`;
                if (typeof window !== 'undefined') {
                  window.location.href = universalLink;
                }
              } catch (error) {
                console.error('❌ Redirect failed:', error);
              }
            }, 1500);
          }
        }, 1500);
      } else {
        throw new Error(response.message || 'Verification failed');
      }
    } catch (error) {
      console.error('❌ Universal verification failed:', error);
      setVerificationStatus('error');
    }
  };

  const handleResendEmail = async () => {
    if (!email) {
      Alert.alert('Oops!', 'No email address found. Please go back and try again.');
      return;
    }

    console.log('📧 Resending verification email to:', email);
    try {
      const response = await API.resendVerification(email);
      console.log('✅ Resend response:', response);
      Alert.alert('Email Sent!', 'Check your inbox for a fresh verification link.');
    } catch (error) {
      console.error('❌ Resend error:', error);
      Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
    }
  };

  // Verifying / success states — minimal, since they're transient
  if (verificationStatus === 'verifying' || verificationStatus === 'success') {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#4CA1AF', '#2C3E50']}
          style={styles.gradientBackground}
        />
        <View style={styles.loadingCard}>
          {verificationStatus === 'verifying' ? (
            <>
              <ActivityIndicator size="large" color="#4CA1AF" />
              <Text style={styles.loadingText}>Verifying your email...</Text>
            </>
          ) : (
            <>
              <Image
                source={require('../assets/icons/check-circle.png')}
                style={{ width: 60, height: 60, tintColor: '#4CAF50' }}
                resizeMode="contain"
              />
              <Text style={styles.successText}>Email Verified!</Text>
              <Text style={styles.loadingText}>Taking you to the app...</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  // Error state — styled to match verifyEmail.js
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#4CA1AF', '#2C3E50']}
        style={styles.gradientBackground}
      />

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace('/verifyEmail')}
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
              source={require('../assets/images/sad-piggy.png')}
              style={styles.piggyImage}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.title}>Email Verification{'\n'}Failed</Text>
          <Text style={styles.description}>
            {!token
              ? 'No verification token found. Please use the link from your email.'
              : 'This link may have expired or already been used. Request a fresh one below.'}
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.resendButton}
              onPress={handleResendEmail}
            >
              {Platform.OS === 'web' ? (
                <Text style={{ marginRight: 8, color: '#fff' }}>✉️</Text>
              ) : (
                <AntDesign name="mail" size={20} color="#fff" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.resendButtonText}>Resend Verification Email</Text>
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
    marginBottom: 16,
    lineHeight: 36,
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
    backgroundColor: '#DB8633',
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
  // Loading / success states
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 260,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#4CA1AF',
    fontWeight: '500',
    textAlign: 'center',
  },
  successText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 16,
    textAlign: 'center',
  },
});
