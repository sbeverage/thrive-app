import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function DonationAmount() {
  const router = useRouter();

  const [amount, setAmount] = useState(15);
  const MIN_AMOUNT = 15;
  const MAX_AMOUNT = 500;

  // Predefined donation amounts
  const presetAmounts = [15, 25, 50, 100, 250, 500];

  const handlePresetSelect = (selectedAmount) => {
    setAmount(selectedAmount);
  };

  const handleCustomInput = (text) => {
    const numericValue = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(numericValue)) {
      if (numericValue >= MIN_AMOUNT && numericValue <= MAX_AMOUNT) {
        setAmount(numericValue);
      } else if (numericValue < MIN_AMOUNT) {
        setAmount(MIN_AMOUNT);
      } else if (numericValue > MAX_AMOUNT) {
        setAmount(MAX_AMOUNT);
      }
    }
  };

  const handleSaveAndContinue = () => {
    Alert.alert(
      '🎉 Monthly Donation Set!',
      `You've committed to donating $${amount} monthly. Thank you for your generosity!`,
      [
        {
          text: 'Continue',
          onPress: () => router.replace('/(tabs)/menu'),
        },
      ]
    );
  };

  return (
    <LinearGradient
      colors={['#2C3E50', '#4CA1AF']}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Monthly Donation</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Image
            source={require('../../../assets/images/bolt-piggy.png')}
            style={styles.heroImage}
          />
          <Text style={styles.heroTitle}>Choose Your Impact</Text>
          <Text style={styles.heroSubtitle}>
            Set your monthly donation amount. Every dollar makes a difference!
          </Text>
        </View>

        {/* Current Selection Card */}
        <View style={styles.selectionCard}>
          <Text style={styles.selectionLabel}>Your Monthly Donation</Text>
          <View style={styles.amountDisplay}>
            <Text style={styles.currencySymbol}>$</Text>
            <Text style={styles.amountText}>{amount}</Text>
          </View>
          <Text style={styles.perMonth}>per month</Text>
        </View>

        {/* Preset Amounts */}
        <View style={styles.presetSection}>
          <Text style={styles.sectionTitle}>Quick Select</Text>
          <View style={styles.presetGrid}>
            {presetAmounts.map((presetAmount) => (
              <TouchableOpacity
                key={presetAmount}
                style={[
                  styles.presetButton,
                  amount === presetAmount && styles.presetButtonActive
                ]}
                onPress={() => handlePresetSelect(presetAmount)}
              >
                <Text style={[
                  styles.presetText,
                  amount === presetAmount && styles.presetTextActive
                ]}>
                  ${presetAmount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Custom Amount */}
        <View style={styles.customSection}>
          <Text style={styles.sectionTitle}>Custom Amount</Text>
          <View style={styles.customInputContainer}>
            <Text style={styles.inputPrefix}>$</Text>
            <TextInput
              value={amount.toString()}
              onChangeText={handleCustomInput}
              placeholder="Enter amount"
              placeholderTextColor="#A0A0A0"
              keyboardType="numeric"
              style={styles.customInput}
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
            />
          </View>
          <Text style={styles.inputHint}>
            Minimum: ${MIN_AMOUNT} • Maximum: ${MAX_AMOUNT}
          </Text>
        </View>

        {/* Impact Preview */}
        <View style={styles.impactCard}>
          <Text style={styles.impactTitle}>Your Impact</Text>
          <View style={styles.impactRow}>
            <Text style={styles.impactLabel}>Monthly:</Text>
            <Text style={styles.impactValue}>${amount}</Text>
          </View>
          <View style={styles.impactRow}>
            <Text style={styles.impactLabel}>Yearly:</Text>
            <Text style={styles.impactValue}>${amount * 12}</Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={handleSaveAndContinue} style={styles.continueButton}>
          <Text style={styles.continueButtonText}>Set Monthly Donation</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  backButton: {
    padding: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 40, // Adjust as needed to center the title
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 0, // Adjust to make space for header
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  heroImage: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    marginBottom: 15,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
  },
  selectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  selectionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  amountText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  perMonth: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  presetSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  presetButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginVertical: 5,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  presetButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  presetText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  presetTextActive: {
    color: '#324E58',
  },
  customSection: {
    marginBottom: 20,
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  customInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    paddingVertical: 10,
  },
  inputPrefix: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 5,
  },
  inputHint: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 10,
  },
  impactCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    padding: 20,
    marginTop: 20,
  },
  impactTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  impactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  impactLabel: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.8,
  },
  impactValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  footer: {
    padding: 20,
    paddingBottom: 40, // Add more padding to the bottom
  },
  continueButton: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#324E58',
  },
});
