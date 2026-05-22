import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../context/UserContext';
import { useBeneficiary } from '../context/BeneficiaryContext';
import { resolveCheckoutBeneficiaryId } from '../utils/resolveCheckoutBeneficiaryId';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CoworkingExtraDonation() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { saveUserData } = useUser();
  const { selectedBeneficiary } = useBeneficiary();

  const sponsorAmount = parseFloat(params.sponsorAmount || '15');
  const charityName =
    params.charityName || selectedBeneficiary?.name || 'your chosen cause';
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
      Alert.alert(
        'Amount required',
        'Please enter a whole dollar amount for your optional extra gift.',
      );
      return;
    }

    await saveUserData(
      {
        coworking: true,
        sponsorAmount: sponsorAmount,
        extraDonationAmount: extraAmount,
        totalMonthlyDonation: totalMonthlyDonation,
        monthlyDonation: totalMonthlyDonation,
        externalBilled: true,
        inviteType: 'coworking',
      },
      true,
    );

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
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Image
            source={require('../../assets/icons/arrow-left.png')}
            style={styles.backIcon}
          />
        </TouchableOpacity>

        <View style={styles.hero}>
          <Image
            source={require('../../assets/images/piggy-coin.png')}
            style={styles.piggy}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Optional extra monthly gift</Text>
          <Text style={styles.body}>
            Your coworking membership already covers ${sponsorAmount.toFixed(0)}/month
            to {charityName}. Enter any additional amount you would like to give from
            your own payment method.
          </Text>

          <View style={styles.breakdownBox}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>From coworking</Text>
              <Text style={styles.breakdownValue}>${sponsorAmount.toFixed(0)}/mo</Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Your extra gift</Text>
              <Text style={[styles.breakdownValue, styles.breakdownValueAccent]}>
                ${extraAmount > 0 ? extraAmount : '—'}
                {extraAmount > 0 ? '/mo' : ''}
              </Text>
            </View>
            {extraAmount > 0 && (
              <>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownTotalLabel}>Total monthly impact</Text>
                  <Text style={styles.breakdownTotalValue}>
                    ${totalMonthlyDonation.toFixed(0)}/mo
                  </Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.amountSectionLabel}>Your extra amount</Text>
          <View style={styles.amountCard}>
            <View style={styles.amountRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={extraAmountText}
                onChangeText={(t) => setExtraAmountText(t.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
            <Text style={styles.amountHint}>per month (billed to you)</Text>
          </View>

          <Text style={styles.paymentNote}>
            Payment on the next screen is only for your extra gift—not the amount
            already included with your membership.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, !extraAmount && styles.primaryButtonDisabled]}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Continue to payment</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    height: SCREEN_HEIGHT * 0.38,
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
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    zIndex: 2,
  },
  backIcon: { width: 24, height: 24, tintColor: '#324E58' },
  hero: {
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 1,
  },
  piggy: {
    width: 96,
    height: 96,
    resizeMode: 'contain',
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
    marginBottom: 12,
    lineHeight: 26,
  },
  body: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  breakdownBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#324E58',
  },
  breakdownValueAccent: {
    color: '#DB8633',
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#21555b',
  },
  breakdownTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#21555b',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  amountSectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 10,
    textAlign: 'center',
  },
  amountCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FED7AA',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dollarSign: {
    fontSize: 36,
    fontWeight: '800',
    color: '#324E58',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 40,
    fontWeight: '800',
    color: '#324E58',
    minWidth: 72,
    textAlign: 'center',
    paddingVertical: 0,
  },
  amountHint: {
    fontSize: 14,
    color: '#7A8D9C',
    marginTop: 8,
    fontWeight: '500',
  },
  paymentNote: {
    fontSize: 13,
    color: '#7A8D9C',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#DB8633',
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
