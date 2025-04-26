import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import API from './lib/api';
import { Ionicons } from '@expo/vector-icons';

export default function SignupProfile() {
  const router = useRouter();
  const { email, name } = useLocalSearchParams();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  useEffect(() => {
    if (name) {
      const [first, ...lastParts] = name.split(' ');
      setFirstName(capitalize(first));
      setLastName(capitalize(lastParts.join(' ')));
    }
  }, [name]);

  const capitalize = (word) => {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  };

  const formatPhoneNumber = (value) => {
    const cleaned = ('' + value).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (match) {
      const [, area, prefix, line] = match;
      if (area && prefix && line) return `(${area}) ${prefix}-${line}`;
      if (area && prefix) return `(${area}) ${prefix}`;
      if (area) return `(${area}`;
    }
    return value;
  };

  const handleSaveProfile = async () => {
    if (!firstName || !lastName || !phoneNumber) {
      Alert.alert('Missing Info', 'Please fill in all fields.');
      return;
    }

    try {
      const payload = { email, firstName, lastName, phoneNumber };
      const res = await API.post('/api/auth/save-profile', payload);
      console.log('✅ Profile saved:', res.data);
      Alert.alert('Profile Saved!', 'Your details have been updated.');
      // Navigate to home (coming soon!)
    } catch (error) {
      console.error('❌ Profile save error:', error.response?.data || error.message);
      Alert.alert('Error', 'Something went wrong. Try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backArrow} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#324e58" />
      </TouchableOpacity>

      {/* Pig & Bubble */}
      <View style={styles.heroContainer}>
        <Image source={require('../assets/images/bolt-piggy.png')} style={styles.piggy} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            <Text style={{ color: "#324e58" }}>A Little More{'\n'}</Text>
            <Text style={{ color: "#db8633" }}>About You!</Text>
          </Text>
        </View>
      </View>

      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <Image source={require('../assets/images/Avatar-large.png')} style={styles.avatar} />
        {/* No profile upload yet */}
      </View>

      {/* Input Fields */}
      <View style={styles.formContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="First Name"
            value={firstName}
            onChangeText={(text) => setFirstName(capitalize(text))}
            style={styles.input}
            placeholderTextColor="#6d6e72"
          />
        </View>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="Last Name"
            value={lastName}
            onChangeText={(text) => setLastName(capitalize(text))}
            style={styles.input}
            placeholderTextColor="#6d6e72"
          />
        </View>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="Phone Number"
            value={phoneNumber}
            onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
            keyboardType="phone-pad"
            style={styles.input}
            placeholderTextColor="#6d6e72"
          />
        </View>
      </View>

      {/* Continue Button */}
      <TouchableOpacity style={styles.continueButton} onPress={handleSaveProfile}>
        <Text style={styles.continueText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 60,
    alignItems: "center",
    backgroundColor: "#fff",
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  backArrow: {
    alignSelf: "flex-start",
    marginLeft: 10,
    marginBottom: 10,
  },
  heroContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 20,
  },
  piggy: {
    width: 69,
    height: 76,
    resizeMode: "contain",
  },
  bubble: {
    backgroundColor: "#f5f5fa",
    padding: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    width: 238,
    height: 94,
  },
  bubbleText: {
    fontSize: 24,
    textAlign: "center",
    lineHeight: 30,
  },
  avatarContainer: {
    marginVertical: 20,
    alignItems: "center",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "#fff",
  },
  formContainer: {
    width: "100%",
  },
  inputWrapper: {
    backgroundColor: "#f5f5fa",
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#e1e1e5",
  },
  input: {
    fontSize: 14,
    color: "#324e58",
  },
  continueButton: {
    backgroundColor: "#db8633",
    borderRadius: 8,
    width: "100%",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  continueText: {
    color: "#fff",
    fontSize: 16,
  },
});
