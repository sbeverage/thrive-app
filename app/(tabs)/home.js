// file: app/(tabs)/home.js
import React from 'react';
import { useFonts, Figtree_400Regular, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Tabs } from 'expo-router';
import MonthlyImpactCard from '../../components/MonthlyImpactCard';

export default function MainHome() {
  const router = useRouter();
  const monthlyDonation = 15;
  const monthlySavings = 0;

  let [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_700Bold,
  });

  if (!fontsLoaded) return null;

  const vouchers = [
    { id: '1', brandName: 'Starbucks', logo: require('../../assets/logos/starbucks.png'), discounts: 3, category: 'Coffee Shop' },
    { id: '2', brandName: 'Ceviche', logo: require('../../assets/images/ceviche-logo.png'), discounts: 2, category: 'Restaurants' },
    { id: '3', brandName: 'Amazon', logo: require('../../assets/logos/amazon.png'), discounts: 3, category: 'Shopping Store' },
  ];

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient
            colors={['#2C3E50', '#4CA1AF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerWrapper}
          >
            <View style={styles.headerTopRow}>
              <Image source={require('../../assets/logos/thrive-logo-white.png')} style={styles.logo} resizeMode="contain" />
              <View style={styles.rightIcons}>
                <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/menu/notifications')}>
                  <Image source={require('../../assets/icons/notification.png')} style={styles.iconWhite} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/menu')}>
                  <Image source={require('../../assets/icons/menu.png')} style={styles.iconWhite} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.profileRow}>
              <View style={styles.profileLeft}>
                <Image source={require('../../assets/images/profile.jpg')} style={styles.profilePic} />
                <Text style={styles.greetingText}>Hey Stephanie!</Text>
              </View>
              <View style={styles.coinsContainer}>
                <Image source={require('../../assets/icons/coin.png')} style={{ width: 18, height: 18, marginRight: 6 }} />
                <Text style={styles.coinsText}>25</Text>
              </View>
            </View>

            <Text style={styles.affirmationText}>“You're someone’s reason to smile today!”</Text>
            <Text style={styles.locationText}>Home — Alpharetta, GA, USA</Text>
          </LinearGradient>

          <View style={styles.monthlyCardWrapper}>
            <MonthlyImpactCard monthlyDonation={monthlyDonation} monthlySavings={monthlySavings} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Beneficiary</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/beneficiary/beneficiaryDetail')} style={styles.beneficiaryCard}>
            <Image source={require('../../assets/images/child-cancer.jpg')} style={styles.beneficiaryImage} />
            <View style={styles.beneficiaryOverlay}>
              <Text style={styles.beneficiaryName}>St. Jude</Text>
              <Text style={styles.beneficiaryDesc}>Helping children fight cancer and other life-threatening diseases.</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Discounts Near You</Text>
            <TouchableOpacity onPress={() => router.push('/discounts')}>
              <Text style={styles.viewDetailsText}>View All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.discountScroll} contentContainerStyle={styles.discountScrollContent}>
            {vouchers.map((voucher, index) => (
              <View key={voucher.id} style={styles.discountCardWrapper}>
                <TouchableOpacity onPress={() => index === 0 && router.push(`/discounts/${voucher.id}`)}>
                  <View style={styles.cardCream}>
                    <Image source={voucher.logo} style={styles.discountLogo} resizeMode="contain" />
                    <Text style={styles.discountBrand}>{voucher.brandName}</Text>
                    <Text style={styles.discountCategory}>{voucher.category}</Text>
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>{voucher.discounts} discounts</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Rank</Text>
            <TouchableOpacity onPress={() => router.push('/leaderboard')}>
              <Text style={styles.viewDetailsText}>View Leaderboard</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>Coming Soon</Text>
          </View>

          <View style={styles.inviteBannerWrapper}>
            <View style={styles.inviteInnerWrapper}>
              <View style={styles.inviteImageContainer}>
                <Image source={require('../../assets/images/invite-kids.png')} style={styles.inviteBannerImage} />
              </View>
              <View style={styles.inviteTextBlock}>
                <Text style={styles.inviteBannerHeadline}>
                  Together we can do more! – share the love.
                </Text>
                <TouchableOpacity style={styles.inviteBannerButton}>
                  <Text style={styles.inviteBannerButtonText}>Invite A Friend</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <Tabs />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  scrollContent: { paddingBottom: 20 },
  headerWrapper: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 130, height: 40 },
  rightIcons: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { marginLeft: 12 },
  iconWhite: { width: 22, height: 22, resizeMode: 'contain', tintColor: 'white' },
  profileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25 },
  profileLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  profilePic: { width: 50, height: 50, borderRadius: 25 },
  greetingText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginLeft: 10 },
  coinsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F6F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  coinsText: { fontSize: 14, color: '#324E58', fontWeight: '700' },
  affirmationText: { fontSize: 16, color: '#E5E8EA', fontStyle: 'italic', marginTop: 12 },
  locationText: { fontSize: 14, color: '#C7D0D8', marginTop: 6, marginBottom: 80 },
  monthlyCardWrapper: { marginTop: -90, marginHorizontal: 20, zIndex: 10 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#324E58' },
  viewDetailsText: { fontSize: 14, fontWeight: '700', color: '#DB8633' },
  beneficiaryCard: {
    backgroundColor: '#F4F6F8',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    marginHorizontal: 20,
  },
  beneficiaryImage: { width: '100%', height: 200 },
  beneficiaryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 10,
  },
  beneficiaryName: { fontSize: 18, fontWeight: '700', color: '#324E58' },
  beneficiaryDesc: { fontSize: 14, color: '#7A8D9C', marginTop: 5 },
  discountScroll: { marginBottom: 10 },
  discountScrollContent: { paddingLeft: 20, paddingBottom: 10 },
  discountCardWrapper: { marginRight: 15 },
  cardCream: {
    backgroundColor: '#FFF5EB',
    padding: 16,
    borderRadius: 20,
    width: 160,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  discountLogo: { width: 40, height: 40, marginBottom: 6 },
  discountBrand: { fontSize: 16, fontWeight: '700', color: '#324E58' },
  discountCategory: { fontSize: 12, color: '#7A8D9C', marginTop: 2 },
  discountBadge: {
    backgroundColor: '#DB8633',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  discountBadgeText: { color: 'white', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  placeholderBox: {
    backgroundColor: '#F4F6F8',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
    marginHorizontal: 20,
  },
  placeholderText: { fontSize: 16, color: '#A0AAB7' },
  inviteBannerWrapper: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 40,
    backgroundColor: '#F0B500',
    height: 130,
  },
  inviteInnerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  inviteImageContainer: {
    width: 180,
    height: '100%',
    overflow: 'hidden',
  },
  inviteBannerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  inviteTextBlock: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  inviteBannerHeadline: {
    color: '#1F2E35',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 20,
  },
  inviteBannerButton: {
    backgroundColor: '#1F2E35',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  inviteBannerButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
});
