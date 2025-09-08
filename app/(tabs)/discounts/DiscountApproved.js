import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ScrollView, Modal, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DiscountApproved() {
  const router = useRouter();
  const { addPoints, addSavings } = useUser();
  const [totalBill, setTotalBill] = useState('');
  const [totalDiscount, setTotalDiscount] = useState('');
  const [showModal, setShowModal] = useState(false);

  const handleGetPoints = async () => {
    if (totalBill && totalDiscount) {
      try {
        // Add 25 points for completing the discount redemption
        await addPoints(25);
        
        // Add the savings amount to total savings
        const savingsAmount = parseFloat(totalDiscount) || 0;
        await addSavings(savingsAmount);
        
        console.log(`💰 Added $${savingsAmount} to savings and 25 points!`);
        setShowModal(true);
      } catch (error) {
        console.error('❌ Error adding points and savings:', error);
        // Still show modal even if there's an error
        setShowModal(true);
      }
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContainer, { paddingBottom: 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Navigation */}
        <View style={styles.headerWrapper}>
          <View style={{ width: 24 }} />
          <Text style={styles.headerTitle}>Discount Redeemed!</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/home')} style={styles.closeButton}>
            <AntDesign name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Combined Company Info & Discount Code Card */}
        <View style={styles.combinedCard}>
          {/* Company Info Section */}
          <View style={styles.companySection}>
            <View style={styles.companyLeft}>
              <Image source={require('../../../assets/logos/starbucks.png')} style={styles.companyLogo} />
              <View style={styles.companyText}>
                <Text style={styles.companyName}>Starbucks Coffee</Text>
                <View style={styles.approvedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={styles.approvedText}>Approved by Carlos Montoya, Owner</Text>
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
            <View style={styles.codeHeader}>
              <Text style={styles.codeLabel}>Your Discount Code</Text>
              <TouchableOpacity style={styles.copyButton}>
                <AntDesign name="copy1" size={18} color="#DB8633" />
              </TouchableOpacity>
            </View>
            <View style={styles.codeDisplay}>
              <Text style={styles.codeText}>DEALFREE</Text>
            </View>
            <Text style={styles.codeInstructions}>Show this code at checkout</Text>
          </View>
        </View>

        {/* What You Get - Highlight Section */}
        <View style={styles.highlightSection}>
          <View style={styles.highlightIcon}>
            <Ionicons name="gift" size={32} color="#DB8633" />
          </View>
          <Text style={styles.highlightTitle}>What You Get</Text>
          <Text style={styles.highlightDiscount}>FREE APPETIZER</Text>
          <Text style={styles.highlightSubtext}>Show this to your waiter</Text>
        </View>

        {/* Points Earning Section */}
        <View style={styles.pointsSection}>
          <View style={styles.pointsHeader}>
            <View style={styles.pointsIconContainer}>
              <Image source={require('../../../assets/images/piggy-coin.png')} style={styles.pointsIcon} />
            </View>
            <View style={styles.pointsText}>
              <Text style={styles.pointsTitle}>Earn Extra Points!</Text>
              <Text style={styles.pointsSubtitle}>Track your savings and earn rewards</Text>
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
                    keyboardType="numeric"
                    value={totalBill}
                    onChangeText={setTotalBill}
                  />
                </View>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Total Savings</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#A0B4C8"
                    keyboardType="numeric"
                    value={totalDiscount}
                    onChangeText={setTotalDiscount}
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.pointsButtonRow}>
            <TouchableOpacity 
              style={styles.skipButton}
              onPress={() => router.push('/(tabs)')}
            >
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.earnPointsButton, 
                (!totalBill || !totalDiscount) && styles.earnPointsButtonDisabled
              ]} 
              onPress={handleGetPoints}
              disabled={!totalBill || !totalDiscount}
            >
              <Text style={styles.earnPointsButtonText}>Earn +25 Points</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Terms Link */}
        <TouchableOpacity style={styles.termsLink}>
          <Text style={styles.termsText}>Read Discount Terms & Conditions</Text>
          <AntDesign name="right" size={14} color="#8E9BAE" />
        </TouchableOpacity>


      </ScrollView>

      {/* Success Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Image source={require('../../../assets/images/piggy-confetti.png')} style={styles.modalIcon} />
            </View>
            <Text style={styles.modalTitle}>Cha-ching!</Text>
            <Text style={styles.modalMessage}>
              <Text style={styles.modalHighlight}>+25 Points</Text> added to your piggy bank!
            </Text>
            <Text style={styles.modalSubtitle}>
              ${totalDiscount} added to your total savings! Check your home page.
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
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  copyButton: {
    padding: 8,
  },
  codeDisplay: {
    backgroundColor: '#DB8633',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  codeText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
  },
  codeInstructions: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Highlight Section
  highlightSection: {
    backgroundColor: '#FFF7ED',
    borderRadius: 20,
    padding: 28,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FED7AA',
    zIndex: 2,
  },
  highlightIcon: {
    backgroundColor: '#fff',
    borderRadius: 50,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  highlightTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 12,
  },
  highlightDiscount: {
    fontSize: 28,
    fontWeight: '900',
    color: '#DB8633',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },
  highlightSubtext: {
    fontSize: 16,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '500',
  },

  // Points Section
  pointsSection: {
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
  pointsHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  pointsIconContainer: {
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
  },
  pointsIcon: {
    width: 40,
    height: 40,
  },
  pointsText: {
    alignItems: 'center',
  },
  pointsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
    textAlign: 'center',
  },
  pointsSubtitle: {
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
  pointsButtonRow: {
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
  earnPointsButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    flex: 2,
  },
  earnPointsButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  earnPointsButtonText: {
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
