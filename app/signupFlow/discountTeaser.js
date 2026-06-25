// Preview of the real Discounts page, used inside the signup flow before the
// donor has picked a cause. Layout mirrors app/(tabs)/(main)/discounts/index.js
// pixel-for-pixel; the only difference is the top brand header swaps the
// THRIVE logo for the piggy image + a "Discounts Waiting For You" headline,
// and tapping a card does nothing (cards have a translucent lock overlay).
// Heart taps work and persist to AsyncStorage so favorites roll over once
// signup completes.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, AntDesign } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import API from '../lib/api';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';
import { useLocation } from '../context/LocationContext';
import { useDiscountFilter } from '../context/DiscountFilterContext';
import { calculateDistance } from '../utils/locationService';

// Preload the piggy artwork at module load so it's decoded into memory by
// the time the screen mounts. Without this, RN's Image lazily decodes the
// bundled asset on first paint and the piggy pops in a beat after the rest
// of the hero. Fire-and-forget — failure here is non-fatal.
Asset.fromModule(require('../../assets/images/piggy-peek.png'))
  .downloadAsync()
  .catch(() => {});

// Curate which vendors appear in the teaser. Names are matched
// case-insensitively against vendor.name. Edit to hand-pick the storefront
// without touching the DB.
const EXCLUDE_VENDOR_NAMES = ['HEW Fitness'];
const FEATURED_VENDOR_NAMES = ['Valor Coffee'];

const FAVORITES_KEY = '@thrive_favorites';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Approximate destination for the coin animation — roughly the center of
// the piggy in the hero. An eyeballed center is fine for the visual effect.
const PIGGY_TARGET_X = SCREEN_WIDTH / 2 - 12;
const PIGGY_TARGET_Y = 150;

function nameOf(v) {
  return (v?.name || '').trim().toLowerCase();
}

