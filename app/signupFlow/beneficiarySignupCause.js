// File: app/signupFlow/beneficiaryCause.js

import React, { useState, useRef, useEffect } from 'react';
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
  Keyboard,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MINIMIZED_HEIGHT = SCREEN_HEIGHT * 0.45;
const MAXIMIZED_HEIGHT = 0;

export default function BeneficiaryPreferences() {
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const beneficiaries = [
    { id: 1, name: 'NPCF', category: 'Childhood Illness', size: 'Large', image: require('../../assets/images/child-cancer.jpg') },
    { id: 2, name: 'Humane Society', category: 'Animal Welfare', size: 'Medium', image: require('../../assets/images/humane-society.jpg') },
    { id: 3, name: 'Charity Water', category: 'Low Income Families', size: 'Large', image: require('../../assets/images/charity-water.jpg') },
    { id: 4, name: 'Dog Trust', category: 'Animal Welfare', size: 'Small', image: require('../../assets/images/humane-society.jpg') },
  ];

  const filteredBeneficiaries = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const toggleFavorite = id => {
    if (favorites.includes(id)) {
      setFavorites(favorites.filter(favId => favId !== id));
    } else {
      setFavorites([...favorites, id]);
    }
  };

  const pan = useRef(new Animated.Value(MINIMIZED_HEIGHT)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gestureState) => {
        if (keyboardVisible) return false;
        return gestureState.y0 - pan._value <= 40;
      },
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (keyboardVisible) return false;
        return Math.abs(gestureState.dy) > 10;
      },
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
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={router.back}>
              <AntDesign name="arrowleft" size={24} color="#324E58" />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#324E58' }}>Beneficiaries</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            <Image source={require('../../assets/images/bolt-piggy.png')} style={{ width: 60, height: 60, resizeMode: 'contain' }} />
            <View style={{ backgroundColor: '#F5F5FA', padding: 12, borderRadius: 10, marginLeft: 10, flex: 1, borderWidth: 1, borderColor: '#E1E1E5' }}>
              <Text style={{ color: '#324E58', fontSize: 14 }}>
                Select a beneficiary to view more and complete your setup.
              </Text>
            </View>
          </View>

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
          </View>

          {filteredBeneficiaries.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {filteredBeneficiaries.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() =>
                    router.push({
                      pathname: '/signupFlow/beneficiarySignupDetails',
                      params: { id: b.id.toString() }, // pass ID only
                    })
                  }
                  style={{
                    width: '48%',
                    backgroundColor: '#F5F5FA',
                    borderRadius: 10,
                    marginBottom: 20,
                    overflow: 'hidden',
                  }}
                >
                  <Image source={b.image} style={{ width: '100%', height: 100, resizeMode: 'cover' }} />
                  <TouchableOpacity style={{ position: 'absolute', top: 8, right: 8 }} onPress={() => toggleFavorite(b.id)}>
                    <AntDesign name={favorites.includes(b.id) ? 'heart' : 'hearto'} size={20} color="#DB8633" />
                  </TouchableOpacity>
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#324E58', marginBottom: 4 }}>{b.name}</Text>
                    <Text style={{ fontSize: 12, color: '#6d6e72' }}>{b.category}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={{ textAlign: 'center', marginTop: 20 }}>No results found.</Text>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
