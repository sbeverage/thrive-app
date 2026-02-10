import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, StyleSheet, Dimensions, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import ProfileCompleteModal from '../../components/ProfileCompleteModal';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useLocalSearchParams } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBeneficiary } from '../context/BeneficiaryContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Apple Pay SVG asset
const applePaySvgAsset = require('../../assets/logos/Apple-Pay.svg');

export default function StripeIntegration() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { selectedBeneficiary } = useBeneficiary();
  const [applePaySvg, setApplePaySvg] = useState(null);

  // Load SVG content
  useEffect(() => {
    const loadSvg = async () => {
      try {
        const asset = Asset.fromModule(applePaySvgAsset);
        await asset.downloadAsync();
        const response = await fetch(asset.localUri || asset.uri);
        const svgContent = await response.text();
        setApplePaySvg(svgContent);
      } catch (error) {
        console.error('Error loading SVG:', error);
      }
    };
    loadSvg();
  }, []);
  const baseAmount = params.amount ? parseFloat(params.amount) : 15;
  const sponsorAmount = params.sponsorAmount ? parseFloat(params.sponsorAmount) : 0;
  const isCoworkingExtra = params.isCoworkingExtra === 'true';
  const totalMonthlyDonation = params.totalMonthlyDonation
    ? parseFloat(params.totalMonthlyDonation)
    : (isCoworkingExtra ? sponsorAmount + baseAmount : baseAmount);
  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [coverFees, setCoverFees] = useState(true);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('card'); // 'card' or 'applepay'
  const [showServiceFeeInfo, setShowServiceFeeInfo] = useState(false);

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

  const handleApplePay = () => {
    setSelectedPaymentMethod('applepay');
    // Here you would integrate with Apple Pay
    // For now, we'll just show a success message
    // setSuccessMessage("Apple Pay selected! Processing payment..."); // This line was not in the new_code, so it's removed.
    setShowModal(true);
  };

  const handleSkip = () => {
    router.replace('/guestHome');
  };

  // Calculate fees breakdown
  const SERVICE_FEE = 3.00; // Fixed $3 service fee
  const CREDIT_CARD_FEE_RATE = 0.035; // 3.5% for Stripe processing
  
  // Calculate amounts
  const subtotal = baseAmount + SERVICE_FEE; // Base amount + service fee
  const creditCardFee = coverFees ? (subtotal * CREDIT_CARD_FEE_RATE) : 0;
  const totalAmount = (subtotal + creditCardFee).toFixed(2);

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
            <Image 
              source={require('../../assets/icons/arrow-left.png')} 
              style={{ width: 24, height: 24, tintColor: '#fff' }} 
            />
          </TouchableOpacity>
          
          {/* Subtle Message Banner */}
          <Animated.View style={{
            opacity: piggyAnim,
            transform: [{ translateY: piggyAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            width: '90%',
            maxWidth: 340,
            marginTop: 20,
            marginBottom: 16,
          }}>
            <View style={styles.subtleBanner}>
              <Text style={styles.subtleBannerText}>
                Help us cover processing fees so more of your donation goes directly to {selectedBeneficiary?.name || 'your cause'}
              </Text>
            </View>
          </Animated.View>

          {/* Main Checkout Card */}
          <Animated.View style={{
            opacity: cardAnim,
            transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          }}>
            <View style={styles.mainCard}>
              {/* Donation Summary Section */}
              <View style={styles.summarySection}>
                <Text style={styles.sectionTitle}>Donation Summary</Text>
                
                {/* Donation Summary */}
                {isCoworkingExtra && sponsorAmount > 0 ? (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Coworking Sponsor</Text>
                      <Text style={styles.summaryAmount}>${sponsorAmount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Your Extra Donation</Text>
                      <Text style={styles.summaryAmount}>${baseAmount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Total Monthly Donation</Text>
                      <Text style={styles.summaryAmount}>${totalMonthlyDonation.toFixed(2)}</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Monthly Donation</Text>
                    <Text style={styles.summaryAmount}>${baseAmount.toFixed(2)}</Text>
                  </View>
                )}
                
                {/* Service Fee */}
                <View style={styles.summaryRow}>
                  <View style={styles.labelWithInfo}>
                    <Text style={styles.summaryLabel}>Service Fee</Text>
                    <TouchableOpacity 
                      onPress={() => setShowServiceFeeInfo(true)}
                      style={styles.infoIconButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Image 
                        source={require('../../assets/icons/info.png')} 
                        style={styles.infoIcon}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.summaryAmount}>${SERVICE_FEE.toFixed(2)}</Text>
                </View>
                
                {/* Credit Card Fees with Toggle */}
                <View style={styles.summaryRow}>
                  <View style={styles.labelWithToggle}>
                    <View style={styles.labelWithInfo}>
                      <Text style={styles.summaryLabel}>Credit Card Fees</Text>
                      <Text style={styles.feePercentage}>(3.5%)</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        if (!coverFees) setConfettiTrigger(true);
                        setCoverFees(!coverFees);
                      }}
                      style={styles.toggleButton}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.toggleSwitch, coverFees && styles.toggleSwitchActive]}>
                        <View style={[styles.toggleThumb, coverFees && styles.toggleThumbActive]} />
                      </View>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.summaryAmount, !coverFees && styles.disabledAmount]}>
                    ${coverFees ? creditCardFee.toFixed(2) : '0.00'}
                  </Text>
                </View>
                
                {/* Total - Prominent */}
                <View style={styles.totalSection}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalAmount}>${totalAmount}</Text>
                  </View>
                </View>
              </View>

              {/* Payment Method Section */}
              <View style={styles.paymentSection}>
                <Text style={styles.sectionTitle}>Payment Method</Text>
                
                {/* Apple Pay */}
                <TouchableOpacity style={styles.applePayButton} onPress={() => handleApplePay()}>
                  {applePaySvg ? (
                    <SvgXml 
                      xml={applePaySvg}
                      width={50}
                      height={50}
                    />
                  ) : (
                    <View style={{ width: 50, height: 50 }} />
                  )}
                </TouchableOpacity>
                
                {/* Divider */}
                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>
                
                {/* Card Inputs */}
                <View style={styles.cardInputsSection}>
                  <Text style={styles.cardInputTitle}>Credit/Debit Card</Text>
                  
                  <TextInput
                    style={styles.input}
                    placeholder="Card number"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={cardNumber}
                    onChangeText={setCardNumber}
                  />
                  
                  <TextInput
                    style={styles.input}
                    placeholder="Cardholder name"
                    placeholderTextColor="#9ca3af"
                    value={holderName}
                    onChangeText={setHolderName}
                  />
                  
                  <View style={styles.cardInputRow}>
                    <TextInput
                      style={[styles.input, styles.cardInputHalf]}
                      placeholder="MM/YY"
                      placeholderTextColor="#9ca3af"
                      value={expiryDate}
                      onChangeText={setExpiryDate}
                    />
                    <TextInput
                      style={[styles.input, styles.cardInputHalf]}
                      placeholder="CVV"
                      placeholderTextColor="#9ca3af"
                      secureTextEntry
                      value={cvv}
                      onChangeText={setCvv}
                    />
                  </View>
                  
                  {/* Save Card Option */}
                  <TouchableOpacity
                    onPress={() => setSaveCard(!saveCard)}
                    style={styles.saveCardOption}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, saveCard && styles.checkboxChecked]}>
                      {saveCard && <AntDesign name="check" size={14} color="#fff" />}
                    </View>
                    <Text style={styles.saveCardText}>Save card for future donations</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confetti */}
              {confettiTrigger && (
                <ConfettiCannon
                  count={100}
                  origin={{ x: SCREEN_WIDTH / 2, y: 0 }}
                  fadeOut
                  explosionSpeed={350}
                  fallSpeed={3000}
                  onAnimationEnd={() => setConfettiTrigger(false)}
                />
              )}

              {/* Continue Button */}
              <Animated.View style={{
                opacity: buttonAnim,
                transform: [{ scale: buttonAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
                marginTop: 24,
                width: '100%',
              }}>
                <TouchableOpacity onPress={handleContinue} style={styles.continueButton}>
                  <Text style={styles.continueButtonText}>Complete Donation</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ProfileCompleteModal
        visible={showModal}
        onClose={async () => {
          setShowModal(false);
          // Mark that user just completed signup - trigger tutorial
          try {
            await AsyncStorage.removeItem('@thrive_walkthrough_completed');
            await AsyncStorage.removeItem('@thrive_walkthrough_current_step');
            console.log('📚 Signup completed - tutorial will show on home screen');
          } catch (error) {
            console.error('Error resetting tutorial:', error);
          }
          router.push('/(tabs)/home');
        }}
      />
      
      {/* Service Fee Info Modal */}
      <Modal
        visible={showServiceFeeInfo}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowServiceFeeInfo(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowServiceFeeInfo(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Service Fee</Text>
            <Text style={styles.modalText}>
              This fee supports the THRIVE Initiative platform and covers various operating costs.
            </Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowServiceFeeInfo(false)}
            >
              <Text style={styles.modalCloseButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.35, zIndex: 0, overflow: 'hidden' },
  gradientBg: { width: SCREEN_WIDTH, height: '100%', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  piggySpeechColumn: { alignItems: 'center', justifyContent: 'center', marginTop: 36, marginBottom: 6, zIndex: 1 },
  piggyLarge: { width: 90, height: 90, resizeMode: 'contain', marginBottom: 10 },
  speechBubbleCard: {
    backgroundColor: '#F5F5FA',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 24,
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
  applePayButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  applePayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
    marginHorizontal: 16,
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  subtleBanner: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  subtleBannerText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '400',
  },
  mainCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    width: '90%',
    maxWidth: 340,
    alignSelf: 'center',
    marginBottom: 30,
  },
  summarySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 24,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#6d6e72',
    fontWeight: '400',
  },
  summaryAmount: {
    fontSize: 15,
    color: '#2C3E50',
    fontWeight: '600',
  },
  disabledAmount: {
    color: '#9ca3af',
  },
  labelWithInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelWithToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
    marginRight: 12,
  },
  feePercentage: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '400',
  },
  infoIconButton: {
    padding: 4,
    marginLeft: 6,
  },
  infoIcon: {
    width: 16,
    height: 16,
    tintColor: '#6d6e72',
  },
  toggleButton: {
    padding: 4,
  },
  totalSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2C3E50',
  },
  paymentSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cardInputsSection: {
    marginTop: 16,
  },
  cardInputTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 16,
  },
  cardInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardInputHalf: {
    width: '48%',
  },
  saveCardOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#DB8633',
    borderColor: '#DB8633',
  },
  saveCardText: {
    fontSize: 14,
    color: '#6d6e72',
    fontWeight: '400',
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
    height: 52,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#324E58',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  amountBubbleCard: {
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
    alignItems: 'center',
  },
  amountBubbleHeading: {
    color: '#324E58',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  amountBubbleAmount: {
    color: '#2C3E50',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  amountBubbleTotal: {
    color: '#6d6e72',
    fontSize: 14,
    textAlign: 'center',
  },
  feeCoverageSection: {
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  feeCoverageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#f5f5fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  feeCoverageCheckbox: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  feeCoverageTextContainer: {
    flex: 1,
  },
  feeCoverageMainText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  feeCoverageSubText: {
    fontSize: 14,
    color: '#6d6e72',
  },
  feeCoverageGratitude: {
    marginTop: 15,
    marginBottom: 20,
  },
  feeCoverageGratitudeText: {
    color: '#2C3E50',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E1E1E5',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: '#DB8633',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '50%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E1E1E5',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#6d6e72',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalCloseButton: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
