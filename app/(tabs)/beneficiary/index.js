// Updated to use superior design patterns from Discounts tab
import React, { useRef, useMemo, useState, useEffect } from 'react';
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

import { AntDesign, Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import SuccessModal from '../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useBeneficiary } from '../../context/BeneficiaryContext';
import MapView, { Marker, Circle } from 'react-native-maps';
import { getCurrentLocation, getDefaultRegion } from '../../utils/locationService';

export default function BeneficiaryScreen() {
  const router = useRouter();
  const { selectedBeneficiary, setSelectedBeneficiary } = useBeneficiary();

  const [searchText, setSearchText] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingBeneficiary, setPendingBeneficiary] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showMap, setShowMap] = useState(false);
  const [mapRegion, setMapRegion] = useState(getDefaultRegion());
  const [location, setLocation] = useState('Detecting location...');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  
  // Add state for the mini popup
  const [miniPopupVisible, setMiniPopupVisible] = useState(false);
  const [selectedBeneficiaryForPopup, setSelectedBeneficiaryForPopup] = useState(null);

  const categories = ['All', 'Favorites', 'Childhood Illness', 'Animal Welfare', 'Low Income Families', 'Education', 'Environment'];

  const beneficiaries = [
    { id: 1, name: 'NPCF', category: 'Childhood Illness', image: require('../../../assets/images/child-cancer.jpg'), location: 'Atlanta, GA', distance: '2.3 mi', latitude: 33.7490, longitude: -84.3880 },
    { id: 2, name: 'Humane Society', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg'), location: 'Alpharetta, GA', distance: '1.1 mi', latitude: 34.0754, longitude: -84.2941 },
    { id: 3, name: 'Charity Water', category: 'Low Income Families', image: require('../../../assets/images/charity-water.jpg'), location: 'Roswell, GA', distance: '3.7 mi', latitude: 34.0232, longitude: -84.3616 },
    { id: 4, name: 'Dog Trust', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg'), location: 'Marietta, GA', distance: '5.2 mi', latitude: 33.9525, longitude: -84.5499 },
    { id: 5, name: 'Local Food Bank', category: 'Low Income Families', image: require('../../../assets/images/charity-water.jpg'), location: 'Sandy Springs, GA', distance: '0.8 mi', latitude: 33.9301, longitude: -84.3785 },
    { id: 6, name: 'Youth Center', category: 'Education', image: require('../../../assets/images/child-cancer.jpg'), location: 'Dunwoody, GA', distance: '2.9 mi', latitude: 33.9495, longitude: -84.3344 },
  ];

  const filteredBeneficiaries = beneficiaries.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchText.toLowerCase());
    let matchesCategory = true;
    
    if (activeCategory === 'All') {
      matchesCategory = true;
    } else if (activeCategory === 'Favorites') {
      matchesCategory = favorites.includes(b.id);
    } else {
      matchesCategory = b.category === activeCategory;
    }
    
    return matchesSearch && matchesCategory;
  });

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
    }
  }, [showMap]);

  // Auto-detect user location when component mounts
  useEffect(() => {
    updateUserLocation();
  }, []);

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
          <AntDesign name="search1" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search Beneficiaries"
            placeholderTextColor="#6d6e72"
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
          />
          <TouchableOpacity onPress={() => router.push('/(tabs)/beneficiary/beneficiaryFilter')} style={{ marginLeft: 10 }}>
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

        {/* Category Tags */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
          {categories.map(tag => (
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
              {filteredBeneficiaries.map(b => (
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
            {filteredBeneficiaries.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Nearby Causes</Text>
                  <Text style={styles.sectionSubtitle}>{filteredBeneficiaries.length} organizations found</Text>
                </View>

                {filteredBeneficiaries.map((b) => (
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
                      <AntDesign
                        name={favorites.includes(b.id) ? 'heart' : 'hearto'}
                        size={20}
                        color="#DB8633"
                      />
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
                            router.push({ 
                              pathname: '/(tabs)/beneficiary/beneficiaryDetail', 
                              params: { id: b.id.toString() } 
                            });
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
                          placeholder="Full Organization Name"
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
    marginBottom: 15,
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
});
