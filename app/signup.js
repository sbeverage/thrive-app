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
import API from './lib/api';

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, usePassword] = useState('');

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please fill out all fields.');
      return;
    }

    try {
      await API.post('/api/auth/signup', { email, password });
      router.push({ pathname: '/verifyEmail', params: { email } });
    } catch (error) {
      Alert.alert('Signup Failed', 'Something went wrong. Try again.');
      console.error('❌ Signup error:', error.response?.data || error.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backArrow} onPress={() => router.replace('/')}>
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>

      <Image source={require('../assets/images/piggy-with-flowers.png')} style={styles.logo} />
      <Image source={require('../assets/images/thrive-logo.png')} style={styles.brand} />
      <Text style={styles.tagline}>Doing good is simple & rewarding.</Text>

      <TextInput
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholderTextColor="#6d6e72"
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={usePassword}
        secureTextEntry
        style={styles.input}
        placeholderTextColor="#6d6e72"
      />

      <TouchableOpacity style={styles.signupButton} onPress={handleSignup}>
        <Text style={styles.signupButtonText}>Create Account</Text>
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
  backArrow: {
    alignSelf: 'flex-start',
    marginLeft: 10,
    marginBottom: 10,
  },
  backIcon: {
    fontSize: 30,
    color: '#324E58',
  },
  logo: {
    width: 51,
    height: 83,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  brand: {
    width: 163,
    height: 29,
    resizeMode: 'contain',
    marginBottom: 10,
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
});
