import React from 'react';
import { View, Text, Image, StyleSheet, Animated, Dimensions, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function MonthlyImpactCard({ monthlyDonation = 15, monthlySavings = 7.5, nextDonationDate = 'Sep 17, 2025' }) {
  const flowerSeed = require('../assets/growth/seed.png');
  const piggyWithCoins = require('../assets/images/piggy-money.png');
  const router = useRouter();

  const fadeAnim = new Animated.Value(0);
  Animated.timing(fadeAnim, {
    toValue: 1,
    duration: 1500,
    useNativeDriver: true,
  }).start();

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      {/* Top row */}
      <View style={styles.headerRow}>
        <View style={styles.dateRow}>
          <Feather name="calendar" size={16} color="#324E58" style={{ marginRight: 6 }} />
          <Text style={styles.dateText}>{nextDonationDate}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/menu/beneficiaryPreferences')}>
          <Feather name="edit-3" size={16} color="#7A8D9C" />
        </TouchableOpacity>
      </View>

      {/* Main Content Row */}
      <View style={styles.impactRow}>
        {/* Donation */}
        <View style={styles.impactBox}>
          <Image source={flowerSeed} style={styles.icon} resizeMode="contain" />
          <Text style={styles.amount}>${monthlyDonation}</Text>
          <Text style={styles.caption}>Monthly Donation</Text>
        </View>

        {/* Divider */}
        <View style={styles.verticalDivider} />

        {/* Savings */}
        <View style={styles.impactBox}>
          <Image source={piggyWithCoins} style={styles.iconPiggy} resizeMode="contain" />
          <Text style={styles.amount}>${monthlySavings}</Text>
          <Text style={styles.caption}>Savings</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'visible',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 14,
    color: '#324E58',
  },
  impactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  impactBox: {
    flex: 1,
    alignItems: 'center',
  },
  verticalDivider: {
    width: 1,
    height: 150,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 10,
    alignSelf: 'center',
    marginTop: -10,
  },
  icon: {
    width: 100,
    height: 100,
    marginBottom: 10,
  },
  iconPiggy: {
    width: 200,
    height: 200,
    marginBottom: 10,
    marginTop: -95,
    zIndex: 10,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
  },
  caption: {
    fontSize: 12,
    color: '#7A8D9C',
    marginTop: 2,
  },
});
