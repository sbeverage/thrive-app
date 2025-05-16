// File: app/signupFlow/beneficiarySignupCause.js

import React, { useRef, useMemo, useState } from 'react';
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
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { AntDesign, Feather } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';

export default function BeneficiaryPreferences() {
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
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

  const filtered = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const toggleFavorite = id => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const sheetRef = useRef(null);
  const snapPoints = useMemo(() => ['25%', '95%'], []);

  return (
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
        {beneficiaries.map(b => (
          <Marker
            key={b.id}
            coordinate={{ latitude: 37.78825 + b.id * 0.001, longitude: -122.4324 }}
            title={b.name}
            description={b.category}
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
          <View style={{ flex: 1 }}>
            {/* Sticky top section */}
            <View style={{ padding: 20 }}>
              <View style={styles.header}>
                <TouchableOpacity onPress={router.back}>
                  <AntDesign name="arrowleft" size={24} color="#324E58" />
                </TouchableOpacity>
                <Text style={styles.title}>Beneficiaries</Text>
                <View style={{ width: 24 }} />
              </View>

              <View style={styles.tipRow}>
                <Image source={require('../../assets/images/bolt-piggy.png')} style={styles.piggy} />
                <View style={styles.tipBox}>
                  <Text style={styles.tipText}>
                    Pick one to donate to. Follow many. Just tap the heart to stay in the loop!
                  </Text>
                </View>
              </View>

              <View style={styles.searchRow}>
                <AntDesign name="search1" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="Search Beneficiaries"
                  placeholderTextColor="#6d6e72"
                  value={searchText}
                  onChangeText={setSearchText}
                  style={styles.searchInput}
                />
                <TouchableOpacity onPress={() => router.push('/signupFlow/beneficiarySignupFilter')}>
                  <Feather name="filter" size={22} color="#6d6e72" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Scrollable card list */}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              {filtered.length > 0 ? (
                <View style={styles.cardGrid}>
                  {filtered.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() =>
                        router.push({ pathname: '/signupFlow/beneficiarySignupDetails', params: { id: b.id.toString() } })
                      }
                      style={styles.card}
                    >
                      <Image source={b.image} style={styles.cardImage} />
                      <TouchableOpacity
                        onPress={() => toggleFavorite(b.id)}
                        style={styles.heartIcon}
                      >
                        <AntDesign name={favorites.includes(b.id) ? 'heart' : 'hearto'} size={20} color="#DB8633" />
                      </TouchableOpacity>
                      <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>{b.name}</Text>
                        <Text style={styles.cardSubtitle}>{b.category}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems: 'center', marginTop: 20 }}>
                  <Text style={styles.noResultsText}>No results found for “{searchText}”</Text>
                  <Text style={styles.inviteText}>
                    Want to see “{searchText}” here? Drop their info below!
                  </Text>

                  {submitted ? (
                    <Text style={{ color: '#324E58', fontWeight: '600', marginTop: 20 }}>
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
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  piggy: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
  },
  tipBox: {
    backgroundColor: '#F5F5FA',
    padding: 12,
    borderRadius: 10,
    marginLeft: 10,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E1E1E5',
  },
  tipText: {
    color: '#324E58',
    fontSize: 14,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#F5F5FA',
    borderRadius: 10,
    marginBottom: 20,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  heartIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  cardText: {
    padding: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6d6e72',
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
  noResultsText: {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 10,
    textAlign: 'center',
  },
  inviteText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 20,
  },
});
