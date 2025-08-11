// file: app/index.js
import React, { useState, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

const slides = [
  {
    key: '1',
    title: 'SHOP',
    description: 'Discover great deals from local merchants and online retailers.',
    image: require('../assets/images/slider-image-1.png'),
  },
  {
    key: '2',
    title: 'SAVE',
    description: 'Earn rewards and savings every time you shop.',
    image: require('../assets/images/slider-image-2.png'),
  },
  {
    key: '3',
    title: 'GIVE',
    description: 'Support causes that matter to you through everyday purchases.',
    image: require('../assets/images/slider-image-3.png'),
  },
];

export default function Index() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);

  const handleScroll = (event) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {/* Decorative Half Circles */}
      <Image source={require('../assets/images/half-circle-left.png')} style={styles.leftCircle} />
      <Image source={require('../assets/images/half-circle-right.png')} style={styles.rightCircle} />

      <Text style={styles.welcomeText}>Welcome to</Text>
      <Image
        source={require('../assets/logos/initiative-logo-no-web.png')}
        style={styles.headerLogo}
        resizeMode="contain"
      />

      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.circleWrapper}>
              {/* Removed the image inside the gray circle */}
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideDescription}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.dotsContainer}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentIndex === index && styles.activeDot,
            ]}
          />
        ))}
      </View>

      <View style={styles.buttonsWrapper}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.primaryText}>Sign Up</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.outlineButton}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.outlineText}>Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 60,
  },
  welcomeText: {
    fontSize: 22,
    color: '#6d6e72',
    marginBottom: 5,
    marginTop: 60,
  },
  headerLogo: {
    width: 310,
    height: 30,
    marginBottom: 60,
  },
  slide: {
    width: width,
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  circleWrapper: {
    width: 300,
    height: 300,
    borderRadius: 140,
    backgroundColor: '#DADADA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    marginBottom: 30,
  },
  circleImage: {
    width: 400,
    height: 400,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2F4E58',
    marginBottom: 8,
  },
  slideDescription: {
    fontSize: 16,
    color: '#2F4E58',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 5,
  },
  activeDot: {
    backgroundColor: '#2F4E58',
  },
  buttonsWrapper: {
    flexDirection: 'row',
    marginTop: 30,
    marginBottom: 40,
    justifyContent: 'center',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#db8633',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#db8633',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlineText: {
    color: '#db8633',
    fontWeight: '600',
    fontSize: 16,
  },
  leftCircle: {
    position: 'absolute',
    top: 80,
    left: -30,
    width: 100,
    height: 100,
    resizeMode: 'contain',
  },
  rightCircle: {
    position: 'absolute',
    bottom: 140,
    right: -20,
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
});
