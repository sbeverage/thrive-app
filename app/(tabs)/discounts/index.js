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
} from 'react-native';


import { Feather, AntDesign, MaterialIcons } from '@expo/vector-icons';
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
import WalkthroughTutorial from '../../../components/WalkthroughTutorial';
import { useTutorial } from '../../../hooks/useTutorial';


// Note: Vendors should have logoUrl from the admin panel
// If no logoUrl is provided, the component will handle it gracefully

export default function DiscountsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
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
  const { filters, updateFilters } = useDiscountFilter();
  const [locationSearch, setLocationSearch] = useState(''); // Location filter from main screen (tap location row to search)
  const [activeScope, setActiveScope] = useState('All');
  const [favorites, setFavorites] = useState(new Set());
  const [geocodedCoords, setGeocodedCoords] = useState({});

  const DEFAULT_LAT = 34.0754;
  const DEFAULT_LNG = -84.2941;
  const GEOCODE_CACHE_KEY = '@thrive_geocache';

  // Sync category pill and location search with filter screen when filters applied
  useEffect(() => {
    if (filters.category && filters.category !== activeCategory) {
      setActiveCategory(filters.category);
    }
    if (filters.location && filters.location !== locationSearch) {
      setLocationSearch(filters.location);
    }
  }, [filters.category, filters.location]);

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

  const handleCategoryPress = (tag) => {
    setActiveCategory(tag);
    if (tag === 'All') {
      updateFilters({ category: '' });
    } else {
      updateFilters({ category: tag });
    }
  };

  // Discount context
  const { discounts, vendors, isLoading: isLoadingDiscounts, loadDiscounts } = useDiscount();
  
  // Tutorial
  const discountsSectionRef = useRef(null);
  const {
    showTutorial,
    currentStep,
    highlightPosition,
    elementRef: tutorialElementRef,
    handleNext,
    handleSkip,
  } = useTutorial('discounts');
  
  // Set the ref for the tutorial to measure
  useEffect(() => {
    if (showTutorial && discountsSectionRef.current) {
      tutorialElementRef.current = discountsSectionRef.current;
    }
  }, [showTutorial, tutorialElementRef]);
  
  // Check tutorial when screen is focused
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        if (showTutorial && discountsSectionRef.current) {
          console.log('📚 Setting tutorial element ref for discounts');
          tutorialElementRef.current = discountsSectionRef.current;
        }
      }, 800);
      return () => clearTimeout(timer);
    }, [showTutorial, tutorialElementRef])
  );
  
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
    
    // Sort categories and add 'All' at the beginning
    const sortedCategories = Array.from(categories).sort();
    const result = ['All', ...sortedCategories];
    console.log('🏷️ Available categories/tags from vendors:', result);
    return result;
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
    'Buy One Get One': 'bogo',
    'Free Item': 'free',
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

    // Filter by category (from filter screen or pill selection)
    const categoryToMatch = filters.category || (activeCategory !== 'All' ? activeCategory : null);
    let matchesCategory = true;
    if (categoryToMatch) {
      matchesCategory = false;
      if (v.category && v.category.toLowerCase() === categoryToMatch.toLowerCase()) matchesCategory = true;
      if (!matchesCategory && v.tags && Array.isArray(v.tags)) {
        matchesCategory = v.tags.some(tag =>
          tag && typeof tag === 'string' && tag.toLowerCase() === categoryToMatch.toLowerCase()
        );
      }
      if (!matchesCategory && v.vendor) {
        if (v.vendor.category && v.vendor.category.toLowerCase() === categoryToMatch.toLowerCase()) matchesCategory = true;
        if (!matchesCategory && v.vendor.tags && Array.isArray(v.vendor.tags)) {
          matchesCategory = v.vendor.tags.some(tag =>
            tag && typeof tag === 'string' && tag.toLowerCase() === categoryToMatch.toLowerCase()
          );
        }
      }
    } else if (activeCategory !== 'All') {
      matchesCategory = false;
      if (v.category && v.category.toLowerCase() === activeCategory.toLowerCase()) matchesCategory = true;
      if (!matchesCategory && v.tags && Array.isArray(v.tags)) {
        matchesCategory = v.tags.some(tag =>
          tag && typeof tag === 'string' && tag.toLowerCase() === activeCategory.toLowerCase()
        );
      }
      if (!matchesCategory && v.vendor) {
        if (v.vendor.category && v.vendor.category.toLowerCase() === activeCategory.toLowerCase()) matchesCategory = true;
        if (!matchesCategory && v.vendor.tags && Array.isArray(v.vendor.tags)) {
          matchesCategory = v.vendor.tags.some(tag =>
            tag && typeof tag === 'string' && tag.toLowerCase() === activeCategory.toLowerCase()
          );
        }
      }
    }

    // Scope filter
    let matchesScope = true;
    if (activeScope === 'Nearby') {
      if (userLocation && v.latitude && v.longitude) {
        const nearbyRadius = filters.radius
          ? parseFloat(String(filters.radius).replace(/[^\d.]/g, '')) || 50
          : 50;
        const dist = calculateDistance(userLocation.latitude, userLocation.longitude, v.latitude, v.longitude);
        matchesScope = dist !== null && dist <= nearbyRadius;
      } else {
        matchesScope = false;
      }
    } else if (activeScope === 'Favorites') {
      matchesScope = favorites.has(String(v.id));
    }

    return matchesSearch && matchesLocation && matchesRadius && matchesType && matchesCategory && matchesScope;
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
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
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
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });
    } else if (locationPermission === 'denied') {
      setLocationDisplay('Location not available');
    } else if (locationPermission === null) {
      setLocationDisplay('Detecting location...');
    }
  }, [userLocation, locationAddress, locationPermission]);

  const handleViewDetails = (vendor) => {
    setSelectedMarker(null); // Close info window
    // Find the discount for this vendor
    const vendorDiscount = discounts.find(d => d.vendorId === vendor.id || d.vendorId === vendor.id.toString());
    if (vendorDiscount) {
      // Navigate to discount details page
      router.push({
        pathname: '/(tabs)/discounts/discountDetails',
        params: { discountId: vendorDiscount.id }
      });
    } else {
      // If no discount found, still navigate to vendor page as fallback
      router.push(`/discounts/${vendor.id}`);
    }
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
          <TouchableOpacity onPress={() => router.push('/(tabs)/discounts/filter')} style={{ marginLeft: 10 }}>
            {Platform.OS === 'web' ? (
              <Text style={{ fontSize: 22 }}>🔽</Text>
            ) : (
              <Feather name="filter" size={22} color="#DB8633" />
            )}
          </TouchableOpacity>
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

        {/* Scope Selector */}
        <View style={styles.scopeRow}>
          {['All', 'Nearby', 'Favorites'].map(scope => (
            <TouchableOpacity
              key={scope}
              style={[styles.scopeBtn, activeScope === scope && styles.scopeBtnActive]}
              onPress={() => setActiveScope(scope)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {scope === 'Favorites' && (
                  <MaterialIcons
                    name={activeScope === 'Favorites' ? 'favorite' : 'favorite-border'}
                    size={14}
                    color={activeScope === scope ? '#DB8633' : '#666'}
                  />
                )}
                <Text style={[styles.scopeText, activeScope === scope && styles.scopeTextActive]}>{scope}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
          {availableCategories.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, activeCategory === tag && styles.tagActive]}
              onPress={() => handleCategoryPress(tag)}
            >
              <Text style={[styles.tagText, activeCategory === tag && styles.tagTextActive]}>
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
                {/* Test marker to verify map is working */}
                <Marker
                  coordinate={{
                    latitude: 34.0754,
                    longitude: -84.2941,
                  }}
                  title="Test Marker - Alpharetta"
                  description="This is a test marker in Alpharetta"
                  pinColor="red"
                />
                
                {filteredVendors.map((vendor) => {
                  console.log('Rendering marker for:', vendor.brandName, 'at:', vendor.latitude, vendor.longitude);
                  return (
                    <Marker
                      key={vendor.id}
                      coordinate={{
                        latitude: vendor.latitude || 34.0522,
                        longitude: vendor.longitude || -118.2437,
                      }}
                      title={vendor.brandName}
                      description={vendor.category}
                      onPress={() => setSelectedMarker(vendor)}
                      pinColor="#DB8633"
                    />
                  );
                })}
              </MapView>
            )}
            
            {/* Custom Info Window */}
            {selectedMarker && (
              <View style={styles.infoWindow}>
                <View style={styles.infoWindowHeader}>
                  <Image source={selectedMarker.imageUrl} style={styles.infoWindowLogo} />
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
              <View ref={discountsSectionRef}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {activeScope === 'Favorites' ? 'Favorited Vendors' : activeScope === 'Nearby' ? 'Nearby Discounts' : 'All Discounts'}
                  </Text>
                  <Text style={styles.sectionSubtitle}>{filteredVendors.length} business{filteredVendors.length !== 1 ? 'es' : ''} found</Text>
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
                      isFavorited={favorites.has(String(item.id))}
                      onToggleFavorite={() => toggleFavorite(item.id)}
                    />
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyState}>
                {activeScope === 'Favorites' ? (
                  <>
                    <Text style={styles.emptyTitle}>No favorites yet</Text>
                    <Text style={styles.emptySubtitle}>Tap the heart on any vendor card to save it here</Text>
                  </>
                ) : activeScope === 'Nearby' && !userLocation ? (
                  <>
                    <Text style={styles.emptyTitle}>Location not available</Text>
                    <Text style={styles.emptySubtitle}>Enable location access to see vendors near you</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>No results found</Text>
                    <Text style={styles.emptySubtitle}>
                      {searchQuery ? `No businesses found for "${searchQuery}"` : 'Try adjusting your search or filters'}
                    </Text>
                  </>
                )}
                
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
    paddingBottom: 12,
    paddingLeft: 4,
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
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
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
