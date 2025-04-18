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
import API from './lib/api'; // ✅ corrected path

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert('Missing Fields', 'Please fill out all fields.');
      return;
    }

    try {
      await API.post('/auth/signup', { name, email, password });
      router.push({ pathname: '/verifyEmail', params: { email } });
    } catch (error) {
      Alert.alert('Signup Failed', 'Something went wrong. Try again.');
      console.error('❌ Signup error:', error.response?.data || error.message);
    }
  };

  const socialLogins = [
    {
      name: 'Facebook',
      icon: require('../assets/images/Facebook-icon.png'),
    },
    {
      name: 'Google',
      icon: require('../assets/images/Google-icon.png'),
    },
    {
      name: 'Apple',
      icon: require('../assets/images/Apple-icon.png'),
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backArrow} onPress={() => router.replace('/')}>
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>

      <Image
        source={require('../assets/images/piggy-with-flowers.png')}
        style={styles.logo}
      />
      <Image
        source={require('../assets/images/thrive-logo.png')}
        style={styles.brand}
      />
      <Text style={styles.tagline}>Doing good is simple & rewarding.</Text>

      <TextInput
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor="#6d6e72"
      />
      <TextInput
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholderTextColor="#6d6e72"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
        placeholderTextColor="#6d6e72"
      />

      <TouchableOpacity style={styles.signupButton} onPress={handleSignup}>
        <Text style={styles.signupButtonText}>Create Account</Text>
      </TouchableOpacity>

      <Text style={styles.orText}>Or sign up with</Text>
      {socialLogins.map((social, index) => (
        <TouchableOpacity key={index} style={styles.socialButton}>
          <Image source={social.icon} style={styles.socialIcon} />
          <Text style={styles.socialText}>Sign up with {social.name}</Text>
        </TouchableOpacity>
      ))}
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
  orText: {
    color: '#6d6e72',
    marginBottom: 10,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#e1e1e5',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    width: '100%',
    marginBottom: 10,
  },
  socialIcon: {
    width: 24,
    height: 24,
    marginRight: 20,
    resizeMode: 'contain',
  },
  socialText: {
    color: '#6d6e72',
    fontWeight: 'bold',
  },
});
