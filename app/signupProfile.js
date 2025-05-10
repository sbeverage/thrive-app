// app/signupProfile.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function SignupProfile() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handlePhoneChange = (text) => {
    const cleaned = ('' + text).replace(/\D/g, '');
    let formattedNumber = cleaned;

    if (cleaned.length >= 1) {
      formattedNumber = '(' + cleaned.slice(0, 3);
    }
    if (cleaned.length >= 4) {
      formattedNumber += ') ' + cleaned.slice(3, 6);
    }
    if (cleaned.length >= 7) {
      formattedNumber += '-' + cleaned.slice(6, 10);
    }
    setPhoneNumber(formattedNumber);
  };

  const handleContinue = () => {
    router.push('/signupFlow/explainerDonate');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Top Navigation */}
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressSegments}>
          <View style={[styles.segment, { backgroundColor: '#324E58' }]} />
          <View style={[styles.segment, { backgroundColor: '#F5F5FA' }]} />
          <View style={[styles.segment, { backgroundColor: '#F5F5FA' }]} />
          <View style={[styles.segment, { backgroundColor: '#F5F5FA' }]} />
          <View style={[styles.segment, { backgroundColor: '#F5F5FA' }]} />
        </View>
        <View style={styles.piggyContainer}>
          <Image source={require('../assets/images/walking-piggy.png')} style={styles.walkingPiggy} />
        </View>
      </View>

      {/* Piggy + Speech Bubble */}
      <View style={styles.speechBubbleContainer}>
        <Image source={require('../assets/images/bolt-piggy.png')} style={styles.piggyIcon} />
        <View style={styles.speechBubble}>
          <Text style={styles.speechNormal}>We’re excited to meet you — we just need a few quick details!</Text>
        </View>
      </View>

      {/* Profile Avatar */}
      <Image source={require('../assets/images/Avatar-large.png')} style={styles.profileIcon} />

      {/* Inputs */}
      <TextInput
        placeholder="First Name"
        value={firstName}
        onChangeText={setFirstName}
        style={styles.input}
        placeholderTextColor="#6d6e72"
        autoCapitalize="words"
      />
      <TextInput
        placeholder="Last Name"
        value={lastName}
        onChangeText={setLastName}
        style={styles.input}
        placeholderTextColor="#6d6e72"
        autoCapitalize="words"
      />
      <TextInput
        placeholder="Phone Number"
        value={phoneNumber}
        onChangeText={handlePhoneChange}
        style={styles.input}
        placeholderTextColor="#6d6e72"
        keyboardType="phone-pad"
      />

      {/* Continue Button */}
      <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressBarContainer: {
    marginBottom: 30,
    position: 'relative',
    alignItems: 'center',
  },
  progressSegments: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 10,
    marginHorizontal: 2,
  },
  piggyContainer: {
    position: 'absolute',
    top: -20,
    left: '5%',
  },
  walkingPiggy: {
    width: 30,
    height: 24,
    resizeMode: 'contain',
  },
  speechBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  piggyIcon: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    marginRight: 10,
  },
  speechBubble: {
    backgroundColor: '#f5f5fa',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    flexShrink: 1,
  },
  speechNormal: {
    color: '#324E58',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'left',
  },
  speechHighlight: {
    color: '#DB8633',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  profileIcon: {
    width: 90,
    height: 90,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 30,
  },
  input: {
    height: 48,
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    marginBottom: 20,
    fontSize: 16,
    color: '#324E58',
  },
  continueButton: {
    backgroundColor: '#db8633',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});
