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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons'; 
import API from './lib/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocation } from './context/LocationContext';
import { signInWithApple, signInWithGoogle, signInWithFacebook } from './utils/socialLogin';
import { useUser } from './context/UserContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const PASSWORD_MIN_LENGTH = 8;

/** Returns null if valid, or an error message string */
const getPasswordValidationError = (pwd) => {
  if (!pwd || pwd.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (!/[a-z]/.test(pwd)) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!/[A-Z]/.test(pwd)) {
    return 'Password must include at least one uppercase letter.';
  }
  return null;
};

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { locationAddress, checkLocationPermission } = useLocation();
  const { updateUserProfile, syncVerificationFromLogin } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  
  // Capture referral token from URL params (?ref=USER_ID)
  const referralToken = params.ref || null;

  // Request location permission when component mounts
  useEffect(() => {
    checkLocationPermission();
  }, []);

  const socialLogins = [
    { name: 'Facebook', icon: require('../assets/images/Facebook-icon.png'), handler: handleFacebookSignup },
    { name: 'Google', icon: require('../assets/images/Google-icon.png'), handler: handleGoogleSignup },
    { name: 'Apple', icon: require('../assets/images/Apple-icon.png'), handler: handleAppleSignup },
  ];

  const handleSocialSignup = async (socialData) => {
    if (!socialData) {
      return; // User canceled
    }

    try {
      setIsSocialLoading(true);
      console.log('🚀 Starting social signup:', socialData.provider);

      // Prepare signup data with location and referral token if available
      const signupData = {
        ...socialData,
        ...(locationAddress?.city && { city: locationAddress.city }),
        ...(locationAddress?.state && { state: locationAddress.state }),
        ...(locationAddress?.zipCode && { zipCode: locationAddress.zipCode }),
        ...(referralToken && { referralToken }),
      };

      // Call social login API (handles both signup and login)
      const response = await API.socialLogin(signupData);
      console.log('✅ Social signup successful:', response);

      // Update user context
      if (response.user?.email) {
        updateUserProfile({ email: response.user.email });
      }

      // Sync verification status
      await syncVerificationFromLogin(response);

      // Check if user needs to complete profile
      if (response.user?.needsProfileSetup) {
        router.push({
          pathname: '/signupProfile',
          params: { email: response.user.email || socialData.email },
        });
      } else {
        // User already has profile, go to home
        router.replace('/home');
      }
    } catch (error) {
      console.error('❌ Social signup error:', error);
      Alert.alert('Signup Failed', error.message || 'Social signup failed. Please try again.');
    } finally {
      setIsSocialLoading(false);
    }
  };

  const handleAppleSignup = async () => {
    const result = await signInWithApple();
    if (result) {
      await handleSocialSignup(result);
    }
  };

  const handleGoogleSignup = async () => {
    const result = await signInWithGoogle();
    if (result) {
      await handleSocialSignup(result);
    }
  };

  const handleFacebookSignup = async () => {
    const result = await signInWithFacebook();
    if (result) {
      await handleSocialSignup(result);
    }
  };

  const handleSignup = async () => {
    if (isSigningUp) return;

    const emailTrim = email.trim();
    if (!emailTrim || !password) {
      Alert.alert('Missing Fields', 'Please fill out all fields.');
      return;
    }

    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      Alert.alert('Password requirements', passwordError);
      return;
    }

    try {
      setIsSigningUp(true);

      // Check if email is already registered (backend GET /api/auth/check-email)
      try {
        await API.checkEmailAvailable(emailTrim);
      } catch (checkError) {
        if (checkError.message?.includes('already registered')) {
          Alert.alert('Email Already Used', checkError.message);
          return;
        }
        Alert.alert(
          'Cannot continue',
          checkError.message || 'We could not verify this email. Please try again.'
        );
        return;
      }

      console.log('🚀 Starting signup process...');
      
      // Prepare signup data with location and referral token if available
      const signupData = {
        email: emailTrim,
        password,
        ...(locationAddress?.city && { city: locationAddress.city }),
        ...(locationAddress?.state && { state: locationAddress.state }),
        ...(locationAddress?.zipCode && { zipCode: locationAddress.zipCode }),
        ...(referralToken && { referralToken }), // Include referral token if present
      };
      
      console.log('📍 Signup data with location and referral:', signupData);
      
      const response = await API.signup(signupData);
      console.log('✅ Signup successful:', response);
      console.log('📧 Email from signup:', email);
      console.log('📧 Email from API response:', response?.user?.email || response?.email);
      
      // Use email from API response if available, otherwise use the one from form
      const userEmail = response?.user?.email || response?.email || emailTrim;
      console.log('📧 Final email to use:', userEmail);
      
      // Navigate to profile setup (points will be reset to 0 in signupProfile)
      // Pass email as a string to ensure it's preserved
      router.push({ 
        pathname: '/signupProfile', 
        params: { email: userEmail } 
      });
    } catch (error) {
      console.error('❌ Signup error:', error);
      const errorMessage = error.message || 'Signup failed. Please try again.';
      Alert.alert('Signup Failed', errorMessage);
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
          <TouchableOpacity style={styles.backArrow} onPress={() => router.replace('/')}> 
            <Image 
              source={require('../assets/icons/arrow-left.png')} 
              style={{ width: 24, height: 24, tintColor: '#324E58' }} 
            />
          </TouchableOpacity>
          <View style={styles.piggyLogoColumn}>
            <Image source={require('../assets/images/piggy-with-flowers.png')} style={styles.logo} />
            <Image source={require('../assets/logos/thrive-logo-white.png')} style={styles.brand} />
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholderTextColor="#6d6e72"
              autoCapitalize="none"
            />
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                placeholderTextColor="#6d6e72"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                {Platform.OS === 'web' ? (
                  <Text style={{ fontSize: 20, color: '#6d6e72' }}>
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </Text>
                ) : (
                  <Feather 
                    name={showPassword ? "eye" : "eye-off"} 
                    size={20} 
                    color="#6d6e72" 
                  />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.passwordHint}>
              Use at least {PASSWORD_MIN_LENGTH} characters with uppercase and lowercase letters.
            </Text>
            <TouchableOpacity
              style={[styles.signupButton, isSigningUp && styles.signupButtonDisabled]}
              onPress={handleSignup}
              disabled={isSigningUp}
            >
              <Text style={styles.signupButtonText}>
                {isSigningUp ? 'Please wait…' : 'Create Account'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.orText}>Or sign up with</Text>
            <View style={styles.socialIconsContainer}>
              {socialLogins.map((social, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.socialIconButton, isSocialLoading && styles.socialIconButtonDisabled]}
                  onPress={social.handler}
                  disabled={isSocialLoading}
                >
                  <Image source={social.icon} style={styles.socialIcon} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.45, zIndex: 0, overflow: 'hidden' },
  gradientBg: { width: SCREEN_WIDTH, height: '100%', borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  piggyLogoColumn: { alignItems: 'center', justifyContent: 'center', marginTop: 80, marginBottom: 10, zIndex: 1 },
  logo: {
    width: 140,
    height: 160,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  brand: {
    width: 163,
    height: 29,
    resizeMode: 'contain',
    marginBottom: 10,
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 8,
    alignSelf: 'flex-start',
    width: '100%',
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
  tagline: {
    fontSize: 16,
    color: '#6d6e72',
    marginBottom: 30,
    textAlign: 'center',
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
    marginBottom: 8,
    height: 48,
  },
  passwordHint: {
    alignSelf: 'flex-start',
    width: '100%',
    fontSize: 12,
    color: '#6d6e72',
    marginBottom: 16,
    lineHeight: 18,
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
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
  signupButton: {
    backgroundColor: '#db8633',
    borderRadius: 8,
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  signupButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  signupButtonDisabled: {
    opacity: 0.7,
  },
  orText: {
    color: '#6d6e72',
    marginBottom: 20,
    fontSize: 16,
    fontWeight: '500',
  },
  socialIconsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  socialIconButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    borderRadius: 8,
    marginHorizontal: 8,
  },
  socialIconButtonDisabled: {
    opacity: 0.5,
  },
  socialIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
});
