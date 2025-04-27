// app/beneficiaryPreference.js

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function BeneficiaryPreference() {
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([
    {
      id: 1,
      name: 'NPCF',
      category: 'Childhood Illness',
      image: require('../assets/images/child-cancer.jpg'),
    },
    {
      id: 2,
      name: 'Humane Society',
      category: 'Animal Welfare',
      image: require('../assets/images/humane-society.jpg'),
    },
    {
      id: 3,
      name: 'Charity Water',
      category: 'Low Income Families',
      image: require('../assets/images/charity-water.jpg'),
    },
    {
      id: 4,
      name: 'Dog Trust',
      category: 'Animal Welfare',
      image: require('../assets/images/humane-society.jpg'),
    },
  ]);

  const toggleFavorite = (id) => {
    if (favorites.includes(id)) {
      setFavorites(favorites.filter(favId => favId !== id));
    } else {
      setFavorites([...favorites, id]);
    }
  };

  const handleContinue = () => {
    router.push('/nextStep'); // placeholder for future next page
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleSkip = () => {
    router.replace('/guestHome');
  };

  const filteredBeneficiaries = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: '#fff', padding: 20 }}>
      {/* Top Navigation */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={handleGoBack}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: '#DB8633', fontSize: 14 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
        <View style={{ flex: 1, height: 4, backgroundColor: '#324E58', borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: '#324E58', borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: '#324E58', borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: '#324E58', borderRadius: 10, marginHorizontal: 2 }} />
        <Image source={require('../assets/images/walking-piggy.png')} style={{ width: 30, height: 24 }} />
      </View>

      {/* Speech Bubble */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 30 }}>
        <Image source={require('../assets/images/bolt-piggy.png')} style={{ width: 60, height: 60, resizeMode: 'contain' }} />
        <View style={{ backgroundColor: '#f5f5fa', padding: 12, borderRadius: 10, marginLeft: 10, flex: 1 }}>
          <Text style={{ color: '#324E58', fontSize: 16 }}>
            Select only one to donate to. Favorite as many as you’d like to see their updates on your newsfeed.
          </Text>
        </View>
      </View>

      {/* Search Bar with Icon */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5fa',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e1e1e5',
        paddingHorizontal: 10,
        marginBottom: 20,
        height: 48,
      }}>
        <AntDesign name="search1" size={20} color="#6d6e72" style={{ marginRight: 10 }} />
        <TextInput
          placeholder="Search Beneficiaries"
          placeholderTextColor="#6d6e72"
          value={searchText}
          onChangeText={setSearchText}
          style={{ flex: 1, fontSize: 16, color: '#324E58' }}
        />
      </View>

      {/* Beneficiary List */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {filteredBeneficiaries.map((b) => (
          <View
            key={b.id}
            style={{
              width: '48%',
              backgroundColor: '#F5F5FA',
              borderRadius: 10,
              marginBottom: 20,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => router.push(`/beneficiaryDetails?id=${b.id}`)}
            >
              <Image source={b.image} style={{ width: '100%', height: 100, resizeMode: 'cover' }} />

              {/* Heart Favorite */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 8, right: 8 }}
                onPress={() => toggleFavorite(b.id)}
              >
                <AntDesign name={favorites.includes(b.id) ? 'heart' : 'hearto'} size={20} color="#DB8633" />
              </TouchableOpacity>

              <View style={{ padding: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#324E58', marginBottom: 4 }}>
                  {b.name}
                </Text>
                <Text style={{ fontSize: 12, color: '#6d6e72' }}>{b.category}</Text>

                {/* Right Arrow */}
                <View style={{ position: 'absolute', bottom: 10, right: 10 }}>
                  <AntDesign name="right" size={16} color="#6d6e72" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Continue Button */}
      <TouchableOpacity
        onPress={handleContinue}
        style={{
          backgroundColor: '#DB8633',
          paddingVertical: 15,
          borderRadius: 10,
          alignItems: 'center',
          marginTop: 10,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16 }}>Continue</Text>
      </TouchableOpacity>

      {/* No Results */}
      {filteredBeneficiaries.length === 0 && (
        <Text style={{ textAlign: 'center', marginTop: 20, color: '#6d6e72' }}>
          No beneficiaries found.
        </Text>
      )}
    </ScrollView>
  );
}
