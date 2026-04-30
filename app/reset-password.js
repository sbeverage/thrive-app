import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import API from './lib/api';

const Alert = Platform.OS === 'web'
  ? {
      alert: (title, message, buttons) => {
        if (typeof window !== 'undefined') {
          window.alert(`${title}\n\n${message}`);
          if (buttons && buttons[0]?.onPress) buttons[0].onPress();
        }
      },
    }
  : require('react-native').Alert;

export default function ResetPassword() {
  const router = useRouter();
  const { token, email } = useLocalSearchParams();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Missing Fields', 'Please fill in both password fields.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Too Short', 'Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    if (!token || !email) {
      Alert.alert('Invalid Link', 'This reset link is missing required information. Please request a new one.');
      return;
    }

    setIsLoading(true);
    try {
      await API.resetPassword(token, email, newPassword);
      setSuccess(true);
    } catch (error) {
      Alert.alert('Reset Failed', error?.message || 'This link may have expired. Please request a new reset link.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <LinearGradient colors={['#21555b', '#2d7a82']} style={styles.successContainer}>
        <Image source={require('../assets/images/bolt-piggy.png')} style={styles.logo} />
        <Text style={styles.successTitle}>Password Updated!</Text>
        <Text style={styles.successSub}>You can now log in with your new password.</Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/login')}>
          <Text style={styles.loginButtonText}>Go to Login</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/login')}>
        <Image
          source={require('../assets/images/arrow-left.png')}
          style={styles.backIcon}
        />
      </TouchableOpacity>

      <Image source={require('../assets/images/bolt-piggy.png')} style={styles.logo} />

      <Text style={styles.title}>Set New Password</Text>
      <Text style={styles.subtitle}>
        Enter a new password for{'\n'}
        <Text style={styles.emailText}>{email || 'your account'}</Text>
      </Text>

      <Text style={styles.label}>New Password</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="At least 8 characters"
          placeholderTextColor="#6d6e72"
          secureTextEntry={!showNew}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.eyeButton} onPress={() => setShowNew(v => !v)}>
          <Text style={styles.eyeText}>{showNew ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Confirm Password</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter your password"
          placeholderTextColor="#6d6e72"
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirm(v => !v)}>
          <Text style={styles.eyeText}>{showConfirm ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.resetButton, isLoading && styles.resetButtonDisabled]}
        onPress={handleReset}
        disabled={isLoading}
      >
        {isLoading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.resetButtonText}>Reset Password</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 60,
    alignItems: 'center',
    backgroundColor: '#fff',
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
  },
  backIcon: {
    width: 45,
    height: 45,
    resizeMode: 'contain',
    tintColor: '#324E58',
  },
  logo: {
    width: 90,
    height: 99,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#21555b',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  emailText: {
    color: '#DB8633',
    fontWeight: '600',
  },
  label: {
    alignSelf: 'flex-start',
    width: '100%',
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  inputWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 15,
    color: '#324E58',
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: 14,
    height: 48,
    justifyContent: 'center',
  },
  eyeText: {
    fontSize: 18,
  },
  resetButton: {
    backgroundColor: '#DB8633',
    borderRadius: 8,
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  resetButtonDisabled: {
    opacity: 0.6,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginTop: 24,
    marginBottom: 12,
  },
  successSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  loginButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  loginButtonText: {
    color: '#21555b',
    fontSize: 16,
    fontWeight: '700',
  },
});
