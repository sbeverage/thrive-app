import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import BeneficiaryDetailCard from '../../components/BeneficiaryDetailCard';
import SuccessModal from '../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { LinearGradient } from 'expo-linear-gradient';

const screenWidth = Dimensions.get('window').width;

export const options = {
  headerShown: false,
};

export default function BeneficiarySignupDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Animation values
  const pageAnim = useRef(new Animated.Value(0)).current;
  const backButtonAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const gradientAnim = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;

  // Use brand blue gradient colors
  const gradientColors = ["#2C3E50", "#4CA1AF"];

  useEffect(() => {
    // Sophisticated entrance animation
    Animated.sequence([
      // Page slides in from right
      Animated.spring(pageAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
      // Back button fades in with bounce
      Animated.spring(backButtonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 7,
      }),
      // Card slides up
      Animated.spring(cardAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
    ]).start();
  }, []);

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
    
    // Enhanced confetti animation
    Animated.sequence([
      Animated.timing(confettiAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(confettiAnim, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    
    // Smooth exit animation before navigation
    Animated.parallel([
      Animated.timing(pageAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.push('/signupFlow/donationAmount');
    });
  };

  const handleBackPress = () => {
    // Smooth back animation
    Animated.parallel([
      Animated.timing(pageAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.back();
    });
  };

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          transform: [
            {
              translateX: pageAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [screenWidth, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* Animated gradient background */}
      <Animated.View style={styles.gradientBg} pointerEvents="none">
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        />
      </Animated.View>

      {/* Animated back button */}
      <Animated.View
        style={[
          styles.backButton,
          {
            opacity: backButtonAnim,
            transform: [
              {
                scale: backButtonAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity onPress={handleBackPress}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={{
          opacity: cardAnim,
          transform: [
            {
              translateY: cardAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [100, 0],
              }),
            },
            {
              scale: cardAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1],
              }),
            },
          ],
        }}
      >
        <BeneficiaryDetailCard data={beneficiary} onSelect={handleBeneficiarySelect} showBackArrow={false} />
      </Animated.View>

      <SuccessModal visible={showSuccessModal} onClose={handleModalClose} message={successMessage} />
      
      {confettiTrigger && (
        <Animated.View
          style={{
            opacity: confettiAnim,
            transform: [
              {
                scale: confettiAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1.2],
                }),
              },
            ],
          }}
        >
          <ConfettiCannon
            count={150}
            origin={{ x: screenWidth / 2, y: 0 }}
            fadeOut
            explosionSpeed={400}
            fallSpeed={2500}
            onAnimationEnd={() => setConfettiTrigger(false)}
          />
        </Animated.View>
      )}
    </Animated.View>
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
    height: '100%',
    zIndex: 0,
  },
  gradient: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
});
