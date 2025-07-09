import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, StyleSheet, Dimensions, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import ProfileCompleteModal from '../../components/ProfileCompleteModal';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated } from 'react-native';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function StripeIntegration() {
  const router = useRouter();

  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [showModal, setShowModal] = useState(false);

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

  const handleContinue = () => {
    setShowModal(true);
  };

  const handleSkip = () => {
    router.replace('/guestHome');
  };

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
            <Image source={require('../../assets/images/piggy-coin.png')} style={styles.piggyLarge} />
            <Animated.View style={{
              opacity: bubbleAnim,
              transform: [{ translateY: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            }}>
              <View style={styles.speechBubbleCard}>
                <Text style={styles.speechBubbleHeading}>You're almost done!</Text>
                <Text style={styles.speechTextCard}>Finish up by adding your credit card to process the payments each month.</Text>
              </View>
            </Animated.View>
          </Animated.View>
          {/* White Card for form and button */}
          <Animated.View style={{
            ...styles.infoCard,
            opacity: cardAnim,
            transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
          }}>
            <Image
              source={require('../../assets/images/stripe-logo.png')}
              style={styles.stripeLogo}
              resizeMode="contain"
            />
            <View style={{ width: '100%', marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Card number"
                placeholderTextColor="#6d6e72"
                keyboardType="numeric"
                value={cardNumber}
                onChangeText={setCardNumber}
              />
              <TextInput
                style={styles.input}
                placeholder="Holder name"
                placeholderTextColor="#6d6e72"
                value={holderName}
                onChangeText={setHolderName}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TextInput
                  style={[styles.input, { width: '48%' }]}
                  placeholder="Expiry date"
                  placeholderTextColor="#6d6e72"
                  value={expiryDate}
                  onChangeText={setExpiryDate}
                />
                <TextInput
                  style={[styles.input, { width: '48%' }]}
                  placeholder="CVV"
                  placeholderTextColor="#6d6e72"
                  secureTextEntry
                  value={cvv}
                  onChangeText={setCvv}
                />
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setSaveCard(!saveCard)}
              style={styles.saveCardContainer}
            >
              <AntDesign
                name={saveCard ? "checkcircle" : "checkcircleo"}
                size={20}
                color="#DB8633"
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: '#324E58', fontSize: 16 }}>
                Save card for <Text style={{ fontWeight: '700' }}>monthly billing</Text>
              </Text>
            </TouchableOpacity>
            <Animated.View style={{
              opacity: buttonAnim,
              transform: [{ scale: buttonAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
              width: '100%',
            }}>
              <TouchableOpacity onPress={handleContinue} style={styles.continueButton}>
                <Text style={styles.continueButtonText}>Save and continue</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ProfileCompleteModal
        visible={showModal}
        onClose={() => {
          setShowModal(false);
          router.push('/home');
        }}
      />
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
    textAlign: 'center',
    lineHeight: 22,
  },
  speechBubbleHeading: {
    color: '#324E58',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
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
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 6,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  skipButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
  },
  speechBubble: {
    backgroundColor: '#F5F5FA',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E1E1E5',
    marginRight: 10,
    flex: 1,
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
    lineHeight: 22,
  },
  piggy: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
  },
  stripeLogo: {
    width: 150,
    height: 60,
    marginVertical: 10,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#f5f5fa',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#324E58',
    marginBottom: 10,
  },
  saveCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 15,
    width: '100%',
    marginTop: 10,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
