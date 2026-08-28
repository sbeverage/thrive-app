// Full Airbnb-style Discounts Screen Implementation with improved UX flow
import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Dimensions,
} from 'react-native';


import { Feather, AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter, useFocusEffect } from 'expo-router';
import { readSignupFlowPending } from '../../../utils/signupFlowCheckpoint';
import { LinearGradient } from 'expo-linear-gradient';
import VoucherCard from '../../../../components/VoucherCard';
import SuggestPrompt from '../../../../components/SuggestPrompt';
import DiscountsLockOverlay from '../../../../components/DiscountsLockOverlay';
import useSubscriptionGate from '../../../../hooks/useSubscriptionGate';
import API from '../../../lib/api';
import MapView, { Marker } from 'react-native-maps';
import { getCurrentLocation, getDefaultRegion, calculateDistance } from '../../../utils/locationService';
import { useLocation } from '../../../context/LocationContext';
import { useDiscount } from '../../../context/DiscountContext';
import { useUser } from '../../../context/UserContext';
import { useDiscountFilter } from '../../../context/DiscountFilterContext';
import { IMAGE_ASSETS } from '../../../utils/assetConstants';
import { beneficiaryLocationMatches } from '../../../utils/beneficiaryLocationMatch';
import { clusterVendors, isCoLocated, regionForCluster, sharedAddressLabel } from '../../../utils/mapClustering';

