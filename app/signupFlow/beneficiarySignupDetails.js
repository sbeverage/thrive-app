// app/signupFlow/beneficiarySignupDetails.js

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Platform, Text, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import BeneficiaryDetailCard from '../../components/BeneficiaryDetailCard';
import SuccessModal from '../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { LinearGradient } from 'expo-linear-gradient';
import { useBeneficiary } from '../context/BeneficiaryContext';
import { useUser } from '../context/UserContext';
import API from '../lib/api';

const screenWidth = Dimensions.get('window').width;

export const options = {
  headerShown: false,
};

export default function BeneficiarySignupDetails() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { id } = params;
  const { setSelectedBeneficiary } = useBeneficiary();

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [beneficiary, setBeneficiary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Use brand blue gradient colors
  const gradientColors = ["#2C3E50", "#4CA1AF"];

  // Load beneficiary data from API
  useEffect(() => {
    const loadBeneficiary = async () => {
      try {
        setLoading(true);
        console.log('📡 Loading beneficiary details for signup, ID:', id);
        
        const data = await API.getCharities();
        
        // Handle different possible response structures
        let charitiesArray = null;
        if (Array.isArray(data)) {
          charitiesArray = data;
        } else if (data?.charities && Array.isArray(data.charities)) {
          charitiesArray = data.charities;
        } else if (data?.data && Array.isArray(data.data)) {
          charitiesArray = data.data;
        }
        
        if (charitiesArray && charitiesArray.length > 0) {
          // Find the beneficiary by ID
          const beneficiaryId = id?.toString();
          const beneficiaryIdNum = id ? parseInt(id, 10) : null;
          
          const foundBeneficiary = charitiesArray.find(charity => {
            return charity.id?.toString() === beneficiaryId ||
                   (typeof charity.id === 'number' ? charity.id : parseInt(charity.id, 10)) === beneficiaryIdNum ||
                   charity.id == id;
          });
          
          if (foundBeneficiary) {
            // Helper function to get default image
            function getDefaultImage(category) {
              if (category === 'Childhood Illness') {
                return require('../../assets/images/child-cancer.jpg');
              } else if (category === 'Animal Welfare') {
                return require('../../assets/images/humane-society.jpg');
              } else {
                return require('../../assets/images/charity-water.jpg');
              }
            }
            
            // Handle main image (imageUrl) - for the large banner image
            let imageSource;
            const imageUrl = foundBeneficiary.imageUrl || foundBeneficiary.image_url || null;
            
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
              if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                imageSource = { uri: imageUrl };
              } else {
                imageSource = getDefaultImage(foundBeneficiary.category);
              }
            } else {
              imageSource = getDefaultImage(foundBeneficiary.category);
            }
            
            // Handle logo image (logoUrl) - for the circular profile image
            let logoSource;
            const logoUrl = foundBeneficiary.logoUrl || foundBeneficiary.logo_url || null;
            
            if (logoUrl && typeof logoUrl === 'string' && logoUrl.trim() !== '') {
              if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
                logoSource = { uri: logoUrl };
              } else {
                logoSource = imageSource; // Fallback to main image
              }
            } else {
              logoSource = imageSource; // Fallback to main image
            }

            // Extract impact fields (check both camelCase and snake_case)
            const livesImpacted = foundBeneficiary.livesImpacted ?? foundBeneficiary.lives_impacted ?? null;
            const programsActive = foundBeneficiary.programsActive ?? foundBeneficiary.programs_active ?? null;
            const directToProgramsPercentage = foundBeneficiary.directToProgramsPercentage ?? foundBeneficiary.direct_to_programs_percentage ?? null;
            const whyThisMatters = foundBeneficiary.whyThisMatters ?? foundBeneficiary.why_this_matters ?? null;
            const successStory = foundBeneficiary.successStory ?? foundBeneficiary.success_story ?? null;
            const storyAuthor = foundBeneficiary.storyAuthor ?? foundBeneficiary.story_author ?? null;
            const impactStatement1 = foundBeneficiary.impactStatement1 ?? foundBeneficiary.impact_statement_1 ?? null;
            const impactStatement2 = foundBeneficiary.impactStatement2 ?? foundBeneficiary.impact_statement_2 ?? null;

            const transformedBeneficiary = {
              id: foundBeneficiary.id,
              name: foundBeneficiary.name,
              category: foundBeneficiary.category,
              type: foundBeneficiary.type,
              image: imageSource, // Main banner image (from imageUrl)
              logoUrl: logoSource, // Logo image (from logoUrl, falls back to main image)
              location: foundBeneficiary.location,
              latitude: foundBeneficiary.latitude,
              longitude: foundBeneficiary.longitude,
              likes: foundBeneficiary.likes ?? 0, // Use ?? to preserve 0
              mutual: foundBeneficiary.mutual ?? 0, // Use ?? to preserve 0
              about: foundBeneficiary.about || foundBeneficiary.description || 'Learn more about this amazing cause and the impact you can make in your local community.',
              ein: foundBeneficiary.ein || '',
              website: foundBeneficiary.website || '',
              phone: foundBeneficiary.phone || '',
              social: foundBeneficiary.social || '',
              // Impact metrics - pass BOTH camelCase and snake_case
              livesImpacted: livesImpacted,
              lives_impacted: foundBeneficiary.lives_impacted ?? foundBeneficiary.livesImpacted ?? livesImpacted,
              programsActive: programsActive,
              programs_active: foundBeneficiary.programs_active ?? foundBeneficiary.programsActive ?? programsActive,
              directToProgramsPercentage: directToProgramsPercentage,
              direct_to_programs_percentage: foundBeneficiary.direct_to_programs_percentage ?? foundBeneficiary.directToProgramsPercentage ?? directToProgramsPercentage,
              // Success story and impact statements - pass BOTH camelCase and snake_case
              whyThisMatters: whyThisMatters,
              why_this_matters: foundBeneficiary.why_this_matters ?? foundBeneficiary.whyThisMatters ?? whyThisMatters,
              successStory: successStory,
              success_story: foundBeneficiary.success_story ?? foundBeneficiary.successStory ?? successStory,
              storyAuthor: storyAuthor,
              story_author: foundBeneficiary.story_author ?? foundBeneficiary.storyAuthor ?? storyAuthor,
              impactStatement1: impactStatement1,
              impact_statement_1: foundBeneficiary.impact_statement_1 ?? foundBeneficiary.impactStatement1 ?? impactStatement1,
              impactStatement2: impactStatement2,
              impact_statement_2: foundBeneficiary.impact_statement_2 ?? foundBeneficiary.impactStatement2 ?? impactStatement2,
              posts: [], // Posts can be added later if needed
            };

            setBeneficiary(transformedBeneficiary);
          } else {
            console.warn('⚠️ Beneficiary not found for ID:', id);
            setBeneficiary({
              id,
              name: 'Unknown Beneficiary',
              image: require('../../assets/images/child-cancer.jpg'),
              likes: 0,
              mutual: 0,
              about: 'Beneficiary information not available.',
              ein: '',
              website: '',
              phone: '',
              social: '',
            });
          }
        } else {
          console.warn('⚠️ No charities found in API response');
          setBeneficiary({
            id,
            name: 'Unknown Beneficiary',
            image: require('../../assets/images/child-cancer.jpg'),
            likes: 0,
            mutual: 0,
            about: 'Beneficiary information not available.',
            ein: '',
            website: '',
            phone: '',
            social: '',
          });
        }
      } catch (error) {
        console.error('❌ Failed to load beneficiary from API:', error);
        setBeneficiary({
          id,
          name: 'Unknown Beneficiary',
          image: require('../../assets/images/child-cancer.jpg'),
          likes: 0,
          mutual: 0,
          about: 'Unable to load beneficiary data. Please check your connection and try again.',
          ein: '',
          website: '',
          phone: '',
          social: '',
        });
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadBeneficiary();
    }
  }, [id]);

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
    if (params?.flow === 'coworking') {
      router.push({
        pathname: '/signupFlow/coworkingDonationPrompt',
        params: { sponsorAmount: params?.sponsorAmount || '15' }
      });
    } else {
      router.push('/signupFlow/donationAmount');
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
          <Image 
            source={require('../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.cardContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading beneficiary details...</Text>
          </View>
        ) : beneficiary ? (
          <BeneficiaryDetailCard data={beneficiary} onSelect={handleBeneficiarySelect} showBackArrow={false} />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Beneficiary not found</Text>
          </View>
        )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#324E58',
    textAlign: 'center',
  },
  cardContainer: {
    flex: 1,
    width: '100%',
    paddingTop: 0,
  },
});
