// app/donationAmount.js

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import Slider from '@react-native-community/slider'; // make sure you have installed this!

export default function DonationAmount() {
  const router = useRouter();

  const [donationAmount, setDonationAmount] = useState(15); // default minimum
  const [fixedAmount, setFixedAmount] = useState('');

  const handleContinue = () => {
    router.push('/stripeIntegration'); // 🌟 Push to next page
  };

  const handleSkip = () => {
    router.replace('/guestHome');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
      {/* Top Navigation */}
      <View style={styles.topNav}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>

        {/* Progress Bar with Walking Piggy */}
        <View style={styles.progressContainer}>
          <View style={styles.progressActive} />
          <View style={styles.progressInactive} />
          <View style={styles.progressInactive} />
          <View style={styles.progressInactive} />
          <Image
            source={require('../assets/images/walking-piggy.png')}
            style={{ width: 30, height: 24, marginLeft: 5 }}
          />
        </View>

        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: '#DB8633', fontSize: 14 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={{ alignItems: 'center', marginTop: 30 }}>
        {/* Piggy and Speech Bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 30 }}>
          <Image source={require('../assets/images/bolt-piggy.png')} style={{ width: 60, height: 60, resizeMode: 'contain' }} />
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>
              What should be the minimum and maximum amount be for your donations each month?
            </Text>
          </View>
        </View>

        {/* Slider */}
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={15}
          maximumValue={250}
          step={1}
          value={donationAmount}
          minimumTrackTintColor="#DB8633"
          maximumTrackTintColor="#F5F5FA"
          thumbTintColor="#DB8633"
          onValueChange={setDonationAmount}
        />
        <View style={styles.amountRow}>
          <Text style={styles.amountText}>${15}</Text>
          <Text style={styles.amountText}>${250}</Text>
        </View>

        {/* Fixed Amount Input */}
        <TextInput
          style={styles.input}
          placeholder="Enter fixed amount"
          placeholderTextColor="#6d6e72"
          keyboardType="numeric"
          value={fixedAmount}
          onChangeText={setFixedAmount}
        />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={handleContinue} style={styles.continueButton}>
          <Text style={{ color: '#fff', fontSize: 16 }}>Save and continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 10,
  },
  progressActive: {
    flex: 1,
    height: 4,
    backgroundColor: '#324E58',
    borderRadius: 10,
    marginHorizontal: 2,
  },
  progressInactive: {
    flex: 1,
    height: 4,
    backgroundColor: '#F5F5FA',
    borderRadius: 10,
    marginHorizontal: 2,
  },
  speechBubble: {
    backgroundColor: '#F5F5FA',
    padding: 12,
    borderRadius: 10,
    marginLeft: 10,
    flex: 1,
  },
  speechText: {
    color: '#324E58',
    fontSize: 16,
    textAlign: 'left',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
    marginBottom: 20,
  },
  amountText: {
    color: '#324E58',
    fontSize: 16,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#f5f5fa',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#324E58',
    marginTop: 10,
  },
  footer: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderColor: '#e1e1e5',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  continueButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 20,
  },
});
