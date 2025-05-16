// file: app/splashScreen.js
import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { SplashScreen, useRouter } from 'expo-router';

const piggy = require('../assets/images/piggy-with-flowers.png');
const logo = require('../assets/images/thrive-logo.png');

export default function Splash() {
  const router = useRouter();
  const piggyOpacity = useRef(new Animated.Value(0)).current;
  const piggyTranslateY = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    SplashScreen.preventAutoHideAsync();

    Animated.sequence([
      Animated.timing(piggyOpacity, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(piggyTranslateY, {
        toValue: -40,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
    ]).start(() => {
      SplashScreen.hideAsync();
      router.replace('/');
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={piggy}
        style={[
          styles.piggy,
          {
            opacity: piggyOpacity,
            transform: [{ translateY: piggyTranslateY }],
          },
        ]}
        resizeMode="contain"
      />
      <Animated.Image
        source={logo}
        style={[styles.logo, { opacity: logoOpacity }]}
        resizeMode="contain"
      />
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  piggy: {
    width: 120,
    height: 160,
    marginBottom: 20,
  },
  logo: {
    width: width * 0.7,
    height: 60,
    marginTop: 10,
  },
});