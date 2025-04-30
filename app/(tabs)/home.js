import React from 'react';
import { useFonts, Figtree_400Regular, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Image, TouchableOpacity } from 'react-native';
import MonthlyImpactCard from '../../components/MonthlyImpactCard';

export default function MainHome() {
  const monthlyDonation = 15;
  const monthlySavings = 0;

  let [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Navigation */}
      <View style={styles.topNavContainer}>
        <TouchableOpacity style={styles.profileContainer}>
          <Image source={{ uri: 'https://via.placeholder.com/40' }} style={styles.profilePic} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image source={require('../../assets/images/thrive-logo.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <View style={styles.rightIcons}>
          <TouchableOpacity style={styles.iconButton}>
            <Image source={require('../../assets/icons/notification.png')} style={{ width: 26, height: 26 }} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Image source={require('../../assets/icons/menu.png')} style={{ width: 28, height: 28 }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Greeting Row */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greetingText}>Hey John! 👋</Text>
            <TouchableOpacity>
              <Text style={styles.locationText}>Home — Alpharetta, GA, USA</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.coinsContainer}>
            <Image source={require('../../assets/icons/coin.png')} style={{ width: 18, height: 18, marginRight: 6 }} />
            <Text style={styles.coinsText}>50/150k</Text>
          </View>
        </View>

        {/* My Giving Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Giving</Text>
          <TouchableOpacity>
            <Text style={styles.viewDetailsText}>View details</Text>
          </TouchableOpacity>
        </View>

        <MonthlyImpactCard monthlyDonation={monthlyDonation} monthlySavings={monthlySavings} />

        {/* My Beneficiary Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Beneficiary</Text>
        </View>

        <View style={styles.beneficiaryCard}>
          <Image source={require('../../assets/images/child-cancer.jpg')} style={styles.beneficiaryImage} />
          <View style={styles.beneficiaryOverlay}>
            <Text style={styles.beneficiaryName}>St. Jude</Text>
            <Text style={styles.beneficiaryDesc}>Helping children fight cancer and other life-threatening diseases.</Text>
          </View>
        </View>

        {/* Discounts Near You Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Discounts Near You</Text>
          <TouchableOpacity>
            <Text style={styles.viewDetailsText}>View All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.discountScroll}>
          <View style={styles.discountCardWrapper}>
            <View style={styles.discountCard}>
              <Image source={require('../../assets/images/valor-logo.png')} style={styles.discountLogo} resizeMode="contain" />
              <Text style={styles.discountVendor}>Valor</Text>
              <Text style={styles.discountInfo}>3 discounts available</Text>
            </View>
          </View>

          <View style={styles.discountCardWrapper}>
            <View style={styles.discountCard}>
              <Image source={require('../../assets/images/ceviche-logo.png')} style={styles.discountLogo} resizeMode="contain" />
              <Text style={styles.discountVendor}>Ceviche</Text>
              <Text style={styles.discountInfo}>2 discounts available</Text>
            </View>
          </View>
        </ScrollView>

        {/* Rank Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rank</Text>
          <TouchableOpacity>
            <Text style={styles.viewDetailsText}>View Leaderboard</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>Coming Soon</Text>
        </View>

        {/* Invite Section */}
        <View style={styles.inviteContainer}>
          <Text style={styles.inviteTitle}>Help Spread The Word To Make A Greater Impact!</Text>
          <TouchableOpacity style={styles.inviteButton}>
            <Text style={styles.inviteButtonText}>Invite A Friend</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingBottom: 50,
  },
  topNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  profileContainer: {
    flex: 1,
  },
  profilePic: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  logoContainer: {
    flex: 2,
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 40,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  iconButton: {
    marginLeft: 15,
  },
  greetingRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: 'Figtree_700Bold',
    color: '#324E58',
  },
  locationText: {
    fontSize: 16,
    color: '#7A8D9C',
    marginTop: 4,
  },
  coinsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F6F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  coinsText: {
    fontSize: 14,
    color: '#324E58',
    fontWeight: 'Figtree_700Bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'Figtree_700Bold',
    color: '#324E58',
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: 'Figtree_700Bold',
    color: '#DB8633',
  },
  beneficiaryCard: {
    backgroundColor: '#F4F6F8',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    marginHorizontal: 20,
  },
  beneficiaryImage: {
    width: '100%',
    height: 200,
  },
  beneficiaryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 10,
  },
  beneficiaryName: {
    fontSize: 18,
    fontWeight: 'Figtree_700Bold',
    color: '#324E58',
  },
  beneficiaryDesc: {
    fontSize: 14,
    color: '#7A8D9C',
    marginTop: 5,
  },
  discountScroll: {
    paddingLeft: 20,
    marginBottom: 20,
  },
  discountCardWrapper: {
    marginRight: 15,
  },
  discountCard: {
    backgroundColor: '#ffffff',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 20,
    width: 170,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  discountLogo: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  discountVendor: {
    fontSize: 16,
    fontWeight: 'Figtree_700Bold',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 4,
  },
  discountInfo: {
    fontSize: 13,
    color: '#DB8633',
    textAlign: 'center',
  },
  placeholderBox: {
    backgroundColor: '#F4F6F8',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
    marginHorizontal: 20,
  },
  placeholderText: {
    fontSize: 16,
    color: '#A0AAB7',
  },
  inviteContainer: {
    marginTop: 30,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  inviteTitle: {
    fontSize: 18,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 20,
  },
  inviteButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  inviteButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'Figtree_700Bold',
  },
});