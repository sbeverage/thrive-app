import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function ExplainerDonate() {
  const router = useRouter();

  const handleContinue = () => {
    router.push('/signupFlow/beneficiarySignupCause'); // next screen
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Back Navigation */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
      </TouchableOpacity>

      {/* New Piggy with Chat Box */}
      <View style={styles.piggySection}>
        <Image
          source={require('../../assets/images/piggy-choose-charity.png')} // Update path to your new image
          style={styles.piggyHero}
        />
      </View>

      {/* Explainer Text */}
      <Text style={styles.paragraph}>
        Every month, your donation supports a cause close to your heart —
        and as a thank you, you'll unlock discounts from our amazing local partners.
      </Text>

      <Text style={styles.paragraph}>
        Pick a local charity (or any organization you love), and we'll take care of the rest.
      </Text>

      {/* Continue Button */}
      <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
        <Text style={styles.continueButtonText}>Let's choose a cause →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#fff',
    paddingTop: 100,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 6,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  piggySection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  piggyHero: {
    width: 280,
    height: 280,
    resizeMode: 'contain',
  },
  paragraph: {
    fontSize: 16,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  continueButton: {
    backgroundColor: '#db8633',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});
