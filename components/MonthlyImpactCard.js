// app/components/MonthlyImpactCard.js
import React from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';

export default function MonthlyImpactCard({ monthlyDonation = 15, monthlySavings = 0 }) {
  // Dynamic flower and coin images
  const flowerImage = require('../assets/images/piggy-with-flowers.png');
  const plainPiggy = require('../assets/images/bolt-piggy.png');
  const coinPiggy = require('../assets/images/piggy-with-coin.png');

  // Coin Shine Logic
  const coinImage = monthlySavings > 0 ? coinPiggy : plainPiggy;
  const coinTintColor = monthlySavings > 0 ? null : 'gray';

  // Animations (simple fade in)
  const fadeAnim = new Animated.Value(0);

  Animated.timing(fadeAnim, {
    toValue: 1,
    duration: 1500,
    useNativeDriver: true,
  }).start();

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      <View style={styles.topRow}>
        <Image source={flowerImage} style={styles.icon} resizeMode="contain" />
        <View style={styles.centerInfo}>
          <Text style={styles.donationText}>${monthlyDonation} Monthly Donation</Text>
        </View>
        <Image source={coinImage} style={[styles.icon, { tintColor: coinTintColor }]} resizeMode="contain" />
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.causeText}>Supporting: St. Jude</Text>
        <Text style={styles.savingsText}>
          {monthlySavings > 0 ? `$${monthlySavings} saved this month! 🎉` : `No savings yet...`}
        </Text>
        {monthlySavings > 0 && (
          <Text style={styles.firstCoin}>✨ First Coin Earned! ✨</Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    margin: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  centerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  icon: {
    width: 60,
    height: 60,
  },
  donationText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#324E58',
  },
  bottomRow: {
    marginTop: 15,
    alignItems: 'center',
  },
  causeText: {
    fontSize: 16,
    color: '#324E58',
    marginBottom: 5,
  },
  savingsText: {
    fontSize: 16,
    color: '#DB8633',
  },
  firstCoin: {
    fontSize: 14,
    color: '#FFC107',
    marginTop: 8,
  },
});
