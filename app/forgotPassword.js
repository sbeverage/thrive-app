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
import API from './lib/api'; // ✅ corrected

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  const handleSendLink = async () => {
    if (!email.trim()) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }

    try {
      await API.post('/auth/forgot-password', { email });
      router.push({ pathname: '/verifyEmail', params: { email } });
    } catch (error) {
      Alert.alert('Error', 'Failed to send reset link. Please try again.');
      console.error('❌ Error sending reset link:', error.response?.data || error.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Image
          source={require('../assets/images/arrow-left.png')}
          style={styles.backIcon}
        />
      </TouchableOpacity>

      <Image source={require('../assets/images/bolt-piggy.png')} style={styles.logo} />

      <Text style={styles.tagline}>
        Enter your email we’ll <Text style={styles.highlight}>send you a reset link</Text>
      </Text>

      <TextInput
        placeholder="Email Address"
        style={styles.input}
        placeholderTextColor="#6d6e72"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TouchableOpacity style={styles.sendButton} onPress={handleSendLink}>
        <Text style={styles.sendButtonText}>Send Link</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 80,
    alignItems: 'center',
    backgroundColor: '#fff',
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 60,
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
    marginBottom: 10,
  },
  tagline: {
    fontSize: 20,
    color: '#324E58',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 60,
    lineHeight: 28,
  },
  highlight: {
    color: '#DB8633',
    fontWeight: 'bold',
  },
  input: {
    height: 48,
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    width: '100%',
    paddingHorizontal: 15,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    color: '#324E58',
  },
  sendButton: {
    backgroundColor: '#db8633',
    borderRadius: 8,
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
