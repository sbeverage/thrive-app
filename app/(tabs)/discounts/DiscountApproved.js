import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function DiscountApproved() {
  const router = useRouter();
  const [totalBill, setTotalBill] = useState('');
  const [totalDiscount, setTotalDiscount] = useState('');
  const [showModal, setShowModal] = useState(false);

  const handleGetPoints = () => {
    setShowModal(true);
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
      {/* Top Navigation & Gradient Header */}
      <LinearGradient
        colors={["#2C3E50", "#4CA1AF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientHeader}
      >
        <View style={styles.headerWrapper}>
          <TouchableOpacity onPress={() => router.back()}>
            <AntDesign name="arrowleft" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: '#fff' }]}>Discount Details</Text>
        </View>
        {/* Business Info */}
        <Image source={require('../../../assets/logos/starbucks.png')} style={styles.logo} />
        <Text style={[styles.business, { color: '#fff' }]}>Starbucks coffee shop</Text>
        <Text style={[styles.discountText, { color: '#E5E8EA' }]}>Free appetizer | up to 4x per month</Text>
        <TouchableOpacity>
          <Text style={[styles.readTerms, { color: '#fff', textDecorationLine: 'underline' }]}>Read Discount Terms</Text>
        </TouchableOpacity>
        <Text style={[styles.approvedBy, { color: '#fff', marginBottom: 0 }]}><Text style={{ fontWeight: 'bold' }}>Approved By:</Text> Carlos Montoya, Owner</Text>
      </LinearGradient>

      {/* Discount Code - Centered, Large, Bold */}
      <View style={styles.codeBox}>
        <Text style={styles.codeText}>DEALFREE</Text>
      </View>
      <Text style={styles.showCodeText}>Show this code at checkout</Text>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 24, width: '100%' }} />

      {/* Points Section */}
      <View style={styles.pointsCard}>
        <Text style={styles.pointsCardTitle}>Want extra points?</Text>
        <Text style={styles.pointsCardSub}>Enter your bill and savings below!</Text>
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Total Bill</Text>
          <TextInput
            placeholder="$0.00"
            style={styles.input}
            keyboardType="numeric"
            value={totalBill}
            onChangeText={setTotalBill}
            placeholderTextColor="#A0B4C8"
          />
          <Text style={styles.inputLabel}>Total Savings</Text>
          <TextInput
            placeholder="$0.00"
            style={styles.input}
            keyboardType="numeric"
            value={totalDiscount}
            onChangeText={setTotalDiscount}
            placeholderTextColor="#A0B4C8"
          />
        </View>
      </View>

      {/* Spacer for button */}
      <View style={{ height: 32 }} />

      {/* Button Area (now scrolls with content, but always visible at bottom) */}
      <View style={styles.stickyButtonArea}>
        <TouchableOpacity style={styles.getPointsButton} onPress={handleGetPoints}>
          <Text style={styles.getPointsText}>Get Points</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.noThanksButton} onPress={handleClose}>
          <Text style={styles.noThanksText}>No Thanks</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

    {/* Modal Popup */}
    <Modal visible={showModal} transparent animationType="fade">
      <View style={styles.modalBackground}>
        <View style={styles.modalContent}>
          <Image source={require('../../../assets/images/piggy-confetti.png')} style={{ width: 250, height: 250, resizeMode: 'contain' }} />
          <Text style={styles.modalTitle}>Cha-ching!</Text>
          <Text style={styles.modalMessage}><Text style={{ color: '#DB8633', fontWeight: 'bold' }}>Extra +25 Points </Text>Just Landed in Your Piggy Bank</Text>
          <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleClose}>
            <Text style={styles.modalButtonPrimaryText}>Wow, Thanks</Text>
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
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 10,
    color: '#324E58',
  },
  scrollContainer: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#324E58',
    marginTop: 10,
  },
  subtitle: {
    backgroundColor: '#FFF5CC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginVertical: 12,
    textAlign: 'center',
    color: '#7F5F00',
  },
  logo: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    marginVertical: 16,
  },
  business: {
    fontSize: 18,
    color: '#324E58',
    marginBottom: 12,
  },
  codeBox: {
    backgroundColor: '#DB8633',
    paddingVertical: 10,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginBottom: 12,
  },
  codeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  discountText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  readTerms: {
    color: '#80A7A7',
    textDecorationLine: 'underline',
    marginBottom: 16,
  },
  approvedBy: {
    fontSize: 14,
    color: '#333',
    marginBottom: 16,
  },
  piggy: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    marginBottom: 20,
  },
  pointsInfo: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#324E58',
  },
  input: {
    width: '100%',
    backgroundColor: '#F7F7FC',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 14,
  },
  getPointsButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  getPointsText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  noThanksButton: {
    borderColor: '#ccc',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  noThanksText: {
    color: '#888',
    fontSize: 16,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    width: '100%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#324E58',
    marginVertical: 10,
  },
  modalMessage: {
    fontSize: 16,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtonPrimary: {
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  modalButtonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pointsCard: {
    backgroundColor: '#F7F7FC',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 0,
  },
  pointsCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 2,
    textAlign: 'center',
  },
  pointsCardSub: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 2,
    marginLeft: 2,
  },
  stickyButtonArea: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: '#fff',
  },
  gradientHeader: {
    paddingBottom: 24,
    paddingTop: 44,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    marginBottom: 0,
  },
  inputSection: {
    width: '100%',
    marginTop: 16,
    marginBottom: 0,
  },
});
