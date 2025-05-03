import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import SuccessModal from '../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';

export default function BeneficiaryScreen() {
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [hasShownFirstSelect, setHasShownFirstSelect] = useState(false);
  const [hasShownFirstFavorite, setHasShownFirstFavorite] = useState(false);
  const [activeTab, setActiveTab] = useState('Beneficiaries');

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

  const handleRequestBeneficiary = () => {
    setSuccessMessage('Beneficiary request sent successfully!');
    setShowSuccessModal(true);
    setConfettiTrigger(true);
  };

  const closeModal = () => {
    setShowSuccessModal(false);
    setSearchText('');
  };

  const filteredBeneficiaries = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={router.back}>
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#324E58' }}>Beneficiaries</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Speech Bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <Image source={require('../../assets/images/bolt-piggy.png')} style={{ width: 60, height: 60, resizeMode: 'contain' }} />
          <View style={{ backgroundColor: '#F5F5FA', padding: 12, borderRadius: 10, marginLeft: 10, flex: 1, borderWidth: 1, borderColor: '#E1E1E5' }}>
            <Text style={{ color: '#324E58', fontSize: 14 }}>
              Select only one to donate to. Favorite as many as you’d like to see their updates on your newsfeed. 
            </Text>
          </View>
        </View>

        {/* Your Selected Beneficiary */}
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#324E58', marginBottom: 10 }}>Your Selected Beneficiary</Text>

        {selectedBeneficiary && (
          <View style={{ marginBottom: 30, borderRadius: 12, overflow: 'hidden' }}>
            <Image source={beneficiaries.find(b => b.id === selectedBeneficiary)?.image} style={{ width: '100%', height: 150 }} />
            <View style={{ position: 'absolute', bottom: 10, left: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{beneficiaries.find(b => b.id === selectedBeneficiary)?.name}</Text>
              <Text style={{ fontSize: 12, color: '#fff' }}>{beneficiaries.find(b => b.id === selectedBeneficiary)?.category}</Text>
            </View>
          </View>
        )}

        {/* Toggle Tabs */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={() => setActiveTab('Beneficiaries')} style={{ paddingVertical: 10, marginHorizontal: 16 }}>
            <Text style={{ fontWeight: '700', color: activeTab === 'Beneficiaries' ? '#DB8633' : '#6D6E72', textAlign: 'center' }}>Beneficiary List</Text>
            {activeTab === 'Beneficiaries' && <View style={{ height: 2, backgroundColor: '#DB8633', marginTop: 4 }} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveTab('Volunteer')} style={{ paddingVertical: 10, marginHorizontal: 16 }}>
            <Text style={{ fontWeight: '700', color: activeTab === 'Volunteer' ? '#DB8633' : '#6D6E72', textAlign: 'center' }}>Volunteer Opportunities</Text>
            {activeTab === 'Volunteer' && <View style={{ height: 2, backgroundColor: '#DB8633', marginTop: 4 }} />}
          </TouchableOpacity>
        </View>

        {activeTab === 'Volunteer' ? (
          <Text style={{ textAlign: 'center', fontSize: 16, color: '#6D6E72' }}>Coming Soon!</Text>
        ) : (
          <>
            {/* Search Bar */}
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
              <TouchableOpacity style={{ marginLeft: 10 }} onPress={() => router.push('/beneficiaryFilter')}>
                <AntDesign name="filter" size={22} color="#DB8633" />
              </TouchableOpacity>
            </View>

            {/* Beneficiary Cards */}
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
                  }}
                >
                  <Image source={b.image} style={{ width: '100%', height: 100, resizeMode: 'cover' }} />
                  <TouchableOpacity style={{ position: 'absolute', top: 8, right: 8 }} onPress={() => toggleFavorite(b.id)}>
                    <AntDesign name={favorites.includes(b.id) ? 'heart' : 'hearto'} size={20} color="#DB8633" />
                  </TouchableOpacity>
                  {selectedBeneficiary === b.id && (
                    <AntDesign name="checkcircle" size={20} color="#DB8633" style={{ position: 'absolute', top: 8, left: 8 }} />
                  )}
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#324E58', marginBottom: 4 }}>{b.name}</Text>
                    <Text style={{ fontSize: 12, color: '#6d6e72' }}>{b.category}</Text>
                    <View style={{ position: 'absolute', bottom: 10, right: 10 }}>
                      <AntDesign name="right" size={16} color="#6d6e72" />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Modal and Confetti */}
      <SuccessModal visible={showSuccessModal} onClose={closeModal} message={successMessage} />
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