function vendorCoords(v) {
  const addr = v?.address || {};
  const lat = Number(addr.latitude);
  const lng = Number(addr.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function getDiscountTextForVendor(vendorId, discounts) {
  const list = (discounts || []).filter((d) => {
    const vid = String(d.vendorId ?? d.vendor_id ?? d.vendor?.id ?? '');
    return vid === String(vendorId);
  });
  if (list.length === 0) return 'Discounts available';
  if (list.length === 1) return '1 discount available';
  return `${list.length} discounts available`;
}

export default function DiscountTeaser() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { location: userLocation, locationAddress, locationPermission } = useLocation();
  const { filters, updateFilters, hasActiveFilters } = useDiscountFilter();

  const [vendors, setVendors] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Coins that are mid-air from a heart tap to the piggy. Each entry has its
  // own Animated.Value (0→1) driving the flight. Cleaned up on landing.
  const [flyingCoins, setFlyingCoins] = useState([]);
  const coinIdRef = useRef(0);

  // Quick bounce on the saved-counter pill when favorites change.
  const pillScale = useRef(new Animated.Value(1)).current;
  // Small piggy bounce when a coin arrives.
  const piggyBounce = useRef(new Animated.Value(1)).current;

  const paramsSnapshot = JSON.stringify(params ?? {});
  useEffect(() => {
    persistSignupFlowCheckpointFromParams('/signupFlow/discountTeaser', params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsSnapshot]);

  // Load vendors + discounts in parallel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [vRes, dRes] = await Promise.all([
          API.getVendors().catch(() => null),
          API.getDiscounts().catch(() => null),
        ]);
        const vList = Array.isArray(vRes) ? vRes : vRes?.vendors || vRes?.data || [];
        const dList = Array.isArray(dRes) ? dRes : dRes?.discounts || dRes?.data || [];
        if (!cancelled) {
          setVendors(vList);
          setDiscounts(dList);
        }
      } catch (err) {
        console.warn('discountTeaser: failed to load data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Favorites persist to AsyncStorage so they roll over post-signup
  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY)
      .then((stored) => {
        if (!stored) return;
        try {
          setFavorites(new Set(JSON.parse(stored)));
        } catch {
          /* non-fatal */
        }
      })
      .catch(() => {});
  }, []);

  // Spawn a coin at (fromX, fromY) and arc it to the piggy. On landing,
  // remove the coin and bounce the piggy briefly. fromX/Y are in window
  // coordinates (provided by GestureResponderEvent.nativeEvent.pageX/Y).
  const spawnCoin = useCallback((fromX, fromY) => {
    coinIdRef.current += 1;
    const id = coinIdRef.current;
    const anim = new Animated.Value(0);
    setFlyingCoins((prev) => [...prev, { id, fromX, fromY, anim }]);
    Animated.timing(anim, {
      toValue: 1,
      duration: 700,
      easing: Easing.bezier(0.5, 0, 0.6, 1),
      useNativeDriver: true,
    }).start(() => {
      setFlyingCoins((prev) => prev.filter((c) => c.id !== id));
      // Piggy bounce when coin lands
      Animated.sequence([
        Animated.timing(piggyBounce, {
          toValue: 1.12,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.spring(piggyBounce, {
          toValue: 1,
          friction: 4,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [piggyBounce]);

  const toggleFavorite = useCallback(
    (vendorId, tapX, tapY) => {
      const id = String(vendorId);
      setFavorites((prev) => {
        const next = new Set(prev);
        const wasFavorited = next.has(id);
        if (wasFavorited) {
          next.delete(id);
        } else {
          next.add(id);
          if (tapX != null && tapY != null) spawnCoin(tapX, tapY);
        }
        AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])).catch(
          () => {},
        );
        return next;
      });
    },
    [spawnCoin],
  );

  // Bounce the saved-counter pill whenever favorites size changes.
  useEffect(() => {
    if (favorites.size === 0) return;
    Animated.sequence([
      Animated.timing(pillScale, {
        toValue: 1.18,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(pillScale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [favorites.size, pillScale]);

  // Annotate + base-sort (featured → nearest → name)
  const processed = useMemo(() => {
    const excluded = new Set(EXCLUDE_VENDOR_NAMES.map((n) => n.toLowerCase()));
    const featured = new Set(FEATURED_VENDOR_NAMES.map((n) => n.toLowerCase()));

    const approved = (vendors || []).filter((v) => {
      if (excluded.has(nameOf(v))) return false;
      const status = (v.signup_status || v.signupStatus || 'approved').toLowerCase();
      if (status && status !== 'approved') return false;
      return true;
    });

    return approved
      .map((v) => {
        let distance = null;
        const c = vendorCoords(v);
        if (userLocation && c) {
          const d = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            c.lat,
            c.lng,
          );
          if (Number.isFinite(d)) distance = d;
        }
        return {
          ...v,
          _distance: distance,
          _discountText: getDiscountTextForVendor(v.id, discounts),
          _isFeatured: featured.has(nameOf(v)),
        };
      })
      .sort((a, b) => {
        if (a._isFeatured !== b._isFeatured) return a._isFeatured ? -1 : 1;
        if (a._distance != null && b._distance != null) return a._distance - b._distance;
        if (a._distance != null) return -1;
        if (b._distance != null) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [vendors, discounts, userLocation]);

  // Apply search + category + favorites filters (same logic the live page uses)
  const visible = useMemo(() => {
    let list = processed;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((v) => (v.name || '').toLowerCase().includes(q));
    }
    if (filters.category) {
      const c = filters.category.toLowerCase();
      list = list.filter((v) => (v.category || '').toLowerCase() === c);
    }
    if (filters.showFavorites) {
      list = list.filter((v) => favorites.has(String(v.id)));
    }
    return list;
  }, [processed, searchQuery, filters.category, filters.showFavorites, favorites]);

  // Counts per category — drives which tag pills show (mirrors live page).
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const v of processed) {
      const c = v.category;
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [processed]);

  const locationDisplay =
    [locationAddress?.city, locationAddress?.state].filter(Boolean).join(', ') ||
    (locationPermission === 'denied'
      ? 'Location not available'
      : 'Detecting location...');

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

  const milestoneHit = favorites.size >= 3;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      {/* Brand header */}
      <LinearGradient
        colors={['#2C3E50', '#4CA1AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.brandHeader}
      >
        {/* Explicit route — router.back() can fail when the user landed
            here via router.replace from beneficiarySignupCause (no stack). */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace('/signupFlow/explainerDonate')}
        >
          <Image
            source={require('../../assets/icons/arrow-left.png')}
            style={{ width: 22, height: 22, tintColor: '#fff' }}
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Discounts Waiting For You</Text>
        <Text style={styles.headerSubtitle}>Favorite the stores you love</Text>

        {/* Saved-counter pill — always rendered so the layout doesn't shift
            when the first heart is added; bounces on every favorite change. */}
        <Animated.View
          style={[styles.savedPill, { transform: [{ scale: pillScale }] }]}
        >
          <AntDesign name="heart" size={12} color="#fff" />
          <Text style={styles.savedPillText}>
            {favorites.size} saved{milestoneHit ? ' 🎉' : ''}
          </Text>
        </Animated.View>
      </LinearGradient>

      {/* Piggy floats on its own layer above the search card. */}
      <View style={styles.piggyOverlay} pointerEvents="none">
        <Animated.Image
          source={require('../../assets/images/piggy-peek.png')}
          style={[
            styles.headerPiggy,
            { transform: [{ scale: piggyBounce }] },
          ]}
          resizeMode="contain"
        />
      </View>

      {/* White header card with search + tag pills (mirror live page) */}
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <Image
            source={require('../../assets/icons/search-icon.png')}
            style={{ width: 18, height: 18, tintColor: '#6d6e72', marginRight: 8 }}
          />
          <TextInput
            placeholder="Search business"
            placeholderTextColor="#6d6e72"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AntDesign name="closecircle" size={16} color="#bbb" />
            </TouchableOpacity>
          )}
        </View>

        {Object.keys(categoryCounts).length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagsRow}
            contentContainerStyle={{ paddingRight: 8 }}
          >
            <TouchableOpacity
              style={[
                styles.tag,
                !filters.category && !filters.showFavorites && styles.tagActive,
              ]}
              onPress={() => updateFilters({ category: '', showFavorites: false })}
            >
              <Text
                style={[
                  styles.tagText,
                  !filters.category && !filters.showFavorites && styles.tagTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tag, filters.showFavorites && styles.tagActive]}
              onPress={() =>
                updateFilters({ showFavorites: !filters.showFavorites, category: '' })
              }
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Image
                  source={require('../../assets/icons/heart.png')}
                  style={{
                    width: 13,
                    height: 13,
                    tintColor: filters.showFavorites ? '#D0861F' : '#666',
                  }}
                />
                <Text
                  style={[styles.tagText, filters.showFavorites && styles.tagTextActive]}
                >
                  Favorites
                </Text>
              </View>
            </TouchableOpacity>
            {Object.entries(categoryCounts).map(([cat]) => (
              <TouchableOpacity
                key={cat}
                style={[styles.tag, filters.category === cat && styles.tagActive]}
                onPress={() =>
                  updateFilters({
                    category: filters.category === cat ? '' : cat,
                    showFavorites: false,
                  })
                }
              >
                <Text
                  style={[
                    styles.tagText,
                    filters.category === cat && styles.tagTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Content list */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sectionTitle}>Discounts Near You</Text>
            <View style={styles.sectionSubtitleRow}>
              <Feather name="map-pin" size={13} color="#8E9BAE" />
              <Text style={styles.sectionSubtitle}>
                {locationDisplay} ({visible.length})
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/discounts/filter')}
            style={[styles.filterBtn, hasActiveFilters() && styles.filterBtnActive]}
          >
            <Feather
              name="filter"
              size={15}
              color={hasActiveFilters() ? '#fff' : '#DB8633'}
            />
            <Text
              style={[
                styles.filterBtnText,
                hasActiveFilters() && styles.filterBtnTextActive,
              ]}
            >
              Filter
            </Text>
          </TouchableOpacity>
        </View>

        {loading
          ? [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
          : visible.length === 0
            ? <EmptyState filters={filters} />
            : visible.map((v) => (
                <LockedVoucherCard
                  key={v.id}
                  vendor={v}
                  isFavorited={favorites.has(String(v.id))}
                  onToggleFavorite={(tapX, tapY) =>
                    toggleFavorite(v.id, tapX, tapY)
                  }
                />
              ))}
      </ScrollView>

      {/* Flying coins — absolutely positioned, each arcs from the tap point
          to the piggy's approximate center. pointerEvents=none so they never
          intercept further taps mid-flight. */}
      {flyingCoins.map((c) => {
        const dx = PIGGY_TARGET_X - c.fromX;
        const dy = PIGGY_TARGET_Y - c.fromY;
        const translateX = c.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, dx],
        });
        // Arc the Y so it lifts a touch before falling into the piggy.
        const translateY = c.anim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, dy - 40, dy],
        });
        const scale = c.anim.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [0.6, 1.05, 0.7],
        });
        const opacity = c.anim.interpolate({
          inputRange: [0, 0.85, 1],
          outputRange: [1, 1, 0],
        });
        return (
          <Animated.View
            key={c.id}
            pointerEvents="none"
            style={[
              styles.flyingCoin,
              {
                left: c.fromX - 14,
                top: c.fromY - 14,
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          >
            <View style={styles.coinCircle}>
              <Text style={styles.coinDollar}>$</Text>
            </View>
          </Animated.View>
        );
      })}

      {/* Sticky CTA — copy upgrades once they've favorited 3+ vendors */}
      <View style={styles.stickyCTA}>
        <TouchableOpacity
          style={[styles.continueButton, milestoneHit && styles.continueButtonHot]}
          onPress={handleContinue}
          activeOpacity={0.9}
        >
          <Text style={styles.continueButtonText}>
            {milestoneHit
              ? '🔥 Pick a cause to save them →'
              : 'Pick Your Cause →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LockedVoucherCard({ vendor, isFavorited, onToggleFavorite }) {
  const logo =
    vendor.logoUrl || vendor.logo_url || vendor.imageUrl || vendor.image_url || null;
  const discountText = vendor._discountText || 'Discounts available';
  const category = vendor.category || (vendor.tags && vendor.tags[0]) || null;

  return (
    <View style={voucherStyles.cardWrapper}>
      <View style={voucherStyles.card}>
        {/* Left Section */}
        <View style={voucherStyles.leftSide}>
          <View style={voucherStyles.logoWrap}>
            <Image
              source={
                logo
                  ? { uri: logo }
                  : require('../../assets/images/logos/starbucks.png')
              }
              style={voucherStyles.logo}
              defaultSource={require('../../assets/images/logos/starbucks.png')}
            />
            {/* Translucent gray veil over the logo — fades the artwork so it
                reads as "locked" while the rest of the card stays normal. */}
            <View pointerEvents="none" style={voucherStyles.logoGrayVeil} />
            {/* Lock badge anchored to the logo */}
            <View style={voucherStyles.lockBadge}>
              <Feather name="lock" size={10} color="#DB8633" />
            </View>
          </View>
          <View style={voucherStyles.textContainer}>
            <Text style={voucherStyles.brand} numberOfLines={1}>
              {vendor.name}
            </Text>
            {category ? (
              <Text style={voucherStyles.categoryLabel} numberOfLines={1}>
                {category}
              </Text>
            ) : null}
            <Text style={voucherStyles.discountBadge}>{discountText}</Text>
          </View>
        </View>

        {/* Notched divider */}
        <View style={voucherStyles.dividerContainer}>
          <View style={voucherStyles.notchTop} />
          <View style={voucherStyles.dottedLine} />
          <View style={voucherStyles.notchBottom} />
        </View>

        {/* Right Section — heart only */}
        <View style={voucherStyles.rightSide}>
          <TouchableOpacity
            onPress={(e) => {
              const { pageX, pageY } = e.nativeEvent;
              onToggleFavorite(pageX, pageY);
            }}
            hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}
          >
            {isFavorited ? (
              <AntDesign name="heart" size={22} color="#DB8633" />
            ) : (
              <Image
                source={require('../../assets/icons/heart.png')}
                style={{ width: 22, height: 22, tintColor: '#DB8633' }}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={voucherStyles.cardWrapper}>
      <View style={[voucherStyles.card, { opacity: 0.5 }]}>
        <View style={voucherStyles.leftSide}>
          <View style={[voucherStyles.logo, { backgroundColor: '#E5E7EB' }]} />
          <View style={voucherStyles.textContainer}>
            <View style={voucherStyles.skeletonLine} />
            <View
              style={[voucherStyles.skeletonLine, { width: '50%', marginTop: 6 }]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function EmptyState({ filters }) {
  const isFavoritesEmpty = filters?.showFavorites;
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>
        {isFavoritesEmpty ? 'No favorites yet' : 'No discounts match'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {isFavoritesEmpty
          ? 'Tap the heart on any card to save your favorite stores. They\'ll be waiting for you after signup.'
          : 'Try clearing your filters to see more options.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ─── Brand header (mirrors miniBrandHeader from live page, taller) ───
  brandHeader: {
    paddingTop: 44,
    paddingBottom: 80,
    paddingHorizontal: 24,
    marginBottom: -22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 18,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 18,
    padding: 6,
  },
  // Wrapper sits over the brand header; alignItems centers the piggy
  // horizontally, and the `top` value tunes how much of the piggy hangs over
  // the search card. Tweak `top` if the empirical placement looks off.
  piggyOverlay: {
    position: 'absolute',
    top: 101,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
    elevation: 8,
  },
  headerPiggy: {
    width: 130,
    height: 100,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  headerSubtitle: {
    marginTop: 4,
    marginBottom: 0,
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    fontWeight: '500',
  },

  // ─── Header card (copied from live discounts page) ───
  header: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 15,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    marginBottom: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
    height: 46,
    lineHeight: 20,
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  tagsRow: {
    marginBottom: 4,
    marginTop: 4,
  },
  tag: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f2f2f2',
    borderRadius: 20,
    marginRight: 10,
  },
  tagActive: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
    borderWidth: 1,
  },
  tagText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tagTextActive: {
    fontSize: 14,
    color: '#D0861F',
    fontWeight: '600',
  },

  // ─── List ───
  listContainer: {
    flex: 1,
    backgroundColor: '#f5f5fa',
  },
  listContent: {
    paddingBottom: 130,
  },
  sectionHeader: {
    paddingHorizontal: 25,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  sectionSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DB8633',
    backgroundColor: '#FFF5EB',
  },
  filterBtnActive: {
    backgroundColor: '#DB8633',
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB8633',
  },
  filterBtnTextActive: {
    color: '#fff',
  },

  // ─── Empty state ───
  emptyState: {
    paddingHorizontal: 32,
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ─── Sticky CTA ───
  stickyCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 5,
  },
  continueButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  // Reward state — slightly hotter shadow when the milestone is hit.
  continueButtonHot: {
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },

  // ─── Saved-counter pill (lives in the hero) ───
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(219, 134, 51, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 14,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  savedPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ─── Flying coin (heart → piggy) ───
  flyingCoin: {
    position: 'absolute',
    zIndex: 60,
    elevation: 12,
  },
  coinCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F4B53C',
    borderWidth: 2,
    borderColor: '#D89322',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  coinDollar: {
    color: '#7C4A0E',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
});

// Voucher card styles — copied from components/VoucherCard.js so the visual
// matches the live page exactly. Extra: logoWrap + lockBadge + lockedOverlay.
const CARD_HEIGHT = 110;
const NOTCH_SIZE = 12;
const voucherStyles = StyleSheet.create({
  cardWrapper: {
    marginVertical: 10,
    marginHorizontal: 20,
    position: 'relative',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    height: CARD_HEIGHT,
    overflow: 'hidden',
  },
  leftSide: {
    flex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  logoWrap: {
    position: 'relative',
    marginRight: 12,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    resizeMode: 'contain',
    backgroundColor: '#F8FAFC',
  },
  lockBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFE6CC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  textContainer: {
    flex: 1,
  },
  brand: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C4F7D',
  },
  categoryLabel: {
    fontSize: 11,
    color: '#8E9BAE',
    textTransform: 'capitalize',
    marginTop: 2,
    marginBottom: 2,
  },
  discountBadge: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  dividerContainer: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notchTop: {
    width: NOTCH_SIZE * 2,
    height: NOTCH_SIZE,
    borderBottomLeftRadius: NOTCH_SIZE,
    borderBottomRightRadius: NOTCH_SIZE,
    backgroundColor: '#f5f5fa',
    alignSelf: 'center',
    marginTop: -NOTCH_SIZE / 2,
  },
  notchBottom: {
    width: NOTCH_SIZE * 2,
    height: NOTCH_SIZE,
    borderTopLeftRadius: NOTCH_SIZE,
    borderTopRightRadius: NOTCH_SIZE,
    backgroundColor: '#f5f5fa',
    alignSelf: 'center',
    marginBottom: -NOTCH_SIZE / 2,
  },
  dottedLine: {
    flex: 1,
    borderLeftWidth: 1,
    borderStyle: 'dotted',
    borderColor: '#ccc',
    width: 1,
    marginVertical: 4,
  },
  rightSide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF7EB',
  },
  // Translucent gray veil sits over the logo image. pointerEvents=none on
  // the View keeps it inert; borderRadius matches the logo to stay circular.
  logoGrayVeil: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: 'rgba(243, 244, 246, 0.55)',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    width: '70%',
  },
});
