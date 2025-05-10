import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ScrollView, Animated, Easing } from 'react-native';
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
    router.push('/signupFlow/stripeIntegration');
  };

  const handleSkip = () => {
    router.replace('/guestHome');
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
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>

        {/* Updated Progress Bar with piggy */}
        <View style={styles.progressBarWrapper}>
          <View style={styles.progressBar}>
            <View style={styles.progressActive} />
            <View style={styles.progressActive} />
            <View style={styles.progressActive} />
            <View style={styles.progressActive} />
            <View style={styles.progressInactive} />
          </View>
          <View style={styles.piggyContainer}>
            <Image source={require('../../assets/images/walking-piggy.png')} style={styles.walkingPiggy} />
          </View>
        </View>

        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: '#DB8633', fontSize: 14 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {/* Speech Bubble */}
        <View style={styles.speechContainer}>
          <Animated.Image
            source={require('../../assets/images/bolt-piggy.png')}
            style={{ width: 50, height: 50, resizeMode: 'contain', marginRight: 10, transform: [{ rotate: piggyRotate }] }}
          />
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>
              Set your giving vibes — how much will you donate monthly?
            </Text>
          </View>
        </View>

        {/* Slider */}
        <View style={styles.sliderContainer}>
          <Image
            source={require('../../assets/images/slider.png')}
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

        <View style={styles.sliderLabels}>
          <Text style={styles.amountLabel}>${MIN_AMOUNT}</Text>
          <Text style={styles.amountLabel}>${MAX_AMOUNT}</Text>
        </View>

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
          <Text style={{ color: '#fff', fontSize: 16 }}>Done! I'm Feeling Generous</Text>
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
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  progressBarWrapper: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    height: 4,
    width: '100%',
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
  piggyContainer: {
    position: 'absolute',
    top: -18,
    left: '65%',
  },
  walkingPiggy: {
    width: 30,
    height: 24,
    resizeMode: 'contain',
  },
  speechContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  speechBubble: {
    backgroundColor: '#F5F5FA',
    padding: 15,
    borderRadius: 10,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E1E1E5',
  },
  speechText: {
    color: '#324E58',
    fontSize: 16,
    textAlign: 'left',
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
