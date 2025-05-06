import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function VolunteeredEvents() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Volunteered Events</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Coming Soon Section */}
      <View style={styles.content}>
        <Image
          source={require('../../../assets/images/coming-soon.png')} // Make sure to include an image asset for this path
          style={styles.image}
        />
        <Text style={styles.title}>Coming Soon!</Text>
        <Text style={styles.subtitle}>
          We’re working on something exciting. Check back soon for volunteer opportunities near you.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  image: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#6D6E72',
    textAlign: 'center',
    lineHeight: 22,
  },
});
