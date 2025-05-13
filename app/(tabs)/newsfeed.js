// File: app/(tabs)/newsfeed.js

import React from 'react';
import { View, Text, Image, StyleSheet, SafeAreaView } from 'react-native';

export default function NewsfeedScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.contentWrapper}>
        <Image
          source={require('../../assets/images/piggy-newsfeed.png')} // Ensure image is in this path
          style={styles.image}
          resizeMode="contain"
        />
        <Text style={styles.title}>Coming Soon!</Text>
        <Text style={styles.subtitle}>Piggy is drafting the first post</Text>
        <Text style={styles.caption}>Check back soon for some feel-good stories, tips, and updates!</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  contentWrapper: {
    alignItems: 'center',
  },
  image: {
    width: 220,
    height: 220,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#DB8633',
    marginBottom: 6,
  },
  caption: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
});
