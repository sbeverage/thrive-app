// app/donationType.js

import React from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import HeartBackground from '../components/HeartBackground'; // 🌟 Import Heart Background

export default function DonationType() {
  const router = useRouter();

  const handleContinue = () => {
    router.push('/donationAmount'); // 🌟 Next page
  };

  const handleSkip = () => {
    router.replace('/guestHome');
  };

  return (
    <View style={{ flex: 1 }}>
      {/* 💖 Heart Background behind everything */}
      <HeartBackground />

      {/* Everything else */}
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        {/* Top Navigation */}
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.back()}>
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>

          {/* Progress Bar */}
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

        {/* Content */}
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          {/* Speech Bubble */}
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>
              A minimum of $15 per month is needed to keep your account active, but you can increase your donation to your desired amount.
            </Text>
          </View>

          {/* Piggy Image */}
          <Image
            source={require('../assets/images/piggy-with-coin.png')}
            style={styles.piggy}
          />
        </ScrollView>

        {/* Bottom Button */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleContinue} style={styles.continueButton}>
            <Text style={{ color: '#fff', fontSize: 16 }}>Got it!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
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
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E1E1E5',
  },
  speechText: {
    color: '#324E58',
    fontSize: 16,
    textAlign: 'center',
  },
  piggy: {
    width: 220,
    height: 220,
    marginTop: 20,
    resizeMode: 'contain',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#e1e1e5',
  },
  continueButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
});
