// File: app/(tabs)/beneficiary/beneficiaryDetail.js

import React, { useState } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import BeneficiaryDetailCard from '../../../components/BeneficiaryDetailCard';
import SuccessModal from '../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useBeneficiary } from '../../context/BeneficiaryContext';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const screenWidth = Dimensions.get('window').width;

export default function BeneficiaryDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const segments = useSegments();
  const { setSelectedBeneficiary } = useBeneficiary();

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Use brand blue gradient colors
  const gradientColors = ["#2C3E50", "#4CA1AF"];

  const beneficiary = {
    id,
    name: 'Placeholder Name',
    category: 'Childhood Illness',
    image: require('../../../assets/images/child-cancer.jpg'),
    likes: 500,
    mutual: 20,
    about: 'This is a placeholder about section for this beneficiary.',
    ein: '81-3223950',
    website: 'placeholder.org',
    phone: '555-1234',
    social: '@placeholder',
    posts: [
      {
        id: '1',
        image: require('../../../assets/images/child-cancer.jpg'),
        text: 'Sample post 1...',
      },
      {
        id: '2',
        image: require('../../../assets/images/child-cancer.jpg'),
        text: 'Sample post 2...',
      },
    ],
  };

  const handleBeneficiarySelect = () => {
    setSelectedBeneficiary(beneficiary);
    setSuccessMessage("Awesome! You've selected your cause!");
    setShowSuccessModal(true);
    setConfettiTrigger(true);
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);

    // Only navigate if we're in the signup flow
    if (segments.includes('signupFlow')) {
      router.push('/signupFlow/donationType');
    }
  };

  const handleBackPress = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      {/* Static gradient background */}
      <View style={styles.gradientBg} pointerEvents="none">
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        />
      </View>

      {/* Back button */}
      <View style={styles.backButton}>
        <TouchableOpacity onPress={handleBackPress}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
      </View>

      <View style={styles.cardContainer}>
        <BeneficiaryDetailCard data={beneficiary} onSelect={handleBeneficiarySelect} showBackArrow={false} />
      </View>

      <SuccessModal visible={showSuccessModal} onClose={handleModalClose} message={successMessage} />
      
      {confettiTrigger && (
        <ConfettiCannon
          count={150}
          origin={{ x: screenWidth / 2, y: 0 }}
          fadeOut
          explosionSpeed={400}
          fallSpeed={2500}
          onAnimationEnd={() => setConfettiTrigger(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  gradientBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    zIndex: 0,
  },
  gradient: {
    width: '100%',
    height: '100%',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  cardContainer: {
    flex: 1,
    width: '100%',
    paddingTop: 0,
  },
});
