import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ScrollView, Modal, Dimensions, Platform, Keyboard, KeyboardAvoidingView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../../lib/api';
import ConfettiCannon from 'react-native-confetti-cannon';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DiscountApproved() {
  const router = useRouter();
  const { addSavings } = useUser();
  const params = useLocalSearchParams();
  
  // Get dynamic data from route params
  const discountId = params.discountId || null;
  const vendorId = params.vendorId || null;
  const discountCode = params.discountCode || 'DEALFREE';
  const vendorName = params.vendorName || 'Starbucks Coffee';
  const discountTitle = params.discountTitle || 'Free Appetizer';
  const vendorLogoUri = params.vendorLogo ? String(params.vendorLogo) : '';
  const vendorLogo = vendorLogoUri ? { uri: vendorLogoUri } : require('../../../assets/images/logos/starbucks.png');
  const discountType = params.discountType || '';
  const discountValue = params.discountValue ? parseFloat(params.discountValue) : null;
  const maxDiscount = params.maxDiscount ? parseFloat(params.maxDiscount) : null;
  const description = params.description || '';
  const terms = params.terms || '';
  const usageLimitPerMonth = params.usageLimitPerMonth ? parseInt(params.usageLimitPerMonth, 10) : null;
  const parseCount = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const remainingUses = parseCount(params.remainingUses);
  const availableCount = parseCount(params.availableCount);
  const usageLimitDisplay = params.usageLimitDisplay || params.discount?.usageLimitDisplay || '';
  const parsedDisplayLimit = parseCount(usageLimitDisplay);
  const usageLimitTotal = usageLimitPerMonth
    ?? parseCount(params.usageLimit)
    ?? parseCount(params.maxUsesPerMonth)
    ?? parseCount(params.usage_limit_per_month)
    ?? parseCount(params.usage_limit)
    ?? parseCount(params.max_uses_per_month)
    ?? parsedDisplayLimit;
  const usageDisplay = remainingUses !== null
    ? (usageLimitTotal
        ? `${remainingUses} out of ${usageLimitTotal} remaining`
        : `${remainingUses} remaining`)
    : availableCount !== null
      ? (usageLimitTotal
          ? `${availableCount} out of ${usageLimitTotal} remaining`
          : `${availableCount} remaining`)
      : (usageLimitDisplay && parsedDisplayLimit === null)
        ? usageLimitDisplay
        : usageLimitTotal
          ? `${usageLimitTotal} time${usageLimitTotal !== 1 ? 's' : ''} per month`
          : 'Unlimited';
  
  const confettiRef = useRef(null);
  const transactionCreatedRef = useRef(false);
  const [totalBill, setTotalBill] = useState('');
  const [totalDiscount, setTotalDiscount] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => confettiRef.current?.start(), 300);
    return () => clearTimeout(timer);
  }, []);

  // Allow only valid dollar amounts: digits + at most one decimal point + at most 2 decimal places
  const filterNumericInput = (text) => {
    const filtered = text.replace(/[^0-9.]/g, '');
    const dotIndex = filtered.indexOf('.');
    if (dotIndex === -1) return filtered;
    const intPart = filtered.slice(0, dotIndex);
    const decPart = filtered.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
    return `${intPart}.${decPart}`;
  };

  const handleSavingsChange = (text) => {
    const filtered = filterNumericInput(text);
    const savingsVal = parseFloat(filtered) || 0;
    const billVal = parseFloat(totalBill) || 0;
    if (billVal > 0 && savingsVal > billVal) {
      setTotalDiscount(totalBill);
      return;
    }
    setTotalDiscount(filtered);
  };
  const [showModal, setShowModal] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Add transaction to transaction history - try backend first, fallback to local
  const addTransactionToHistory = useCallback(async (transactionData) => {
    const spendingNum = parseFloat(String(transactionData.spending).replace(/[$,]/g, '')) || 0;
    const savingsNum = parseFloat(String(transactionData.savings).replace(/[$,]/g, '')) || 0;

    try {
      let backendId = null;

      // Try to save to backend first
      try {
        const result = await API.createTransaction({
          type: 'redemption',
          description: transactionData.discount,
          discount_code: discountCode,
          savings: savingsNum,
          spending: spendingNum,
          discount_id: discountId || undefined,
          vendor_id: vendorId || undefined,
          metadata: {
            vendor_name: transactionData.brand,
            vendor_logo_url: vendorLogoUri || null,
          },
        });
        backendId = result?.transaction?.id ?? null;
        console.log('✅ Transaction saved to backend', backendId);
      } catch (apiError) {
        console.warn('⚠️ Backend save failed, using local storage:', apiError.message);
      }

      // Always write to local storage so Savings Tracker shows it immediately,
      // even if the backend saved it (avoids needing a fresh fetch to see it).
      const localEntry = {
        id: backendId ? String(backendId) : Date.now().toString(),
        type: 'redemption',
        brand: transactionData.brand,
        date: transactionData.date,
        discount: transactionData.discount,
        spending: transactionData.spending,
        savings: transactionData.savings,
        logo: vendorLogoUri ? { uri: vendorLogoUri } : null,
        status: 'completed',
      };
      const existingRaw = await AsyncStorage.getItem('userTransactions');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      // Don't duplicate if backend ID already in cache
      const alreadyExists = backendId && existing.some((t) => String(t.id) === String(backendId));
      if (!alreadyExists) {
        existing.unshift(localEntry);
        await AsyncStorage.setItem('userTransactions', JSON.stringify(existing));
      }
    } catch (error) {
      console.error('❌ Error saving transaction to history:', error);
    }
  }, [discountCode, discountId, vendorId, vendorLogoUri]);

  // If the user leaves without pressing Save or Skip, auto-create a $0 transaction.
  // useFocusEffect cleanup also runs when callback deps change — `vendorLogo` was a new
  // `{ uri }` object every render, which re-fired cleanup and duplicated the $0 POST
  // before Save. Depend only on stable primitives + memoized addTransactionToHistory.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!transactionCreatedRef.current) {
          transactionCreatedRef.current = true;
          addTransactionToHistory({
            brand: vendorName,
            date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            discount: discountTitle,
            spending: '$0',
            savings: '$0',
            logo: vendorLogoUri ? { uri: vendorLogoUri } : require('../../../assets/images/logos/starbucks.png'),
          }).catch(() => {});
        }
      };
    }, [vendorName, discountTitle, vendorLogoUri, addTransactionToHistory]),
  );

  const contentPaddingBottom = keyboardHeight > 0 ? keyboardHeight + 24 : 24;

  const billNum = parseFloat(totalBill) || 0;
  const savingsNum = parseFloat(totalDiscount) || 0;
  const savingsExceedsBill = savingsNum > billNum;
  const canSave = totalBill && totalDiscount && !savingsExceedsBill;

  const handleSaveTransaction = async () => {
    const bill = parseFloat(totalBill) || 0;
    const savings = parseFloat(totalDiscount) || 0;
    if (savings > bill) {
      Alert.alert(
        'Invalid Amount',
        'Savings cannot be greater than your total bill. Please enter a savings amount that does not exceed your bill total.',
        [{ text: 'OK' }]
      );
      return;
    }
    if (totalBill && totalDiscount) {
      try {
        transactionCreatedRef.current = true;
        // Add the savings amount to total savings
        const savingsAmount = parseFloat(totalDiscount) || 0;
        await addSavings(savingsAmount);
        
        // Add transaction to transaction history
        await addTransactionToHistory({
          brand: vendorName,
          date: new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          }),
          discount: discountTitle,
          spending: `$${totalBill}`,
          savings: `$${totalDiscount}`,
          logo: vendorLogo,
        });
        
        console.log(`💰 Added $${savingsAmount} to savings!`);
        setShowModal(true);
      } catch (error) {
        console.error('❌ Error adding savings:', error);
        // Still show modal even if there's an error
        setShowModal(true);
      }
    }
  };

  const handleSkip = async () => {
    transactionCreatedRef.current = true;
    try {
      // Add transaction to transaction history with $0 values
      await addTransactionToHistory({
        brand: vendorName,
        date: new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        discount: discountTitle,
        spending: '$0',
        savings: '$0',
        logo: vendorLogo,
      });
      
      console.log('💰 Created transaction record with $0 values!');
      router.push('/(tabs)');
    } catch (error) {
      console.error('❌ Error creating transaction:', error);
      // Still navigate even if there's an error
      router.push('/(tabs)');
    }
  };

  const handleClose = () => {
    setShowModal(false);
    router.push('/(tabs)');
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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContainer, { paddingBottom: contentPaddingBottom }]}
          keyboardShouldPersistTaps="handled"
        >
        {/* Top Navigation */}
        <View style={styles.headerWrapper}>
          <View style={{ width: 24 }} />
          <Text style={styles.headerTitle}>Discount Redeemed!</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/home')} style={styles.closeButton}>
            {Platform.OS === 'web' ? (
              <Text style={{ fontSize: 24, color: '#fff' }}>✕</Text>
            ) : (
              <AntDesign name="close" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Combined Company Info & Discount Code Card */}
        <View style={styles.combinedCard}>
          {/* Company Info Section */}
          <View style={styles.companySection}>
            <View style={styles.companyLeft}>
              <Image source={vendorLogo} style={styles.companyLogo} />
              <View style={styles.companyText}>
                <Text style={styles.companyName}>{vendorName}</Text>
                <View style={styles.approvedBadge}>
                  {Platform.OS === 'web' ? (
                    <Text style={{ marginRight: 6 }}>✅</Text>
                  ) : (
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  )}
                  <Text style={styles.approvedText}>Discount Approved</Text>
                </View>
              </View>
            </View>
            <View style={styles.companyRight}>
              <View style={styles.statusIndicator}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Active</Text>
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.cardDivider} />

          {/* Discount Code Section */}
          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>Your Discount Code</Text>
            <View style={styles.codeDisplay}>
              <Text style={styles.codeText}>{discountCode}</Text>
            </View>
            <Text style={styles.codeInstructions}>Use this code at checkout</Text>
            {description ? (
              <Text style={styles.codeDescription}>{description}</Text>
            ) : null}
          </View>
        </View>

        {/* Savings Tracking Section */}
        <View style={styles.savingsSection}>
          <View style={styles.savingsHeader}>
            <View style={styles.savingsIconContainer}>
              {Platform.OS === 'web' ? (
                <Text style={{ fontSize: 32 }}>💰</Text>
              ) : (
                <Ionicons name="cash" size={32} color="#DB8633" />
              )}
            </View>
            <View style={styles.savingsText}>
              <Text style={styles.savingsTitle}>Track Your Savings</Text>
              <Text style={styles.savingsSubtitle}>Enter your total bill and savings amount</Text>
            </View>
          </View>
          
          <View style={styles.inputContainer}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Total Bill</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#A0B4C8"
                    keyboardType="decimal-pad"
                    value={totalBill}
                    onChangeText={(t) => setTotalBill(filterNumericInput(t))}
                  />
                </View>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Total Savings</Text>
                <View style={[styles.inputWrapper, savingsExceedsBill && styles.inputError]}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#A0B4C8"
                    keyboardType="decimal-pad"
                    value={totalDiscount}
                    onChangeText={handleSavingsChange}
                  />
                </View>
                {savingsExceedsBill && (
                  <Text style={styles.inputErrorText}>Savings cannot exceed total bill</Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.savingsButtonRow}>
            <TouchableOpacity 
              style={styles.skipButton}
              onPress={handleSkip}
            >
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.saveButton, 
                !canSave && styles.saveButtonDisabled
              ]} 
              onPress={handleSaveTransaction}
              disabled={!canSave}
            >
              <Text style={styles.saveButtonText}>Save Transaction</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Terms Link */}
        <TouchableOpacity style={styles.termsLink}>
          <Text style={styles.termsText}>Read Discount Terms & Conditions</Text>
          {Platform.OS === 'web' ? (
            <Text style={{ fontSize: 14, color: '#8E9BAE' }}>›</Text>
          ) : (
            <AntDesign name="right" size={14} color="#8E9BAE" />
          )}
        </TouchableOpacity>


        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confetti burst on arrival */}
      <ConfettiCannon
        ref={confettiRef}
        count={120}
        origin={{ x: SCREEN_WIDTH / 2, y: -10 }}
        autoStart={false}
        fadeOut
        fallSpeed={2800}
        colors={['#DB8633', '#21555b', '#FFC857', '#10B981', '#fff']}
      />

      {/* Success Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Image source={require('../../../assets/images/piggy-confetti.png')} style={styles.modalIcon} />
            </View>
            <Text style={styles.modalTitle}>Savings Recorded! 🎉</Text>
            <Text style={styles.modalMessage}>
              <Text style={styles.modalHighlight}>${totalDiscount}</Text> added to your total savings!
            </Text>
            <Text style={styles.modalSubtitle}>
              Great job supporting local businesses and making a difference!
            </Text>
            <TouchableOpacity style={styles.modalButton} onPress={handleClose}>
              <Text style={styles.modalButtonText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: SCREEN_HEIGHT * 0.45, 
    zIndex: 0, 
    overflow: 'hidden' 
  },
  gradientBg: { 
    width: SCREEN_WIDTH, 
    height: '100%', 
    borderBottomLeftRadius: 40, 
    borderBottomRightRadius: 40 
  },
  headerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 1,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  scrollContainer: {
    padding: 20,
    zIndex: 1,
  },
  
  // Combined Company & Discount Code Card
  combinedCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#F1F5F9',
    zIndex: 2,
  },
  
  // Company Section
  companySection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  companyLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  companyRight: {
    alignItems: 'flex-end',
  },
  companyLogo: {
    width: 56,
    height: 56,
    resizeMode: 'contain',
    marginRight: 16,
    borderRadius: 12,
  },
  companyText: {
    flex: 1,
    paddingTop: 2,
  },
  companyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  approvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  approvedText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginLeft: 6,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },

  // Card Divider
  cardDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 20,
  },

  // Discount Code Section
  codeSection: {
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 16,
  },
  codeDisplay: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#21555b',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 32,
    marginBottom: 12,
    alignItems: 'center',
    width: '100%',
  },
  codeText: {
    color: '#21555b',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
  },
  codeInstructions: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  codeDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    width: '100%',
  },

  // Savings Section
  savingsSection: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    zIndex: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderTopWidth: 3,
    borderTopColor: '#DB8633',
  },
  savingsHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  savingsIconContainer: {
    backgroundColor: '#FFF7ED',
    borderRadius: 50,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#FED7AA',
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  savingsText: {
    alignItems: 'center',
  },
  savingsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
    textAlign: 'center',
  },
  savingsSubtitle: {
    fontSize: 14,
    color: '#8E9BAE',
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    fontSize: 18,
    color: '#324E58',
  },
  inputError: {
    borderColor: '#DC2626',
    borderWidth: 2,
    backgroundColor: '#FEF2F2',
  },
  inputErrorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 6,
    fontWeight: '500',
  },
  savingsButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skipButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flex: 1,
  },
  skipButtonText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    flex: 2,
  },
  saveButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Terms Link
  termsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    zIndex: 2,
  },
  termsText: {
    fontSize: 14,
    color: '#8E9BAE',
    marginRight: 8,
  },

  // Modal Styles
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  modalIconContainer: {
    marginBottom: 20,
  },
  modalIcon: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#324E58',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  modalHighlight: {
    color: '#DB8633',
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E9BAE',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
