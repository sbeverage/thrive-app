import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import SuccessModal from '../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MINIMIZED_HEIGHT = SCREEN_HEIGHT * 0.45;
const MAXIMIZED_HEIGHT = 0;

export default function BeneficiaryPreferences() {
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

  const beneficiaries = [
    { id: 1, name: 'NPCF', category: 'Childhood Illness', image: require('../../../assets/images/child-cancer.jpg') },
    { id: 2, name: 'Humane Society', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg') },
    { id: 3, name: 'Charity Water', category: 'Low Income Families', image: require('../../../assets/images/charity-water.jpg') },
    { id: 4, name: 'Dog Trust', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg') },
  ];

  const filteredBeneficiaries = beneficiaries.filter(b => b.name.toLowerCase().includes(searchText.toLowerCase()));

  const toggleFavorite = id => {
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

  const selectBeneficiary = id => {
    setSelectedBeneficiary(id);
    if (!hasShownFirstSelect) {
      setSuccessMessage("Awesome! You've selected your cause!");
      setShowSuccessModal(true);
      setConfettiTrigger(true);
      setHasShownFirstSelect(true);
    }
  };

  const closeModal = () => {
    setShowSuccessModal(false);
    setSearchText('');
  };

  const pan = useRef(new Animated.Value(MINIMIZED_HEIGHT)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gestureState) => {
        return gestureState.y0 - pan._value <= 40;
      },
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderMove: Animated.event([null, { dy: pan }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 50) {
          Animated.spring(pan, { toValue: MINIMIZED_HEIGHT, useNativeDriver: false }).start();
        } else if (gesture.dy < -50) {
          Animated.spring(pan, { toValue: MAXIMIZED_HEIGHT, useNativeDriver: false }).start();
        } else {
          Animated.spring(pan, {
            toValue: pan._value > SCREEN_HEIGHT * 0.2 ? MINIMIZED_HEIGHT : MAXIMIZED_HEIGHT,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ ...StyleSheet.absoluteFillObject }}
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

      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          width: '100%',
          backgroundColor: '#fff',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: SCREEN_HEIGHT * 0.8,
          transform: [
            {
              translateY: pan.interpolate({
                inputRange: [MAXIMIZED_HEIGHT, MINIMIZED_HEIGHT],
                outputRange: [MAXIMIZED_HEIGHT, MINIMIZED_HEIGHT],
                extrapolate: 'clamp',
              }),
            },
          ],
        }}
        {...panResponder.panHandlers}
      >
        <View style={{ height: 6, backgroundColor: '#ccc', borderRadius: 3, alignSelf: 'center', width: 40, marginVertical: 10 }} />

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={router.back}>
              <AntDesign name="arrowleft" size={24} color="#324E58" />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#324E58' }}>Beneficiaries</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            <Image source={require('../../../assets/images/bolt-piggy.png')} style={{ width: 60, height: 60, resizeMode: 'contain' }} />
            <View style={{ backgroundColor: '#F5F5FA', padding: 12, borderRadius: 10, marginLeft: 10, flex: 1, borderWidth: 1, borderColor: '#E1E1E5' }}>
              <Text style={{ color: '#324E58', fontSize: 14 }}>
                Select only one to donate to. Favorite as many as you’d like to see their updates on your newsfeed.
              </Text>
            </View>
          </View>

          {selectedBeneficiary && (
            <View style={{ marginBottom: 30, borderRadius: 12, overflow: 'hidden' }}>
              <Image source={beneficiaries.find(b => b.id === selectedBeneficiary)?.image} style={{ width: '100%', height: 150 }} />
              <View style={{ position: 'absolute', bottom: 10, left: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{beneficiaries.find(b => b.id === selectedBeneficiary)?.name}</Text>
                <Text style={{ fontSize: 12, color: '#fff' }}>{beneficiaries.find(b => b.id === selectedBeneficiary)?.category}</Text>
              </View>
            </View>
          )}

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
      </Animated.View>

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