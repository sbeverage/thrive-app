import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Image,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import MapView, { Marker, Circle } from 'react-native-maps';
import VoucherCard from '../../../components/VoucherCard';
import { useRouter } from 'expo-router';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MINIMIZED_HEIGHT = SCREEN_HEIGHT * 0.45;
const MAXIMIZED_HEIGHT = 0;

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
];

export default function DiscountsScreen() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const pan = useRef(new Animated.Value(MINIMIZED_HEIGHT)).current;
  const flatListRef = useRef(null);
  const router = useRouter();
  const scrollOffsetY = useRef(0);
  const gestureStartY = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gestureState) => {
        gestureStartY.current = gestureState.y0;
        return gestureState.y0 <= 100; // Only trigger pan if touch started at the top 100px
      },
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureStartY.current <= 100 && Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: Animated.event([null, { dy: pan }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 50) {
          Animated.spring(pan, {
            toValue: MINIMIZED_HEIGHT,
            useNativeDriver: false,
          }).start();
        } else if (gesture.dy < -50) {
          Animated.spring(pan, {
            toValue: MAXIMIZED_HEIGHT,
            useNativeDriver: false,
          }).start();
        } else {
          Animated.spring(pan, {
            toValue:
              pan._value > SCREEN_HEIGHT * 0.2 ? MINIMIZED_HEIGHT : MAXIMIZED_HEIGHT,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const filteredVendors = vendors.filter(vendor => {
    const matchesCategory =
      activeCategory === 'All' || vendor.category === activeCategory;
    const matchesSearch = vendor.brandName
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        customMapStyle={[
          { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#fdf7f1' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#f0e6db' }] },
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#D0861F' }] },
          { featureType: 'water', stylers: [{ color: '#e6f2f3' }] },
        ]}
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
        {filteredVendors.map(vendor => (
          <Marker
            key={vendor.id}
            coordinate={{ latitude: vendor.latitude, longitude: vendor.longitude }}
            title={vendor.brandName}
            description={vendor.discountText}
          />
        ))}
      </MapView>

      <Animated.View
        style={[styles.overlay, { transform: [{ translateY: pan }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.dragHandle} />
        <View style={styles.contentWrapper}>
          <View style={styles.searchWrapper}>
            <TextInput
              placeholder="Search Business"
              placeholderTextColor="#aaa"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => router.push('/(tabs)/discounts/filter')}
            >
              <Image
                source={require('../../../assets/icons/filter.png')}
                style={styles.filterIcon}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagsRow}
          >
            {['All', 'Coffee Shop', 'Electronics', 'Shopping Store', 'Tech'].map(tag => (
              <TouchableOpacity
                key={tag}
                style={[styles.tag, activeCategory === tag && styles.tagActive]}
                onPress={() => setActiveCategory(tag)}
              >
                <Text style={[styles.tagText, activeCategory === tag && styles.tagTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.fixedVoucherListHeight}>
          <FlatList
            ref={flatListRef}
            data={filteredVendors}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <VoucherCard brand={item.brandName} logo={item.imageUrl} discounts={3} />
            )}
            contentContainerStyle={styles.voucherListWithBackground}
            showsVerticalScrollIndicator={false}
            onScroll={e => {
              scrollOffsetY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#F5F5FA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.7,
    height: SCREEN_HEIGHT * 0.55,
    paddingTop: 10,
    paddingHorizontal: 0,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginBottom: 8,
  },
  contentWrapper: {
    paddingHorizontal: 16,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
  },
  filterButton: {
    marginLeft: 10,
  },
  filterIcon: {
    width: 20,
    height: 20,
    tintColor: '#324E58',
  },
  tagsRow: {
    paddingVertical: 8,
    paddingLeft: 20,
  },
  tag: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#f2f2f2',
    borderRadius: 12,
    marginRight: 8,
    alignSelf: 'flex-start',
  },
  tagActive: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
    borderWidth: 1,
  },
  tagText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#666',
    fontWeight: '500',
  },
  tagTextActive: {
    fontSize: 13,
    lineHeight: 16,
    color: '#D0861F',
    fontWeight: '600',
  },
  voucherListWithBackground: {
    paddingBottom: 100,
    paddingHorizontal: 16,
  },
  fixedVoucherListHeight: {
    flex: 1,
  },
});
