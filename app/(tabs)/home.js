// file: app/(tabs)/home.js
import React from 'react';
import { useFonts, Figtree_400Regular, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Tabs } from 'expo-router';
import MonthlyImpactCard from '../../components/MonthlyImpactCard';
import { useBeneficiary } from '../context/BeneficiaryContext';

export default function MainHome() {
  const router = useRouter();
  const { selectedBeneficiary } = useBeneficiary();
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
                <Text style={styles.coinsText}>847</Text>
              </View>
            </View>

            <Text style={styles.affirmationText}>“You're someone’s reason to smile today!”</Text>
            <Text style={styles.locationText}>Home — Alpharetta, GA, USA</Text>
          </LinearGradient>

          <View style={styles.monthlyCardWrapper}>
            <MonthlyImpactCard monthlyDonation={monthlyDonation} monthlySavings={monthlySavings} />
          </View>

          {/* My Beneficiary Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>My Beneficiary</Text>
          </View>
          {selectedBeneficiary ? (
            <TouchableOpacity onPress={() => router.push('/(tabs)/beneficiary/beneficiaryDetail')} style={styles.beneficiaryCard}>
              <Image source={selectedBeneficiary.image} style={styles.beneficiaryImage} />
              <View style={styles.beneficiaryOverlay}>
                <Text style={styles.beneficiaryName}>{selectedBeneficiary.name}</Text>
                <Text style={styles.beneficiaryDesc}>{selectedBeneficiary.about}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.push('/(tabs)/beneficiary')} style={styles.beneficiaryCard}>
              <Image source={require('../../assets/images/child-cancer.jpg')} style={styles.beneficiaryImage} />
              <View style={styles.beneficiaryOverlay}>
                <Text style={styles.beneficiaryName}>Select Your Cause</Text>
                <Text style={styles.beneficiaryDesc}>Choose a beneficiary to support during your signup.</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 8, width: '100%' }} />

          {/* Discounts Near You Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Discounts Near You</Text>
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

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 8, width: '100%' }} />

          {/* Rank Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Rank</Text>
          </View>
          <View style={[styles.leaderboardItem, styles.yourRankingCard, { marginHorizontal: 20, marginBottom: 30 }]}>
            <View style={styles.leaderboardRankBox}>
              <Text style={[styles.leaderboardRank, styles.leaderboardRankYou]}>42</Text>
            </View>
            <Image source={require('../../assets/images/profile.jpg')} style={styles.leaderboardProfile} />
            <View style={styles.leaderboardInfo}>
              <Text style={styles.leaderboardName}>Stephanie Beverage</Text>
              <Text style={styles.leaderboardLocation}>Alpharetta, GA</Text>
            </View>
            <View style={styles.leaderboardPointsRow}>
              <Text style={styles.leaderboardPoints}>847</Text>
              <Image source={require('../../assets/icons/coin.png')} style={styles.leaderboardCoin} />
            </View>
          </View>

          {/* Divider below Rank */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 8, width: '100%' }} />

          {/* Enhanced Invite Section */}
          <View style={styles.inviteSectionWrapper}>
            <View style={styles.inviteSectionHeader}>
              <Text style={styles.inviteSectionTitle}>Grow Your Impact</Text>
              <Text style={styles.inviteSectionSubtitle}>Invite friends and earn rewards together</Text>
            </View>
            
            <View style={styles.inviteCard}>
              <View style={styles.inviteStatsContainer}>
                <View style={styles.inviteStatItem}>
                  <Text style={styles.inviteStatNumber}>3</Text>
                  <Text style={styles.inviteStatLabel}>Friends Invited</Text>
                </View>
                <View style={styles.inviteStatDivider} />
                <View style={styles.inviteStatItem}>
                  <Text style={styles.inviteStatNumber}>+150</Text>
                  <Text style={styles.inviteStatLabel}>Points Earned</Text>
                </View>
              </View>
              
              <View style={styles.inviteProgressContainer}>
                <Text style={styles.inviteProgressText}>Next milestone: 5 friends</Text>
                <View style={styles.inviteProgressBar}>
                  <View style={[styles.inviteProgressFill, { width: '60%' }]} />
                </View>
                <Text style={styles.inviteProgressReward}>🎁 +50 bonus points</Text>
              </View>
              
              <TouchableOpacity style={styles.inviteCardButton}>
                <Text style={styles.inviteCardButtonText}>Invite Friends</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.inviteSocialProof}>
              <Text style={styles.inviteSocialProofText}>
                "My friends love the discounts and we're all making a difference together!" 
                <Text style={styles.inviteSocialProofAuthor}> — Sarah M.</Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <Tabs />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollContent: { paddingBottom: 20, backgroundColor: '#F5F5F5' },
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
  sectionHeader: { fontSize: 20, fontWeight: '700', color: '#324E58' },
  sectionHeaderRow: { marginTop: 30, marginBottom: 10, paddingHorizontal: 20 },
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
    backgroundColor: '#FFFFFF',
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

  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  yourRankingCard: {
    borderWidth: 2,
    borderColor: '#DB8633',
    backgroundColor: '#FFF5EB',
  },
  leaderboardRankBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardRank: {
    fontSize: 18,
    fontWeight: '700',
    color: '#B0B0B0',
  },
  leaderboardRankYou: {
    color: '#DB8633',
  },
  leaderboardProfile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
  },
  leaderboardLocation: {
    fontSize: 13,
    color: '#888',
  },
  leaderboardPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  leaderboardPoints: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DB8633',
  },
  leaderboardCoin: {
    width: 16,
    height: 16,
    marginLeft: 2,
  },
  inviteSectionWrapper: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 40,
    backgroundColor: '#F4F6F8',
    padding: 20,
  },
  inviteSectionHeader: {
    alignItems: 'center',
    marginBottom: 15,
  },
  inviteSectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 5,
  },
  inviteSectionSubtitle: {
    fontSize: 16,
    color: '#7A8D9C',
    textAlign: 'center',
  },
  inviteCard: {
    alignItems: 'center',
    marginBottom: 20,
  },
  inviteStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  inviteStatItem: {
    alignItems: 'center',
  },
  inviteStatNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DB8633',
  },
  inviteStatLabel: {
    fontSize: 14,
    color: '#7A8D9C',
    marginTop: 5,
  },
  inviteStatDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#E5E7EB',
    marginHorizontal: 20,
  },
  inviteProgressContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  inviteProgressText: {
    fontSize: 14,
    color: '#7A8D9C',
    marginBottom: 5,
  },
  inviteProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  inviteProgressFill: {
    height: '100%',
    backgroundColor: '#DB8633',
    borderRadius: 4,
  },
  inviteProgressReward: {
    fontSize: 14,
    color: '#DB8633',
    fontWeight: '700',
    marginTop: 5,
  },

  inviteCardButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginTop: 15,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  inviteCardButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  inviteSocialProof: {
    backgroundColor: '#F0F2F5',
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
  },
  inviteSocialProofText: {
    fontSize: 14,
    color: '#324E58',
    lineHeight: 20,
  },
  inviteSocialProofAuthor: {
    fontWeight: '700',
    color: '#DB8633',
  },
});
