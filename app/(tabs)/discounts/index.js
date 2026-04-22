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
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';


import { Feather, AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter, useFocusEffect } from 'expo-router';
import VoucherCard from '../../../components/VoucherCard';
import SuggestCard from '../../../components/SuggestCard';
import API from '../../lib/api';
import MapView, { Marker } from 'react-native-maps';
import { getCurrentLocation, getDefaultRegion, calculateDistance } from '../../utils/locationService';
import { useLocation } from '../../context/LocationContext';
import { useDiscount } from '../../context/DiscountContext';
import { useDiscountFilter } from '../../context/DiscountFilterContext';


// Note: Vendors should have logoUrl from the admin panel
// If no logoUrl is provided, the component will handle it gracefully

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
  const router = useRouter();
  
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

  // Load favorites from storage on mount
  useEffect(() => {
    AsyncStorage.getItem('@thrive_favorites').then(stored => {
      if (stored) setFavorites(new Set(JSON.parse(stored)));
    });
  }, []);

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

    // Filter by location (only when explicitly set via filter screen or user typing)
    let matchesLocation = true;
    const locFilter = (filters.location && filters.location.trim()) || '';
    if (locFilter) {
      const loc = locFilter.toLowerCase();
      matchesLocation = (v.location && v.location.toLowerCase().includes(loc));
    }

    // Filter by radius (distance from user) - parse "5 miles" -> 5
    let matchesRadius = true;
    if (filters.radius && userLocation) {
      const radiusNum = parseFloat(String(filters.radius).replace(/[^\d.]/g, '')) || 0;
      if (radiusNum > 0 && v.latitude && v.longitude) {
        const dist = calculateDistance(
          userLocation.latitude, userLocation.longitude,
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

  const handleMarkerPress = (vendor) => {
    console.log('Marker pressed:', vendor);
    setSelectedMarker(vendor);
  };

  const updateMapRegion = async () => {
    const userLocation = await getCurrentLocation();
    if (userLocation) {
      setMapRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      });
    }
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
      setMapRegion({
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5fa' }}>
      {/* Header with Search and Toggle */}
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <Image 
            source={require('../../../assets/icons/search-icon.png')} 
            style={{ width: 18, height: 18, tintColor: '#6d6e72', marginRight: 8 }} 
          />
          <TextInput
            placeholder="Search Business"
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

        {/* Location Input */}
        <View style={styles.locationRow}>
          {Platform.OS === 'web' ? (
            <Text style={{ fontSize: 16, color: '#6d6e72', marginRight: 8 }}>📍</Text>
          ) : (
            <Feather name="map-pin" size={16} color="#6d6e72" style={{ marginRight: 8 }} />
          )}
          {isEditingLocation ? (
            <TextInput
              placeholder="Enter city or area to filter (e.g. Atlanta)"
              placeholderTextColor="#6d6e72"
              value={locationSearch}
              onChangeText={(t) => {
                setLocationSearch(t);
                updateFilters({ location: t.trim() });
              }}
              style={styles.locationInput}
              autoFocus
              onBlur={() => setIsEditingLocation(false)}
              onSubmitEditing={() => setIsEditingLocation(false)}
            />
          ) : (
            <TouchableOpacity 
              style={styles.locationDisplay}
              onPress={() => {
                setIsEditingLocation(true);
                setLocationSearch(locationSearch || locationDisplay);
              }}
            >
              <Text style={styles.locationText}>{locationSearch || locationDisplay}</Text>
              {Platform.OS === 'web' ? (
                <Text style={{ fontSize: 14, color: '#DB8633', marginLeft: 8 }}>✏️</Text>
              ) : (
                <Feather name="edit-2" size={14} color="#DB8633" style={{ marginLeft: 8 }} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={styles.refreshLocationButton}
            onPress={updateUserLocation}
            disabled={isLoadingLocation}
          >
            {Platform.OS === 'web' ? (
              <Text style={{ fontSize: 16, color: isLoadingLocation ? '#ccc' : '#DB8633' }}>🔄</Text>
            ) : (
              <Feather 
                name="refresh-cw" 
                size={16} 
                color={isLoadingLocation ? "#ccc" : "#DB8633"} 
                style={isLoadingLocation ? { transform: [{ rotate: '180deg' }] } : {}}
              />
            )}
          </TouchableOpacity>
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
                <AntDesign
                  name={filters.showFavorites ? 'heart' : 'hearto'}
                  size={13}
                  color={filters.showFavorites ? '#D0861F' : '#666'}
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
                style={StyleSheet.absoluteFill}
                initialRegion={mapRegion}
                region={mapRegion}
                showsUserLocation={true}
                showsMyLocationButton={true}
                onMapReady={updateMapRegion}
                showsBuildings={true}
                showsTraffic={false}
                showsIndoors={false}
              >
                {filteredVendors.map((vendor) => (
                  <Marker
                    key={vendor.id}
                    coordinate={{
                      latitude: vendor.latitude || DEFAULT_LAT,
                      longitude: vendor.longitude || DEFAULT_LNG,
                    }}
                    onPress={() => setSelectedMarker(vendor)}
                    tracksViewChanges={false}
                  >
                    <View style={styles.customMarkerContainer}>
                      <View style={styles.customMarkerBubble}>
                        {vendor.imageUrl ? (
                          <Image
                            source={{ uri: vendor.imageUrl }}
                            style={styles.customMarkerLogo}
                            resizeMode="cover"
                          />
                        ) : (
                          <Feather name="tag" size={12} color="#fff" />
                        )}
                        <Text style={styles.customMarkerText} numberOfLines={1}>
                          {vendor.brandName}
                        </Text>
                      </View>
                      <View style={styles.customMarkerTail} />
                    </View>
                  </Marker>
                ))}
              </MapView>
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
                    <Text style={styles.sectionTitle}>All Discounts</Text>
                    <Text style={styles.sectionSubtitle}>{filteredVendors.length} business{filteredVendors.length !== 1 ? 'es' : ''} found</Text>
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
              <View style={styles.emptyState}>
                <>
                  <Text style={styles.emptyTitle}>No results found</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery ? `No businesses found for "${searchQuery}"` : 'Try adjusting your search or filters'}
                  </Text>
                </>
                
                <SuggestCard
                  type="vendor"
                  searchQuery={searchQuery}
                  onSubmit={({ name, website }) => API.submitVendorRequest({ name, website })}
                />
              </View>
            )}
          </ScrollView>
        )}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
    paddingVertical: 10,
    minHeight: 40,
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
    height: 40,
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
    backgroundColor: '#21555b',
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
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
  emptyState: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    alignItems: 'center',
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
  customMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  customMarkerContainer: {
    alignItems: 'center',
  },
  customMarkerBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#21555b',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: 160,
    gap: 5,
  },
  customMarkerLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  customMarkerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  customMarkerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#21555b',
  },
  infoWindowLogoFallback: {
    backgroundColor: '#e8f0f1',
    justifyContent: 'center',
    alignItems: 'center',
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
