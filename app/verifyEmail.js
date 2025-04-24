import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import API from './lib/api';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const handleResendEmail = async () => {
    if (!email) {
      Alert.alert('Oops!', 'No email provided.');
      return;
    }

    setIsLoading(true);

    try {
      await API.post('/auth/resend-verification', { email });
      Alert.alert('✅ Email Sent!', 'Check your inbox for a new verification link.');
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
      console.error('❌ Resend error:', error.response?.data || error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 🛎️ Auto-check if email is verified every 5 seconds
  useEffect(() => {
    if (!email) return;

    setCheckingStatus(true);

    const interval = setInterval(async () => {
      try {
        const res = await API.get(`/auth/check-verification/${email}`);
        if (res.data?.isVerified) {
          clearInterval(interval);
          router.replace({ pathname: '/signupProfile', params: { name, email } });
        }
      } catch (error) {
        console.error('❌ Verification check error:', error?.response?.data || error?.message || error);
      }      
    }, 5000);

    return () => clearInterval(interval);
  }, [email]);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Image source={require('../assets/images/arrow-left.png')} style={styles.backIcon} />
      </TouchableOpacity>

      <Image source={require('../assets/images/bolt-piggy.png')} style={styles.logo} />

      <Text style={styles.title}>Almost there!</Text>
      <Text style={styles.message}>
        We've sent a verification link to:{"\n"}
        <Text style={styles.email}>{email}</Text>
      </Text>

      <TouchableOpacity
        style={styles.resendButton}
        onPress={handleResendEmail}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.resendButtonText}>Resend Email</Text>
        )}
      </TouchableOpacity>

      {checkingStatus && (
        <Text style={styles.checkingText}>⏳ Waiting for verification...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 80,
    backgroundColor: '#fff',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
  },
  backIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
    tintColor: '#324E58',
  },
  logo: {
    width: 100,
    height: 110,
    resizeMode: 'contain',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: '#6d6e72',
    marginBottom: 40,
  },
  email: {
    color: '#DB8633',
    fontWeight: '600',
  },
  resendButton: {
    backgroundColor: '#DB8633',
    borderRadius: 8,
    paddingHorizontal: 30,
    paddingVertical: 14,
  },
  resendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  checkingText: {
    marginTop: 20,
    fontSize: 14,
    color: '#6d6e72',
  },
});