// Note: Vendors should have logoUrl from the admin panel
// If no logoUrl is provided, the component will handle it gracefully

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function DiscountsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [locationDisplay, setLocationDisplay] = useState('Detecting location...');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapRegion, setMapRegion] = useState(getDefaultRegion());
  // Vendors sharing one street address, shown as a list when their pin is
  // tapped — zooming can never separate them, so the map hands off to a list
  // rather than pretending they sit in different places.
  const [addressGroup, setAddressGroup] = useState(null);
  const { user } = useUser();

  // Discounts require a live monthly donation. Only checked for signed-in
  // donors — logged-out users are redirected off this tab anyway.
  const { isActive: subscriptionActive, status: subscriptionStatus } =
    useSubscriptionGate({ enabled: !!user?.isLoggedIn, user });
  // Explicitly `=== false`: the hook reports null while loading or after a
  // failed check, and flashing a lock at a paying donor is worse than a brief
  // unlocked state the server would still block.
  const discountsLocked = subscriptionActive === false;

  const mapRef = useRef(null);
  // Marker taps bubble up to the MapView's onPress in react-native-maps 1.29
  // (its press event is a BubblingEventHandler), so a tap on a pin would clear
  // the very state it just set. Record marker taps and let the map ignore them.
  const markerPressRef = useRef(0);
  // Captured once. Binding initialRegion to mapRegion — which the map itself
  // updates via onRegionChangeComplete — made the map re-apply the prop after
  // every settle and zoom in again, halving the delta each pass until it was
  // buried at street level with every vendor off screen.
  const initialRegionRef = useRef(getDefaultRegion());
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const pending = await readSignupFlowPending();
          if (cancelled || !pending?.route) return;
          router.replace({ pathname: pending.route, params: pending.params || {} });
        } catch {
          /* non-fatal */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [router]),
  );

  // Location context
  const { location: userLocation, locationAddress, locationPermission, checkLocationPermission, refreshLocation, isLoadingLocation } = useLocation();

  // Filter context
  const { filters, updateFilters, hasActiveFilters } = useDiscountFilter();
  const [locationSearch, setLocationSearch] = useState(''); // Location filter from main screen (tap location row to search)
  const [favorites, setFavorites] = useState(new Set());
  const [geocodedCoords, setGeocodedCoords] = useState({});

  const DEFAULT_LAT = 34.0754;
  const DEFAULT_LNG = -84.2941;
  const GEOCODE_CACHE_KEY = '@thrive_geocache';

  // Sync location search with filter screen
  useEffect(() => {
    if (filters.location && filters.location !== locationSearch) {
      setLocationSearch(filters.location);
    }
  }, [filters.location]);

  // Load favorites — AsyncStorage first for instant UI, then reconcile with
  // the server so they sync across devices. Server is authoritative for
  // logged-in users; logged-out users fall back to local-only.
  //
  // Runs on every focus (not just mount) so a heart tapped on the vendor
  // detail page shows up here as soon as the donor navigates back.
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('@thrive_favorites').then(stored => {
        if (stored) setFavorites(new Set(JSON.parse(stored)));
      });
      API.getMyFavoriteVendors()
        .then((data) => {
          const ids = new Set((data?.vendors || []).map(v => String(v.id)));
          if (ids.size > 0) {
            setFavorites(ids);
            AsyncStorage.setItem('@thrive_favorites', JSON.stringify([...ids]));
          }
        })
        .catch(() => {}); // not logged in → keep AsyncStorage state
    }, [])
  );

  // Geocode the "search near a location" text. Radius used to be measured
  // from the device's GPS even when a location was typed, so
  // "Roswell, GA + 5 miles" actually meant "city name is Roswell AND within
  // 5 miles of wherever the phone is" — never "near Roswell".
  const [filterLocationCoords, setFilterLocationCoords] = useState(null);

  useEffect(() => {
    const loc = (filters.location || '').trim();
    if (!loc) {
      setFilterLocationCoords(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await Location.geocodeAsync(loc);
        if (cancelled) return;
        setFilterLocationCoords(
          results?.length > 0
            ? { latitude: results[0].latitude, longitude: results[0].longitude }
            : null,
        );
      } catch (_) {
        if (!cancelled) setFilterLocationCoords(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.location]);

  // Geocode vendor addresses that are missing real coordinates
  useEffect(() => {
    if (!vendors || vendors.length === 0) return;

    const runGeocode = async () => {
      const cached = await AsyncStorage.getItem(GEOCODE_CACHE_KEY);
      const cache = cached ? JSON.parse(cached) : {};
      setGeocodedCoords(cache);

      const needsGeocode = vendors.filter(v => {
        if (cache[String(v.id)]) return false;
        const lat = Number(v.address?.latitude);
        const lng = Number(v.address?.longitude);
        return !lat || !lng || (lat === DEFAULT_LAT && lng === DEFAULT_LNG);
      });

      if (needsGeocode.length === 0) return;

      const updated = { ...cache };
      let changed = false;

      for (const vendor of needsGeocode) {
        const addr = vendor.address;
        if (!addr) continue;
        const parts = [addr.street, addr.city, addr.state, addr.zipCode].filter(Boolean);
        if (parts.length === 0) continue;

        try {
          const results = await Location.geocodeAsync(parts.join(', '));
          if (results?.length > 0) {
            updated[String(vendor.id)] = {
              latitude: results[0].latitude,
              longitude: results[0].longitude,
            };
            changed = true;
          }
        } catch (_) {}

        // Brief pause to avoid rate limiting Apple Maps geocoder
        await new Promise(r => setTimeout(r, 250));
      }

      if (changed) {
        setGeocodedCoords(updated);
        await AsyncStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(updated));
      }
    };

    runGeocode();
  }, [vendors]);

  const toggleFavorite = (vendorId) => {
    setFavorites(prev => {
      const next = new Set(prev);
      const key = String(vendorId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      AsyncStorage.setItem('@thrive_favorites', JSON.stringify([...next]));
      return next;
    });
    // Mirror to server so the vendor portal can track real "saved by donors"
    // counts. Logged-out users get a silent 401 — local state still updated.
    API.toggleVendorFavorite(vendorId);
  };


  // Discount context
  const { discounts, vendors, isLoading: isLoadingDiscounts, loadDiscounts } = useDiscount();
  
  
  // Debug: Log vendors and discounts when they change
  useEffect(() => {
    console.log('📊 Vendors loaded:', vendors?.length || 0);
    console.log('📊 Discounts loaded:', discounts?.length || 0);
    if (vendors?.length > 0) {
      console.log('📊 Vendors from API:', vendors.slice(0, 3).map(v => ({ id: v.id, name: v.name })));
    }
    if (discounts?.length > 0) {
      console.log('📊 Discounts from API:', discounts.slice(0, 3).map(d => ({ id: d.id, vendorId: d.vendorId, title: d.title })));
    }
  }, [vendors, discounts]);

  // Note: keep discounts unfiltered so counts stay consistent with vendors list

  // Extract unique categories/tags from vendors dynamically
  const availableCategories = useMemo(() => {
    if (!vendors || vendors.length === 0) return ['All'];
    
    // Get all unique categories from vendors
    const categories = new Set();
    vendors.forEach(vendor => {
      // Support both category field and tags array
      if (vendor.category) {
        categories.add(vendor.category);
      }
      if (vendor.tags && Array.isArray(vendor.tags)) {
        vendor.tags.forEach(tag => {
          if (tag && typeof tag === 'string') {
            categories.add(tag);
          }
        });
      }
    });
    
    // Order by preferred sequence, then alphabetical for any extras
    const preferred = ['restaurant', 'retail', 'coworking'];
    const all = Array.from(categories);
    const ordered = [
      ...preferred.filter(c => all.some(a => a.toLowerCase() === c)),
      ...all.filter(a => !preferred.includes(a.toLowerCase())).sort(),
    ];
    return ['All', ...ordered];
  }, [vendors]);

  // Transform vendors data to match the expected format
  // Use useMemo to ensure vendors and discounts are properly matched
  const transformedVendors = useMemo(() => {
    if (!vendors || vendors.length === 0) {
      console.log('⚠️ No vendors loaded yet');
      return [];
    }
    
    return vendors.map(vendor => {
      // Find discounts for this vendor (match by vendorId)
      const vendorDiscounts = discounts.filter(d => {
        const discountVendorId = d.vendorId?.toString() || d.vendorId;
        const vendorId = vendor.id?.toString() || vendor.id;
        return discountVendorId === vendorId;
      });
      
      // Handle logo - use logoUrl from admin panel if available
      let logoSource = null;
      if (vendor.logoUrl && typeof vendor.logoUrl === 'string' && vendor.logoUrl.trim() !== '') {
        // Check if it's a valid HTTP URL
        if (vendor.logoUrl.startsWith('http://') || vendor.logoUrl.startsWith('https://')) {
          logoSource = vendor.logoUrl;
        } else {
          console.warn(`⚠️ Invalid logoUrl for ${vendor.name}:`, vendor.logoUrl);
        }
      } else if (vendor.imageUrl && typeof vendor.imageUrl === 'string' && vendor.imageUrl.trim() !== '') {
        // Fallback to imageUrl if it's a valid HTTP URL
        if (vendor.imageUrl.startsWith('http://') || vendor.imageUrl.startsWith('https://')) {
          logoSource = vendor.imageUrl;
        } else {
          console.warn(`⚠️ Invalid imageUrl for ${vendor.name}:`, vendor.imageUrl);
        }
      }
      // If no valid logoUrl/imageUrl, logoSource will be null and VoucherCard will use fallback
      
      // Resolve coordinates: prefer stored lat/lng, fall back to geocoded cache, then default
      const geo = geocodedCoords[String(vendor.id)];
      const storedLat = Number(vendor.address?.latitude);
      const storedLng = Number(vendor.address?.longitude);
      const hasRealStored = storedLat && storedLng &&
        !(storedLat === DEFAULT_LAT && storedLng === DEFAULT_LNG);
      const latitude = hasRealStored ? storedLat : (geo?.latitude || DEFAULT_LAT);
      const longitude = hasRealStored ? storedLng : (geo?.longitude || DEFAULT_LNG);

      return {
        id: vendor.id,
        brandName: vendor.name,
        category: vendor.category,
        tags: vendor.tags || [],
        imageUrl: logoSource,
        discountText: `${vendorDiscounts.length} discount${vendorDiscounts.length !== 1 ? 's' : ''} available`,
        latitude,
        longitude,
        location: `${vendor.address?.city || 'Alpharetta'}, ${vendor.address?.state || 'GA'}`,
        vendor: vendor,
        discountId: vendorDiscounts.length > 0 ? vendorDiscounts[0].id : null
      };
    });
  }, [vendors, discounts, geocodedCoords]);

  // Map filter type options to discount type values
  const typeFilterMap = {
    'Percentage': 'percentage',
    'Fixed Amount': 'fixed',
    'Buy 1 Get 1': 'bogo',
    'Buy One Get One': 'bogo',
    'Free Item': 'free',
    'Free': 'free',
  };

  const filteredVendors = transformedVendors.filter(v => {
    const matchesSearch = v.brandName.toLowerCase().includes(searchQuery.toLowerCase());

    // A typed location plus a radius is a genuine proximity search, measured
    // from that location. Without a radius, fall back to matching the city
    // string so behaviour is unchanged for people who only pick a place.
    const locFilter = (filters.location && filters.location.trim()) || '';
    const proximityActive = !!(filters.radius && filterLocationCoords);

    let matchesLocation = true;
    if (locFilter && !proximityActive) {
      matchesLocation = beneficiaryLocationMatches(locFilter, v.location || '');
    }

    // Filter by radius - parse "5 miles" -> 5. Origin is the searched
    // location when we could geocode one, otherwise the device position.
    let matchesRadius = true;
    const radiusOrigin = filterLocationCoords || userLocation;
    if (filters.radius && radiusOrigin) {
      const radiusNum = parseFloat(String(filters.radius).replace(/[^\d.]/g, '')) || 0;
      if (radiusNum > 0 && v.latitude && v.longitude) {
        const dist = calculateDistance(
          radiusOrigin.latitude, radiusOrigin.longitude,
          v.latitude, v.longitude
        );
        matchesRadius = dist !== null && dist <= radiusNum;
      }
    }

    // Filter by discount type
    let matchesType = true;
    if (filters.type && typeFilterMap[filters.type]) {
      const targetType = typeFilterMap[filters.type];
      const vendorDiscounts = discounts.filter(d =>
        (d.vendorId?.toString() || d.vendorId) === (v.id?.toString() || v.id)
      );
      matchesType = vendorDiscounts.some(d => {
        const dt = (d.discountType || d.discount_type || '').toLowerCase();
        return dt === targetType;
      });
    }

    // Filter by category (from filter screen only)
    let matchesCategory = true;
    if (filters.category) {
      const cat = filters.category.toLowerCase();
      matchesCategory =
        (v.category && v.category.toLowerCase() === cat) ||
        (v.tags && v.tags.some(t => t && t.toLowerCase() === cat)) ||
        (v.vendor?.category && v.vendor.category.toLowerCase() === cat) ||
        (v.vendor?.tags && v.vendor.tags.some(t => t && t.toLowerCase() === cat));
    }

    // Availability filter
    let matchesAvailability = true;
    if (filters.availability) {
      const avMap = { 'In-Store': 'in-store', 'Online': 'online', 'Both': 'both' };
      const target = avMap[filters.availability] || filters.availability.toLowerCase();
      const vendorDiscounts = discounts.filter(d =>
        (d.vendorId?.toString() || d.vendorId) === (v.id?.toString() || v.id)
      );
      matchesAvailability = vendorDiscounts.some(d => {
        const av = (d.availability || '').toLowerCase();
        if (target === 'both') return av === 'both' || av === 'in-store' || av === 'online';
        return av === target || av === 'both' || av === '';
      });
    }

    // showFavorites filter from filter screen
    const matchesFavoritesFilter = !filters.showFavorites || favorites.has(String(v.id));

    return matchesSearch && matchesLocation && matchesRadius && matchesType && matchesCategory && matchesAvailability && matchesFavoritesFilter;
  });

  // Count vendors per category for badge display (scope + search applied, category not applied)
  const categoryCounts = useMemo(() => {
    const counts = {};
    transformedVendors.forEach(v => {
      const cats = new Set([v.category, ...(v.tags || [])].filter(Boolean));
      cats.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    });
    return counts;
  }, [transformedVendors]);

  const highlightedVendors = filteredVendors.slice(0, 2);
  const remainingVendors = filteredVendors.slice(2);
  // With the keyboard up the header is nearly all the donor can see, so it
  // doubles as the empty-state message rather than a tall block underneath.
  const hasNoVendorResults = filteredVendors.length === 0;
  const discountsSectionTitle = hasNoVendorResults
    ? 'No Results Found'
    : filters.showFavorites
      ? 'All Favorites'
      : filters.category
        ? `All ${filters.category}`
        : 'All Discounts';
  const displayedVendorCount = filteredVendors.length > 50 ? "50+" : String(filteredVendors.length);

  // Group vendors for the current zoom level. Recomputed as the region
  // changes so pins merge when they would overlap and split as you zoom in.
  const mapClusters = useMemo(
    () => clusterVendors(filteredVendors, mapRegion, SCREEN_WIDTH),
    [filteredVendors, mapRegion],
  );

  const mapMarkers = useMemo(() => {
    const entries = [];
    mapClusters.forEach((cluster) => {
      if (cluster.count === 1) {
        entries.push({
          type: 'vendor',
          id: cluster.id,
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          vendor: cluster.vendors[0],
        });
        return;
      }
      entries.push({
        type: 'cluster',
        id: cluster.id,
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        cluster,
      });
    });
    return entries;
  }, [mapClusters]);

  const handleMarkerPress = (vendor) => {
    console.log('Marker pressed:', vendor);
    setSelectedMarker(vendor);
  };

  // The map reports its own region back via onRegionChangeComplete so that
  // clustering can react to zoom, which means `region` can no longer be a
  // controlled prop. Programmatic moves go through the ref instead.
  const moveMapTo = (region) => {
    setMapRegion(region);
    mapRef.current?.animateToRegion(region, 400);
  };

  // Only promote a user gesture into a re-cluster when the view actually
  // changed enough to matter: half a zoom step, or a third of a screen pan.
  // onRegionChangeComplete only fires once a gesture settles, so clustering
  // can follow the camera directly: groups re-split on every pinch, the way
  // Apple Maps behaves.
  const handleRegionChangeComplete = (region) => {
    setMapRegion(region);
  };

  const updateMapRegion = async () => {
    const userLocation = await getCurrentLocation();
    if (userLocation) {
      moveMapTo({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      });
    }
  };

  const handleClusterPress = (cluster) => {
    markerPressRef.current = Date.now();
    setSelectedMarker(null);
    // One address, several businesses (a coworking building, a food hall):
    // no zoom level will ever separate these, so list them instead.
    if (isCoLocated(cluster)) {
      setAddressGroup(cluster);
      return;
    }
    setAddressGroup(null);
    const next = regionForCluster(cluster, mapRegion);
    if (next) moveMapTo(next);
  };

  const updateUserLocation = async () => {
    if (locationPermission === 'granted') {
      setLocationSearch(''); // Clear location search when refreshing to current location
      updateFilters({ location: '' });
      await refreshLocation();
    } else {
      checkLocationPermission();
    }
  };

  // Helper function to get friendly location name from coordinates
  const getFriendlyLocationName = (latitude, longitude) => {
    // Alpharetta area (roughly)
    if (latitude >= 34.05 && latitude <= 34.10 && longitude >= -84.35 && longitude <= -84.25) {
      return 'Alpharetta, GA';
    }
    // Woodstock area (roughly)
    else if (latitude >= 34.09 && latitude <= 34.12 && longitude >= -84.52 && longitude <= -84.50) {
      return 'Woodstock, GA';
    }
    // Atlanta area (roughly)
    else if (latitude >= 33.70 && latitude <= 33.80 && longitude >= -84.40 && longitude <= -84.35) {
      return 'Atlanta, GA';
    }
    // General Atlanta metro area
    else if (latitude >= 33.50 && latitude <= 34.50 && longitude >= -84.80 && longitude <= -84.00) {
      return 'Atlanta Metro, GA';
    }
    else {
      return 'Current Location';
    }
  };

  useEffect(() => {
    if (showMap) {
      updateMapRegion();
      console.log('Map shown, vendors:', vendors);
      console.log('Map region:', mapRegion);
    }
  }, [showMap]);

  // Auto-detect user location when component mounts
  useEffect(() => {
    checkLocationPermission();
  }, []);

  // Update location display when location context changes
  useEffect(() => {
    if (userLocation && locationPermission === 'granted') {
      let display;
      // Use locationAddress from context if available (more accurate)
      if (locationAddress?.city && locationAddress?.state) {
        display = `${locationAddress.city}, ${locationAddress.state}`;
      } else {
        // Fallback to coordinates-based lookup
        display = getFriendlyLocationName(userLocation.latitude, userLocation.longitude);
      }
      setLocationDisplay(display);

      // Show detected city in the input field (display only - don't apply as filter)
      setLocationSearch(prev => {
        if (!prev) return display;
        return prev;
      });

      // Update map region
      moveMapTo({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      });
    } else if (locationPermission === 'denied') {
      setLocationDisplay('Location not available');
    } else if (locationPermission === null) {
      setLocationDisplay('Detecting location...');
    }
  }, [userLocation, locationAddress, locationPermission]);

  const handleViewDetails = (vendor) => {
    setSelectedMarker(null);
    router.push({
      pathname: '/(tabs)/discounts/[id]',
      params: { id: vendor.id.toString() },
    });
  };

  const handleGetDirections = (vendor) => {
    // Open maps app with directions
    const url = `https://maps.apple.com/?daddr=${vendor.latitude},${vendor.longitude}`;
    Linking.openURL(url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <LinearGradient
        colors={['#2C3E50', '#4CA1AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.miniBrandHeader}
      >
        <Image
          source={{ uri: IMAGE_ASSETS.INITIATIVE_LOGO_NO_WEB_WHITE }}
          style={styles.miniBrandLogo}
          resizeMode="contain"
        />
      </LinearGradient>

      {/* Header with Search and Toggle */}
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <Image 
            source={require('../../../../assets/icons/search-icon.png')} 
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
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <AntDesign name="closecircle" size={16} color="#bbb" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Tag Pills */}
        {Object.keys(categoryCounts).length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagsRow}
            contentContainerStyle={{ paddingRight: 8 }}
          >
            <TouchableOpacity
              style={[styles.tag, !filters.category && !filters.showFavorites && styles.tagActive]}
              onPress={() => updateFilters({ category: '', showFavorites: false })}
            >
              <Text style={[styles.tagText, !filters.category && !filters.showFavorites && styles.tagTextActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tag, filters.showFavorites && styles.tagActive]}
              onPress={() => updateFilters({ showFavorites: !filters.showFavorites, category: '' })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Image
                  source={require('../../../../assets/icons/heart.png')}
                  style={{ width: 13, height: 13, tintColor: filters.showFavorites ? '#D0861F' : '#666' }}
                />
                <Text style={[styles.tagText, filters.showFavorites && styles.tagTextActive]}>Favorites</Text>
              </View>
            </TouchableOpacity>
            {Object.entries(categoryCounts).map(([cat]) => (
              <TouchableOpacity
                key={cat}
                style={[styles.tag, filters.category === cat && styles.tagActive]}
                onPress={() => updateFilters({ category: filters.category === cat ? '' : cat, showFavorites: false })}
              >
                <Text style={[styles.tagText, filters.category === cat && styles.tagTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* List/Map Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity 
            style={[styles.toggleBtn, !showMap && styles.toggleActive]} 
            onPress={() => setShowMap(false)}
          >
            {Platform.OS === 'web' ? (
              <Text style={{ fontSize: 16, color: !showMap ? '#fff' : '#666' }}>📋</Text>
            ) : (
              <Feather name="list" size={16} color={!showMap ? "#fff" : "#666"} />
            )}
            <Text style={[styles.toggleText, !showMap && styles.toggleTextActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, showMap && styles.toggleActive]} 
            onPress={() => setShowMap(true)}
          >
            {Platform.OS === 'web' ? (
              <Text style={{ fontSize: 16, color: showMap ? '#fff' : '#666' }}>🗺️</Text>
            ) : (
              <Feather name="map" size="16" color={showMap ? "#fff" : "#666"} />
            )}
            <Text style={[styles.toggleText, showMap && styles.toggleTextActive]}>Map</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {/* Dimmed and inert while the donor has no live monthly donation.
            The server already refuses redemption with a 402, so locking
            here just moves the answer forward instead of letting someone
            browse into a wall. */}
        <View
          style={[styles.contentInner, discountsLocked && styles.contentLocked]}
          pointerEvents={discountsLocked ? 'none' : 'auto'}
        >
                  {showMap ? (
            <View style={styles.mapContainer}>
              {Platform.OS === 'web' ? (
                <View style={[StyleSheet.absoluteFill, styles.webMapFallback]}>
                  <Text style={styles.webMapText}>Map view is not available on web</Text>
                  <Text style={styles.webMapSubtext}>Please use the mobile app for full map functionality</Text>
                  <TouchableOpacity 
                    style={styles.webMapButton}
                    onPress={() => setShowMap(false)}
                  >
                    <Text style={styles.webMapButtonText}>Switch to List View</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <MapView
                  ref={mapRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={initialRegionRef.current}
                  // Not a controlled `region`: the map has to tell us where it
                  // ended up after a pinch so clustering can re-run at the new
                  // zoom. Programmatic moves go through moveMapTo().
                  onRegionChangeComplete={handleRegionChangeComplete}
                  onPress={() => {
                    // Ignore the bubbled press that follows a marker tap.
                    if (Date.now() - markerPressRef.current < 400) return;
                    setSelectedMarker(null);
                    setAddressGroup(null);
                  }}
                  showsUserLocation={true}
                  showsMyLocationButton={true}
                  onMapReady={updateMapRegion}
                  showsBuildings={false}
                  showsTraffic={false}
                  showsIndoors={false}
                  // Apple + Google both overlay their own restaurant / retail
                  // labels on the map by default — those competed with THRIVE
                  // vendor pins so donors couldn't tell which businesses were
                  // actually on the platform. Suppress everything except the
                  // custom markers we add below.
                  // Renamed to the plural in react-native-maps 1.29.0, and it
                  // defaults to true — the singular spelling is silently ignored,
                  // which would bring Apple's own POI labels back.
                  showsPointsOfInterests={false}
                  showsCompass={false}
                  showsScale={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  {mapMarkers.map((entry) => {
                    if (entry.type === 'cluster') {
                      const { count } = entry.cluster;
                      return (
                        <Marker
                          key={`${entry.id}-${count}`}
                          coordinate={{ latitude: entry.latitude, longitude: entry.longitude }}
                          onPress={() => handleClusterPress(entry.cluster)}
                          tracksViewChanges={false}
                        >
                          <View
                            style={[
                              styles.clusterBubble,
                              count >= 10 && styles.clusterBubbleMedium,
                              count >= 25 && styles.clusterBubbleLarge,
                            ]}
                          >
                            <Text style={styles.clusterCount}>{count}</Text>
                          </View>
                        </Marker>
                      );
                    }

                    const isSelected = selectedMarker?.id === entry.vendor.id;
                    return (
                      <Marker
                        // Key must stay stable across selection: remounting
                        // markers mutates AIRMap's subview array and is what
                        // crashed insertReactSubview:atIndex:. The selected pin
                        // re-snapshots via tracksViewChanges instead.
                        key={entry.id}
                        coordinate={{ latitude: entry.latitude, longitude: entry.longitude }}
                        onPress={() => {
                          markerPressRef.current = Date.now();
                          setAddressGroup(null);
                          setSelectedMarker(entry.vendor);
                        }}
                        tracksViewChanges={isSelected}
                      >
                        <View style={styles.pinContainer}>
                          <View style={[styles.pinBubble, isSelected && styles.pinBubbleSelected]}>
                            {entry.vendor.imageUrl ? (
                              <Image
                                source={{ uri: entry.vendor.imageUrl }}
                                style={styles.pinLogo}
                                resizeMode="cover"
                              />
                            ) : (
                              <Feather name="tag" size={15} color={isSelected ? '#fff' : '#DB8633'} />
                            )}
                          </View>
                          <View style={[styles.pinTail, isSelected && styles.pinTailSelected]} />
                        </View>
                      </Marker>
                    );
                  })}
                </MapView>
              )}
            
              {/* Floating Filter Button */}
              <TouchableOpacity
                style={[styles.mapFilterBtn, styles.mapFilterBtnActive]}
                onPress={() => router.push('/(tabs)/discounts/filter')}
              >
                <Feather name="filter" size={15} color="#fff" />
                <Text style={[styles.mapFilterBtnText, styles.mapFilterBtnTextActive]}>Filter</Text>
              </TouchableOpacity>

              {/* Several businesses at one street address */}
              {addressGroup && (
                <View style={styles.infoWindow}>
                  <View style={styles.addressGroupHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addressGroupTitle}>
                        {addressGroup.count} businesses here
                      </Text>
                      <Text style={styles.addressGroupSubtitle} numberOfLines={1}>
                        {sharedAddressLabel(addressGroup)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={() => setAddressGroup(null)}
                    >
                      {Platform.OS === 'web' ? (
                        <Text style={{ fontSize: 20, color: '#666' }}>✕</Text>
                      ) : (
                        <AntDesign name="close" size={20} color="#666" />
                      )}
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.addressGroupList} showsVerticalScrollIndicator={false}>
                    {addressGroup.vendors.map((v) => (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.addressGroupRow}
                        onPress={() => {
                          setAddressGroup(null);
                          handleViewDetails(v);
                        }}
                      >
                        {v.imageUrl ? (
                          <Image
                            source={{ uri: v.imageUrl }}
                            style={styles.addressGroupLogo}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.addressGroupLogo, styles.infoWindowLogoFallback]}>
                            <Feather name="tag" size={16} color="#21555b" />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.addressGroupName} numberOfLines={1}>
                            {v.brandName}
                          </Text>
                          <Text style={styles.addressGroupMeta} numberOfLines={1}>
                            {v.category ? `${v.category} · ` : ''}{v.discountText}
                          </Text>
                        </View>
                        <Feather name="chevron-right" size={18} color="#bbb" />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Custom Info Window */}
              {selectedMarker && (
                <View style={styles.infoWindow}>
                  <View style={styles.infoWindowHeader}>
                    {selectedMarker.imageUrl ? (
                      <Image source={{ uri: selectedMarker.imageUrl }} style={styles.infoWindowLogo} resizeMode="cover" />
                    ) : (
                      <View style={[styles.infoWindowLogo, styles.infoWindowLogoFallback]}>
                        <Feather name="tag" size={22} color="#21555b" />
                      </View>
                    )}
                    <View style={styles.infoWindowText}>
                      <Text style={styles.infoWindowTitle}>{selectedMarker.brandName}</Text>
                      <Text style={styles.infoWindowCategory}>{selectedMarker.category}</Text>
                      <Text style={styles.infoWindowLocation}>{selectedMarker.location}</Text>
                      <Text style={styles.infoWindowDiscounts}>{selectedMarker.discountText}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.closeButton}
                      onPress={() => setSelectedMarker(null)}
                    >
                      {Platform.OS === 'web' ? (
                        <Text style={{ fontSize: 20, color: '#666' }}>✕</Text>
                      ) : (
                        <AntDesign name="close" size={20} color="#666" />
                      )}
                    </TouchableOpacity>
                  </View>
                
                  <View style={styles.infoWindowActions}>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => handleViewDetails(selectedMarker)}
                    >
                      {Platform.OS === 'web' ? (
                        <Text style={{ fontSize: 16, color: '#fff', marginRight: 8 }}>ℹ️</Text>
                      ) : (
                        <Feather name="info" size={16} color="#fff" />
                      )}
                      <Text style={styles.actionButtonText}>View Details</Text>
                    </TouchableOpacity>
                  
                    <TouchableOpacity 
                      style={styles.actionButtonSecondary}
                      onPress={() => handleGetDirections(selectedMarker)}
                    >
                      {Platform.OS === 'web' ? (
                        <Text style={{ fontSize: 16, color: '#DB8633', marginRight: 8 }}>📍</Text>
                      ) : (
                        <Feather name="map-pin" size={16} color="#DB8633" />
                      )}
                      <Text style={styles.actionButtonTextSecondary}>Get Directions</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.listContainer}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              automaticallyAdjustKeyboardInsets={true}
              keyboardShouldPersistTaps="handled"
            >
              {filteredVendors.length > 0 ? (
                <View>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>{discountsSectionTitle}</Text>
                      <View style={styles.sectionSubtitleRow}>
                        <Feather name="map-pin" size={13} color="#8E9BAE" />
                        <Text style={styles.sectionSubtitle}>
                          {locationDisplay || "Current Location"} ({displayedVendorCount})
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push('/(tabs)/discounts/filter')}
                      style={[styles.filterBtn, hasActiveFilters() && styles.filterBtnActive]}
                    >
                      <Feather name="filter" size={15} color={hasActiveFilters() ? '#fff' : '#DB8633'} />
                      <Text style={[styles.filterBtnText, hasActiveFilters() && styles.filterBtnTextActive]}>Filter</Text>
                    </TouchableOpacity>
                  </View>
                  {filteredVendors.map(item => {
                    const vendorDiscount = discounts.find(d => {
                      const discountVendorId = d.vendorId?.toString() || d.vendorId;
                      const vendorId = item.id?.toString() || item.id;
                      return discountVendorId === vendorId;
                    });
                    return (
                      <VoucherCard
                        key={item.id}
                        brand={item.brandName}
                        logo={item.imageUrl}
                        discounts={item.discountText}
                        discountId={vendorDiscount?.id || item.discountId}
                        vendor={item.vendor}
                        vendorId={item.id}
                        category={item.category || (item.tags && item.tags[0]) || null}
                        isFavorited={favorites.has(String(item.id))}
                        onToggleFavorite={() => toggleFavorite(item.id)}
                      />
                    );
                  })}
                </View>
              ) : (
                <View>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>{discountsSectionTitle}</Text>
                      <View style={styles.sectionSubtitleRow}>
                        <Feather name="map-pin" size={13} color="#8E9BAE" />
                        <Text style={styles.sectionSubtitle}>
                          {locationDisplay || 'Current Location'} ({displayedVendorCount})
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push('/(tabs)/discounts/filter')}
                      style={[styles.filterBtn, hasActiveFilters() && styles.filterBtnActive]}
                    >
                      <Feather name="filter" size={15} color={hasActiveFilters() ? '#fff' : '#DB8633'} />
                      <Text style={[styles.filterBtnText, hasActiveFilters() && styles.filterBtnTextActive]}>Filter</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Heading lives in the section header above now — this keeps
                      just the one-line hint plus a compact request prompt. */}
                  <View style={styles.emptyStateCompact}>
                    {/* No hint line — the section header already says "No Results
                        Found", so a second sentence just pushed the card down. */}
                    <SuggestPrompt
                      type="vendor"
                      searchQuery={searchQuery}
                      onSubmit={({ name, website }) => API.submitVendorRequest({ name, website })}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </View>

        {discountsLocked && (
          <DiscountsLockOverlay
            status={subscriptionStatus}
            onChooseAmount={() => router.push('/(tabs)/menu/editDonationAmount')}
            onUpdatePayment={() => router.push('/(tabs)/menu/manageCards')}
          />
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  miniBrandHeader: {
    height: 96,
    paddingTop: 8,
    marginBottom: -22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBrandLogo: {
    width: 190,
    height: 60,
    opacity: 0.98,
    marginTop: -20,
  },
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
    marginBottom: 16,
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    marginBottom: 16,
    height: 48,
  },
  locationInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
  },
  locationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationText: {
    fontSize: 16,
    color: '#324E58',
    fontWeight: '500',
  },
  refreshLocationButton: {
    padding: 8,
    marginLeft: 8,
  },
  scopeRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  scopeBtn: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e1e1e5',
    backgroundColor: '#fff',
  },
  scopeBtnActive: {
    borderColor: '#DB8633',
    backgroundColor: '#FFF5EB',
  },
  scopeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  scopeTextActive: {
    color: '#DB8633',
  },
  tagsRow: {
    marginBottom: 10,
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
  clearFiltersContainer: {
    paddingBottom: 8,
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5EB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D0861F',
    alignSelf: 'flex-start',
  },
  clearFiltersText: {
    color: '#D0861F',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    padding: 4,
    marginTop: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: '#DB8633',
  },
  filterIconBtn: {
    marginLeft: 10,
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF5EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#DB8633',
  },
  filterIconBtnActive: {
    backgroundColor: '#DB8633',
  },
  toggleText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    flex: 1,
  },
  contentLocked: {
    opacity: 0.35,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#f5f5fa',
  },
  listContent: {
    paddingBottom: 80,
  },
  sectionHeader: {
    paddingHorizontal: 25,
    paddingTop: 20,
    paddingBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  sectionSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyStateCompact: {
    // Matches sectionHeader's inset so the hint and request card line up with
    // the heading above them instead of running to the screen edge.
    paddingHorizontal: 25,
    paddingTop: 4,
    paddingBottom: 2,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  requestSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 8,
    textAlign: 'center',
  },
  requestSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  successMessage: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0ea5e9',
  },
  successText: {
    fontSize: 14,
    color: '#0c4a6e',
    textAlign: 'center',
    fontWeight: '500',
  },
  requestForm: {
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e1e5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#324E58',
    backgroundColor: '#fff',
  },
  requestButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Info Window Styles
  infoWindow: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 9999,
  },
  infoWindowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoWindowLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  infoWindowText: {
    flex: 1,
  },
  infoWindowTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  infoWindowCategory: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  infoWindowLocation: {
    fontSize: 12,
    color: '#8E9BAE',
    marginBottom: 4,
  },
  infoWindowDiscounts: {
    fontSize: 13,
    color: '#DB8633',
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5fa',
  },
  infoWindowActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DB8633',
    gap: 8,
  },
  actionButtonTextSecondary: {
    color: '#DB8633',
    fontSize: 14,
    fontWeight: '600',
  },
  // Web fallback styles
  webMapFallback: {
    backgroundColor: '#f5f5fa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  webMapText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 8,
  },
  webMapSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  webMapButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  webMapButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addressGroupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  addressGroupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
  },
  addressGroupSubtitle: {
    fontSize: 13,
    color: '#5D6D7E',
    marginTop: 2,
  },
  addressGroupList: {
    maxHeight: 210,
  },
  addressGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8e8e8',
  },
  addressGroupLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f4f4f4',
  },
  addressGroupName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
  },
  addressGroupMeta: {
    fontSize: 12,
    color: '#993C1D',
    marginTop: 2,
  },
  // Cluster badge: deep navy, so a group reads as a group at a glance instead
  // of looking like one more orange vendor pin.
  clusterBubble: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: '#324E58',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  clusterBubbleMedium: {
    minWidth: 48,
    height: 48,
    borderRadius: 24,
  },
  clusterBubbleLarge: {
    minWidth: 56,
    height: 56,
    borderRadius: 28,
  },
  clusterCount: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Vendor pin: white fill so the logo stays legible, ringed in brand orange.
  // Deliberately has no name label — the old label made each marker 120px
  // wide, which guaranteed overlap for vendors on the same downtown block.
  // The name appears in the info window on tap instead.
  pinContainer: {
    alignItems: 'center',
  },
  pinBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#DB8633',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  pinBubbleSelected: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#DB8633',
    borderColor: '#fff',
    borderWidth: 3,
  },
  pinLogo: {
    width: '100%',
    height: '100%',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#DB8633',
    marginTop: -1,
  },
  pinTailSelected: {
    borderTopColor: '#fff',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
  },
  infoWindowLogoFallback: {
    backgroundColor: '#e8f0f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapFilterBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DB8633',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 100,
  },
  mapFilterBtnActive: {
    backgroundColor: '#DB8633',
    borderColor: '#DB8633',
  },
  mapFilterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB8633',
  },
  mapFilterBtnTextActive: {
    color: '#fff',
  },
});

function DiscountCard({ data, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={{
      flexDirection: 'row',
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 1,
    }}>
      <Image source={data.logo} style={{ width: 40, height: 40, marginRight: 16, borderRadius: 8 }} resizeMode="contain" />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#000' }}>{data.brand}</Text>
        <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Ends on {data.ends}</Text>
        <Text style={{ fontSize: 13, color: '#db8633', marginTop: 4, fontWeight: '500' }}>{data.offers} discounts available</Text>
      </View>
    </TouchableOpacity>
  );
}
