import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const LAST_LOGIN_KEY = 'lastLoginMethod';
import { AntDesign, Feather } from '@expo/vector-icons';
import API from './lib/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from './context/UserContext';
import { useBeneficiary } from './context/BeneficiaryContext';
import { signInWithApple, signInWithGoogle, signInWithFacebook } from './utils/socialLogin';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const { updateUserProfile, syncVerificationFromLogin, loadUserData } = useUser();
  const { reloadBeneficiary } = useBeneficiary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [lastLogin, setLastLogin] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(LAST_LOGIN_KEY).then((raw) => {
      try {
        if (raw) {
          const data = JSON.parse(raw);
          setLastLogin(data);
          if (data.method === 'email' && data.email) {
            setEmail(data.email);
          }
        }
      } catch (_) {}
    });
  }, []);

  const saveLastLogin = (method, emailValue) => {
    const data = method === 'email' ? { method, email: emailValue } : { method };
    AsyncStorage.setItem(LAST_LOGIN_KEY, JSON.stringify(data));
    setLastLogin(data);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Info', 'Please enter both email and password.');
      return;
    }

    try {
      console.log('🔐 Starting login process...');
      const response = await API.login({ email, password });
      console.log('✅ Login successful:', response);
      
      // Update user email in context (preserves existing data)
      updateUserProfile({ email });
      
      // Sync verification status from login response
      await syncVerificationFromLogin(response);
      
      // IMPORTANT: Reload full user data from backend to get profile image and all saved data
      await loadUserData();
      
      // Reload beneficiary from storage
      await reloadBeneficiary();

      saveLastLogin('email', email);
      
      // Navigate to home on successful login
      router.replace('/home');
    } catch (error) {
      console.error('❌ Login error:', error);
      const errorMessage = error.message || 'Login failed. Please check your credentials.';
      Alert.alert('Login Error', errorMessage);
    }
  };

  const handleSocialLogin = async (socialData) => {
    if (!socialData) {
      return; // User canceled
    }

    try {
      setIsSocialLoading(true);
      console.log('🔐 Starting social login:', socialData.provider);

      // Call social login API (handles both signup and login)
      const response = await API.socialLogin(socialData);
      console.log('✅ Social login successful:', response);

      // Update user context
      if (response.user?.email) {
        updateUserProfile({ email: response.user.email });
      }

      // Sync verification status
      await syncVerificationFromLogin(response);

      // IMPORTANT: Reload full user data from backend to get profile image and all saved data
      await loadUserData();
      
      // Reload beneficiary from storage
      await reloadBeneficiary();

      saveLastLogin(socialData.provider);

      // Navigate to home on successful login
      router.replace('/home');
    } catch (error) {
      console.error('❌ Social login error:', error);
      Alert.alert('Login Failed', error.message || 'Social login failed. Please try again.');
    } finally {
      setIsSocialLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    const result = await signInWithApple();
    if (result) {
      await handleSocialLogin(result);
    }
  };

  const handleGoogleLogin = async () => {
    const result = await signInWithGoogle();
    if (result) {
      await handleSocialLogin(result);
    }
  };

  const handleFacebookLogin = async () => {
    const result = await signInWithFacebook();
    if (result) {
      await handleSocialLogin(result);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Blue gradient as absolute background for top half */}
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'flex-start' }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backArrow} onPress={() => router.back()}>
            <Image 
              source={require('../assets/icons/arrow-left.png')} 
              style={{ width: 24, height: 24, tintColor: '#324E58' }} 
            />
          </TouchableOpacity>
          <View style={styles.piggyLogoColumn}>
            <Image source={require('../assets/images/piggy-with-flowers.png')} style={styles.logo} />
            <Image source={require('../assets/logos/thrive-logo-white.png')} style={styles.brand} />
            <Text style={styles.welcomeMessage}>Welcome Back! 🎉</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, styles.labelRowLabel]}>Email Address</Text>
              {lastLogin?.method === 'email' && (
                <Text style={styles.previouslyUsedBadge}>Previously used</Text>
              )}
            </View>
            <TextInput
              placeholder="Enter your email"
              style={styles.input}
              placeholderTextColor="#6d6e72"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                placeholder="Enter your password"
                style={styles.passwordInput}
                placeholderTextColor="#6d6e72"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Feather 
                  name={showPassword ? "eye" : "eye-off"} 
                  size={20} 
                  color="#6d6e72" 
                />
              </TouchableOpacity>
            </View>
            
            {/* Forgot Password Link */}
            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => router.push('/forgotPassword')}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
              <Text style={styles.loginButtonText}>Login</Text>
            </TouchableOpacity>

            <Text style={styles.orText}>Or login with</Text>
            <View style={styles.socialIconsContainer}>
              <View style={styles.socialIconWrapper}>
                <TouchableOpacity
                  style={[styles.socialIconButton, isSocialLoading && styles.socialIconButtonDisabled]}
                  onPress={handleFacebookLogin}
                  disabled={isSocialLoading}
                >
                  <Image source={require('../assets/images/Facebook-icon.png')} style={styles.socialIcon} />
                </TouchableOpacity>
                {lastLogin?.method === 'facebook' && (
                  <Text style={styles.previouslyUsedBadgeSmall}>Previously used</Text>
                )}
              </View>
              <View style={styles.socialIconWrapper}>
                <TouchableOpacity
                  style={[styles.socialIconButton, isSocialLoading && styles.socialIconButtonDisabled]}
                  onPress={handleGoogleLogin}
                  disabled={isSocialLoading}
                >
                  <Image source={require('../assets/images/Google-icon.png')} style={styles.socialIcon} />
                </TouchableOpacity>
                {lastLogin?.method === 'google' && (
                  <Text style={styles.previouslyUsedBadgeSmall}>Previously used</Text>
                )}
              </View>
              <View style={styles.socialIconWrapper}>
                <TouchableOpacity
                  style={[styles.socialIconButton, isSocialLoading && styles.socialIconButtonDisabled]}
                  onPress={handleAppleLogin}
                  disabled={isSocialLoading}
                >
                  <Image source={require('../assets/images/Apple-icon.png')} style={styles.socialIcon} />
                </TouchableOpacity>
                {lastLogin?.method === 'apple' && (
                  <Text style={styles.previouslyUsedBadgeSmall}>Previously used</Text>
                )}
              </View>
            </View>

            {/* Link to Signup */}
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={styles.signupLink}>I don't have an account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: SCREEN_HEIGHT * 0.45, 
    zIndex: 0, 
    overflow: 'hidden' 
  },
  gradientBg: { 
    width: SCREEN_WIDTH, 
    height: '100%', 
    borderBottomLeftRadius: 40, 
    borderBottomRightRadius: 40 
  },
  piggyLogoColumn: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 50, 
    marginBottom: 10, 
    zIndex: 1 
  },
  logo: {
    width: 120,
    height: 140,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  brand: {
    width: 163,
    height: 29,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  welcomeMessage: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: '90%',
    maxWidth: 340,
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 10,
    alignItems: 'center',
    zIndex: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  labelRowLabel: {
    marginBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  previouslyUsedBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DB8633',
    backgroundColor: 'rgba(219, 134, 51, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  backArrow: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 6,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    height: 48,
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    width: '100%',
    paddingHorizontal: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e1e1e5',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    marginBottom: 20,
    height: 48,
  },
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#324E58',
  },
  eyeButton: {
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    color: '#6d6e72',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: '#db8633',
    borderRadius: 8,
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  orText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6d6e72',
    marginBottom: 20,
  },
  socialIconsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 10,
    marginBottom: 25,
  },
  socialIconWrapper: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  socialIconButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    borderRadius: 8,
  },
  previouslyUsedBadgeSmall: {
    fontSize: 9,
    fontWeight: '600',
    color: '#DB8633',
    marginTop: 4,
  },
  socialIconButtonDisabled: {
    opacity: 0.5,
  },
  socialIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  signupLink: {
    textDecorationLine: 'underline',
    color: '#324e58',
    marginBottom: 20,
    fontSize: 16,
    fontWeight: '500',
  },
});
