// One-Time Gift Flow: Amount Selection → Checkout → Success
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500];

export default function OneTimeGiftScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Get beneficiary info from params
  const beneficiaryId = params.beneficiaryId;
  const beneficiaryName = params.beneficiaryName || 'Charity';
  const beneficiaryImage = params.beneficiaryImage ? { uri: params.beneficiaryImage } : null;
  
  const [amount, setAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');

  const handlePresetSelect = (presetAmount) => {
    setAmount(presetAmount.toString());
    setCustomAmount('');
  };

  const handleCustomInput = (text) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    setCustomAmount(numericValue);
    if (numericValue) {
      setAmount(numericValue);
    } else {
      setAmount('');
    }
  };

  const handleContinue = async () => {
    const donationAmount = parseFloat(amount);
    
    if (!amount || donationAmount < 1) {
      Alert.alert('Invalid Amount', 'Please enter a donation amount of at least $1.');
      return;
    }

    if (donationAmount > 10000) {
      Alert.alert('Amount Too Large', 'Please enter an amount less than $10,000.');
      return;
    }

    if (!beneficiaryId) {
      Alert.alert('Error', 'Beneficiary information is missing. Please try again.');
      return;
    }

    // Navigate to checkout screen
    router.push({
      pathname: '/(tabs)/beneficiary/checkout',
      params: {
        beneficiaryId: beneficiaryId,
        beneficiaryName: beneficiaryName,
        beneficiaryImage: params.beneficiaryImage || '',
        amount: donationAmount.toString(),
        userCoveredFees: 'true', // Default to user covering fees
        donorMessage: '',
        isAnonymous: 'false',
      },
    });
  };



  const selectedAmount = amount ? parseFloat(amount) : 0;

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
        >
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#fff' }} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Give One-Time Gift</Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Beneficiary Info Card */}
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

        {/* Amount Selection */}
        <View style={styles.amountSection}>
          <Text style={styles.sectionTitle}>Choose Amount</Text>
          
          {/* Preset Amounts */}
          <View style={styles.presetContainer}>
            {PRESET_AMOUNTS.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.presetButton,
                  amount === preset.toString() && styles.presetButtonSelected
                ]}
                onPress={() => handlePresetSelect(preset)}
              >
                <Text style={[
                  styles.presetText,
                  amount === preset.toString() && styles.presetTextSelected
                ]}>
                  ${preset}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Amount Input */}
          <View style={styles.customAmountContainer}>
            <Text style={styles.customAmountLabel}>Or enter custom amount</Text>
            <View style={styles.customAmountInputWrapper}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.customAmountInput}
                placeholder="0"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={customAmount}
                onChangeText={handleCustomInput}
                maxLength={6}
              />
            </View>
          </View>

          {/* Selected Amount Display */}
          {selectedAmount > 0 && (
            <View style={styles.selectedAmountCard}>
              <Text style={styles.selectedAmountLabel}>Your Gift</Text>
              <Text style={styles.selectedAmountValue}>${selectedAmount.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Continue Button */}
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!amount || selectedAmount < 1) && styles.continueButtonDisabled
          ]}
          onPress={handleContinue}
          disabled={!amount || selectedAmount < 1}
        >
          <Text style={styles.continueButtonText}>
            Continue to Checkout
          </Text>
        </TouchableOpacity>

        {/* Info Note */}
        <Text style={styles.infoNote}>
          💝 Your one-time gift will be processed securely and added to your transaction history.
        </Text>
      </ScrollView>

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
    marginBottom: 30,
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
  amountSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 16,
  },
  presetContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  presetButton: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#DB8633',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetButtonSelected: {
    backgroundColor: '#FFF5EB',
    borderColor: '#DB8633',
  },
  presetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DB8633',
  },
  presetTextSelected: {
    color: '#DB8633',
  },
  customAmountContainer: {
    marginBottom: 20,
  },
  customAmountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  customAmountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '600',
    color: '#324E58',
    marginRight: 8,
  },
  customAmountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#324E58',
    paddingVertical: 14,
  },
  selectedAmountCard: {
    backgroundColor: '#FFF5EB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#DB8633',
  },
  selectedAmountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DB8633',
    marginBottom: 4,
  },
  selectedAmountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#DB8633',
  },
  continueButton: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  continueButtonDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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


