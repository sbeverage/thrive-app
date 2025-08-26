// Full Airbnb-style Discounts Screen Implementation with improved UX flow
import React, { useRef, useMemo, useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import VoucherCard from '../../../components/VoucherCard';
import MapView, { Marker } from 'react-native-maps';
import { getCurrentLocation, getDefaultRegion } from '../../utils/locationService';


export default function DiscountsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [location, setLocation] = useState('Detecting location...');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapRegion, setMapRegion] = useState(getDefaultRegion());
  const router = useRouter();

  const vendors = [
    {
      id: '1',
      brandName: 'Starbucks',
      category: 'Coffee Shop',
      imageUrl: require('../../../assets/logos/starbucks.png'),
      discountText: '3 discounts available',
      latitude: 34.0754,
      longitude: -84.2941,
      location: 'Alpharetta, GA',
    },
    {
      id: '2',
      brandName: 'Apple Store',
      category: 'Electronics',
      imageUrl: require('../../../assets/logos/apple.png'),
      discountText: '3 discounts available',
      latitude: 34.0754,
      longitude: -84.2942,
      location: 'Alpharetta, GA',
    },
    {
      id: '3',
      brandName: 'Amazon On-Site Store',
      category: 'Shopping Store',
      imageUrl: require('../../../assets/logos/amazon.png'),
      discountText: '3 discounts available',
      latitude: 34.0754,
      longitude: -84.2940,
      location: 'Alpharetta, GA',
    },
    {
      id: '4',
      brandName: 'Starbucks',
      category: 'Coffee Shop',
      imageUrl: require('../../../assets/logos/starbucks.png'),
      discountText: '3 discounts available',
      latitude: 34.1015,
      longitude: -84.5194,
      location: 'Woodstock, GA',
    },
    {
      id: '5',
      brandName: 'Apple Store',
      category: 'Electronics',
      imageUrl: require('../../../assets/logos/apple.png'),
      discountText: '3 discounts available',
      latitude: 34.1015,
      longitude: -84.5195,
      location: 'Woodstock, GA',
    },
    {
      id: '6',
      brandName: 'Amazon On-Site Store',
      category: 'Shopping Store',
      imageUrl: require('../../../assets/logos/amazon.png'),
      discountText: '3 discounts available',
      latitude: 34.1015,
      longitude: -84.5193,
      location: 'Woodstock, GA',
    },
  ];

  const filteredVendors = vendors.filter(v => {
    const matchesSearch = v.brandName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || v.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

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
    try {
      const userLocation = await getCurrentLocation();
      if (userLocation) {
        // Check if user is in the Atlanta metro area and show friendly location names
        const { latitude, longitude } = userLocation;
        
        // Alpharetta area (roughly)
        if (latitude >= 34.05 && latitude <= 34.10 && longitude >= -84.35 && longitude <= -84.25) {
          setLocation('Alpharetta, GA');
        }
        // Woodstock area (roughly)
        else if (latitude >= 34.09 && latitude <= 34.12 && longitude >= -84.52 && longitude <= -84.50) {
          setLocation('Woodstock, GA');
        }
        // Atlanta area (roughly)
        else if (latitude >= 33.70 && latitude <= 33.80 && longitude >= -84.40 && longitude <= -84.35) {
          setLocation('Atlanta, GA');
        }
        // General Atlanta metro area
        else if (latitude >= 33.50 && latitude <= 34.50 && longitude >= -84.80 && longitude <= -84.00) {
          setLocation('Atlanta Metro, GA');
        }
        else {
          setLocation('Current Location');
        }
      } else {
        setLocation('Location not available');
      }
    } catch (error) {
      console.error('Error getting user location:', error);
      setLocation('Location not available');
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
    updateUserLocation();
  }, []);

  const handleViewDetails = (vendorId) => {
    setSelectedMarker(null); // Close info window
    router.push(`/discounts/${vendorId}`);
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
          <AntDesign name="search1" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search Business"
            placeholderTextColor="#6d6e72"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          <TouchableOpacity onPress={() => router.push('/(tabs)/discounts/filter')} style={{ marginLeft: 10 }}>
            <Feather name="filter" size={22} color="#DB8633" />
          </TouchableOpacity>
        </View>

        {/* Location Input */}
        <View style={styles.locationRow}>
          <Feather name="map-pin" size={16} color="#6d6e72" style={{ marginRight: 8 }} />
          {isEditingLocation ? (
            <TextInput
              placeholder="Enter your location"
              placeholderTextColor="#6d6e72"
              value={location}
              onChangeText={setLocation}
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
              <Text style={styles.locationText}>{location}</Text>
              <Feather name="edit-2" size={14} color="#DB8633" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={styles.refreshLocationButton}
            onPress={updateUserLocation}
          >
            <Feather name="refresh-cw" size={16} color="#DB8633" />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
          {['All', 'Coffee Shop', 'Electronics', 'Shopping Store'].map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, activeCategory === tag && styles.tagActive]}
              onPress={() => setActiveCategory(tag)}
            >
              <Text style={[styles.tagText, activeCategory === tag && styles.tagTextActive]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
                    <AntDesign name="close" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.infoWindowActions}>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => handleViewDetails(selectedMarker.id)}
                  >
                    <Feather name="info" size={16} color="#fff" />
                    <Text style={styles.actionButtonText}>View Details</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.actionButtonSecondary}
                    onPress={() => handleGetDirections(selectedMarker)}
                  >
                    <Feather name="map-pin" size={16} color="#DB8633" />
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
          >
            {filteredVendors.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Nearby Discounts</Text>
                  <Text style={styles.sectionSubtitle}>{filteredVendors.length} businesses found</Text>
              </View>

                {filteredVendors.map((item) => (
                  <VoucherCard
                    key={item.id}
                    brand={item.brandName}
                    logo={item.imageUrl}
                    discounts={3}
                    onPress={() => router.push(`/discounts/${item.id}`)}
                  />
                ))}

                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>All Discounts</Text>
                  <Text style={styles.sectionSubtitle}>Browse all available offers</Text>
            </View>

                {filteredVendors.map((item) => (
                  <VoucherCard
                    key={`all-${item.id}`}
                    brand={item.brandName}
                    logo={item.imageUrl}
                    discounts={3}
                    onPress={() => router.push(`/discounts/${item.id}`)}
                  />
                ))}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery ? `No businesses found for "${searchQuery}"` : 'Try adjusting your search or filters'}
                </Text>
                
                {searchQuery && (
                  <View style={styles.requestSection}>
                    <Text style={styles.requestTitle}>Want to see "{searchQuery}" here?</Text>
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
                      placeholder="Full Business Name"
                      placeholderTextColor="#999"
                      style={styles.input}
                    />
                    <TextInput
                      value={businessUrl}
                      onChangeText={setBusinessUrl}
                      placeholder="Website URL"
                      placeholderTextColor="#999"
                      autoCapitalize="none"
                      style={styles.input}
                    />
                    <TouchableOpacity
                      style={styles.requestButton}
                      onPress={() => {
                        if (businessName.trim() && businessUrl.trim()) {
                          setSubmitted(true);
                        } else {
                          alert('Please fill out both fields.');
                        }
                      }}
                    >
                          <Text style={styles.requestButtonText}>Submit Request</Text>
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
