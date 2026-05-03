// file: app/(tabs)/home.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFonts, Figtree_400Regular, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Animated, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MonthlyImpactCard from '../../components/MonthlyImpactCard';
import { useBeneficiary } from '../context/BeneficiaryContext';
import { useUser } from '../context/UserContext';
import { useLocation } from '../context/LocationContext';
import { useDiscount } from '../context/DiscountContext';
import API from '../lib/api';
import InviteFriendsModal from '../../components/InviteFriendsModal';
import {
  REFERRAL_TIERS,
  milestonesForDisplay,
  nextMilestoneFromPaidCount,
  tiersUnlockedCount,
} from '../constants/referralRewards';
import { BADGE_ASSETS, IMAGE_ASSETS } from '../utils/assetConstants';

export default function MainHome() {
  const router = useRouter();
  const navigation = useNavigation();
  const { selectedBeneficiary, reloadBeneficiary } = useBeneficiary();
  const { user, loadUserData } = useUser();

  // Redirect to landing when there is no session. If a JWT still exists, do not bounce to /
  // while UserContext hydrates — stale userData can have isLoggedIn: false with a valid token.
  useEffect(() => {
    if (user.isLoading || user.isLoggedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (cancelled) return;
        if (!token) router.replace('/');
      } catch (_) {
        if (!cancelled) router.replace('/');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.isLoading, user.isLoggedIn, router]);

  // Profile image smooth fade-in — resets whenever the URL changes (e.g. backend sync arrives)
  const imageUri = user.profileImage || user.profileImageUrl || null;
  const prevImageUri = useRef(null);
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const getInitials = useCallback(() => {
    if (user.firstName && user.lastName) return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    if (user.firstName) return user.firstName[0].toUpperCase();
    if (user.lastName) return user.lastName[0].toUpperCase();
    if (user.email) return user.email[0].toUpperCase();
    return 'U';
  }, [user.firstName, user.lastName, user.email]);
  useEffect(() => {
    if (imageUri && imageUri !== prevImageUri.current) {
      prevImageUri.current = imageUri;
      imageOpacity.setValue(0);
    }
  }, [imageUri]);
  const handleImageLoad = useCallback(() => {
    Animated.timing(imageOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

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
          await reloadBeneficiary();
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
      {/* Omit top edge here: SafeAreaView top inset + gray bg created a band above the gradient. Top inset is applied inside headerWrapper instead. */}
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        >
          <LinearGradient
            colors={['#2C3E50', '#4CA1AF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerWrapper}
          >
            {/* Top bar: root SafeAreaView already applies top inset. */}
            <View style={styles.headerNavChrome}>
              <View style={styles.headerTopRow}>
                <View style={styles.logoWrap}>
                  <Image
                    source={{ uri: IMAGE_ASSETS.INITIATIVE_LOGO_NO_WEB_WHITE }}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.rightIcons}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => router.push('/menu')}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Open menu"
                  >
                    <Image source={require('../../assets/icons/menu.png')} style={styles.iconWhite} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.headerDivider} />

            {/* Hero tail (extra blue) lives only under the greeting — keeps logo row at universal top placement. */}
            <View style={styles.headerProfileSection}>
              <View style={styles.profileRow}>
              <View style={styles.profileLeft}>
                {/* Avatar: initials always rendered underneath; image fades in on top when ready */}
                <View style={[styles.profilePic, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }]}>
                  <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
                    {getInitials()}
                  </Text>
                  {imageUri && (
                    <Animated.Image
                      source={{ uri: imageUri }}
                      style={[StyleSheet.absoluteFill, { borderRadius: 25, opacity: imageOpacity }]}
                      onLoad={handleImageLoad}
                    />
                  )}
                </View>
                {!user.isLoading && (
                  <Text style={styles.greetingText}>
                    {(() => {
                      let name = user.firstName
                        || (user.name && user.name.split(' ')[0])
                        || (user.email && user.email.split('@')[0])
                        || '';
                      if (name) name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
                      return name ? `Hey ${name}!` : '';
                    })()}
                  </Text>
                )}
              </View>
            </View>
            </View>
          </LinearGradient>

          <View style={styles.monthlyCardWrapper}>
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
                <Image
                  source={selectedBeneficiary.image || require('../../assets/images/charity-water.jpg')}
                  style={styles.beneficiaryImage}
                  resizeMode="cover"
                />
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

          {/* Grow Your Impact — Redesigned */}
          <View style={styles.inviteSectionWrapper}>
            {/* Gradient header with stats */}
            <LinearGradient
              colors={['#1a3a42', '#21555b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.inviteGradientHeader}
            >
              <Text style={styles.inviteSectionTitle}>Grow Your Impact</Text>
              <Text style={styles.inviteSectionSubtitle}>
                Invite friends & unlock recognition while amplifying your cause.
              </Text>
              <View style={styles.inviteStatsContainer}>
                <View style={styles.inviteStatItem}>
                  <Text style={styles.inviteStatNumber}>{paidFriendsCount}</Text>
                  <Text style={styles.inviteStatLabel}>Active{'\n'}Friends</Text>
                </View>
                <View style={styles.inviteStatDivider} />
                <View style={styles.inviteStatItem}>
                  <Text style={styles.inviteStatNumber}>
                    {tiersUnlockedCount(referralMilestones)}/{REFERRAL_TIERS.length}
                  </Text>
                  <Text style={styles.inviteStatLabel}>Badges{'\n'}Earned</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Body: badges + progress + button */}
            <View style={styles.inviteBodySection}>
              <Text style={styles.inviteBadgesLabel}>Recognition Badges</Text>
              <View style={styles.inviteBadgesRow}>
                {REFERRAL_TIERS.map((tier, index) => {
                  const unlocked = paidFriendsCount >= tier.count;
                  const badgeImages = [BADGE_ASSETS.SUPPORTER, BADGE_ASSETS.SPOTLIGHT, BADGE_ASSETS.CHAMPION];
                  const badgeImagesLocked = [BADGE_ASSETS.SUPPORTER_LOCKED, BADGE_ASSETS.SPOTLIGHT_LOCKED, BADGE_ASSETS.CHAMPION_LOCKED];
                  return (
                    <View key={index} style={[styles.badgeCard, unlocked && styles.badgeCardUnlocked]}>
                      <Image
                        source={{ uri: unlocked ? badgeImages[index] : badgeImagesLocked[index] }}
                        style={[styles.badgeImage, !unlocked && styles.badgeImageLocked]}
                      />
                      <Text style={[styles.badgeName, !unlocked && styles.badgeNameLocked]}>
                        {tier.shortLabel}
                      </Text>
                      {unlocked ? (
                        <Text style={styles.badgeEarned}>Earned ✓</Text>
                      ) : (
                        <Text style={styles.badgeRequirement}>
                          {tier.count} friend{tier.count > 1 ? 's' : ''}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>

              <View style={styles.inviteProgressContainer}>
                <Text style={styles.inviteProgressText}>
                  {paidFriendsCount >= REFERRAL_TIERS[REFERRAL_TIERS.length - 1].count
                    ? '🎉 All recognition tiers unlocked — thank you!'
                    : `${Math.max(0, nextMilestone.count - paidFriendsCount)} more active friend${nextMilestone.count - paidFriendsCount === 1 ? '' : 's'} to unlock ${nextMilestone.reward}`}
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

      {/* Invite Friends Modal */}
      <InviteFriendsModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />

    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollContent: { paddingBottom: 16, backgroundColor: '#F5F5F5' },
  headerWrapper: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  /** Top-aligned row: no fixed height so logo + menu sit high; paddingBottom sets gap to divider. */
  headerNavChrome: {
    paddingTop: 4,
    paddingBottom: 8,
    justifyContent: 'flex-start',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 30,
    marginTop: 30,
  },
  /** Full-bleed hairline; negative margin matches headerWrapper horizontal padding */
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginTop: 5,
    marginBottom: 20,
    marginHorizontal: -24,
  },
  /** Greeting + large teal area below (does not affect logo vertical position). */
  headerProfileSection: {
    paddingTop: 8,
    paddingBottom: 150,
  },
  /** Left-aligned; maxWidth keeps wide wordmark from overlapping the menu icon. */
  logoWrap: {
    marginRight: 12,
    alignItems: 'flex-start',
    justifyContent: 'center',
    flexShrink: 1,
    maxWidth: '78%',
  },
  /** ~480×45 initiative strip; slight lift mirrors discounts miniBrandLogo marginTop -20. */
  logo: { height: 18, aspectRatio: 480 / 45, alignSelf: 'flex-start', marginTop: -8 },
  rightIcons: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  iconButton: { marginLeft: 12 },
  iconWhite: { width: 22, height: 22, resizeMode: 'contain', tintColor: 'white' },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  profilePic: { width: 50, height: 50, borderRadius: 25 },
  greetingText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 14,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  /**
   * Overlap into the gradient. More negative = card sits slightly higher (tighter to the name row).
   * marginBottom adds space before the “My Beneficiary” header.
   */
  /** With paddingBottom 150, more negative = card sits higher on screen. */
  monthlyCardWrapper: {
    marginTop: -120,
    marginHorizontal: 20,
    marginBottom: 10,
    zIndex: 10,
  },
  sectionHeader: { fontSize: 20, fontWeight: '700', color: '#324E58' },
  sectionHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginTop: 16, 
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
    marginTop: 18,
    marginBottom: 28,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  inviteGradientHeader: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 20,
  },
  inviteSectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  inviteSectionSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
    marginBottom: 20,
  },
  inviteStatsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  inviteStatItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  inviteStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 10,
  },
  inviteStatNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  inviteStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 3,
  },
  inviteBodySection: {
    padding: 20,
  },
  inviteBadgesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E9BAE',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  inviteBadgesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  badgeCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: '#e9ecef',
  },
  badgeCardUnlocked: {
    backgroundColor: '#e8f4f5',
    borderColor: '#21555b',
  },
  badgeImage: {
    width: 56,
    height: 56,
    marginBottom: 6,
    resizeMode: 'contain',
  },
  badgeImageLocked: {
    opacity: 0.6,
  },
  badgeName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#21555b',
    marginBottom: 3,
    textAlign: 'center',
  },
  badgeNameLocked: {
    color: '#aaa',
  },
  badgeEarned: {
    fontSize: 10,
    color: '#21555b',
    fontWeight: '600',
  },
  badgeRequirement: {
    fontSize: 10,
    color: '#bbb',
    textAlign: 'center',
  },
  inviteProgressContainer: {
    marginBottom: 20,
  },
  inviteProgressText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  inviteProgressBar: {
    height: 6,
    backgroundColor: '#e9ecef',
    borderRadius: 3,
    overflow: 'hidden',
  },
  inviteProgressFill: {
    height: '100%',
    backgroundColor: '#DB8633',
    borderRadius: 3,
  },
  inviteCardButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  inviteCardButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  testButtonText: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
});
