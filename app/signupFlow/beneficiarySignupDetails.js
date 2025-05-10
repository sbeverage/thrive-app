import React, { useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import BeneficiaryDetailCard from '../../components/BeneficiaryDetailCard';
import SuccessModal from '../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';

const screenWidth = Dimensions.get('window').width;

export default function BeneficiarySignupDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const beneficiary = {
    id,
    name: 'Placeholder Name',
    image: require('../../assets/images/child-cancer.jpg'),
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
        image: require('../../assets/images/child-cancer.jpg'),
        text: 'Sample post 1...',
      },
      {
        id: '2',
        image: require('../../assets/images/child-cancer.jpg'),
        text: 'Sample post 2...',
      },
    ],
  };

  const handleBeneficiarySelect = () => {
    setSuccessMessage("Awesome! You've selected your cause!");
    setShowSuccessModal(true);
    setConfettiTrigger(true);
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    router.push('/signupFlow/donationType');
  };

  return (
    <View style={styles.container}>
      <BeneficiaryDetailCard data={beneficiary} onSelect={handleBeneficiarySelect} />
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
