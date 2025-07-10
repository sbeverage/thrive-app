// app/beneficiarySearch.js

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import SuccessModal from '../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 120,
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
  // ... keep other styles ...
});

export default function BeneficiarySearch() {
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [hasShownFirstSelect, setHasShownFirstSelect] = useState(false);
  const [hasShownFirstFavorite, setHasShownFirstFavorite] = useState(false);

  const [beneficiaries, setBeneficiaries] = useState([
    { id: 1, name: 'NPCF', category: 'Childhood Illness', image: require('../assets/images/child-cancer.jpg') },
    { id: 2, name: 'Humane Society', category: 'Animal Welfare', image: require('../assets/images/humane-society.jpg') },
    { id: 3, name: 'Charity Water', category: 'Low Income Families', image: require('../assets/images/charity-water.jpg') },
    { id: 4, name: 'Dog Trust', category: 'Animal Welfare', image: require('../assets/images/humane-society.jpg') },
  ]);

  const toggleFavorite = (id) => {
    if (favorites.includes(id)) {
      setFavorites(favorites.filter(favId => favId !== id));
    } else {
      setFavorites([...favorites, id]);
      if (!hasShownFirstFavorite) {
        setSuccessMessage("You're now following a cause!");
        setShowSuccessModal(true);
        setConfettiTrigger(true);
        setHasShownFirstFavorite(true);
      }
    }
  };

  const selectBeneficiary = (id) => {
    setSelectedBeneficiary(id);
    if (!hasShownFirstSelect) {
      setSuccessMessage("Awesome! You've selected your cause!");
      setShowSuccessModal(true);
      setConfettiTrigger(true);
      setHasShownFirstSelect(true);
    }
  };

  const handleSkip = () => {
    router.replace('/guestHome');
  };

  const handleRequestBeneficiary = () => {
    setSuccessMessage('Beneficiary request sent successfully!');
    setShowSuccessModal(true);
    setConfettiTrigger(true);
  };

  const closeModal = () => {
    setShowSuccessModal(false);
    setSearchText('');
  };

  const handleContinue = () => {
    router.push('/donationType');
  };

  const filteredBeneficiaries = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, paddingTop: 60 }}>
        
        {/* Top Navigation */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity style={styles.backButton} onPress={router.back}>
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSkip}>
            <Text style={{ color: '#DB8633', fontSize: 14 }}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Speech Bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 30 }}>
          <Image source={require('../assets/images/bolt-piggy.png')} style={{ width: 60, height: 60, resizeMode: 'contain', marginRight: 12 }} />
          <View style={{ 
            backgroundColor: '#f5f5fa', 
            paddingVertical: 16, 
            paddingHorizontal: 20, 
            borderRadius: 20, 
            marginLeft: 0, 
            flex: 1,
            borderWidth: 1,
            borderColor: '#e1e1e5',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2,
            position: 'relative',
          }}>
            <Text style={{ color: '#324E58', fontSize: 16, lineHeight: 22 }}>
              Select only one to donate to. Favorite as many as you'd like to see their updates on your newsfeed.
            </Text>
            <View style={{
              position: 'absolute',
              left: -8,
              top: 20,
              width: 0,
              height: 0,
              borderLeftWidth: 8,
              borderRightWidth: 0,
              borderBottomWidth: 8,
              borderTopWidth: 8,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: '#f5f5fa',
              borderTopColor: 'transparent',
            }} />
          </View>
        </View>

        {/* Search Bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5fa', borderRadius: 8, borderWidth: 1, borderColor: '#e1e1e5', paddingHorizontal: 10, marginBottom: 20 }}>
          <AntDesign name="search1" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search Beneficiaries"
            placeholderTextColor="#6d6e72"
            value={searchText}
            onChangeText={setSearchText}
            style={{ flex: 1, height: 48, fontSize: 16, color: '#324E58' }}
          />
        </View>

        {/* Beneficiary List or No Match */}
        {filteredBeneficiaries.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {filteredBeneficiaries.map((b) => (
              <TouchableOpacity
                key={b.id}
                onPress={() => selectBeneficiary(b.id)}
                style={{
                  width: '48%',
                  backgroundColor: selectedBeneficiary === b.id ? '#FFEAD2' : '#F5F5FA',
                  borderRadius: 10,
                  marginBottom: 20,
                  overflow: 'hidden',
                  borderWidth: selectedBeneficiary === b.id ? 2 : 0,
                  borderColor: selectedBeneficiary === b.id ? '#DB8633' : 'transparent',
                  shadowColor: selectedBeneficiary === b.id ? '#DB8633' : 'transparent',
                  shadowOpacity: selectedBeneficiary === b.id ? 0.2 : 0,
                  shadowOffset: { width: 0, height: 2 },
                  shadowRadius: 4,
                  elevation: selectedBeneficiary === b.id ? 4 : 0,
                }}
              >
                <Image source={b.image} style={{ width: '100%', height: 100, resizeMode: 'cover' }} />

                {/* Heart favorite icon */}
                <TouchableOpacity
                  style={{ position: 'absolute', top: 8, right: 8 }}
                  onPress={() => toggleFavorite(b.id)}
                >
                  <AntDesign name={favorites.includes(b.id) ? 'heart' : 'hearto'} size={20} color="#DB8633" />
                </TouchableOpacity>

                {selectedBeneficiary === b.id && (
                  <AntDesign
                    name="checkcircle"
                    size={20}
                    color="#DB8633"
                    style={{ position: 'absolute', top: 8, left: 8 }}
                  />
                )}

                <View style={{ padding: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#324E58', marginBottom: 4 }}>
                    {b.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6d6e72' }}>{b.category}</Text>

                  <View style={{ position: 'absolute', bottom: 10, right: 10 }}>
                    <AntDesign name="right" size={16} color="#6d6e72" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ textAlign: 'center', color: '#6d6e72', marginBottom: 20 }}>
              Sorry, no beneficiaries found.
            </Text>
            <Text style={{ textAlign: 'center', color: '#324E58', fontSize: 18, fontWeight: '700', marginBottom: 20 }}>
              Would you like to see "{searchText}" on the app?
            </Text>

            <TouchableOpacity
              style={{
                borderWidth: 2,
                borderColor: '#DB8633',
                borderRadius: 8,
                paddingVertical: 12,
                paddingHorizontal: 20,
                marginBottom: 20,
              }}
              onPress={handleRequestBeneficiary}
            >
              <Text style={{ color: '#DB8633', fontSize: 16 }}>Yes! Request Beneficiary</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Static Bottom Button */}
      <View style={{
        backgroundColor: '#fff',
        padding: 20,
        borderTopWidth: 1,
        borderColor: '#e1e1e5',
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
      }}>
        <TouchableOpacity
          onPress={handleContinue}
          style={{
            backgroundColor: '#DB8633',
            paddingVertical: 15,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16 }}>Continue</Text>
        </TouchableOpacity>
      </View>

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        onClose={closeModal}
        message={successMessage}
      />

      {/* Confetti */}
      {confettiTrigger && (
        <ConfettiCannon
          count={100}
          origin={{ x: -10, y: 0 }}
          fadeOut
          explosionSpeed={350}
          fallSpeed={3000}
          onAnimationEnd={() => setConfettiTrigger(false)}
        />
      )}
    </View>
  );
}
