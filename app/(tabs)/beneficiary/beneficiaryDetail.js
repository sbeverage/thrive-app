// File: app/(tabs)/beneficiaryDetails.js

import React, { useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import BeneficiaryDetailCardApp from '../../../components/BeneficiaryDetailCardApp';
import SuccessModal from '../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useBeneficiary } from '../../context/BeneficiaryContext'; // ✅ global state

const screenWidth = Dimensions.get('window').width;

export default function BeneficiaryDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const segments = useSegments(); // ✅ to check if we're in signupFlow
  const { setSelectedBeneficiary } = useBeneficiary();

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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
    setSelectedBeneficiary(beneficiary); // ✅ save to global context
    setSuccessMessage("Awesome! You've selected your cause!");
    setShowSuccessModal(true);
    setConfettiTrigger(true);
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);

    // ✅ Only navigate if we're in the signup flow
    if (segments.includes('signupFlow')) {
      router.push('/signupFlow/donationType');
    }
  };

  return (
    <View style={styles.container}>
      <BeneficiaryDetailCardApp data={beneficiary} onSelect={handleBeneficiarySelect} />
      <SuccessModal visible={showSuccessModal} onClose={handleModalClose} message={successMessage} />
      {confettiTrigger && (
        <ConfettiCannon
          count={100}
          origin={{ x: screenWidth / 2, y: 0 }}
          fadeOut
          explosionSpeed={350}
          fallSpeed={3000}
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
});
