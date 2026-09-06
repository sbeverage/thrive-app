// Final step of the Team signup flow — the comped counterpart to
// coworkingDonationPrompt.
//
// A team account is internal: nobody is billed, so there is no amount to
// confirm and no Stripe step. All this screen does is record the membership,
// attach the cause the donor just picked, and hand them the app. The card on
// file is offered as an option rather than a requirement, because a team
// member who wants to make a real one-time gift needs one — a monthly
// donation is never created either way.

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
import { Feather } from '@expo/vector-icons';
import ProfileCompleteModal from '../../components/ProfileCompleteModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../context/UserContext';
import { useBeneficiary } from '../context/BeneficiaryContext';
import API from '../lib/api';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function TeamAccountReady() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { saveUserData } = useUser();
  const { selectedBeneficiary } = useBeneficiary();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const charityName = selectedBeneficiary?.name || 'your chosen cause';

  const teamParamsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    persistSignupFlowCheckpointFromParams('/signupFlow/teamAccountReady', params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamParamsKey]);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveUserData(
        {
          inviteType: 'team',
          coworking: false,
          sponsorAmount: 0,
          extraDonationAmount: 0,
          // Zero on purpose. A team account is not a $0 subscription — it has
          // no subscription at all, and the Home card reads these to decide
          // whether to show a monthly figure.
          totalMonthlyDonation: 0,
          monthlyDonation: 0,
          externalBilled: true,
        },
        true,
      );

      if (selectedBeneficiary?.id) {
        try {
          await API.saveProfile({ beneficiary: selectedBeneficiary.id });
        } catch (err) {
          console.warn('⚠️ Could not save beneficiary to profile:', err.message);
        }
      }

      setShowModal(true);
    } finally {
      setSaving(false);
    }
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
          <Text style={styles.title}>Your Team Account Is Ready</Text>

          <View style={styles.badgeBox}>
            <Text style={styles.badgeLabel}>THRIVE Team</Text>
            <Text style={styles.badgeAmount}>No monthly charge</Text>
            <Text style={styles.badgeCause}>supporting {charityName}</Text>
          </View>

          <View style={styles.bullets}>
            <TeamBullet text="Full access to every vendor discount" />
            <TeamBullet text="No card required and nothing billed" />
            <TeamBullet text="Add a card any time to make a one-time gift" />
          </View>

          <Text style={styles.body}>
            Your cause selection is here so you can see what donors see — it
            isn't counted in THRIVE's donation totals.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, saving && { opacity: 0.7 }]}
            onPress={finish}
            activeOpacity={0.85}
            disabled={saving}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? 'Setting up…' : 'Start exploring'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ProfileCompleteModal
        visible={showModal}
        onClose={async () => {
          setShowModal(false);
          try {
            await AsyncStorage.removeItem('@thrive_walkthrough_completed');
            await AsyncStorage.removeItem('@thrive_walkthrough_current_step');
            // Clearing this is what ends the signup flow — app/index.js resumes
            // an incomplete signup while it is set.
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

function TeamBullet({ text }) {
  return (
    <View style={styles.bulletRow}>
      <Feather name="check" size={15} color="#21555b" />
      <Text style={styles.bulletText}>{text}</Text>
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
  hero: { alignItems: 'center', marginBottom: 20, zIndex: 1 },
  piggy: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    marginBottom: 8,
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
  badgeBox: {
    backgroundColor: '#E8F4F5',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#C5E4E7',
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#21555b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  badgeAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#21555b',
  },
  badgeCause: {
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
    marginTop: 6,
    textAlign: 'center',
  },
  bullets: { gap: 10, marginBottom: 18 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#324E58',
    lineHeight: 20,
  },
  body: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#DB8633',
    alignItems: 'center',
    marginHorizontal: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
