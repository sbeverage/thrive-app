import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import SuccessModal from '../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';

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
    { id: 1, name: 'NPCF', category: 'Childhood Illness', image: require('../../assets/images/child-cancer.jpg') },
    { id: 2, name: 'Humane Society', category: 'Animal Welfare', image: require('../../assets/images/humane-society.jpg') },
    { id: 3, name: 'Charity Water', category: 'Low Income Families', image: require('../../assets/images/charity-water.jpg') },
    { id: 4, name: 'Dog Trust', category: 'Animal Welfare', image: require('../../assets/images/humane-society.jpg') },
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
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        
        {/* Top Header Navigation */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={router.back}>
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#324E58' }}>Beneficiaries</Text>
          <View style={{ width: 24 }} /> {/* spacer */}
        </View>

        {/* Speech Bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <Image source={require('../../assets/images/bolt-piggy.png')} style={{ width: 60, height: 60, resizeMode: 'contain' }} />
          <View style={{ backgroundColor: '#F5F5FA', padding: 12, borderRadius: 10, marginLeft: 10, flex: 1, borderWidth: 1, borderColor: '#E1E1E5' }}>
            <Text style={{ color: '#324E58', fontSize: 14 }}>
              Favorite as many as you’d like to see their updates on your newsfeed. Select only one to donate to.
            </Text>
          </View>
        </View>

        {/* Search Bar & Filter */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5fa', borderRadius: 8, borderWidth: 1, borderColor: '#e1e1e5', paddingHorizontal: 10, flex: 1 }}>
            <AntDesign name="search1" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Search Beneficiaries"
              placeholderTextColor="#6d6e72"
              value={searchText}
              onChangeText={setSearchText}
              style={{ flex: 1, height: 48, fontSize: 16, color: '#324E58' }}
            />
          </View>
          <TouchableOpacity style={{ marginLeft: 10 }}>
            <AntDesign name="filter" size={22} color="#DB8633" />
          </TouchableOpacity>
        </View>

        {/* -- Continue with your existing beneficiary list section here -- */}
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
