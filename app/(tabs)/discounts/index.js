// Full Airbnb-style Discounts Screen Implementation using BottomSheet with corrected voucher styling and consistent search UI
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
import BottomSheet from '@gorhom/bottom-sheet';
import { Feather, AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import VoucherCard from '../../../components/VoucherCard';

export default function DiscountsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const sheetRef = useRef(null);
  const router = useRouter();

  const snapPoints = useMemo(() => ['25%', '95%'], []);

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
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
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

        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose={false}
          backgroundStyle={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, backgroundColor: '#f5f5fa' }}>
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
            </View>

            {filteredVendors.length > 0 ? (
              <FlatList
                data={filteredVendors}
                keyExtractor={item => item.id}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: 60,
                  backgroundColor: '#f5f5fa',
                  flexGrow: 1,
                  justifyContent: 'flex-start',
                }}
                renderItem={({ item }) => (
                  <VoucherCard
                    brand={item.brandName}
                    logo={item.imageUrl}
                    discounts={3}
                    onPress={() => router.push(`/discounts/${item.id}`)}
                  />
                )}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: '#f5f5fa' }}>
                <Text style={{ fontSize: 16, color: '#aaa', marginBottom: 10, textAlign: 'center' }}>
                  No results found for “{searchQuery}”
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#324E58', textAlign: 'center', marginBottom: 20 }}>
                  Want to see “{searchQuery}” here? Drop their info below!
                </Text>

                {submitted ? (
                  <Text style={{ color: '#324E58', fontWeight: '600', marginTop: 20, textAlign: 'center' }}>
                    ✅ Request submitted! Thank you — we’ll review and add them soon.
                  </Text>
                ) : (
                  <>
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
                      <Text style={{ color: '#fff', fontWeight: '600' }}>Submit Request</Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </BottomSheet>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
    height: 48,
  },
  tagsRow: {
    paddingBottom: 10,
    paddingLeft: 4,
  },
  tag: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#f2f2f2',
    borderRadius: 12,
    marginRight: 8,
  },
  tagActive: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
    borderWidth: 1,
  },
  tagText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  tagTextActive: {
    fontSize: 13,
    color: '#D0861F',
    fontWeight: '600',
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
});
