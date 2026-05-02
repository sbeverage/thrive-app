import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, StyleSheet, TouchableOpacity, ScrollView, Image, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../context/UserContext';
import { useBeneficiary } from '../context/BeneficiaryContext';
import { resolveCheckoutBeneficiaryId } from '../utils/resolveCheckoutBeneficiaryId';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CoworkingExtraDonation() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { saveUserData } = useUser();
  const { selectedBeneficiary } = useBeneficiary();

  const sponsorAmount = parseFloat(params.sponsorAmount || '15');
  const [extraAmountText, setExtraAmountText] = useState('');
  const extraAmount = parseInt(extraAmountText, 10) || 0;

  const totalMonthlyDonation = sponsorAmount + extraAmount;

  const coworkingExtraParamsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    persistSignupFlowCheckpointFromParams(
      '/signupFlow/coworkingExtraDonation',
      params,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coworkingExtraParamsKey]);

  const handleContinue = async () => {
    if (!extraAmount || extraAmount < 1) {
      Alert.alert('Amount Required', 'Please enter a whole dollar amount to give.');
      return;
    }

    await saveUserData({
      coworking: true,
      sponsorAmount: sponsorAmount,
      extraDonationAmount: extraAmount,
      totalMonthlyDonation: totalMonthlyDonation,
      monthlyDonation: totalMonthlyDonation,
      externalBilled: true,
      inviteType: 'coworking'
    }, true);

    const beneficiaryId = await resolveCheckoutBeneficiaryId({
      params,
      selectedBeneficiary,
    });

    router.push({
      pathname: '/signupFlow/stripeIntegration',
      params: {
        amount: extraAmount.toString(),
        sponsorAmount: sponsorAmount.toString(),
        totalMonthlyDonation: totalMonthlyDonation.toString(),
        isCoworkingExtra: 'true',
        ...(beneficiaryId ? { beneficiaryId } : {}),
      }
    });
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
          <Image source={require('../../assets/images/piggy-coin.png')} style={styles.piggy} />
          <Text style={styles.title}>Add Extra Support</Text>
          <Text style={styles.subtitle}>
            Coworking covers ${sponsorAmount.toFixed(0)}/month. How much more would you like to add?
          </Text>

          <View style={styles.amountCard}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={extraAmountText}
              onChangeText={(t) => setExtraAmountText(t.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              maxLength={5}
            />
            <Text style={styles.amountLabel}>per month</Text>
          </View>

          {extraAmount > 0 && (
            <Text style={styles.totalText}>
              Total monthly impact: ${totalMonthlyDonation.toFixed(0)}
            </Text>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
            <Text style={styles.primaryButtonText}>Continue to Payment</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  amountCard: {
    backgroundColor: '#F5F5FA',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 16,
    alignItems: 'center',
    width: SCREEN_WIDTH * 0.6
  },
  dollarSign: { fontSize: 28, fontWeight: '700', color: '#324E58', position: 'absolute', left: 24, top: 16 },
  amountInput: {
    fontSize: 36,
    fontWeight: '700',
    color: '#324E58',
    textAlign: 'center',
    minWidth: 80,
    paddingHorizontal: 8,
    paddingTop: 0,
  },
  amountLabel: { fontSize: 14, color: '#8E9BAE', marginTop: 4 },
  totalText: { fontSize: 16, color: '#324E58', marginBottom: 20 },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#DB8633',
    alignItems: 'center'
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 }
});

