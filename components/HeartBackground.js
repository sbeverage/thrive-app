// components/HeartBackground.js

import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export default function HeartBackground() {
  return (
    <View style={styles.container}>
      {/* Tiny hearts scattered */}
      <Image
        source={require('../assets/images/hearts-background.png')}
        style={[styles.heart, { top: 80, left: '10%', opacity: 0.15, transform: [{ rotate: '-45deg' }] }]}
      />
      <Image
        source={require('../assets/images/hearts-background.png')}
        style={[styles.heart, { top: 100, right: '5%', opacity: 0.2, transform: [{ rotate: '10deg' }] }]}
      />
      <Image
        source={require('../assets/images/hearts-background.png')}
        style={[styles.heart, { top: 220, left: '20%', opacity: 0.12, transform: [{ rotate: '-8deg' }] }]}
      />
      <Image
        source={require('../assets/images/hearts-background.png')}
        style={[styles.heart, { top: 320, right: '15%', opacity: 0.18, transform: [{ rotate: '5deg' }] }]}
      />
      <Image
        source={require('../assets/images/hearts-background.png')}
        style={[styles.heart, { bottom: 120, left: '30%', opacity: 0.1, transform: [{ rotate: '-25deg' }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  heart: {
    position: 'absolute',
    width: 80, // 💥 Much smaller than before
    height: 80,
    resizeMode: 'contain',
  },
});

