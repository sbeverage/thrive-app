// Full Airbnb-style Discounts Screen Implementation with improved UX flow
import React, { useRef, useMemo, useState } from 'react';
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
import MapView, { Marker, Circle } from 'react-native-maps';
import { Feather, AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import VoucherCard from '../../../components/VoucherCard';

export default function DiscountsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [location, setLocation] = useState('San Francisco, CA');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const router = useRouter();

  const vendors = [
    {
      id: '1',
      brandName: 'Starbucks',
      category: 'Coffee Shop',
      imageUrl: require('../../../assets/logos/starbucks.png'),
      discountText: '3 discounts available',
      latitude: 37.78825,
      longitude: -122.4324,
    },
    {
      id: '2',
      brandName: 'Apple Store',
      category: 'Electronics',
      imageUrl: require('../../../assets/logos/apple.png'),
      discountText: '3 discounts available',
      latitude: 37.78845,
      longitude: -122.435,
    },
    {
      id: '3',
      brandName: 'Amazon On-Site Store',
      category: 'Shopping Store',
      imageUrl: require('../../../assets/logos/amazon.png'),
      discountText: '3 discounts available',
      latitude: 37.78885,
      longitude: -122.431,
    },
    {
      id: '4',
      brandName: 'Starbucks',
      category: 'Coffee Shop',
      imageUrl: require('../../../assets/logos/starbucks.png'),
      discountText: '3 discounts available',
      latitude: 37.78825,
      longitude: -122.4324,
    },
    {
      id: '5',
      brandName: 'Apple Store',
      category: 'Electronics',
      imageUrl: require('../../../assets/logos/apple.png'),
      discountText: '3 discounts available',
      latitude: 37.78845,
      longitude: -122.435,
    },
    {
      id: '6',
      brandName: 'Amazon On-Site Store',
      category: 'Shopping Store',
      imageUrl: require('../../../assets/logos/amazon.png'),
      discountText: '3 discounts available',
      latitude: 37.78885,
      longitude: -122.431,
    },
  ];

  const filteredVendors = vendors.filter(v => {
    const matchesSearch = v.brandName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || v.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

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
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: 37.78825,
            longitude: -122.4324,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Circle
            center={{ latitude: 37.78825, longitude: -122.4324 }}
            radius={700}
            strokeColor="#D0861F"
            fillColor="rgba(208,134,31,0.1)"
          />
          {filteredVendors.map(v => (
            <Marker
              key={v.id}
              coordinate={{ latitude: v.latitude, longitude: v.longitude }}
              title={v.brandName}
              description={v.discountText}
            />
          ))}
        </MapView>
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
