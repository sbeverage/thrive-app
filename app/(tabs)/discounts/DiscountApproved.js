import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

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
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Top Navigation */}
      <View style={styles.headerWrapper}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Discount Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Discount Approved!</Text>
        <Text style={styles.subtitle}>Show or enter this code to get your discount!</Text>
        <Image source={require('../../../assets/logos/starbucks.png')} style={styles.logo} />
        <Text style={styles.business}>Starbucks coffee shop</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>Code: DEALFREE</Text>
        </View>
        <Text style={styles.discountText}>Free appetizer | up to 4x per month</Text>
        <TouchableOpacity>
          <Text style={styles.readTerms}>Read Discount Terms</Text>
        </TouchableOpacity>
        <Text style={styles.approvedBy}><Text style={{ fontWeight: 'bold' }}>Approved By:</Text> Carlos Montoya, Owner</Text>
        <Image source={require('../../../assets/images/piggy-coin.png')} style={styles.piggy} />
        <Text style={styles.pointsInfo}>Add your saving and total bill amount to get <Text style={{ color: '#DB8633', fontWeight: 'bold' }}>extra +25 points</Text></Text>
        <TextInput
          placeholder="Enter Total Bill"
          style={styles.input}
          keyboardType="numeric"
          value={totalBill}
          onChangeText={setTotalBill}
        />
        <TextInput
          placeholder="Enter Total Discount"
          style={styles.input}
          keyboardType="numeric"
          value={totalDiscount}
          onChangeText={setTotalDiscount}
        />
        <TouchableOpacity style={styles.getPointsButton} onPress={handleGetPoints}>
          <Text style={styles.getPointsText}>Get Points</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.noThanksButton} onPress={handleClose}>
          <Text style={styles.noThanksText}>No Thanks</Text>
        </TouchableOpacity>
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
    </View>
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
});
