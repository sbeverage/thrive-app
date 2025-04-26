import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import API from './lib/api';

export default function SignupProfile() {
  const router = useRouter();
  const { name = '', email = '' } = useLocalSearchParams();

  const [firstName, setFirstName] = useState(name.split(' ')[0] || '');
  const [lastName, setLastName] = useState(name.split(' ')[1] || '');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handlePhoneChange = (text) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = '';

    if (cleaned.length <= 3) {
      formatted = `(${cleaned}`;
    } else if (cleaned.length <= 6) {
      formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else {
      formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }

    setPhoneNumber(formatted);
  };

  const handleContinue = async () => {
    try {
      const payload = {
        email,
        firstName,
        lastName,
        phoneNumber,
      };
      console.log('📤 Sending profile update:', payload);
      await API.post('/api/auth/save-profile', payload);

      router.push('/home');
    } catch (error) {
      console.error('❌ Error saving profile:', error);
      Alert.alert('Error', 'Something went wrong. Try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* your UI code stays the same, just make sure your TextInputs are connected */}
      <TouchableOpacity style={styles.backArrow} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#324e58" />
      </TouchableOpacity>

      {/* Hero */}
      <View style={styles.heroContainer}>
        <Image source={require('../assets/images/bolt-piggy.png')} style={styles.piggy} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            <Text style={{ color: "#324e58" }}>A Little More{"\n"}</Text>
            <Text style={{ color: "#db8633" }}>About You!</Text>
          </Text>
        </View>
      </View>

      {/* Profile picture upload */}
      <View style={styles.avatarContainer}>
        <Image source={require('../assets/images/Avatar-large.png')} style={styles.avatar} />
      </View>

      {/* Form */}
      <View style={styles.formContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="First Name"
            value={firstName}
            onChangeText={setFirstName}
            style={styles.input}
            placeholderTextColor="#6d6e72"
          />
        </View>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="Last Name"
            value={lastName}
            onChangeText={setLastName}
            style={styles.input}
            placeholderTextColor="#6d6e72"
          />
        </View>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="Phone Number"
            value={phoneNumber}
            onChangeText={handlePhoneChange}
            style={styles.input}
            keyboardType="phone-pad"
            placeholderTextColor="#6d6e72"
          />
        </View>
      </View>

      <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
        <Text style={styles.continueText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // keep your styles, nothing changes here
});
