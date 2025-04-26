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
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons'; // ✅ Added for back arrow
import API from './lib/api';

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

      if (response.data.is_verified) {
        router.replace('/home');
      } else {
        router.push({ pathname: '/verifyEmail', params: { email } });
      }
    } catch (error) {
      Alert.alert('Login Error', error.response?.data?.message || 'Something went wrong.');
      console.error('❌ Login error:', error.response?.data || error.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
      </View>

      {/* Piggy and Brand */}
      <Image
        source={require('../assets/images/piggy-with-flowers.png')}
        style={styles.logo}
      />
      <Image
        source={require('../assets/images/thrive-logo.png')}
        style={styles.brand}
      />
      <Text style={styles.tagline}>Doing good is simple & rewarding.</Text>

      {/* Email and Password Inputs */}
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
        <Text style={styles.forgotText}>Forgot Password</Text>
      </TouchableOpacity>

      {/* Login Button */}
      <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
        <Text style={styles.loginButtonText}>Login</Text>
      </TouchableOpacity>

      {/* Link to Signup */}
      <TouchableOpacity onPress={() => router.push('/signup')}>
        <Text style={styles.signupLink}>I don’t have an account</Text>
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
  },
  header: {
    width: '100%',
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 90,
    height: 99,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  brand: {
    width: 200,
    height: 35,
    resizeMode: 'contain',
    marginBottom: 20,
  },
  tagline: {
    fontSize: 20,
    color: '#6d6e72',
    marginBottom: 30,
    textAlign: 'center',
    lineHeight: 28, // ✅ Same as beneficiary line spacing
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
    marginBottom: 30,
  },
  forgotText: {
    color: '#6d6e72',
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
  },
  signupLink: {
    textDecorationLine: 'underline',
    color: '#324e58',
    marginBottom: 20,
  },
});
