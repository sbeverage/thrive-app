import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ScrollView, Animated, Easing, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

export default function DonationAmount() {
  const router = useRouter();

  const [amount, setAmount] = useState(15);
  const MIN_AMOUNT = 15;
  const MAX_AMOUNT = 250;

  const piggyAnim = new Animated.Value(0);

  const handleSliderChange = (value) => {
    setAmount(Math.round(value));
    animatePiggy();
  };

  const handleInputChange = (text) => {
    const numericValue = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(numericValue)) {
      if (numericValue >= MIN_AMOUNT && numericValue <= MAX_AMOUNT) {
        setAmount(numericValue);
      } else if (numericValue < MIN_AMOUNT) {
        setAmount(MIN_AMOUNT);
      } else {
        setAmount(MAX_AMOUNT);
      }
    }
  };

  const handleSaveAndContinue = () => {
    Alert.alert(
      '🎉 Changes Saved!',
      'Your donation preferences were successfully updated!',
      [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/menu'),
        },
      ]
    );
  };

  const animatePiggy = () => {
    Animated.sequence([
      Animated.timing(piggyAnim, { toValue: 1, duration: 200, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(piggyAnim, { toValue: -1, duration: 200, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(piggyAnim, { toValue: 0, duration: 200, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
  };

  const piggyRotate = piggyAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-10deg', '0deg', '10deg'],
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Top Navigation */}
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {/* Speech Bubble */}
        <View style={styles.speechContainer}>
          <Animated.Image
            source={require('../../../assets/images/bolt-piggy.png')}
            style={{ width: 50, height: 50, resizeMode: 'contain', marginRight: 10, transform: [{ rotate: piggyRotate }] }}
          />
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>
            Set your giving vibes — how much will you donate monthly?”
            </Text>
          </View>
          <View style={styles.speechBubbleTail} />
        </View>

        {/* Curvy Slider */}
        <View style={styles.sliderContainer}>
          <Image
            source={require('../../../assets/images/slider.png')}
            style={styles.sliderBackground}
          />
          <Slider
            style={styles.slider}
            minimumValue={MIN_AMOUNT}
            maximumValue={MAX_AMOUNT}
            value={amount}
            onValueChange={handleSliderChange}
            minimumTrackTintColor="transparent"
            maximumTrackTintColor="transparent"
            thumbTintColor="#DB8633"
          />
        </View>

        {/* Min/Max Labels */}
        <View style={styles.sliderLabels}>
          <Text style={styles.amountLabel}>${MIN_AMOUNT}</Text>
          <Text style={styles.amountLabel}>${MAX_AMOUNT}</Text>
        </View>

        {/* Fixed Amount Input */}
        <View style={styles.inputContainer}>
          <TextInput
            value={amount.toString()}
            onChangeText={handleInputChange}
            placeholder="Enter fixed amount"
            placeholderTextColor="#A0A0A0"
            keyboardType="numeric"
            style={styles.input}
          />
        </View>
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={handleSaveAndContinue} style={styles.continueButton}>
          <Text style={{ color: '#fff', fontSize: 16 }}>Done & Feeling Generous</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    padding: 10,
  },
  speechContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  speechBubble: {
    backgroundColor: '#F5F5FA',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E1E1E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  speechBubbleTail: {
    position: 'absolute',
    left: -8,
    top: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderBottomWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#F5F5FA',
    borderTopColor: 'transparent',
  },
  speechText: {
    color: '#324E58',
    fontSize: 16,
    textAlign: 'left',
    lineHeight: 22,
  },
  sliderContainer: {
    marginTop: 10,
    marginBottom: 30,
    height: 60,
    justifyContent: 'center',
  },
  sliderBackground: {
    width: '100%',
    height: 60,
    resizeMode: 'contain',
    position: 'absolute',
  },
  slider: {
    width: '100%',
    height: 60,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  amountLabel: {
    fontSize: 16,
    color: '#324E58',
  },
  inputContainer: {
    backgroundColor: '#F5F5FA',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E1E1E5',
  },
  input: {
    height: 50,
    fontSize: 16,
    color: '#324E58',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#E1E1E5',
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
  },
});
