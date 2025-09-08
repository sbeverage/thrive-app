// app/signupFlow/beneficiarySignupDetails.js

import React, { useState } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import BeneficiaryDetailCard from '../../components/BeneficiaryDetailCard';
import SuccessModal from '../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { LinearGradient } from 'expo-linear-gradient';
import { useBeneficiary } from '../context/BeneficiaryContext';
import { useUser } from '../context/UserContext';

const screenWidth = Dimensions.get('window').width;

export const options = {
  headerShown: false,
};

export default function BeneficiarySignupDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { setSelectedBeneficiary } = useBeneficiary();

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Use brand blue gradient colors
  const gradientColors = ["#2C3E50", "#4CA1AF"];

  // Map beneficiary IDs to actual beneficiary data
  const beneficiaryData = {
    '1': {
      id: 1,
      name: 'NPCF',
      category: 'Childhood Illness',
      image: require('../../assets/images/child-cancer.jpg'),
      location: 'Atlanta, GA',
      distance: '2.3 mi',
      latitude: 33.7490,
      longitude: -84.3880,
      likes: 500,
      mutual: 20,
      about: 'NPCF is dedicated to helping children fight cancer and other life-threatening diseases.',
      ein: '81-3223950',
      website: 'npcforg.org',
      phone: '555-1234',
      social: '@npcforg',
    },
    '2': {
      id: 2,
      name: 'Humane Society',
      category: 'Animal Welfare',
      image: require('../../assets/images/humane-society.jpg'),
      location: 'Alpharetta, GA',
      distance: '1.1 mi',
      latitude: 34.0754,
      longitude: -84.2941,
      likes: 450,
      mutual: 15,
      about: 'Humane Society works to protect and care for animals in need.',
      ein: '81-3223951',
      website: 'humanesociety.org',
      phone: '555-1235',
      social: '@humanesociety',
    },
    '3': {
      id: 3,
      name: 'Charity Water',
      category: 'Low Income Families',
      image: require('../../assets/images/charity-water.jpg'),
      location: 'Roswell, GA',
      distance: '3.7 mi',
      latitude: 34.0232,
      longitude: -84.3616,
      likes: 600,
      mutual: 25,
      about: 'Charity Water provides clean drinking water to people in developing countries.',
      ein: '81-3223952',
      website: 'charitywater.org',
      phone: '555-1236',
      social: '@charitywater',
    },
    '4': {
      id: 4,
      name: 'Dog Trust',
      category: 'Animal Welfare',
      image: require('../../assets/images/humane-society.jpg'),
      location: 'Marietta, GA',
      distance: '5.2 mi',
      latitude: 33.9525,
      longitude: -84.5499,
      likes: 380,
      mutual: 12,
      about: 'Dog Trust is committed to the welfare of dogs and responsible dog ownership.',
      ein: '81-3223953',
      website: 'dogtrust.org',
      phone: '555-1237',
      social: '@dogtrust',
    },
    '5': {
      id: 5,
      name: 'Local Food Bank',
      category: 'Low Income Families',
      image: require('../../assets/images/charity-water.jpg'),
      location: 'Sandy Springs, GA',
      distance: '0.8 mi',
      latitude: 33.9301,
      longitude: -84.3785,
      likes: 320,
      mutual: 18,
      about: 'Local Food Bank provides food assistance to families in need.',
      ein: '81-3223954',
      website: 'localfoodbank.org',
      phone: '555-1238',
      social: '@localfoodbank',
    },
    '6': {
      id: 6,
      name: 'Youth Center',
      category: 'Education',
      image: require('../../assets/images/child-cancer.jpg'),
      location: 'Dunwoody, GA',
      distance: '2.9 mi',
      latitude: 33.9495,
      longitude: -84.3344,
      likes: 420,
      mutual: 22,
      about: 'Youth Center provides educational programs and support for young people.',
      ein: '81-3223955',
      website: 'youthcenter.org',
      phone: '555-1239',
      social: '@youthcenter',
    },
  };

  const beneficiary = beneficiaryData[id] || {
    id,
    name: 'Unknown Beneficiary',
    image: require('../../assets/images/child-cancer.jpg'),
    likes: 0,
    mutual: 0,
    about: 'Beneficiary information not available.',
    ein: 'N/A',
    website: 'N/A',
    phone: 'N/A',
    social: 'N/A',
  };

  const handleBeneficiarySelect = async () => {
    // Set the selected beneficiary in the context
    setSelectedBeneficiary(beneficiary);
    
    // Award 10 points for selecting a beneficiary
    
    setSuccessMessage("Awesome! You've selected your cause!");
    setShowSuccessModal(true);
    setConfettiTrigger(true);
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    router.push('/signupFlow/donationAmount');
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
