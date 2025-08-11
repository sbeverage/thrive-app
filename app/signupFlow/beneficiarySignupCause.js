// File: app/signupFlow/beneficiarySignupCause.js

import React, { useState } from 'react';
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
  Dimensions,
  Modal,
} from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const categories = [
  'Childhood Illness',
  'Foster Care', 
  'Disabilities',
  'Mental Health',
  'Animal Welfare',
  'Anti-Human Trafficking',
  'Rehabilitation',
  'Low Income Families',
  'Education',
];

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function BeneficiaryPreferences() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [location, setLocation] = useState('');
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [tempLocation, setTempLocation] = useState(location);
  const [radius, setRadius] = useState(10);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const beneficiaries = [
    { id: 1, name: 'NPCF', category: 'Childhood Illness', image: require('../../assets/images/child-cancer.jpg') },
    { id: 2, name: 'Humane Society', category: 'Animal Welfare', image: require('../../assets/images/humane-society.jpg') },
    { id: 3, name: 'Charity Water', category: 'Low Income Families', image: require('../../assets/images/charity-water.jpg') },
    { id: 4, name: 'Dog Trust', category: 'Animal Welfare', image: require('../../assets/images/humane-society.jpg') },
    { id: 5, name: 'NPCF', category: 'Childhood Illness', image: require('../../assets/images/child-cancer.jpg') },
    { id: 6, name: 'Humane Society', category: 'Animal Welfare', image: require('../../assets/images/humane-society.jpg') },
    { id: 7, name: 'Charity Water', category: 'Low Income Families', image: require('../../assets/images/charity-water.jpg') },
    { id: 8, name: 'Dog Trust', category: 'Animal Welfare', image: require('../../assets/images/humane-society.jpg') },
  ];

  const filtered = beneficiaries.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesCategory = !selectedCategory || b.category === selectedCategory;
    const matchesLocation = !location || b.location.toLowerCase().includes(location.toLowerCase());
    return matchesSearch && matchesCategory && matchesLocation;
  });

  const toggleFavorite = id => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <AntDesign name="search1" size={18} color="#324E58" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Search beneficiary by name"
              placeholderTextColor="#6d6e72"
              value={searchText}
              onChangeText={setSearchText}
              style={styles.searchInput}
            />
          </View>
        </View>
        <View style={styles.locationFieldWrapper}>
          <TouchableOpacity
            style={styles.locationField}
            onPress={() => {
              setTempLocation(location);
              setLocationModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Feather name="map-pin" size={18} color="#324E58" style={{ marginRight: 8 }} />
            <Text style={{ color: location ? '#111' : '#888', flex: 1 }}>
              {location ? location : 'Add a location (optional)'}
            </Text>
          </TouchableOpacity>
        </View>
        <Modal
          visible={locationModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setLocationModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add a location</Text>
              <View style={styles.modalInputRow}>
                <Feather name="map-pin" size={20} color="#324E58" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter location"
                  value={tempLocation}
                  onChangeText={setTempLocation}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    setLocation(tempLocation);
                    setLocationModalVisible(false);
                  }}
                  placeholderTextColor="#888"
                  fontWeight="500"
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
                <TouchableOpacity onPress={() => setLocationModalVisible(false)} style={{ marginRight: 16 }}>
                  <Text style={{ color: '#888', fontSize: 16 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setLocation(tempLocation);
                    setLocationModalVisible(false);
                  }}
                  disabled={!tempLocation.trim()}
                >
                  <Text style={{ color: !tempLocation.trim() ? '#ccc' : '#007AFF', fontWeight: 'bold', fontSize: 16 }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <View style={styles.categorySection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            <TouchableOpacity
              style={[styles.categoryChip, !selectedCategory && styles.categoryChipSelected]}
              onPress={() => setSelectedCategory('')}
            >
              <Text style={[styles.categoryText, !selectedCategory && styles.categoryTextSelected]}>
                All
              </Text>
            </TouchableOpacity>
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                style={[styles.categoryChip, selectedCategory === category && styles.categoryChipSelected]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[styles.categoryText, selectedCategory === category && styles.categoryTextSelected]}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
      {/* Scrollable Cards Section */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
          {/* Beneficiary Cards */}
          <View style={styles.cardsSection}>
            {filtered.length > 0 ? (
              filtered.map((b) => (
                <View key={b.id} style={styles.card}>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({ pathname: '/signupFlow/beneficiarySignupDetails', params: { id: b.id.toString() } })
                    }
                    style={styles.cardImageContainer}
                  >
                    <Image source={b.image} style={styles.cardImage} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => toggleFavorite(b.id)}
                    style={styles.heartIcon}
                  >
                    <AntDesign name={favorites.includes(b.id) ? 'heart' : 'hearto'} size={20} color="#DB8633" />
                  </TouchableOpacity>
                  <View style={styles.cardContent}>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle}>{b.name}</Text>
                      <Text style={styles.cardSubtitle}>{b.category}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.viewButton}
                      onPress={() =>
                        router.push({ pathname: '/signupFlow/beneficiarySignupDetails', params: { id: b.id.toString() } })
                      }
                    >
                      <Text style={styles.viewButtonText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.noResultsContainer}>
                <Text style={styles.noResultsText}>
                  {searchText ? `No results found for "${searchText}"` : 'No results found'}
                </Text>
                <Text style={styles.inviteText}>
                  {searchText 
                    ? `Want to see "${searchText}" here? Drop their info below!`
                    : 'Want to request a charity? Drop their info below.'}
                </Text>
                {submitted ? (
                  <Text style={styles.submittedText}>
                    ✅ Request submitted! Thank you — we'll review and add them soon.
                  </Text>
                ) : (
                  <View style={styles.requestForm}>
                    <TextInput
                      value={businessName}
                      onChangeText={setBusinessName}
                      placeholder="Full Business Name"
                      placeholderTextColor="#999"
                      style={styles.requestInput}
                    />
                    <TextInput
                      value={businessUrl}
                      onChangeText={setBusinessUrl}
                      placeholder="Website URL"
                      placeholderTextColor="#999"
                      autoCapitalize="none"
                      style={styles.requestInput}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 30,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 6,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationGradientWrapper: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  locationSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  locationSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  locationInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#324E58',
  },
  locationButton: {
    padding: 8,
  },
  radiusSection: {
    marginBottom: 10,
  },
  radiusLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  radiusSlider: {
    flexDirection: 'row',
    gap: 8,
  },
  radiusOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  radiusOptionSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  radiusText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  radiusTextSelected: {
    color: '#2C3E50',
    fontWeight: '600',
  },
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
  },
  categorySection: {
    marginBottom: 25,
  },
  categoryScroll: {
    paddingHorizontal: 20,
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#f2f2f2',
    borderRadius: 12,
    marginRight: 8,
  },
  categoryChipSelected: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  categoryTextSelected: {
    fontSize: 16,
    color: '#D0861F',
    fontWeight: '600',
  },
  cardsSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  cardImageContainer: {
    width: '100%',
  },
  cardImage: {
    width: '100%',
    height: 200,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    resizeMode: 'cover',
  },
  heartIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
  },
  cardContent: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  viewButton: {
    backgroundColor: '#DB8633',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  viewButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noResultsContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  noResultsText: {
    fontSize: 16,
    color: '#324E58',
    marginBottom: 8,
  },
  inviteText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  submittedText: {
    color: '#324E58',
    fontWeight: '600',
    marginTop: 20,
  },
  requestForm: {
    width: '100%',
  },
  requestInput: {
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    height: 48,
    marginBottom: 12,
    fontSize: 16,
    color: '#324E58',
  },
  requestButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  locationFieldWrapper: {
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  },
  locationField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    height: 38,
    marginBottom: 16,
    position: 'relative',
  },
  locationText: {
    fontSize: 16,
    color: '#324E58',
    flex: 1,
  },
  locationPlaceholder: {
    fontSize: 16,
    color: '#b0b0b0',
    flex: 1,
  },
  clearLocationButton: {
    marginLeft: 8,
    padding: 2,
  },
  stickyHeader: {
    backgroundColor: '#fff',
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    paddingTop: 30,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)', // slightly lighter overlay for a modern look
    padding: 0,
    margin: 0,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 18, // more rounded corners
    padding: 22,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 30, // helps avoid keyboard overlap
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 18,
  },
  modalInput: {
    width: '100%',
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    color: '#333',
    // marginBottom: 15, // remove to avoid extra space
  },
  modalInputRow: {
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
});
