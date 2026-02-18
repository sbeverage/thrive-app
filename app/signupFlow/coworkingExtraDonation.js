import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Dimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../context/UserContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CoworkingExtraDonation() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { saveUserData } = useUser();

  const sponsorAmount = parseFloat(params.sponsorAmount || '15');
  const [extraAmount, setExtraAmount] = useState(5);

  const totalMonthlyDonation = sponsorAmount + extraAmount;

  const handleContinue = async () => {
    await saveUserData({
      coworking: true,
      sponsorAmount: sponsorAmount,
      extraDonationAmount: extraAmount,
      totalMonthlyDonation: totalMonthlyDonation,
      monthlyDonation: totalMonthlyDonation,
      externalBilled: true,
      inviteType: 'coworking'
    }, true);

    router.push({
      pathname: '/signupFlow/stripeIntegration',
      params: {
        amount: extraAmount.toString(),
        sponsorAmount: sponsorAmount.toString(),
        totalMonthlyDonation: totalMonthlyDonation.toString(),
        isCoworkingExtra: 'true'
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
            Coworking covers ${sponsorAmount.toFixed(0)}. You can add $5+ more.
          </Text>

          <View style={styles.amountCard}>
            <Text style={styles.amountText}>${extraAmount.toFixed(0)}</Text>
            <Text style={styles.amountLabel}>extra per month</Text>
          </View>

          <Slider
            style={styles.slider}
            minimumValue={5}
            maximumValue={250}
            step={1}
            value={extraAmount}
            onValueChange={setExtraAmount}
            minimumTrackTintColor="#4CA1AF"
            maximumTrackTintColor="#e0e0e0"
            thumbTintColor="#DB8633"
          />

          <Text style={styles.totalText}>
            Total monthly impact: ${totalMonthlyDonation.toFixed(0)}
          </Text>

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
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
    alignItems: 'center',
    width: SCREEN_WIDTH * 0.6
  },
  amountText: { fontSize: 28, fontWeight: '700', color: '#324E58' },
  amountLabel: { fontSize: 14, color: '#8E9BAE' },
  slider: { width: '100%', height: 40, marginVertical: 12 },
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

