import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function MonthlyImpactCard({
  monthlyDonation = 15,
  monthlySavings = 7.5,
  nextDonationDate = null,
  coworking = false,
  sponsorAmount = 0,
  extraDonationAmount = 0,
}) {
  // Debug the values received by the card
  console.log('📊 MonthlyImpactCard received:', { monthlyDonation, monthlySavings, nextDonationDate });
  
  // Calculate next billing date (1 month from now)
  const getNextBillingDate = () => {
    if (nextDonationDate) return nextDonationDate;
    
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    return nextMonth.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  const flowerSeed = require('../assets/growth/seed.png');
  const piggyWithCoins = require('../assets/images/piggy-money.png');

  return (
    <View style={styles.card}>
      {/* Top Row */}
      <View style={styles.headerRow}>
        <View style={styles.dateRow}>
          <Feather name="calendar" size={16} color="#324E58" style={{ marginRight: 6 }} />
          <Text style={styles.dateText}>Next Billing: {getNextBillingDate()}</Text>
        </View>
      </View>

      {/* Main Content Row */}
      <View style={styles.impactRow}>
        {/* Monthly Donation */}
        <View style={styles.impactBox}>
          <Image source={flowerSeed} style={styles.icon} resizeMode="contain" />
          <Text style={styles.amount}>${parseFloat(monthlyDonation || 0).toFixed(2)}</Text>
          <Text style={styles.caption}>Monthly Donation</Text>
          {coworking && (sponsorAmount > 0 || extraDonationAmount > 0) && (
            <Text style={styles.subcaption}>
              Coworking ${parseFloat(sponsorAmount || 0).toFixed(0)} + You ${parseFloat(extraDonationAmount || 0).toFixed(0)}
            </Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.verticalDivider} />

        {/* Savings */}
        <View style={styles.impactBox}>
          <Image source={piggyWithCoins} style={styles.iconPiggy} resizeMode="contain" />
          <Text style={styles.amount}>${parseFloat(monthlySavings || 0).toFixed(2)}</Text>
          <Text style={styles.caption}>Savings</Text>
        </View>
      </View>
    </View>
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
  subcaption: {
    fontSize: 11,
    color: '#9AA9B6',
    marginTop: 4,
  },
});
