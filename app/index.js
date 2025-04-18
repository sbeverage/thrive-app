import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

export default function Index() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      <View style={styles.card}>
        <View style={styles.content}>
          {/* Logo + Images */}
          <View style={styles.topSection}>
            <Image
              source={require('../assets/images/piggy-with-flowers.png')}
              style={styles.piggyImage}
              resizeMode="contain"
            />

            <Image
              source={require('../assets/images/thrive-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            <Text style={styles.tagline}>
              Live Generously.{"\n"}Shop Locally.
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonSection}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/signup')}
            >
              <Text style={styles.primaryText}>Get Started</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.outlineText}>I Already Have An Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: 390,
    height: 844,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 120,
    paddingBottom: 65,
  },
  topSection: {
    alignItems: 'center',
  },
  piggyImage: {
    width: 99,
    height: 165,
    marginBottom: 24,
  },
  logo: {
    width: 323,
    height: 58,
    marginTop: 24,
    marginBottom: 88,
  },
  tagline: {
    width: 359,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 30,
    color: '#6d6e72',
    fontWeight: '500',
    fontFamily: 'Helvetica',
    marginBottom: 120,
  },
  buttonSection: {
    width: '100%',
    paddingHorizontal: 17,
  },
  primaryButton: {
    backgroundColor: '#db8633',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '500',
    fontSize: 14,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#db8633',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlineText: {
    color: '#db8633',
    fontWeight: '500',
    fontSize: 14,
  },
});
