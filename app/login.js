import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import API from './lib/api';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Info', 'Please enter both email and password.');
      return;
    }

    try {
      const response = await API.post('/auth/login', { email, password });
      // Skip verification check and go directly to home
      router.replace('/home');
    } catch (error) {
      Alert.alert('Login Error', error.response?.data?.message || 'Something went wrong.');
      console.error('❌ Login error:', error.response?.data || error.message);
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
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>
          <View style={styles.piggyLogoColumn}>
            <Image source={require('../assets/images/piggy-with-flowers.png')} style={styles.logo} />
            <Image source={require('../assets/logos/thrive-logo-white.png')} style={styles.brand} />
            <Text style={styles.welcomeMessage}>Welcome Back! 🎉</Text>
          </View>
          <View style={styles.infoCard}>
            <TextInput
              placeholder="Email Address"
              style={styles.input}
              placeholderTextColor="#6d6e72"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              placeholder="Password"
              style={styles.input}
              placeholderTextColor="#6d6e72"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            
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
              <TouchableOpacity style={styles.socialIconButton}>
                <Image source={require('../assets/images/Facebook-icon.png')} style={styles.socialIcon} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialIconButton}>
                <Image source={require('../assets/images/Google-icon.png')} style={styles.socialIcon} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialIconButton}>
                <Image source={require('../assets/images/Apple-icon.png')} style={styles.socialIcon} />
              </TouchableOpacity>
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
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 25,
  },
  socialIconButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    borderRadius: 8,
    marginHorizontal: 8,
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
