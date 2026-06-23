import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AntDesign, Feather } from '@expo/vector-icons';
import API from '../lib/api';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';
import { useLocation } from '../context/LocationContext';
import { calculateDistance } from '../utils/locationService';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Curate which vendors appear in the teaser. Names are matched
// case-insensitively against vendor.name on each discount. Edit these to
// hand-pick the storefront without redeploying any DB changes.
const EXCLUDE_VENDOR_NAMES = ['HEW Fitness'];
const FEATURED_VENDOR_NAMES = ['Valor Coffee'];

// Approx height of one card row (padding + logo + marginBottom). Used to
// derive per-card scroll-driven transforms (revolving-door tilt at the top).
const CARD_SLOT = 92;

function vendorNameOf(d) {
  return (d.vendor?.name || d.vendorName || d.vendor_name || '').trim().toLowerCase();
}

function vendorCoords(d) {
  const addr = d.vendor?.address || {};
  const lat = Number(addr.latitude);
  const lng = Number(addr.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// Sort discounts for the teaser. Ordering rules:
//   1. Featured vendors always first (controlled curation).
//   2. Then: nearest-first if we have the user's location.
//   3. Otherwise: highest-value discount first (% off > $ off > BOGO/free).
// Excluded vendors are dropped entirely.
function sortDiscountsForTeaser(allDiscounts, userLocation) {
  const excluded = new Set(EXCLUDE_VENDOR_NAMES.map((n) => n.toLowerCase()));
  const featured = new Set(FEATURED_VENDOR_NAMES.map((n) => n.toLowerCase()));

  const active = (allDiscounts || []).filter((d) => {
    const status = (d.status || '').toLowerCase();
    if (status && status !== 'active') return false;
    if (d.is_active === false) return false;
    if (excluded.has(vendorNameOf(d))) return false;
    return true;
  });

  const valueScore = (d) => {
    const type = (d.discountType || d.discount_type || '').toLowerCase();
    if (type === 'percentage') {
      const pct =
        Number(d.discountPercentage ?? d.discount_percentage ?? d.discountValue ?? d.discount_value ?? 0) || 0;
      return 1000 + pct;
    }
    if (type === 'fixed') {
      const amt =
        Number(d.discountAmount ?? d.discount_amount ?? d.discountValue ?? d.discount_value ?? 0) || 0;
      return 500 + amt;
    }
    if (type === 'bogo') return 400;
    if (type === 'free') return 300;
    return 100;
  };

  const annotated = active.map((d) => {
    let distanceMi = null;
    const coords = vendorCoords(d);
    if (userLocation && coords) {
      const dist = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        coords.lat,
        coords.lng,
      );
      if (Number.isFinite(dist)) distanceMi = dist;
    }
    return { ...d, _distanceMi: distanceMi };
  });

  return annotated
    .sort((a, b) => {
      const aFeatured = featured.has(vendorNameOf(a));
      const bFeatured = featured.has(vendorNameOf(b));
      if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;

      const aHasDist = a._distanceMi != null;
      const bHasDist = b._distanceMi != null;
      if (aHasDist && bHasDist) return a._distanceMi - b._distanceMi;
      if (aHasDist) return -1;
      if (bHasDist) return 1;

      return valueScore(b) - valueScore(a);
    })
    .slice(0, 12);
}

function formatDistance(mi) {
  if (mi == null) return null;
  if (mi < 0.1) return '<0.1 mi';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

function formatDiscountHeadline(d) {
  const type = (d.discountType || d.discount_type || '').toLowerCase();
  if (type === 'percentage') {
    const pct = d.discountPercentage ?? d.discount_percentage ?? d.discountValue ?? d.discount_value;
    if (pct != null) return `${pct}% off`;
  }
  if (type === 'fixed') {
    const amt = d.discountAmount ?? d.discount_amount ?? d.discountValue ?? d.discount_value;
    if (amt != null) return `$${amt} off`;
  }
  if (type === 'bogo') return 'BOGO';
  if (type === 'free') return 'Free item';
  return 'Member perk';
}

function getVendorName(d) {
  return (
    d.vendor?.name ||
    d.vendorName ||
    d.vendor_name ||
    d.business_name ||
    d.title ||
    'Local favorite'
  );
}

function getVendorLogo(d) {
  return (
    d.vendor?.logoUrl ||
    d.vendor?.logo_url ||
    d.logo_url ||
    d.logoUrl ||
    d.image_url ||
    null
  );
}

function getVendorCategory(d) {
  return d.vendor?.category || d.category || null;
}

export default function DiscountTeaser() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { location: userLocation } = useLocation();
  const [rawDiscounts, setRawDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  // Hold up to 12 entrance anims so cards always animate in if the API
  // returns fewer.
  const cardAnims = useRef(
    Array.from({ length: 12 }, () => new Animated.Value(0)),
  ).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  // Tracks user's scroll position so cards can react as they exit the top.
  const scrollY = useRef(new Animated.Value(0)).current;

  // Sort whenever discounts or location updates. Memoized so the list isn't
  // re-shuffled on every render.
  const discounts = React.useMemo(
    () => sortDiscountsForTeaser(rawDiscounts, userLocation),
    [rawDiscounts, userLocation],
  );

  const paramsSnapshot = JSON.stringify(params ?? {});
  useEffect(() => {
    persistSignupFlowCheckpointFromParams('/signupFlow/discountTeaser', params);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkpoint when serialized route params change
  }, [paramsSnapshot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await API.getDiscounts();
        const raw = Array.isArray(data) ? data : data?.discounts || [];
        if (!cancelled) setRawDiscounts(raw);
      } catch (err) {
        console.warn('discountTeaser: failed to load discounts', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  useEffect(() => {
    if (loading || discounts.length === 0) return;
    // Bottom-up stagger: the lowest visible card lands first, and each card
    // above it follows. Reads as "rising into place" instead of dropping in.
    Animated.stagger(
      90,
      [...cardAnims.slice(0, discounts.length)].reverse().map((a) =>
        Animated.spring(a, {
          toValue: 1,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [loading, discounts.length, cardAnims]);

  const handleContinue = () => {
    if (params?.flow === 'coworking') {
      router.push({
        pathname: '/signupFlow/beneficiarySignupCause',
        params: { flow: 'coworking', sponsorAmount: params?.sponsorAmount || '15' },
      });
    } else {
      router.push('/signupFlow/beneficiarySignupCause');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Blue gradient top — matches the donation explainer screen so the
          two consecutive signup screens read as a pair. */}
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={['#2C3E50', '#4CA1AF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>

      {/* Back */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Image
          source={require('../../assets/icons/arrow-left.png')}
          style={{ width: 24, height: 24, tintColor: '#fff' }}
        />
      </TouchableOpacity>

      {/* Locked header — does NOT scroll with the card list */}
      <Animated.View
        style={[
          styles.heroBlock,
          styles.heroLocked,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-12, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.peekBadge}>
          <Text style={styles.peekBadgeEmoji}>👀</Text>
          <Text style={styles.peekBadgeText}>SNEAK PEEK</Text>
        </View>
        <Text style={styles.heroTitle}>Discounts Waiting{'\n'}For You</Text>
        <Text style={styles.heroSubtitle}>
          Scroll through what's nearby —{'\n'}all unlock the moment you donate.
        </Text>
      </Animated.View>

      {/* Only the cards scroll */}
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollListContent}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      >
        <View style={styles.cardsContainer}>
          {loading
            ? [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
            : discounts.map((d, i) => {
                // Each card's natural Y inside the scroll content. As scrollY
                // approaches it, the card hits the top edge; once it passes,
                // the card "bends back" through a revolving door and fades.
                const naturalY = i * CARD_SLOT;
                const rotateX = scrollY.interpolate({
                  inputRange: [naturalY, naturalY + CARD_SLOT / 2, naturalY + CARD_SLOT],
                  outputRange: ['0deg', '-30deg', '-75deg'],
                  extrapolate: 'clamp',
                });
                const scrollOpacity = scrollY.interpolate({
                  inputRange: [naturalY, naturalY + CARD_SLOT / 2, naturalY + CARD_SLOT],
                  outputRange: [1, 0.55, 0],
                  extrapolate: 'clamp',
                });
                const scrollScale = scrollY.interpolate({
                  inputRange: [naturalY, naturalY + CARD_SLOT],
                  outputRange: [1, 0.86],
                  extrapolate: 'clamp',
                });
                return (
                  <Animated.View
                    key={d.id || i}
                    style={{
                      opacity: cardAnims[i] || 1,
                      transform: [
                        {
                          translateY:
                            cardAnims[i]?.interpolate({
                              inputRange: [0, 1],
                              outputRange: [40, 0],
                            }) || 0,
                        },
                      ],
                    }}
                  >
                    <Animated.View
                      style={{
                        opacity: scrollOpacity,
                        transform: [
                          { perspective: 800 },
                          { rotateX },
                          { scale: scrollScale },
                        ],
                      }}
                    >
                      <TeaserCard discount={d} />
                    </Animated.View>
                  </Animated.View>
                );
              })}
        </View>

        {!loading && discounts.length > 0 && (
          <View style={styles.moreTease}>
            <Text style={styles.moreTeaseText}>+ many more once you join</Text>
          </View>
        )}
      </Animated.ScrollView>

      {/* Sticky CTA */}
      <View style={styles.stickyButtonContainer}>
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue} activeOpacity={0.9}>
          <Text style={styles.continueButtonText}>Pick Your Cause →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TeaserCard({ discount }) {
  const headline = formatDiscountHeadline(discount);
  const vendorName = getVendorName(discount);
  const category = getVendorCategory(discount);
  const logo = getVendorLogo(discount);
  const distanceLabel = formatDistance(discount._distanceMi);

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.cardLogo} resizeMode="cover" />
        ) : (
          <View style={[styles.cardLogo, styles.cardLogoPlaceholder]}>
            <AntDesign name="tagso" size={24} color="#DB8633" />
          </View>
        )}
        {/* Lock badge anchored to the logo — signals "gated" without copy. */}
        <View style={styles.lockBadge}>
          <Feather name="lock" size={11} color="#DB8633" />
        </View>
      </View>
      <View style={styles.cardCenter}>
        <Text style={styles.cardVendor} numberOfLines={1}>
          {vendorName}
        </Text>
        <View style={styles.cardMetaRow}>
          {category ? (
            <Text style={styles.cardCategory} numberOfLines={1}>
              {category}
            </Text>
          ) : null}
          {distanceLabel ? (
            <>
              {category ? <View style={styles.cardMetaDot} /> : null}
              <Feather name="map-pin" size={11} color="#6B7280" />
              <Text style={styles.cardDistance}>{distanceLabel}</Text>
            </>
          ) : null}
        </View>
      </View>
      <View style={styles.cardRight}>
        <LinearGradient
          colors={['#DB8633', '#F4A95C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardBadge}
        >
          <Text style={styles.cardBadgeText} numberOfLines={1}>
            {headline}
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={[styles.card, { opacity: 0.5 }]}>
      <View style={[styles.cardLogo, styles.cardLogoPlaceholder]} />
      <View style={styles.cardCenter}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '50%', marginTop: 6 }]} />
      </View>
      <View style={[styles.cardBadge, { backgroundColor: '#E5E7EB' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.38,
    zIndex: 0,
    overflow: 'hidden',
  },
  gradientBg: {
    width: SCREEN_WIDTH,
    height: '100%',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  scrollView: { flex: 1 },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 20,
    padding: 6,
  },
  contentSection: {
    alignItems: 'center',
    paddingTop: 70,
    paddingBottom: 160,
    zIndex: 5,
  },
  scrollListContent: {
    paddingTop: 8,
    paddingBottom: 140, // leave room for sticky CTA so the last card isn't hidden
    alignItems: 'center',
  },
  heroBlock: {
    width: '90%',
    maxWidth: 360,
    alignItems: 'center',
    marginBottom: 24,
  },
  heroLocked: {
    paddingTop: 70, // clears the back button overlay
    paddingBottom: 12,
    alignSelf: 'center',
    zIndex: 5,
    marginBottom: 0,
  },
  peekBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
  },
  peekBadgeEmoji: { fontSize: 14, marginRight: 6 },
  peekBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    lineHeight: 21,
  },
  cardsContainer: {
    width: '92%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardLeft: { marginRight: 14, position: 'relative' },
  cardLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  lockBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFE6CC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cardLogoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFE6CC',
    backgroundColor: '#FFF5EB',
  },
  cardCenter: { flex: 1, minWidth: 0 },
  cardVendor: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  cardCategory: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  cardMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 6,
  },
  cardDistance: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 3,
    fontWeight: '500',
  },
  cardLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLockText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginLeft: 4,
    fontWeight: '500',
  },
  cardRight: { marginLeft: 10 },
  cardBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 74,
    alignItems: 'center',
  },
  cardBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  moreTease: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  moreTeaseDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 3,
  },
  moreTeaseText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginLeft: 10,
    fontWeight: '500',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    width: '70%',
  },
  statRow: {
    width: '92%',
    maxWidth: 380,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFF5EB',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#FFE6CC',
  },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#FFE6CC',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DB8633',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  stickyButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
    alignItems: 'center',
  },
  stickyHelper: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
