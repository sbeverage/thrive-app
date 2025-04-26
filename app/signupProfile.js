import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import API from './lib/api';

export default function SignupProfileScreen() {
  const { email, name } = useLocalSearchParams();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ✅ Autofill first/last name if passed from signup
  useEffect(() => {
    if (name) {
      const [first, ...rest] = name.split(' ');
      setFirstName(first);
      setLastName(rest.join(' '));
    }
  }, [name]);

  const handleSaveProfile = async () => {
    if (!firstName || !lastName || !phoneNumber) {
      Alert.alert('Missing Info', 'Please fill out all fields.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await API.post('/auth/save-profile', {
        email,
        firstName,
        lastName,
        phoneNumber,
      });

      console.log('✅ Profile saved:', res.data);
      router.replace('/home');
    } catch (error) {
      console.error('❌ Profile save error:', error.response?.data || error.message);
      Alert.alert('Error', 'Something went wrong. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Image source={require('../assets/images/arrow-left.png')} style={styles.backIcon} />
        </TouchableOpacity>

        <Image source={require('../assets/images/bolt-piggy.png')} style={styles.piggy} />
        <Text style={styles.header}>
          <Text style={styles.headerLine1}>A Little More</Text>{'\n'}
          <Text style={styles.headerLine2}>About You!</Text>
        </Text>

        <Image source={require('../assets/images/Avatar-large.png')} style={styles.avatar} />

        <TextInput
          placeholder="First Name"
          value={firstName}
          onChangeText={setFirstName}
          style={styles.input}
          placeholderTextColor="#6d6e72"
        />
        <TextInput
          placeholder="Last Name"
          value={lastName}
          onChangeText={setLastName}
          style={styles.input}
          placeholderTextColor="#6d6e72"
        />
        <TextInput
          placeholder="Phone Number"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          style={styles.input}
          placeholderTextColor="#6d6e72"
        />

        <TouchableOpacity style={styles.button} onPress={handleSaveProfile} disabled={isLoading}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 80,
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingHorizontal: 20,
    flexGrow: 1,
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
  piggy: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  headerLine1: {
    fontSize: 22,
    fontWeight: '500',
    color: '#324E58',
  },
  headerLine2: {
    fontSize: 22,
    fontWeight: '600',
    color: '#DB8633',
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    resizeMode: 'contain',
    marginBottom: 30,
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
  button: {
    backgroundColor: '#DB8633',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 30,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
