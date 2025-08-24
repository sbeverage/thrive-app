import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Ionicons } from '@expo/vector-icons';

export default function DiscountApproved() {
  const router = useRouter();
  const [totalBill, setTotalBill] = useState('');
  const [totalDiscount, setTotalDiscount] = useState('');
  const [showModal, setShowModal] = useState(false);

  const handleGetPoints = () => {
    if (totalBill && totalDiscount) {
      setShowModal(true);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    router.push('/(tabs)');
  };

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={[styles.scrollContainer, { paddingBottom: 120 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Top Navigation */}
      <View style={styles.headerWrapper}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Discount Redeemed!</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Hero Section with Company Info */}
      <View style={styles.heroSection}>
        <View style={styles.heroContent}>
          <Image source={require('../../../assets/logos/starbucks.png')} style={styles.heroLogo} />
          <View style={styles.heroText}>
            <Text style={styles.heroCompany}>Starbucks Coffee</Text>
            <Text style={styles.heroDiscount}>Free Appetizer</Text>
            <Text style={styles.heroApprovedBy}>Approved By: Carlos Montoya, Owner</Text>
            <View style={styles.heroBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.heroBadgeText}>Approved</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Discount Code - Floating Card */}
      <View style={styles.codeFloatingCard}>
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

      {/* Terms Link */}
      <TouchableOpacity style={styles.termsLink}>
        <Text style={styles.termsText}>Read Discount Terms & Conditions</Text>
        <AntDesign name="right" size={14} color="#8E9BAE" />
      </TouchableOpacity>

      {/* Spacer */}
      <View style={{ height: 32 }} />
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
            Your savings will now appear on your home page
          </Text>
          <TouchableOpacity style={styles.modalButton} onPress={handleClose}>
            <Text style={styles.modalButtonText}>Awesome!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
  },
  scrollContainer: {
    padding: 20,
    backgroundColor: '#fff',
  },
  
  // Hero Section
  heroSection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#DB8633',
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroLogo: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
    marginRight: 20,
  },
  heroText: {
    flex: 1,
  },
  heroCompany: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 6,
  },
  heroDiscount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#DB8633',
    marginBottom: 8,
  },
  heroApprovedBy: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 4,
  },

  // Floating Code Card
  codeFloatingCard: {
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
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  pointsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  pointsIconContainer: {
    backgroundColor: '#fff',
    borderRadius: 50,
    padding: 12,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pointsIcon: {
    width: 32,
    height: 32,
  },
  pointsText: {
    flex: 1,
  },
  pointsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  pointsSubtitle: {
    fontSize: 14,
    color: '#64748B',
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
    backgroundColor: '#fff',
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
  earnPointsButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
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
  },
  termsText: {
    fontSize: 14,
    color: '#64748B',
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
    color: '#64748B',
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
