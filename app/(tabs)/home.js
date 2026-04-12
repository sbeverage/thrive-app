// file: app/(tabs)/home.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFonts, Figtree_400Regular, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Image, TouchableOpacity } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import MonthlyImpactCard from '../../components/MonthlyImpactCard';
import { useBeneficiary } from '../context/BeneficiaryContext';
import { useUser } from '../context/UserContext';
import { useLocation } from '../context/LocationContext';
import { useDiscount } from '../context/DiscountContext';
import API from '../lib/api';
import WalkthroughTutorial from '../../components/WalkthroughTutorial';
import { useTutorial } from '../../hooks/useTutorial';
import InviteFriendsModal from '../../components/InviteFriendsModal';
import {
  REFERRAL_TIERS,
  milestonesForDisplay,
  nextMilestoneFromPaidCount,
  tiersUnlockedCount,
} from '../constants/referralRewards';

export default function MainHome() {
  const router = useRouter();
  const navigation = useNavigation();
  const { selectedBeneficiary } = useBeneficiary();
  const { user, loadUserData } = useUser();
  const { location: userLocation, locationAddress, locationPermission, checkLocationPermission } = useLocation();
  const { vendors, discounts, loadDiscounts } = useDiscount();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [topDiscounts, setTopDiscounts] = useState([]);
  
  // Referral data state
  const [paidFriendsCount, setPaidFriendsCount] = useState(0);
  const [referralMilestones, setReferralMilestones] = useState([]);
  const [badges, setBadges] = useState([]);
  const [nextMilestone, setNextMilestone] = useState(() =>
    nextMilestoneFromPaidCount(0, milestonesForDisplay([], 0))
  );
  
  
  // Load user data when component mounts or when screen is focused
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        try {
          await loadUserData();
        } catch (error) {
          console.error('❌ Error loading user data on home page:', error);
        }
      };
      loadData();
    }, [])
  );
  
  // Load referral data
  useEffect(() => {
    loadReferralData();
  }, []);
  
  // Load discounts and prepare top discounts for home page
  useEffect(() => {
    loadDiscounts();
  }, []);
  
  // Process discounts to get top vendors with discount counts
  useEffect(() => {
    if (vendors && discounts) {
      // Group discounts by vendor and count them
      const vendorDiscountCounts = {};
      
      discounts.forEach(discount => {
        const vendorId = discount.vendorId || discount.vendor?.id;
        if (vendorId) {
          vendorDiscountCounts[vendorId] = (vendorDiscountCounts[vendorId] || 0) + 1;
        }
      });
      
      // Get vendors that have discounts, sorted by discount count (descending)
      const vendorsWithDiscounts = vendors
        .filter(vendor => {
          const vendorId = vendor.id?.toString() || vendor.id;
          return vendorDiscountCounts[vendorId] > 0;
        })
        .map(vendor => {
          const vendorId = vendor.id?.toString() || vendor.id;
          const discountCount = vendorDiscountCounts[vendorId] || 0;
          
          // Get vendor logo (prefer logoUrl, fallback to local assets)
          let logoSource = null;
          const vendorName = vendor.name || vendor.brandName || '';
          
          // If logoUrl exists and is a valid URL, use it
          if (vendor.logoUrl && vendor.logoUrl.startsWith('http')) {
            logoSource = { uri: vendor.logoUrl };
          } else {
            // Try to match vendor name to local logo assets
            const logoMap = {
              'Starbucks': require('../../assets/images/logos/starbucks.png'),
              'Apple Store': require('../../assets/images/logos/apple.png'),
              'Ceviche': require('../../assets/images/ceviche-logo.png'),
              'Amazon': require('../../assets/logos/amazon.png'),
            };
            
            // Try exact match first, then partial match
            logoSource = logoMap[vendorName] || 
              (vendorName.toLowerCase().includes('starbucks') ? logoMap['Starbucks'] : null) ||
              (vendorName.toLowerCase().includes('apple') ? logoMap['Apple Store'] : null) ||
              (vendorName.toLowerCase().includes('ceviche') ? logoMap['Ceviche'] : null) ||
              (vendorName.toLowerCase().includes('amazon') ? logoMap['Amazon'] : null) ||
              (vendor.imageUrl ? { uri: vendor.imageUrl } : null);
          }
          
          return {
            id: vendor.id?.toString() || vendor.id,
            brandName: vendor.name || vendor.brandName || 'Vendor',
            logo: logoSource,
            discounts: discountCount,
            category: vendor.category || 'Business',
            vendor: vendor, // Keep full vendor object for navigation
          };
        })
        .sort((a, b) => b.discounts - a.discounts) // Sort by discount count (highest first)
        .slice(0, 10); // Get top 10
      
      setTopDiscounts(vendorsWithDiscounts);
    }
  }, [vendors, discounts]);
  
  const loadReferralData = async () => {
    try {
      const data = await API.getReferralInfo();

      const actualPaidFriendsCount = data?.paidFriendsCount ?? data?.friendsCount ?? 0;
      setPaidFriendsCount(actualPaidFriendsCount);

      const milestones = milestonesForDisplay(data?.milestones || [], actualPaidFriendsCount);
      setReferralMilestones(milestones);
      setNextMilestone(nextMilestoneFromPaidCount(actualPaidFriendsCount, milestones));

      const earnedBadges = milestones
        .filter((m) => m.unlocked)
        .map((m) => ({
          name: m.shortLabel || m.reward.replace(/ Badge$/i, '').trim(),
          earnedAt: m.earnedAt,
          milestone: m.count,
        }));

      setBadges(earnedBadges);
    } catch (error) {
      console.error('Error loading referral data:', error);
      setPaidFriendsCount(0);
      setReferralMilestones(milestonesForDisplay([], 0));
      setNextMilestone(nextMilestoneFromPaidCount(0, milestonesForDisplay([], 0)));
      setBadges([]);
    }
  };
  
  // Tutorial
  const impactCardRef = useRef(null);
  const {
    showTutorial,
    currentStep,
    highlightPosition,
    elementRef: tutorialElementRef,
    handleNext,
    handleSkip,
  } = useTutorial('home');
  
  // Disable swipe-back gesture and prevent back navigation to index/login
  useFocusEffect(
    useCallback(() => {
      // Disable gestures
      navigation.setOptions({
        gestureEnabled: false,
        gestureDirection: 'horizontal',
        fullScreenGestureEnabled: false,
      });

      // Prevent back navigation from home screen (main tab - shouldn't allow back)
      const unsubscribe = navigation.addListener('beforeRemove', (e) => {
        // Check if this is a back action (not a forward navigation)
        const action = e.data?.action;
        const isBackAction = 
          action?.type === 'GO_BACK' || 
          action?.type === 'POP' ||
          action?.type === 'NAVIGATE' && action?.payload?.name === '..';
        
        if (isBackAction) {
          // Prevent back navigation from home screen
          // This prevents swiping back to index/login page
          e.preventDefault();
        }
        // Allow forward navigation (to other tabs, detail pages, etc.)
      });

      return unsubscribe;
    }, [navigation])
  );

  // Set the ref for the tutorial to measure
  useEffect(() => {
    if (showTutorial && impactCardRef.current) {
      tutorialElementRef.current = impactCardRef.current;
    }
  }, [showTutorial, tutorialElementRef]);
  
  // Check tutorial when screen is focused (after signup)
  useFocusEffect(
    useCallback(() => {
      // Small delay to ensure screen is fully rendered
      const timer = setTimeout(() => {
        if (showTutorial && impactCardRef.current) {
          tutorialElementRef.current = impactCardRef.current;
        } else if (impactCardRef.current) {
          // Always set the ref if element exists, even if tutorial not showing yet
          tutorialElementRef.current = impactCardRef.current;
        }
      }, 1500);
      return () => clearTimeout(timer);
    }, [showTutorial, tutorialElementRef])
  );

  // State for display location (updates when locationAddress changes)
  const [displayLocation, setDisplayLocation] = useState('Your Area');

  // Update display location when locationAddress or userLocation changes
  useEffect(() => {
    if (userLocation && locationPermission === 'granted') {
      // Use locationAddress from context if available (more accurate)
      if (locationAddress?.city && locationAddress?.state) {
        const display = `${locationAddress.city}, ${locationAddress.state}`;
        setDisplayLocation(display);
        return;
      }
      // Fallback to coordinates-based lookup
      setDisplayLocation('Current Location, USA');
      return;
    }
    setDisplayLocation('Your Area');
  }, [locationAddress, userLocation, locationPermission]);

  // Get display location (for backwards compatibility)
  const getDisplayLocation = () => {
    return displayLocation;
  };
  // Calculate monthly values based on user's donation amount
  const monthlyDonation = user.monthlyDonation || 15;
  const monthlySavings = user.totalSavings || 0; // Use total savings from discounts
  
  // Check location permission when home page loads
  useEffect(() => {
    checkLocationPermission();
  }, []);

  // Refresh data when user navigates to home page
  useFocusEffect(
    React.useCallback(() => {
      const refreshData = async () => {
        await loadUserData();
      };
      refreshData();
    }, [])
  );

  let [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_700Bold,
  });

  if (!fontsLoaded) return null;

  // Use topDiscounts from state, fallback to empty array
  const vouchers = topDiscounts.length > 0 ? topDiscounts : [];

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Email Verification Banner */}
          {user.isLoggedIn && !user.isVerified && (
            <View style={styles.verificationBanner}>
              <Text style={styles.verificationText}>
                📧 Please verify your email to access all features
              </Text>
              <TouchableOpacity 
                style={styles.verifyButton}
                onPress={() => router.push('/verifyEmail')}
              >
                <Text style={styles.verifyButtonText}>Verify Email</Text>
              </TouchableOpacity>
            </View>
          )}
          
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
                {(user.profileImage || user.profileImageUrl) ? (
                  <Image source={{ uri: user.profileImage || user.profileImageUrl }} style={styles.profilePic} />
                ) : (
                  <View style={[styles.profilePic, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
                      {(() => {
                        if (user.firstName && user.lastName) {
                          return `${user.firstName[0].toUpperCase()}${user.lastName[0].toUpperCase()}`;
                        } else if (user.firstName) {
                          return user.firstName[0].toUpperCase();
                        } else if (user.lastName) {
                          return user.lastName[0].toUpperCase();
                        } else if (user.email) {
                          return user.email[0].toUpperCase();
                        } else {
                          return 'U';
                        }
                      })()}
                    </Text>
                  </View>
                )}
                <Text style={styles.greetingText}>
                  {(() => {
                    // Try multiple ways to get the name
                    let name = user.firstName 
                      || (user.name && user.name.split(' ')[0])
                      || (user.email && user.email.split('@')[0])
                      || 'there';
                    // Capitalize first letter
                    if (name && name !== 'there') {
                      name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
                    }
                    return `Hey ${name}!`;
                  })()}
                </Text>
              </View>
            </View>

            <Text style={styles.affirmationText}>"You're someone's reason to smile today!"</Text>
            <Text style={styles.locationText}>Home — {getDisplayLocation()}</Text>
          </LinearGradient>

          <View style={styles.monthlyCardWrapper} ref={impactCardRef}>
            <MonthlyImpactCard 
              key={`${monthlyDonation}-${monthlySavings}`}
              monthlyDonation={monthlyDonation} 
              monthlySavings={monthlySavings} 
              coworking={user.coworking}
              sponsorAmount={user.sponsorAmount}
              extraDonationAmount={user.extraDonationAmount}
            />
          </View>

          {/* My Beneficiary Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>My Beneficiary</Text>
          </View>
          {selectedBeneficiary ? (
            <TouchableOpacity 
              onPress={() => {
                router.push({
                  pathname: '/(tabs)/beneficiary/beneficiaryDetail', 
                  params: { id: selectedBeneficiary?.id?.toString() } 
                });
              }} 
              style={styles.beneficiaryCard}
              activeOpacity={0.9}
            >
              <View style={styles.beneficiaryImageContainer}>
                <Image source={selectedBeneficiary.image} style={styles.beneficiaryImage} resizeMode="cover" />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.7)']}
                  style={styles.beneficiaryImageOverlay}
                />
                <View style={styles.beneficiaryTextOverlay}>
                  <View style={styles.beneficiaryNameRow}>
                    <Text style={styles.beneficiaryName}>{selectedBeneficiary.name}</Text>
                    <AntDesign name="right" size={18} color="#FFFFFF" style={styles.chevronIcon} />
                  </View>
                  {selectedBeneficiary.category && (
                    <Text style={styles.beneficiaryCategory}>{selectedBeneficiary.category}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              onPress={() => router.push('/(tabs)/beneficiary')} 
              style={styles.beneficiaryCard}
              activeOpacity={0.9}
            >
              <View style={styles.beneficiaryImageContainer}>
                <Image source={require('../../assets/images/child-cancer.jpg')} style={styles.beneficiaryImage} resizeMode="cover" />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.7)']}
                  style={styles.beneficiaryImageOverlay}
                />
                <View style={styles.beneficiaryTextOverlay}>
                  <View style={styles.beneficiaryNameRow}>
                    <Text style={styles.beneficiaryName}>Select Your Cause</Text>
                    <AntDesign name="right" size={18} color="#FFFFFF" style={styles.chevronIcon} />
                  </View>
                  <Text style={styles.beneficiaryCategory}>Tap to choose a beneficiary</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 8, width: '100%' }} />

          {/* Discounts Near You Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Discounts Near You</Text>
            <TouchableOpacity onPress={() => router.push('/discounts')}>
              <Text style={styles.viewMoreText}>View More</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.discountScroll} contentContainerStyle={styles.discountScrollContent}>
            {vouchers.length > 0 ? (
              vouchers.map((voucher) => (
                <View key={voucher.id} style={styles.discountCardWrapper}>
                  <TouchableOpacity 
                    onPress={() => router.push(`/discounts/${voucher.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardCream}>
                      {voucher.logo ? (
                        <Image 
                          source={voucher.logo} 
                          style={styles.discountLogo} 
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={[styles.discountLogo, { backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 12, color: '#9CA3AF', fontWeight: '600' }}>
                            {voucher.brandName.substring(0, 2).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.discountCardContent}>
                        <Text style={styles.discountBrand} numberOfLines={2} ellipsizeMode="tail">
                          {voucher.brandName}
                        </Text>
                        <Text style={styles.discountCategory} numberOfLines={1} ellipsizeMode="tail">
                          {voucher.category}
                        </Text>
                      </View>
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountBadgeText}>{voucher.discounts} {voucher.discounts === 1 ? 'discount' : 'discounts'}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <View style={styles.discountCardWrapper}>
                <View style={styles.cardCream}>
                  <Text style={styles.discountBrand}>Loading discounts...</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 8, width: '100%' }} />

          {/* Enhanced Invite Section */}
          <View style={styles.inviteSectionWrapper}>
            <View style={styles.inviteSectionHeader}>
              <Text style={styles.inviteSectionTitle}>Grow Your Impact</Text>
              <Text style={styles.inviteSectionSubtitle}>
                Invite friends—unlock recognition while keeping donations focused on causes.
              </Text>
            </View>
            
            <View style={styles.inviteCard}>
              <View style={styles.inviteStatsContainer}>
                <View style={styles.inviteStatItem}>
                  <Text style={styles.inviteStatNumber}>{paidFriendsCount}</Text>
                  <Text style={styles.inviteStatLabel}>Friends Making{'\n'}a Difference</Text>
                </View>
                <View style={styles.inviteStatDivider} />
                <View style={styles.inviteStatItem}>
                  <Text style={styles.inviteStatNumber}>
                    {tiersUnlockedCount(referralMilestones)}/{REFERRAL_TIERS.length}
                  </Text>
                  <Text style={styles.inviteStatLabel}>Recognition{'\n'}tiers unlocked</Text>
                </View>
              </View>
              
              {/* Badges Display */}
              {badges.length > 0 && (
                <View style={styles.homeBadgesContainer}>
                  <Text style={styles.homeBadgesLabel}>Your Badges</Text>
                  <View style={styles.homeBadgesList}>
                    {badges.map((badge, index) => (
                      <View key={index} style={styles.homeBadgeItem}>
                        <AntDesign name="star" size={20} color="#DB8633" />
                        <Text style={styles.homeBadgeName}>{badge.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              
              <View style={styles.inviteProgressContainer}>
                <Text style={styles.inviteProgressText}>
                  {paidFriendsCount >= REFERRAL_TIERS[REFERRAL_TIERS.length - 1].count
                    ? 'Every recognition tier unlocked—thank you!'
                    : `${Math.max(0, nextMilestone.count - paidFriendsCount)} more ${nextMilestone.count - paidFriendsCount === 1 ? 'active friend' : 'active friends'} to unlock ${nextMilestone.reward}`}
                </Text>
                <View style={styles.inviteProgressBar}>
                  <View style={[styles.inviteProgressFill, { 
                    width: `${(() => {
                      const maxTier = REFERRAL_TIERS[REFERRAL_TIERS.length - 1].count;
                      if (paidFriendsCount >= maxTier) return 100;
                      const denom = Math.max(1, nextMilestone.count);
                      return Math.min((paidFriendsCount / denom) * 100, 100);
                    })()}%` 
                  }]} />
                </View>
              </View>
              
              <TouchableOpacity 
                style={styles.inviteCardButton}
                onPress={() => setShowInviteModal(true)}
              >
                <Text style={styles.inviteCardButtonText}>Invite Friends</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <Tabs />
      
      {/* Invite Friends Modal */}
      <InviteFriendsModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
      
      {/* Tutorial */}
      {showTutorial && currentStep && (
        <WalkthroughTutorial
          visible={showTutorial}
          currentStep={currentStep.stepNumber}
          totalSteps={currentStep.totalSteps}
          highlightPosition={highlightPosition}
          title={currentStep.title}
          description={currentStep.description}
          onNext={handleNext}
          onSkip={handleSkip}
        />
      )}
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
  affirmationText: { fontSize: 16, color: '#E5E8EA', fontStyle: 'italic', marginTop: 12 },
  locationText: { fontSize: 14, color: '#C7D0D8', marginTop: 6, marginBottom: 80 },
  monthlyCardWrapper: { marginTop: -90, marginHorizontal: 20, zIndex: 10 },
  sectionHeader: { fontSize: 20, fontWeight: '700', color: '#324E58' },
  sectionHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginTop: 30, 
    marginBottom: 10, 
    paddingHorizontal: 20 
  },
  viewDetailsText: { fontSize: 14, fontWeight: '700', color: '#DB8633' },
  viewMoreText: { fontSize: 14, fontWeight: '500', color: '#DB8633' },
  beneficiaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  beneficiaryImageContainer: {
    position: 'relative',
    width: '100%',
    height: 160,
    overflow: 'hidden',
  },
  beneficiaryImage: { 
    width: '100%', 
    height: '100%',
  },
  beneficiaryImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  beneficiaryTextOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 16,
  },
  beneficiaryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  beneficiaryName: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#FFFFFF',
    flex: 1,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  chevronIcon: {
    marginLeft: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  beneficiaryCategory: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  discountScroll: { marginBottom: 10 },
  discountScrollContent: { paddingLeft: 20, paddingBottom: 10 },
  discountCardWrapper: { marginRight: 15 },
  cardCream: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 16,
    width: 160,
    height: 170, // Fixed compact height for consistency
    alignItems: 'center',
    justifyContent: 'space-between', // Distribute content evenly
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  discountLogo: { 
    width: 44, 
    height: 44, 
    borderRadius: 22,
    marginBottom: 8,
  },
  discountCardContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    minHeight: 44, // Compact space for text (2 lines max)
  },
  discountBrand: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#324E58', 
    textAlign: 'center',
    lineHeight: 18, // Tight line height for compact look
    marginBottom: 3,
  },
  discountCategory: { 
    fontSize: 11, 
    color: '#7A8D9C', 
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  discountBadge: {
    backgroundColor: '#DB8633',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    width: '100%',
    marginTop: 6,
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
    textAlign: 'center',
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
    alignItems: 'center',
  },
  inviteStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  inviteStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  inviteStatNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DB8633',
  },
  inviteStatLabel: {
    fontSize: 12,
    color: '#7A8D9C',
    marginTop: 5,
    textAlign: 'center',
  },
  homeBadgesContainer: {
    marginBottom: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  homeBadgesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 8,
    textAlign: 'center',
  },
  homeBadgesList: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  homeBadgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#DB8633',
    borderStyle: 'dashed',
    gap: 6,
  },
  homeBadgeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#324E58',
  },
  inviteProgressContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  inviteProgressText: {
    fontSize: 14,
    color: '#7A8D9C',
    marginBottom: 5,
    textAlign: 'center',
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
  testButtonText: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  verificationBanner: {
    backgroundColor: '#FF6B6B',
    padding: 15,
    margin: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verificationText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  verifyButton: {
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 10,
  },
  verifyButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '700',
  },
});
