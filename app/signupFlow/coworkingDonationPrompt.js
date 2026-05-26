import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ProfileCompleteModal from '../../components/ProfileCompleteModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../context/UserContext';
import { useBeneficiary } from '../context/BeneficiaryContext';
import API from '../lib/api';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CoworkingDonationPrompt() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { saveUserData } = useUser();
  const { selectedBeneficiary } = useBeneficiary();
  const [showModal, setShowModal] = useState(false);

  const sponsorAmount = parseFloat(params.sponsorAmount || '15');
  const charityName = selectedBeneficiary?.name || 'your chosen cause';

  const coworkingPromptParamsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    persistSignupFlowCheckpointFromParams(
      '/signupFlow/coworkingDonationPrompt',
      params,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coworkingPromptParamsKey]);

  const completeWithoutExtra = async () => {
    await saveUserData({
      coworking: true,
      sponsorAmount: sponsorAmount,
      extraDonationAmount: 0,
      totalMonthlyDonation: sponsorAmount,
      monthlyDonation: sponsorAmount,
      externalBilled: true,
      inviteType: 'coworking',
    }, true);

    if (selectedBeneficiary?.id) {
      try {
        await API.saveProfile({ beneficiary: selectedBeneficiary.id });
      } catch (err) {
        console.warn('⚠️ Could not save beneficiary to profile:', err.message);
      }
    }

    setShowModal(true);
  };

  const goToExtraDonation = () => {
    router.push({
      pathname: '/signupFlow/coworkingExtraDonation',
      params: {
        sponsorAmount: sponsorAmount.toString(),
        charityName,
      },
    });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.gradientBgWrap} pointerEvents="none">
        <LinearGradient
          colors={['#21555b', '#2d7a82']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image
            source={require('../../assets/images/bolt-piggy.png')}
            style={styles.piggy}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>
            Your THRIVE Membership Includes a Monthly Donation
          </Text>

          <View style={styles.includedBox}>
            <Text style={styles.includedLabel}>Included with your membership</Text>
            <Text style={styles.includedAmount}>
              ${sponsorAmount.toFixed(0)}
              <Text style={styles.includedPer}>/month</Text>
            </Text>
            <Text style={styles.includedCause}>to {charityName}</Text>
          </View>

          <Text style={styles.body}>
            This monthly gift is already set up through your THRIVE membership.
          </Text>

          <Text style={styles.bodySecondary}>
            If you would like, you can add an optional extra monthly gift.
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={completeWithoutExtra}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>
                Continue (${sponsorAmount.toFixed(0)}/mo only)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={goToExtraDonation}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Give Extra</Text>
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
            await AsyncStorage.removeItem('signupFlowPending');
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
  screen: { flex: 1, backgroundColor: '#F5F5F5' },
  gradientBgWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.42,
    zIndex: 0,
    overflow: 'hidden',
  },
  gradientBg: {
    width: '100%',
    height: '100%',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  scroll: {
    flexGrow: 1,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 20,
    zIndex: 1,
  },
  piggy: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  heroEyebrow: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E8ECEF',
    shadowColor: '#21555b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    zIndex: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 26,
  },
  includedBox: {
    backgroundColor: '#E8F4F5',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#C5E4E7',
  },
  includedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#21555b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  includedAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#21555b',
  },
  includedPer: {
    fontSize: 18,
    fontWeight: '600',
    color: '#21555b',
  },
  includedCause: {
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
    marginTop: 6,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
  bodySecondary: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonRow: { gap: 12, marginHorizontal: 16 },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#DB8633',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#DB8633',
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#DB8633',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
