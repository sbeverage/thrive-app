import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  Animated,
  PanResponder,
  Keyboard,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import SuccessModal from '../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useBeneficiary } from '../../context/BeneficiaryContext'; // ✅ fixed path

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MINIMIZED_HEIGHT = SCREEN_HEIGHT * 0.45;
const MAXIMIZED_HEIGHT = 0;

export default function BeneficiaryScreen() {
  const router = useRouter();
  const { selectedBeneficiary, setSelectedBeneficiary } = useBeneficiary(); // ✅ now includes setter

  const [searchText, setSearchText] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const beneficiaries = [
    { id: 1, name: 'NPCF', category: 'Childhood Illness', image: require('../../../assets/images/child-cancer.jpg') },
    { id: 2, name: 'Humane Society', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg') },
    { id: 3, name: 'Charity Water', category: 'Low Income Families', image: require('../../../assets/images/charity-water.jpg') },
    { id: 4, name: 'Dog Trust', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg') },
  ];

  const filteredBeneficiaries = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const selectBeneficiary = (id) => {
    const selected = beneficiaries.find(b => b.id === id);
    if (selected) {
      setSelectedBeneficiary(selected); // ✅ global state
      setSuccessMessage("Awesome! You've selected your cause!");
      setShowSuccessModal(true);
      setConfettiTrigger(true);
    }
  };

  const closeModal = () => {
    setShowSuccessModal(false);
    setSearchText('');
  };

  const pan = useRef(new Animated.Value(MINIMIZED_HEIGHT)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !keyboardVisible,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderMove: Animated.event([null, { dy: pan }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 50) {
          Animated.spring(pan, { toValue: MINIMIZED_HEIGHT, useNativeDriver: false }).start();
        } else {
          Animated.spring(pan, { toValue: MAXIMIZED_HEIGHT, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    Animated.spring(pan, {
      toValue: keyboardVisible ? MAXIMIZED_HEIGHT : MINIMIZED_HEIGHT,
      useNativeDriver: false,
    }).start();
  }, [keyboardVisible]);

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
          transform: [{
            translateY: pan.interpolate({
              inputRange: [MAXIMIZED_HEIGHT, MINIMIZED_HEIGHT],
              outputRange: [MAXIMIZED_HEIGHT, MINIMIZED_HEIGHT],
              extrapolate: 'clamp',
            })
          }],
        }}
        {...panResponder.panHandlers}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          
          {/* Title */}
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#324E58', marginBottom: 12 }}>
            Beneficiaries
          </Text>

          {/* Selected Beneficiary Card */}
          {selectedBeneficiary && (
            <View style={{
              marginBottom: 16,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: '#FFEAD2',
              borderWidth: 2,
              borderColor: '#DB8633',
            }}>
              <Image
                source={selectedBeneficiary.image}
                style={{ width: '100%', height: 120, resizeMode: 'cover' }}
              />
              <View style={{ position: 'absolute', bottom: 10, left: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                  {selectedBeneficiary.name}
                </Text>
                <Text style={{ fontSize: 12, color: '#fff' }}>
                  {selectedBeneficiary.category}
                </Text>
              </View>
            </View>
          )}

          {/* Search Bar + Filter */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5fa', borderRadius: 8, borderWidth: 1, borderColor: '#e1e1e5', paddingHorizontal: 10, marginBottom: 16 }}>
            <AntDesign name="search1" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Search Beneficiaries"
              placeholderTextColor="#6d6e72"
              value={searchText}
              onChangeText={setSearchText}
              style={{ flex: 1, height: 48, fontSize: 16, color: '#324E58' }}
            />
            <TouchableOpacity onPress={() => router.push('/(tabs)/beneficiary/beneficiaryFilter')} style={{ marginLeft: 10 }}>
              <AntDesign name="filter" size={22} color="#DB8633" />
            </TouchableOpacity>
          </View>

          {/* Beneficiary Cards */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {filteredBeneficiaries.map((b) => (
              <View key={b.id} style={{ width: '48%', backgroundColor: '#F5F5FA', borderRadius: 10, marginBottom: 20, overflow: 'hidden' }}>
                <TouchableOpacity onPress={() => selectBeneficiary(b.id)}>
                  <Image source={b.image} style={{ width: '100%', height: 100, resizeMode: 'cover' }} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/beneficiary/beneficiaryDetail', params: { id: b.id.toString() } })} style={{ padding: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#324E58', marginBottom: 4 }}>{b.name}</Text>
                  <Text style={{ fontSize: 12, color: '#6d6e72' }}>{b.category}</Text>
                  <AntDesign name="right" size={16} color="#6d6e72" style={{ position: 'absolute', right: 10, bottom: 10 }} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      </Animated.View>

      {/* Modal & Confetti */}
      <SuccessModal visible={showSuccessModal} onClose={closeModal} message={successMessage} />
      {confettiTrigger && (
        <ConfettiCannon
          count={100}
          origin={{ x: SCREEN_HEIGHT / 2, y: 0 }}
          fadeOut
          explosionSpeed={350}
          fallSpeed={3000}
          onAnimationEnd={() => setConfettiTrigger(false)}
        />
      )}
    </View>
  );
}
