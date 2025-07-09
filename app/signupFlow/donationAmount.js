import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ScrollView, Animated, Easing, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DonationAmount() {
  const router = useRouter();

  const [amount, setAmount] = useState(15);
  const MIN_AMOUNT = 15;
  const MAX_AMOUNT = 250;

  // Animation values
  const piggyAnim = useRef(new Animated.Value(0)).current;
  const bubbleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(piggyAnim, { toValue: 1, useNativeDriver: true, tension: 40, friction: 8 }),
        Animated.timing(bubbleAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 8 }),
      Animated.spring(buttonAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }),
    ]).start();
  }, []);

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
      {/* Blue gradient as absolute background for top half */}
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 60, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Top Navigation */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>
          {/* Piggy and Speech Bubble in blue area */}
          <Animated.View style={{
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 36,
            marginBottom: 6,
            zIndex: 1,
            opacity: piggyAnim,
            transform: [{ translateY: piggyAnim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
          }}>
            <Animated.Image
              source={require('../../assets/images/bolt-piggy.png')}
              style={[styles.piggyLarge, { opacity: piggyAnim }]}
            />
            <Animated.View style={{
              opacity: bubbleAnim,
              transform: [{ translateY: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            }}>
              <View style={styles.speechBubbleCard}>
                <Text style={styles.speechTextCard}>
                  A minimum of $15 per month is needed to keep your account active, but you can increase your donation to your desired amount.
                </Text>
              </View>
            </Animated.View>
          </Animated.View>
          {/* White Card for form and button */}
          <Animated.View style={{
            ...styles.infoCard,
            opacity: cardAnim,
            transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
          }}>
            {/* Slider */}
            <View style={styles.sliderContainerCard}>
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
            <View style={styles.sliderLabelsCard}>
              <Text style={styles.amountLabelCard}>${MIN_AMOUNT}</Text>
              <Text style={styles.amountLabelCard}>${MAX_AMOUNT}</Text>
            </View>
            <View style={styles.inputContainerCard}>
              <TextInput
                value={amount.toString()}
                onChangeText={handleInputChange}
                placeholder="Enter fixed amount"
                placeholderTextColor="#A0A0A0"
                keyboardType="numeric"
                style={styles.inputCard}
              />
            </View>
            {/* Button inside card */}
            <Animated.View style={{
              opacity: buttonAnim,
              transform: [{ scale: buttonAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
              width: '100%',
            }}>
              <TouchableOpacity onPress={handleSaveAndContinue} style={styles.continueButtonCard}>
                <Text style={styles.continueButtonTextCard}>Done! I'm Feeling Generous</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.45, zIndex: 0, overflow: 'hidden' },
  gradientBg: { width: SCREEN_WIDTH, height: '100%', borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  piggySpeechColumn: { alignItems: 'center', justifyContent: 'center', marginTop: 36, marginBottom: 6, zIndex: 1 },
  piggyLarge: { width: 90, height: 90, resizeMode: 'contain', marginBottom: 10 },
  speechBubbleCard: {
    backgroundColor: '#F5F5FA',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E1E1E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
    marginBottom: 8,
    maxWidth: 340,
  },
  speechTextCard: {
    color: '#324E58',
    fontSize: 16,
    textAlign: 'left',
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: '90%',
    maxWidth: 340,
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 30,
    alignItems: 'center',
    zIndex: 2,
  },
  sliderContainerCard: {
    marginTop: 10,
    marginBottom: 30,
    height: 60,
    justifyContent: 'center',
    width: '100%',
    alignItems: 'center',
  },
  sliderBackground: {
    width: '90%',
    height: 60,
    resizeMode: 'contain',
    position: 'absolute',
    left: '5%',
  },
  sliderLabelsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 5,
    width: '100%',
  },
  amountLabelCard: {
    fontSize: 16,
    color: '#324E58',
  },
  inputContainerCard: {
    backgroundColor: '#F5F5FA',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E1E1E5',
    width: '100%',
    marginBottom: 20,
  },
  inputCard: {
    height: 50,
    fontSize: 16,
    color: '#324E58',
    width: '100%',
  },
  continueButtonCard: {
    backgroundColor: '#DB8633',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 15,
    width: '100%',
    marginTop: 10,
  },
  continueButtonTextCard: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 6,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  slider: {
    width: '90%',
    height: 40,
    alignSelf: 'center',
    position: 'relative',
    zIndex: 2,
  },
});
