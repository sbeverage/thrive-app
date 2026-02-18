import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ProfileCompleteModal from '../../components/ProfileCompleteModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../context/UserContext';
import { useBeneficiary } from '../context/BeneficiaryContext';

export default function CoworkingDonationPrompt() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { saveUserData } = useUser();
  const { selectedBeneficiary } = useBeneficiary();
  const [showModal, setShowModal] = useState(false);

  const sponsorAmount = parseFloat(params.sponsorAmount || '15');
  const charityName = selectedBeneficiary?.name || 'your charity';

  const completeWithoutExtra = async () => {
    await saveUserData({
      coworking: true,
      sponsorAmount: sponsorAmount,
      extraDonationAmount: 0,
      totalMonthlyDonation: sponsorAmount,
      monthlyDonation: sponsorAmount,
      externalBilled: true,
      inviteType: 'coworking'
    }, true);
    setShowModal(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Image source={require('../../assets/images/bolt-piggy.png')} style={styles.piggy} />
          <Text style={styles.title}>Coworking Donation</Text>
          <Text style={styles.subtitle}>
            THRIVE Coworking contributes ${sponsorAmount.toFixed(0)}/month to {charityName}.
          </Text>
          <Text style={styles.question}>Would you like to give more?</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={completeWithoutExtra}>
              <Text style={styles.secondaryButtonText}>No thanks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push({
                pathname: '/signupFlow/coworkingExtraDonation',
                params: { sponsorAmount: sponsorAmount.toString() }
              })}
            >
              <Text style={styles.primaryButtonText}>Yes, add more</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <ProfileCompleteModal
        visible={showModal}
        onClose={async () => {
          setShowModal(false);
          try {
            await AsyncStorage.removeItem('@thrive_walkthrough_completed');
            await AsyncStorage.removeItem('@thrive_walkthrough_current_step');
          } catch (error) {
            console.error('Error resetting tutorial:', error);
          }
          router.push('/(tabs)/home');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 240, zIndex: 0, overflow: 'hidden' },
  gradientBg: { width: '100%', height: '100%', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  container: {
    flexGrow: 1,
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center'
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    alignItems: 'center'
  },
  piggy: { width: 90, height: 90, resizeMode: 'contain', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#324E58', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#4CA1AF', textAlign: 'center', marginBottom: 16 },
  question: { fontSize: 16, color: '#324E58', textAlign: 'center', marginBottom: 20 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DB8633',
    alignItems: 'center'
  },
  secondaryButtonText: { color: '#DB8633', fontWeight: '600' },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#DB8633',
    alignItems: 'center'
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' }
});

