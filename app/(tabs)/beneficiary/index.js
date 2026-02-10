// Updated to use superior design patterns from Discounts tab
import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Modal,
} from 'react-native';

import { AntDesign, Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import SuccessModal from '../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useBeneficiary } from '../../context/BeneficiaryContext';
import { useBeneficiaryFilter } from '../../context/BeneficiaryFilterContext';
import { useLocation } from '../../context/LocationContext';
import MapView, { Marker, Circle } from 'react-native-maps';
import { getCurrentLocation, getDefaultRegion, calculateDistance, formatDistance } from '../../utils/locationService';
import WalkthroughTutorial from '../../../components/WalkthroughTutorial';
import { useTutorial } from '../../../hooks/useTutorial';
import API from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function BeneficiaryScreen() {
  const router = useRouter();
  const { selectedBeneficiary, setSelectedBeneficiary } = useBeneficiary();
  const { filters, clearFilters, hasActiveFilters } = useBeneficiaryFilter();
  const { location: userLocation, locationAddress, locationPermission, checkLocationPermission, refreshLocation, isLoadingLocation } = useLocation();

  const [searchText, setSearchText] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingBeneficiary, setPendingBeneficiary] = useState(null);
  const [favorites, setFavorites] = useState([]);
  
  // Load favorites from AsyncStorage on mount
  // IMPORTANT: Favorites should ONLY be set when the user explicitly selects them.
  // No automatic favoriting should occur - favorites start empty unless user selects them.
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const savedFavorites = await AsyncStorage.getItem('beneficiaryFavorites');
        if (savedFavorites) {
          const parsed = JSON.parse(savedFavorites);
          // Ensure we're loading an array, and don't add any default favorites
          setFavorites(Array.isArray(parsed) ? parsed : []);
          console.log('✅ Loaded favorites from storage:', parsed);
        } else {
          // If no favorites exist, explicitly set to empty array (don't add any defaults)
          setFavorites([]);
        }
      } catch (error) {
        console.error('❌ Error loading favorites:', error);
        // On error, set to empty array (don't add any defaults)
        setFavorites([]);
      }
    };
    loadFavorites();
  }, []);
  
  // Save favorites to AsyncStorage whenever they change
  useEffect(() => {
    const saveFavorites = async () => {
      try {
        await AsyncStorage.setItem('beneficiaryFavorites', JSON.stringify(favorites));
        console.log('💾 Saved favorites to storage:', favorites);
      } catch (error) {
        console.error('❌ Error saving favorites:', error);
      }
    };
    if (favorites.length >= 0) { // Save even if empty array
      saveFavorites();
    }
  }, [favorites]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showMap, setShowMap] = useState(false);
  const [mapRegion, setMapRegion] = useState(getDefaultRegion());
  const [locationDisplay, setLocationDisplay] = useState('Detecting location...');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  
  // Add state for the mini popup
  const [miniPopupVisible, setMiniPopupVisible] = useState(false);
  
  // Tutorial
  const beneficiarySectionRef = useRef(null);
  const {
    showTutorial,
    currentStep,
    highlightPosition,
    elementRef: tutorialElementRef,
    handleNext,
    handleSkip,
  } = useTutorial('beneficiary');
  
  // Set the ref for the tutorial to measure
  useEffect(() => {
    if (showTutorial && beneficiarySectionRef.current) {
      tutorialElementRef.current = beneficiarySectionRef.current;
    }
  }, [showTutorial, tutorialElementRef]);
  
  // Check tutorial when screen is focused
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        if (showTutorial && beneficiarySectionRef.current) {
          console.log('📚 Setting tutorial element ref for beneficiary');
          tutorialElementRef.current = beneficiarySectionRef.current;
        } else if (beneficiarySectionRef.current) {
          // Always set the ref if element exists
          tutorialElementRef.current = beneficiarySectionRef.current;
        }
      }, 800);
      return () => clearTimeout(timer);
    }, [showTutorial, tutorialElementRef])
  );
  const [selectedBeneficiaryForPopup, setSelectedBeneficiaryForPopup] = useState(null);

  const categories = ['All', 'Favorites', 'Animal Welfare', 'Arts & Culture', 'Childhood Illness', 'Disabilities', 'Disaster Relief', 'Education', 'Elderly Care', 'Environment', 'Healthcare', 'Homelessness', 'Hunger Relief', 'International Aid', 'Low Income Families', 'Veterans', 'Youth Development'];

  // State for beneficiaries from API
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);

  // Load beneficiaries from API
  const loadBeneficiaries = async () => {
    try {
      setLoadingBeneficiaries(true);
      console.log('📡 Loading beneficiaries from API...');
      console.log('📡 API endpoint:', 'https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api/charities');
      
      const data = await API.getCharities();
      console.log('✅ Beneficiaries loaded - Full response:', JSON.stringify(data, null, 2));
      console.log('✅ Response type:', typeof data);
      console.log('✅ Has charities property:', !!data?.charities);
      console.log('✅ Charities is array:', Array.isArray(data?.charities));
      console.log('✅ Number of charities:', data?.charities?.length || 0);
      
      // Handle different response formats
      let charitiesArray = null;
      if (data && data.charities && Array.isArray(data.charities)) {
        charitiesArray = data.charities;
      } else if (Array.isArray(data)) {
        // Handle case where response is directly an array
        console.warn('⚠️ Response is directly an array, not wrapped in { charities: [...] }');
        charitiesArray = data;
      } else if (data && data.data && Array.isArray(data.data)) {
        // Handle nested data property
        console.warn('⚠️ Response has nested data property');
        charitiesArray = data.data;
      }
      
      if (charitiesArray && charitiesArray.length > 0) {
        console.log('✅ Processing', charitiesArray.length, 'charities from API');
        console.log('✅ Charity names:', charitiesArray.map(c => c.name));
        console.log('✅ Charity IDs:', charitiesArray.map(c => c.id));
        // Transform backend data to frontend format
        const transformed = charitiesArray.map(charity => {
          // Calculate distance from user location
          let distanceStr = null;
          if (userLocation && charity.latitude && charity.longitude) {
            const distanceInMiles = calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              charity.latitude,
              charity.longitude
            );
            distanceStr = formatDistance(distanceInMiles);
          }

          // Handle image - use URL if available, otherwise fallback to local asset
          let imageSource;
          if (charity.imageUrl) {
            imageSource = { uri: charity.imageUrl };
          } else {
            // Fallback to default image based on category
            if (charity.category === 'Childhood Illness') {
              imageSource = require('../../../assets/images/child-cancer.jpg');
            } else if (charity.category === 'Animal Welfare') {
              imageSource = require('../../../assets/images/humane-society.jpg');
            } else {
              imageSource = require('../../../assets/images/charity-water.jpg');
            }
          }

          return {
            id: charity.id,
            name: charity.name,
            category: charity.category,
            type: charity.type,
            image: imageSource,
            location: charity.location,
            latitude: charity.latitude,
            longitude: charity.longitude,
            distance: distanceStr,
            likes: charity.likes || 0,
            mutual: charity.mutual || 0,
            about: charity.about || '',
            ein: charity.ein || '',
            website: charity.website || '',
            phone: charity.phone || '',
            social: charity.social || '',
          };
        });

        setBeneficiaries(transformed);
        console.log('✅ Beneficiaries transformed and set:', transformed.length);
        console.log('✅ First 3 transformed beneficiaries:', transformed.slice(0, 3).map(b => ({ id: b.id, name: b.name })));
      } else {
        console.warn('⚠️ Invalid data format from API');
        console.warn('⚠️ Data received:', JSON.stringify(data, null, 2));
        console.warn('⚠️ No beneficiaries available - showing empty state');
        setBeneficiaries([]);
      }
    } catch (error) {
      console.error('❌ Failed to load beneficiaries from API:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      if (error.response) {
        console.error('❌ Response status:', error.response.status);
        console.error('❌ Response data:', JSON.stringify(error.response.data, null, 2));
      }
      if (error.request) {
        console.error('❌ Request made but no response received');
        console.error('❌ Request config:', JSON.stringify(error.config, null, 2));
      }
      console.log('🔄 No beneficiaries available - showing empty state');
      setBeneficiaries([]);
    } finally {
      setLoadingBeneficiaries(false);
    }
  };

  // Load beneficiaries when component mounts or user location changes
  useEffect(() => {
    loadBeneficiaries();
  }, []);

  // Recalculate distances when user location changes
  useEffect(() => {
    if (userLocation && beneficiaries.length > 0) {
      setBeneficiaries(prev => prev.map(b => {
        if (b.latitude && b.longitude) {
          const distanceInMiles = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            b.latitude,
            b.longitude
          );
          return {
            ...b,
            distance: formatDistance(distanceInMiles),
          };
        }
        return b;
      }));
    }
  }, [userLocation]);

  const filteredBeneficiaries = beneficiaries.filter(b => {
    // Search text filter
    const matchesSearch = b.name.toLowerCase().includes(searchText.toLowerCase()) ||
                         b.location.toLowerCase().includes(searchText.toLowerCase());
    
    // Category filter (from category tags)
    let matchesCategory = true;
    if (activeCategory === 'All') {
      matchesCategory = true;
    } else if (activeCategory === 'Favorites') {
      matchesCategory = favorites.includes(b.id);
    } else {
      matchesCategory = b.category === activeCategory;
    }
    
    // Filter context filters
    const matchesLocation = !filters.location || 
                           b.location.toLowerCase().includes(filters.location.toLowerCase());
    
    const matchesCause = !filters.cause || b.category === filters.cause;
    
    const matchesType = !filters.type || b.type === filters.type;
    
    const matchesFavorites = !filters.showFavorites || favorites.includes(b.id);
    
    // Emergency filter - disabled until backend supports emergency tagging
    const matchesEmergency = !filters.emergency;
    
    return matchesSearch && matchesCategory && matchesLocation && 
           matchesCause && matchesType && matchesFavorites && matchesEmergency;
  });

  const highlightedBeneficiaries = filteredBeneficiaries.slice(0, 2);
  const remainingBeneficiaries = filteredBeneficiaries.slice(2);

  const handleConfirmBeneficiary = () => {
    if (pendingBeneficiary) {
      setSelectedBeneficiary(pendingBeneficiary);
      setSuccessMessage("Awesome! You've selected your cause!");
      setShowSuccessModal(true);
      setConfettiTrigger(true);
      setConfirmModalVisible(false);
      setPendingBeneficiary(null);
    }
  };

  const toggleFavorite = id => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const updateMapRegion = async () => {
    const userLocation = await getCurrentLocation();
    if (userLocation) {
      setMapRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  };

  const updateUserLocation = async () => {
    if (locationPermission === 'granted') {
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
    }
  }, [showMap]);

  // Auto-detect user location when component mounts
  useEffect(() => {
    checkLocationPermission();
  }, []);

  // Update location display when location context changes
  useEffect(() => {
    const updateLocationDisplay = async () => {
      if (userLocation && locationPermission === 'granted') {
        // Use locationAddress from context if available (more accurate)
        if (locationAddress?.city && locationAddress?.state) {
          const display = `${locationAddress.city}, ${locationAddress.state}`;
          setLocationDisplay(display);
          console.log('📍 Location display updated:', display);
        } else if (userLocation.latitude && userLocation.longitude) {
          // Fallback: try to get friendly name from coordinates
          try {
            const friendlyName = await getFriendlyLocationName(userLocation.latitude, userLocation.longitude);
            setLocationDisplay(friendlyName);
            console.log('📍 Location display updated (fallback):', friendlyName);
          } catch (error) {
            console.error('Error getting friendly location name:', error);
            setLocationDisplay('Current Location');
          }
        } else {
          setLocationDisplay('Current Location');
        }
        
        // Update map region
        setMapRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } else if (locationPermission === 'denied') {
        setLocationDisplay('Location not available');
      } else if (isLoadingLocation) {
        setLocationDisplay('Detecting location...');
      } else if (locationPermission === null) {
        setLocationDisplay('Tap to set location');
      }
    };
    
    updateLocationDisplay();
  }, [userLocation, locationAddress, locationPermission, isLoadingLocation]);

  const closeModal = () => {
    setShowSuccessModal(false);
    setSearchText('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5fa' }}>
      {/* Header with Search and Toggle */}
      <View style={styles.header}>


        {/* Search Row */}
        <View style={styles.searchRow}>
          <Image 
            source={require('../../../assets/icons/search-icon.png')} 
            style={{ width: 18, height: 18, tintColor: '#6d6e72', marginRight: 8 }} 
          />
          <TextInput
            placeholder="Search Beneficiaries"
            placeholderTextColor="#6d6e72"
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
          />
          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/beneficiary/beneficiaryFilter')} 
            style={[
              { marginLeft: 10, padding: 4, borderRadius: 4 },
              hasActiveFilters() && { backgroundColor: '#FFF5EB' }
            ]}
          >
            <Feather name="filter" size={22} color={hasActiveFilters() ? "#D0861F" : "#DB8633"} />
            {hasActiveFilters() && (
              <View style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#D0861F'
              }} />
            )}
          </TouchableOpacity>
        </View>

        {/* Location Input */}
        <View style={styles.locationRow}>
          <Feather name="map-pin" size={16} color="#6d6e72" style={{ marginRight: 8 }} />
          {isEditingLocation ? (
            <TextInput
              placeholder="Enter your location"
              placeholderTextColor="#6d6e72"
              value={locationDisplay}
              onChangeText={setLocationDisplay}
              style={styles.locationInput}
              autoFocus
              onBlur={() => setIsEditingLocation(false)}
              onSubmitEditing={() => setIsEditingLocation(false)}
            />
          ) : (
            <TouchableOpacity 
              style={styles.locationDisplay}
              onPress={() => setIsEditingLocation(true)}
            >
              <Text style={styles.locationText}>{locationDisplay}</Text>
              <Feather name="edit-2" size={14} color="#DB8633" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={styles.refreshLocationButton}
            onPress={updateUserLocation}
            disabled={isLoadingLocation}
          >
            <Feather 
              name="refresh-cw" 
              size={16} 
              color={isLoadingLocation ? "#ccc" : "#DB8633"} 
              style={isLoadingLocation ? { transform: [{ rotate: '180deg' }] } : {}}
            />
          </TouchableOpacity>
        </View>

        {/* Category Tags */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
          {categories.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, activeCategory === tag && styles.tagActive]}
              onPress={() => setActiveCategory(tag)}
            >
              <View style={styles.tagContent}>
                {tag === 'Favorites' && (
                  <MaterialIcons 
                    name="favorite-border" 
                    size={14} 
                    color={activeCategory === tag ? '#fff' : '#666'} 
                    style={styles.tagIcon} 
                  />
                )}
                <Text style={[styles.tagText, activeCategory === tag && styles.tagTextActive]}>{tag}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Clear Filters Button - only show when filters are active */}
        {hasActiveFilters() && (
          <View style={styles.clearFiltersContainer}>
            <TouchableOpacity 
              style={styles.clearFiltersButton}
              onPress={clearFilters}
            >
              <Feather name="x" size={16} color="#D0861F" />
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* List/Map Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity 
            style={[styles.toggleBtn, !showMap && styles.toggleActive]} 
            onPress={() => setShowMap(false)}
          >
            <Feather name="list" size={16} color={!showMap ? "#fff" : "#666"} />
            <Text style={[styles.toggleText, !showMap && styles.toggleTextActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, showMap && styles.toggleActive]} 
            onPress={() => setShowMap(true)}
          >
            <Feather name="map" size="16" color={showMap ? "#fff" : "#666"} />
            <Text style={[styles.toggleText, showMap && styles.toggleTextActive]}>Map</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {showMap ? (
          Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, styles.webMapFallback]}>
              <Text style={styles.webMapText}>Map view is not available on web</Text>
              <Text style={styles.webMapSubtext}>Please use the mobile app for full map functionality</Text>
              <TouchableOpacity 
                style={styles.switchToListButton}
                onPress={() => setShowMap(false)}
              >
                <Text style={styles.switchToListButtonText}>Switch to List View</Text>
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
            >
              <Circle
                center={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                radius={15000}
                strokeColor="#DB8633"
                fillColor="rgba(219, 134, 51, 0.1)"
              />
              {!loadingBeneficiaries && filteredBeneficiaries.map(b => (
                <Marker
                  key={b.id}
                  coordinate={{ latitude: b.latitude, longitude: b.longitude }}
                  title={b.name}
                  description={b.category}
                  onPress={() => {
                    setSelectedBeneficiaryForPopup(b);
                    setMiniPopupVisible(true);
                  }}
                  pinColor="#DB8633"
                />
              ))}
            </MapView>
          )
        ) : (
          <ScrollView 
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {loadingBeneficiaries ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#666', fontSize: 16 }}>Loading beneficiaries...</Text>
              </View>
            ) : filteredBeneficiaries.length > 0 ? (
              <>
                <View ref={beneficiarySectionRef}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Nearby Causes</Text>
                    <Text style={styles.sectionSubtitle}>{filteredBeneficiaries.length} organizations found</Text>
                  </View>

                  {highlightedBeneficiaries.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.beneficiaryCard,
                        selectedBeneficiary?.id === b.id && styles.selectedBeneficiaryCard
                      ]}
                      onPress={() => {
                        setSelectedBeneficiaryForPopup(b);
                        setMiniPopupVisible(true);
                      }}
                    >
                      <Image source={b.image} style={styles.beneficiaryImage} />
                      <TouchableOpacity 
                        onPress={() => toggleFavorite(b.id)} 
                        style={styles.favoriteButton}
                      >
                        {favorites.includes(b.id) ? (
                          <AntDesign
                            name="heart"
                            size={20}
                            color="#DB8633"
                          />
                        ) : (
                          <Image 
                            source={require('../../../assets/icons/heart.png')} 
                            style={{ width: 20, height: 20, tintColor: '#DB8633' }} 
                          />
                        )}
                      </TouchableOpacity>
                      <View style={styles.beneficiaryCardContent}>
                        <Text style={styles.beneficiaryName}>{b.name}</Text>
                        <Text style={styles.beneficiaryCategory}>{b.category}</Text>
                        <View style={styles.beneficiaryLocation}>
                          <Ionicons name="location" size={14} color="#8E9BAE" />
                          <Text style={styles.beneficiaryLocationText}>{b.location} • {b.distance}</Text>
                        </View>
                        
                        {/* Buttons Row */}
                        <View style={styles.buttonsRow}>
                          <TouchableOpacity 
                            style={styles.detailsButton}
                            onPress={() => {
                              router.push({
                                pathname: '/(tabs)/beneficiary/beneficiaryDetail',
                                params: { id: b.id.toString() }
                              });
                            }}
                          >
                            <Text style={styles.detailsButtonText}>View Details</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.selectButton}
                            onPress={() => {
                              setPendingBeneficiary(b);
                              setConfirmModalVisible(true);
                            }}
                          >
                            <Text style={styles.selectButtonText}>Select</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {remainingBeneficiaries.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[
                      styles.beneficiaryCard,
                      selectedBeneficiary?.id === b.id && styles.selectedBeneficiaryCard
                    ]}
                    onPress={() => {
                      setSelectedBeneficiaryForPopup(b);
                      setMiniPopupVisible(true);
                    }}
                  >
                    <Image source={b.image} style={styles.beneficiaryImage} />
                    <TouchableOpacity 
                      onPress={() => toggleFavorite(b.id)} 
                      style={styles.favoriteButton}
                    >
                      {favorites.includes(b.id) ? (
                        <AntDesign
                          name="heart"
                          size={20}
                          color="#DB8633"
                        />
                      ) : (
                        <Image 
                          source={require('../../../assets/icons/heart.png')} 
                          style={{ width: 20, height: 20, tintColor: '#DB8633' }} 
                        />
                      )}
                    </TouchableOpacity>
                    <View style={styles.beneficiaryCardContent}>
                      <Text style={styles.beneficiaryName}>{b.name}</Text>
                      <Text style={styles.beneficiaryCategory}>{b.category}</Text>
                      <View style={styles.beneficiaryLocation}>
                        <Ionicons name="location" size={14} color="#8E9BAE" />
                        <Text style={styles.beneficiaryLocationText}>{b.location} • {b.distance}</Text>
                      </View>
                      
                      {/* Buttons Row */}
                      <View style={styles.buttonsRow}>
                        {/* View Details Button */}
                        <TouchableOpacity
                          style={styles.viewDetailsButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            console.log('🔵 Navigating to beneficiary detail with ID:', b.id);
                            console.log('🔵 Full beneficiary object:', JSON.stringify(b, null, 2));
                            
                            // Try the exact same format that works for beneficiaryFilter
                            const route = '/(tabs)/beneficiary/beneficiaryDetail';
                            console.log('🔵 Attempting navigation to:', route, 'with id:', b.id);
                            
                            router.push({ 
                              pathname: route,
                              params: { id: b.id.toString() } 
                            });
                            
                            console.log('🔵 Navigation push completed');
                          }}
                        >
                          <Text style={styles.viewDetailsButtonText}>Details</Text>
                        </TouchableOpacity>

                        {/* Change to This Button - only show if not already selected */}
                        {selectedBeneficiary?.id !== b.id && (
                          <TouchableOpacity
                            style={styles.changeToThisButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              setSelectedBeneficiary(b);
                            }}
                          >
                            <Text style={styles.changeToThisButtonText}>Select</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchText ? `No beneficiaries found for "${searchText}"` : 'Try adjusting your search or filters'}
                </Text>
                
                {searchText && (
                  <View style={styles.requestSection}>
                    <Text style={styles.requestTitle}>Want to see "{searchText}" here?</Text>
                    <Text style={styles.requestSubtitle}>Drop their info below and we'll add them soon!</Text>

                    {submitted ? (
                      <View style={styles.successMessage}>
                        <Text style={styles.successText}>✅ Request submitted! Thank you — we'll review and add them soon.</Text>
                      </View>
                    ) : (
                      <View style={styles.requestForm}>
                        <TextInput
                          value={businessName}
                          onChangeText={setBusinessName}
                          placeholder="Full Organization Name *"
                          placeholderTextColor="#999"
                          style={styles.input}
                        />
                        <TextInput
                          value={businessUrl}
                          onChangeText={setBusinessUrl}
                          placeholder="Website URL *"
                          placeholderTextColor="#999"
                          autoCapitalize="none"
                          style={styles.input}
                        />
                        <TextInput
                          value={contactName}
                          onChangeText={setContactName}
                          placeholder="Your Name (Optional)"
                          placeholderTextColor="#999"
                          style={styles.input}
                        />
                        <TextInput
                          value={contactEmail}
                          onChangeText={setContactEmail}
                          placeholder="Your Email (Optional)"
                          placeholderTextColor="#999"
                          autoCapitalize="none"
                          keyboardType="email-address"
                          style={styles.input}
                        />
                        {submitError ? (
                          <Text style={styles.errorText}>{submitError}</Text>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.requestButton, isSubmitting && styles.requestButtonDisabled]}
                          onPress={async () => {
                            if (!businessName.trim()) {
                              setSubmitError('Please enter the organization name.');
                              return;
                            }
                            if (!businessUrl.trim()) {
                              setSubmitError('Please enter the website URL.');
                              return;
                            }
                            
                            // Validate email format if provided
                            if (contactEmail.trim()) {
                              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                              if (!emailRegex.test(contactEmail.trim())) {
                                setSubmitError('Please enter a valid email address.');
                                return;
                              }
                            }

                            setIsSubmitting(true);
                            setSubmitError('');
                            
                            try {
                              await API.submitBeneficiaryRequest({
                                contact_name: contactName.trim() || null,
                                company_name: businessName.trim(),
                                email: contactEmail.trim() ? contactEmail.trim().toLowerCase() : null,
                                website: businessUrl.trim(),
                              });
                              
                              setSubmitted(true);
                              // Clear form after successful submission
                              setBusinessName('');
                              setBusinessUrl('');
                              setContactName('');
                              setContactEmail('');
                            } catch (error) {
                              console.error('Failed to submit beneficiary request:', error);
                              setSubmitError(error.message || 'Failed to submit request. Please try again.');
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          disabled={isSubmitting}
                        >
                          <Text style={styles.requestButtonText}>
                            {isSubmitting ? 'Submitting...' : 'Submit Request'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Confirmation Modal */}
      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalBox}>
            <Text style={styles.modalText}>Are you sure you want "{pendingBeneficiary?.name}" to be your new beneficiary?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleConfirmBeneficiary} style={styles.confirmBtn}>
                <Text style={styles.confirmBtnText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SuccessModal visible={showSuccessModal} onClose={closeModal} message={successMessage} />
      {confettiTrigger && (
        <ConfettiCannon
          count={100}
          origin={{ x: 200, y: 0 }}
          fadeOut
          explosionSpeed={350}
          fallSpeed={3000}
          onAnimationEnd={() => setConfettiTrigger(false)}
        />
      )}

      {/* Mini Popup Modal */}
      <Modal
        visible={miniPopupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMiniPopupVisible(false)}
      >
        <TouchableOpacity
          style={styles.miniPopupOverlay}
          activeOpacity={1}
          onPress={() => setMiniPopupVisible(false)}
        >
          <TouchableOpacity
            style={styles.miniPopupContent}
            activeOpacity={1}
            onPress={() => {}} // Prevent closing when tapping content
          >
            <View style={styles.miniPopupHeader}>
              <Text style={styles.miniPopupTitle}>{selectedBeneficiaryForPopup?.name}</Text>
              <TouchableOpacity
                style={styles.miniPopupCloseButton}
                onPress={() => setMiniPopupVisible(false)}
              >
                <AntDesign name="close" size={20} color="#8E9BAE" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.miniPopupAbout}>
              {selectedBeneficiaryForPopup?.about || "Learn more about this amazing cause and the impact you can make in your local community."}
            </Text>
            
            <View style={styles.miniPopupButtons}>
              {selectedBeneficiaryForPopup?.id !== selectedBeneficiary?.id && (
                <TouchableOpacity
                  style={styles.miniPopupChangeButton}
                  onPress={() => {
                    setPendingBeneficiary(selectedBeneficiaryForPopup);
                    setMiniPopupVisible(false);
                    setConfirmModalVisible(true);
                  }}
                >
                  <Text style={styles.miniPopupChangeButtonText}>Change to this cause</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={styles.miniPopupLearnButton}
                onPress={() => {
                  setMiniPopupVisible(false);
                  router.push({ 
                    pathname: '/(tabs)/beneficiary/beneficiaryDetail', 
                    params: { id: selectedBeneficiaryForPopup?.id.toString() } 
                  });
                }}
              >
                <Text style={styles.miniPopupLearnButtonText}>Learn More</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#324E58',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
    marginBottom: 10,
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
  tagsRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 20,
  },
  tag: {
    backgroundColor: '#f0f0f5',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#e1e1e5',
  },
  tagActive: {
    backgroundColor: '#DB8633',
    borderColor: '#DB8633',
  },
  tagContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagIcon: {
    marginRight: 6,
  },
  tagText: {
    fontSize: 14,
    color: '#6d6e72',
  },
  tagTextActive: {
    color: '#fff',
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
    backgroundColor: '#f5f5fa',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 15,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    marginBottom: 15,
    marginHorizontal: -20, // Negative margin to offset parent padding for consistent measurement
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#324E58',
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6d6e72',
  },
  beneficiaryCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedBeneficiaryCard: {
    borderColor: '#DB8633',
  },
  beneficiaryImage: {
    width: 120,
    height: '100%',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    resizeMode: 'cover',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
  },
  beneficiaryCardContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  beneficiaryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  beneficiaryCategory: {
    fontSize: 13,
    color: '#6d6e72',
    marginBottom: 6,
  },
  beneficiaryLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
  },
  beneficiaryLocationText: {
    fontSize: 12,
    color: '#8E9BAE',
    marginLeft: 4,
  },
  viewDetailsButton: {
    backgroundColor: '#f5f5fa',
    borderWidth: 1,
    borderColor: '#DB8633',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  viewDetailsButtonText: {
    fontSize: 12,
    color: '#DB8633',
    fontWeight: '500',
  },
  changeToThisButton: {
    backgroundColor: 'transparent',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    marginLeft: 8,
  },
  changeToThisButtonText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 13,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#324E58',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6d6e72',
    marginTop: 5,
  },
  requestSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  requestTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 5,
  },
  requestSubtitle: {
    fontSize: 14,
    color: '#6d6e72',
    textAlign: 'center',
  },
  requestForm: {
    width: '100%',
    marginTop: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    color: '#324E58',
    width: '100%',
  },
  requestButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  requestButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  successMessage: {
    backgroundColor: '#e8f5e9',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  successText: {
    color: '#2e7d32',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  requestButtonDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  confirmModalBox: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    width: '85%',
    alignItems: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#324E58',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 10,
  },
  confirmBtnText: {
    color: 'white',
    fontWeight: '700',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#324E58',
    fontWeight: '700',
  },
  
  // Mini Popup Styles
  miniPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  miniPopupContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  miniPopupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  miniPopupTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
    marginRight: 16,
  },
  miniPopupCloseButton: {
    padding: 4,
  },
  miniPopupAbout: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4A5568',
    marginBottom: 24,
  },
  miniPopupButtons: {
    gap: 12,
  },
  miniPopupChangeButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  miniPopupChangeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  miniPopupLearnButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  miniPopupLearnButtonText: {
    color: '#4A5568',
    fontSize: 16,
    fontWeight: '500',
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
  switchToListButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  switchToListButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  clearFiltersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
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
});
