// One-Time Gift Checkout Screen with Stripe Integration
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useStripe } from '@stripe/stripe-react-native';
import API from '../../lib/api';
import { STRIPE_PUBLISHABLE_KEY } from '../../utils/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { initPaymentSheet, presentPaymentSheet, isApplePaySupported } = useStripe();
  
  // Check if Stripe is properly initialized
  useEffect(() => {
    if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY.includes('pk_test_51...')) {
      Alert.alert(
        'Configuration Required',
        'Stripe publishable key is not configured. Please add your Stripe publishable key to app/utils/constants.js',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  }, []);
  
  // Get data from params
  const beneficiaryId = params.beneficiaryId;
  const beneficiaryName = params.beneficiaryName || 'Charity';
  const beneficiaryImage = params.beneficiaryImage ? { uri: params.beneficiaryImage } : null;
  const amount = parseFloat(params.amount || '0');
  const userCoveredFees = params.userCoveredFees === 'true';
  const donorMessage = params.donorMessage || '';
  const isAnonymous = params.isAnonymous === 'true';
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [error, setError] = useState(null);

  // Initialize Stripe and check Apple Pay availability
  useEffect(() => {
    checkApplePaySupport();
    createPaymentIntent();
  }, []);

  const checkApplePaySupport = async () => {
    try {
      const supported = await isApplePaySupported();
      setApplePayAvailable(supported);
    } catch (error) {
      console.error('Error checking Apple Pay support:', error);
      setApplePayAvailable(false);
    }
  };

  const createPaymentIntent = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      const giftData = {
        beneficiary_id: beneficiaryId,
        amount: amount,
        currency: 'USD',
        user_covered_fees: userCoveredFees,
        donor_message: donorMessage,
        is_anonymous: isAnonymous,
      };

      const response = await API.createOneTimeGiftPaymentIntent(giftData);
      
      if (response.success && response.payment_intent) {
        setPaymentIntent(response.payment_intent);
        
        // Initialize payment sheet for Apple Pay
        if (applePayAvailable) {
          await initializePaymentSheet(response.payment_intent);
        }
      } else {
        throw new Error('Failed to create payment intent');
      }
    } catch (error) {
      console.error('Error creating payment intent:', error);
      setError(error.message || 'Failed to initialize payment. Please try again.');
      Alert.alert('Error', error.message || 'Failed to initialize payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const initializePaymentSheet = async (paymentIntentData) => {
    try {
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'THRIVE Initiative',
        paymentIntentClientSecret: paymentIntentData.client_secret,
        applePay: {
          merchantCountryCode: 'US',
        },
        style: 'alwaysDark',
      });

      if (initError) {
        console.error('Payment sheet initialization error:', initError);
        // Don't show error to user, just disable Apple Pay
        setApplePayAvailable(false);
      }
    } catch (error) {
      console.error('Error initializing payment sheet:', error);
      setApplePayAvailable(false);
    }
  };

  const handleApplePay = async () => {
    if (!paymentIntent) {
      Alert.alert('Error', 'Payment not initialized. Please try again.');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          console.error('Payment sheet error:', presentError);
          Alert.alert('Payment Failed', presentError.message || 'Payment could not be completed.');
        }
        setIsProcessing(false);
        return;
      }

      // Payment succeeded, confirm with backend
      await confirmPayment(paymentIntent.id, null, 'apple_pay');
    } catch (error) {
      console.error('Apple Pay error:', error);
      setError(error.message || 'Apple Pay payment failed.');
      Alert.alert('Error', error.message || 'Apple Pay payment failed.');
      setIsProcessing(false);
    }
  };

  const handleCardPayment = async () => {
    if (!paymentIntent) {
      Alert.alert('Error', 'Payment not initialized. Please try again.');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      // For card payments, we'll use the payment sheet as well
      // This allows users to enter card details securely
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          console.error('Payment sheet error:', presentError);
          Alert.alert('Payment Failed', presentError.message || 'Payment could not be completed.');
        }
        setIsProcessing(false);
        return;
      }

      // Payment succeeded, confirm with backend
      await confirmPayment(paymentIntent.id, null, 'card');
    } catch (error) {
      console.error('Card payment error:', error);
      setError(error.message || 'Card payment failed.');
      Alert.alert('Error', error.message || 'Card payment failed.');
      setIsProcessing(false);
    }
  };

  const confirmPayment = async (paymentIntentId, paymentMethodId, paymentMethodType) => {
    try {
      const response = await API.confirmOneTimeGiftPayment(paymentIntentId, paymentMethodId);

      if (response.success && response.gift) {
        // Save transaction to local storage
        await saveTransaction(response.transaction);

        setIsProcessing(false);
        setConfettiTrigger(true);
        setShowSuccess(true);
      } else {
        throw new Error('Payment confirmation failed');
      }
    } catch (error) {
      console.error('Error confirming payment:', error);
      setError(error.message || 'Failed to confirm payment.');
      Alert.alert('Error', error.message || 'Failed to confirm payment.');
      setIsProcessing(false);
    }
  };

  const saveTransaction = async (transaction) => {
    try {
      const existingTransactions = await AsyncStorage.getItem('userTransactions');
      const transactions = existingTransactions ? JSON.parse(existingTransactions) : [];
      
      transactions.unshift({
        id: transaction.id || Date.now().toString(),
        type: 'donation',
        beneficiaryName: transaction.beneficiary_name || beneficiaryName,
        amount: transaction.amount || `$${amount.toFixed(2)}`,
        date: transaction.date || new Date().toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        }),
        status: transaction.status || 'completed',
        isOneTimeGift: true,
      });
      
      await AsyncStorage.setItem('userTransactions', JSON.stringify(transactions));
      console.log('✅ Saved one-time gift transaction');
    } catch (error) {
      console.error('❌ Error saving transaction:', error);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    router.back();
  };

  // Calculate fees (matching backend calculation)
  const processingFee = userCoveredFees ? (amount * 0.029 + 0.30) : 0;
  const totalAmount = userCoveredFees ? (amount + processingFee) : amount;

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#2C3E50', '#4CA1AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          disabled={isProcessing}
        >
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#fff' }} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Beneficiary Info */}
        <View style={styles.beneficiaryCard}>
          {beneficiaryImage ? (
            <Image source={beneficiaryImage} style={styles.beneficiaryImage} />
          ) : (
            <View style={[styles.beneficiaryImage, styles.beneficiaryImagePlaceholder]}>
              <Feather name="heart" size={32} color="#DB8633" />
            </View>
          )}
          <Text style={styles.beneficiaryName}>{beneficiaryName}</Text>
          <Text style={styles.beneficiarySubtext}>One-time donation</Text>
        </View>

        {/* Payment Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Payment Summary</Text>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Donation Amount</Text>
            <Text style={styles.summaryAmount}>${amount.toFixed(2)}</Text>
          </View>

          {userCoveredFees && processingFee > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Processing Fee</Text>
              <Text style={styles.summaryAmount}>${processingFee.toFixed(2)}</Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>${totalAmount.toFixed(2)}</Text>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Payment Methods */}
        {paymentIntent && (
          <View style={styles.paymentMethodsCard}>
            <Text style={styles.sectionTitle}>Payment Method</Text>

            {/* Apple Pay Button */}
            {applePayAvailable && (
              <>
                <TouchableOpacity
                  style={styles.applePayButton}
                  onPress={handleApplePay}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.applePayText}>Pay with Apple Pay</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            {/* Card Payment Button */}
            <TouchableOpacity
              style={[
                styles.cardPaymentButton,
                isProcessing && styles.buttonDisabled
              ]}
              onPress={handleCardPayment}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="credit-card" size={20} color="#fff" />
                  <Text style={styles.cardPaymentText}>Pay with Card</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Loading State */}
        {!paymentIntent && isProcessing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#DB8633" />
            <Text style={styles.loadingText}>Initializing payment...</Text>
          </View>
        )}

        {/* Info Note */}
        <Text style={styles.infoNote}>
          🔒 Your payment is processed securely through Stripe.
        </Text>
      </ScrollView>

      {/* Success Modal */}
      <Modal
        visible={showSuccess}
        transparent
        animationType="fade"
        onRequestClose={handleSuccessClose}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            {confettiTrigger && (
              <ConfettiCannon
                count={200}
                origin={{ x: 200, y: 0 }}
                fadeOut
                autoStart
              />
            )}
            <View style={styles.successIconContainer}>
              <AntDesign name="checkcircle" size={64} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Thank You! 🎉</Text>
            <Text style={styles.successMessage}>
              Your ${totalAmount.toFixed(2)} gift to {beneficiaryName} has been processed successfully.
            </Text>
            <Text style={styles.successSubtext}>
              This donation has been added to your transaction history.
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={handleSuccessClose}
            >
              <Text style={styles.successButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  beneficiaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  beneficiaryImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  beneficiaryImagePlaceholder: {
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  beneficiaryName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  beneficiarySubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  summaryAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DB8633',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#DC2626',
  },
  paymentMethodsCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  applePayButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  applePayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
    marginHorizontal: 16,
  },
  cardPaymentButton: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cardPaymentText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  infoNote: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 400,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  successSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  successButton: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 120,
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

