// File: app/(tabs)/beneficiary/beneficiaryDetail.js

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Image, ActivityIndicator, Text, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import BeneficiaryDetailCard from '../../../components/BeneficiaryDetailCard';
import SuccessModal from '../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useBeneficiary } from '../../context/BeneficiaryContext';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import API from '../../lib/api';
import { BACKEND_URL } from '../../utils/constants';

console.log('🔴 BENEFICIARY DETAIL FILE LOADED - screenWidth:', Dimensions.get('window').width);

const screenWidth = Dimensions.get('window').width;

export default function BeneficiaryDetailScreen() {
  console.log('🔴 BENEFICIARY DETAIL COMPONENT RENDERED');
  
  const params = useLocalSearchParams();
  // Handle case where id might be an array (expo-router sometimes returns arrays)
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const segments = useSegments();
  const { setSelectedBeneficiary } = useBeneficiary();
  
  // Removed debug alert - component loads normally

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [beneficiary, setBeneficiary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState(null);

  // Log params on mount
  useEffect(() => {
    console.log('🔍 BeneficiaryDetailScreen mounted');
    console.log('🔍 All params:', JSON.stringify(params, null, 2));
    console.log('🔍 ID from params:', id, 'Type:', typeof id);
    console.log('🔍 Params object:', params);
    
    if (!id) {
      console.error('❌ NO ID PROVIDED IN PARAMS!');
      console.error('❌ Full params:', params);
      setDebugInfo({ 
        step: 'No ID in params', 
        params: JSON.stringify(params, null, 2),
        error: 'ID parameter not found in route params',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on id, not params object (which changes on every render)

  // Use brand blue gradient colors
  const gradientColors = ["#2C3E50", "#4CA1AF"];

  // Load beneficiary data from API
  useEffect(() => {
    const loadBeneficiary = async () => {
      try {
        setLoading(true);
        console.log('📡 Loading beneficiary details for ID:', id);
        console.log('📡 ID type:', typeof id, 'Value:', id);
        setDebugInfo({ step: 'Loading API...', id, idType: typeof id });
        
        // Try to use the detail endpoint first (has all fields)
        let foundBeneficiary = null;
        try {
          console.log('📡 Calling API.getCharityById() for ID:', id);
          console.log('📡 Full URL will be:', `${BACKEND_URL}/api/charities/${id}`);
          foundBeneficiary = await API.getCharityById(id);
          console.log('✅ API.getCharityById() - Response received');
          console.log('📦 Full charity data from detail endpoint:', JSON.stringify(foundBeneficiary, null, 2));
          console.log('📋 ALL KEYS in foundBeneficiary:', Object.keys(foundBeneficiary || {}));
          console.log('🔍 DIRECT FIELD ACCESS TEST:', {
            'foundBeneficiary.livesImpacted': foundBeneficiary?.livesImpacted,
            'foundBeneficiary.programsActive': foundBeneficiary?.programsActive,
            'foundBeneficiary.directToProgramsPercentage': foundBeneficiary?.directToProgramsPercentage,
            'foundBeneficiary.impactStatement1': foundBeneficiary?.impactStatement1 ? foundBeneficiary.impactStatement1.substring(0, 30) + '...' : 'NULL',
            'foundBeneficiary.impactStatement2': foundBeneficiary?.impactStatement2 ? foundBeneficiary.impactStatement2.substring(0, 30) + '...' : 'NULL',
            'foundBeneficiary.successStory': foundBeneficiary?.successStory ? foundBeneficiary.successStory.substring(0, 30) + '...' : 'NULL',
            'foundBeneficiary.whyThisMatters': foundBeneficiary?.whyThisMatters ? foundBeneficiary.whyThisMatters.substring(0, 30) + '...' : 'NULL',
          });
          
        } catch (detailError) {
          console.error('❌ Detail endpoint FAILED:', detailError.message);
          if (detailError.response) {
            console.error('❌ Detail error status:', detailError.response.status);
            if (detailError.response.data) {
              console.error('❌ Detail error data:', detailError.response.data);
            }
          } else {
            console.error('❌ Network or connection error (no response)');
          }
          console.warn('⚠️ Detail endpoint failed, falling back to list endpoint');
          // Fallback to list endpoint if detail endpoint doesn't exist or fails
          try {
            console.log('📡 Falling back to API.getCharities()...');
            const data = await API.getCharities();
            console.log('📦 API Response received:', JSON.stringify(data, null, 2));
            
            // Handle different possible response structures
            let charitiesArray = null;
            if (data) {
              if (Array.isArray(data)) {
                charitiesArray = data;
                console.log('📊 API returned array directly');
              } else if (data.charities && Array.isArray(data.charities)) {
                charitiesArray = data.charities;
                console.log('📊 API returned object with charities array');
              } else if (data.data && Array.isArray(data.data)) {
                charitiesArray = data.data;
                console.log('📊 API returned object with data array');
              } else {
                console.error('❌ Unknown API response structure:', Object.keys(data));
              }
            }
            
            if (charitiesArray && charitiesArray.length > 0) {
              console.log('📊 Total charities in response:', charitiesArray.length);
              
              // Find the beneficiary by ID
              const beneficiaryId = id?.toString();
              const beneficiaryIdNum = id ? parseInt(id, 10) : null;
              
              foundBeneficiary = charitiesArray.find(charity => {
                const charityId = charity.id?.toString();
                const charityIdNum = typeof charity.id === 'number' ? charity.id : parseInt(charity.id, 10);
                return charityId === beneficiaryId || 
                       charityIdNum === beneficiaryIdNum ||
                       charity.id == id ||
                       charity.id === parseInt(id, 10) ||
                       charity.id === id;
              });
            }
          } catch (listError) {
            console.error('❌ Both detail and list endpoints failed:', listError);
            setDebugInfo({ 
              step: 'API Error', 
              error: listError.message,
              status: listError.response?.status,
              url: listError.config?.url,
              id 
            });
            // Set error state
            setBeneficiary({
              id,
              name: 'API Error',
              category: 'Unknown',
              image: require('../../../assets/images/child-cancer.jpg'),
              likes: 0,
              mutual: 0,
              about: 'Unable to load beneficiary data. The API request failed. Please check your connection and try again.',
              ein: '',
              website: '',
              phone: '',
              social: '',
              posts: [],
            });
            setLoading(false);
            return;
          }
        } // End of catch (detailError) block

        if (foundBeneficiary) {
            console.log('✅ Found beneficiary:', foundBeneficiary.name);
            console.log('🖼️ Full beneficiary data:', JSON.stringify(foundBeneficiary, null, 2));
            
            // Log ALL field names to see what's available
            console.log('📋 All field names in foundBeneficiary:', Object.keys(foundBeneficiary));
            
            // CRITICAL: Log the exact values we're checking for
            console.log('🔍 DIRECT FIELD ACCESS TEST:', {
              'foundBeneficiary.livesImpacted': foundBeneficiary.livesImpacted,
              'foundBeneficiary.lives_impacted': foundBeneficiary.lives_impacted,
              'foundBeneficiary.programsActive': foundBeneficiary.programsActive,
              'foundBeneficiary.programs_active': foundBeneficiary.programs_active,
              'foundBeneficiary.directToProgramsPercentage': foundBeneficiary.directToProgramsPercentage,
              'foundBeneficiary.direct_to_programs_percentage': foundBeneficiary.direct_to_programs_percentage,
              'foundBeneficiary.impactStatement1': foundBeneficiary.impactStatement1,
              'foundBeneficiary.impact_statement_1': foundBeneficiary.impact_statement_1,
              'foundBeneficiary.impactStatement2': foundBeneficiary.impactStatement2,
              'foundBeneficiary.impact_statement_2': foundBeneficiary.impact_statement_2,
              'foundBeneficiary.successStory': foundBeneficiary.successStory,
              'foundBeneficiary.success_story': foundBeneficiary.success_story,
              'foundBeneficiary.whyThisMatters': foundBeneficiary.whyThisMatters,
              'foundBeneficiary.why_this_matters': foundBeneficiary.why_this_matters,
            });
            
            // Log impact-related fields specifically - CHECK EXACT FIELD NAMES
            console.log('📊 Impact-related fields in API response:', {
              livesImpacted: foundBeneficiary.livesImpacted,
              lives_impacted: foundBeneficiary.lives_impacted,
              programsActive: foundBeneficiary.programsActive,
              programs_active: foundBeneficiary.programs_active,
              directToProgramsPercentage: foundBeneficiary.directToProgramsPercentage,
              direct_to_programs_percentage: foundBeneficiary.direct_to_programs_percentage,
              impactStatement1: foundBeneficiary.impactStatement1,
              impact_statement_1: foundBeneficiary.impact_statement_1,
              impactStatement2: foundBeneficiary.impactStatement2,
              impact_statement_2: foundBeneficiary.impact_statement_2,
              successStory: foundBeneficiary.successStory,
              success_story: foundBeneficiary.success_story,
              whyThisMatters: foundBeneficiary.whyThisMatters,
              why_this_matters: foundBeneficiary.why_this_matters,
            });
            
            // CRITICAL: Check if fields exist using 'in' operator
            console.log('🔍 Field existence check:', {
              hasLivesImpacted: 'livesImpacted' in foundBeneficiary,
              hasLivesImpactedSnake: 'lives_impacted' in foundBeneficiary,
              hasProgramsActive: 'programsActive' in foundBeneficiary,
              hasProgramsActiveSnake: 'programs_active' in foundBeneficiary,
              hasDirectToProgramsPercentage: 'directToProgramsPercentage' in foundBeneficiary,
              hasDirectToProgramsPercentageSnake: 'direct_to_programs_percentage' in foundBeneficiary,
              hasImpactStatement1: 'impactStatement1' in foundBeneficiary,
              hasImpactStatement1Snake: 'impact_statement_1' in foundBeneficiary,
              hasImpactStatement2: 'impactStatement2' in foundBeneficiary,
              hasImpactStatement2Snake: 'impact_statement_2' in foundBeneficiary,
              hasSuccessStory: 'successStory' in foundBeneficiary,
              hasSuccessStorySnake: 'success_story' in foundBeneficiary,
              hasWhyThisMatters: 'whyThisMatters' in foundBeneficiary,
              hasWhyThisMattersSnake: 'why_this_matters' in foundBeneficiary,
            });
            
            // Helper function to get default image
            function getDefaultImage(category) {
              if (category === 'Childhood Illness') {
                return require('../../../assets/images/child-cancer.jpg');
              } else if (category === 'Animal Welfare') {
                return require('../../../assets/images/humane-society.jpg');
              } else {
                return require('../../../assets/images/charity-water.jpg');
              }
            }
            
            // Handle main image (imageUrl) - for the large banner image
            let imageSource;
            const imageUrl = foundBeneficiary.imageUrl || foundBeneficiary.image_url || null;
            
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
              if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                console.log('✅ Using main image URL from backend:', imageUrl);
                imageSource = { uri: imageUrl };
              } else {
                console.warn('⚠️ Main image URL is not valid, using fallback');
                imageSource = getDefaultImage(foundBeneficiary.category);
              }
            } else {
              console.log('⚠️ No main image URL found, using fallback');
              imageSource = getDefaultImage(foundBeneficiary.category);
            }
            
            // Handle logo image (logoUrl) - for the circular profile image
            let logoSource;
            const logoUrl = foundBeneficiary.logoUrl || foundBeneficiary.logo_url || null;
            
            if (logoUrl && typeof logoUrl === 'string' && logoUrl.trim() !== '') {
              if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
                console.log('✅ Using logo URL from backend:', logoUrl);
                logoSource = { uri: logoUrl };
              } else {
                console.warn('⚠️ Logo URL is not valid, using main image as fallback');
                logoSource = imageSource;
              }
            } else {
              console.log('⚠️ No logo URL found, using main image as fallback');
              logoSource = imageSource;
            }

            // SIMPLIFIED: Pass data directly from API - API returns camelCase fields
            // Just check both camelCase and snake_case for compatibility
            console.log('📊 Passing data directly from API response');
            
            // Extract values directly from API response (check both camelCase and snake_case)
            const finalLivesImpacted = foundBeneficiary.livesImpacted ?? foundBeneficiary.lives_impacted ?? null;
            const finalProgramsActive = foundBeneficiary.programsActive ?? foundBeneficiary.programs_active ?? null;
            const finalDirectToPrograms = foundBeneficiary.directToProgramsPercentage ?? foundBeneficiary.direct_to_programs_percentage ?? null;
            const finalWhyMatters = foundBeneficiary.whyThisMatters ?? foundBeneficiary.why_this_matters ?? null;
            const finalSuccessStory = foundBeneficiary.successStory ?? foundBeneficiary.success_story ?? null;
            const finalStoryAuthor = foundBeneficiary.storyAuthor ?? foundBeneficiary.story_author ?? null;
            const finalImpact1 = foundBeneficiary.impactStatement1 ?? foundBeneficiary.impact_statement_1 ?? null;
            const finalImpact2 = foundBeneficiary.impactStatement2 ?? foundBeneficiary.impact_statement_2 ?? null;
            
            // CRITICAL DEBUG: Log what we're about to pass
            console.log('🚨🚨🚨 FINAL VALUES BEFORE PASSING TO COMPONENT (DIRECT FROM API):', {
              finalLivesImpacted,
              finalProgramsActive,
              finalDirectToPrograms,
              finalWhyMatters: finalWhyMatters ? finalWhyMatters.substring(0, 50) + '...' : 'NULL',
              finalSuccessStory: finalSuccessStory ? finalSuccessStory.substring(0, 50) + '...' : 'NULL',
              finalImpact1: finalImpact1 ? finalImpact1.substring(0, 50) + '...' : 'NULL',
              finalImpact2: finalImpact2 ? finalImpact2.substring(0, 50) + '...' : 'NULL',
            });

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
              // Impact metrics - pass BOTH camelCase and snake_case to ensure component can read either
              livesImpacted: finalLivesImpacted,
              lives_impacted: foundBeneficiary.lives_impacted ?? foundBeneficiary.livesImpacted ?? finalLivesImpacted,
              programsActive: finalProgramsActive,
              programs_active: foundBeneficiary.programs_active ?? foundBeneficiary.programsActive ?? finalProgramsActive,
              directToProgramsPercentage: finalDirectToPrograms,
              direct_to_programs_percentage: foundBeneficiary.direct_to_programs_percentage ?? foundBeneficiary.directToProgramsPercentage ?? finalDirectToPrograms,
              // Success story and impact statements - pass BOTH camelCase and snake_case
              whyThisMatters: finalWhyMatters,
              why_this_matters: foundBeneficiary.why_this_matters ?? foundBeneficiary.whyThisMatters ?? finalWhyMatters,
              successStory: finalSuccessStory,
              success_story: foundBeneficiary.success_story ?? foundBeneficiary.successStory ?? finalSuccessStory,
              storyAuthor: finalStoryAuthor,
              story_author: foundBeneficiary.story_author ?? foundBeneficiary.storyAuthor ?? finalStoryAuthor,
              impactStatement1: finalImpact1,
              impact_statement_1: foundBeneficiary.impact_statement_1 ?? foundBeneficiary.impactStatement1 ?? finalImpact1,
              impactStatement2: finalImpact2,
              impact_statement_2: foundBeneficiary.impact_statement_2 ?? foundBeneficiary.impactStatement2 ?? finalImpact2,
              posts: [], // Posts can be added later if needed
            };
            
            // Log final transformed data with actual values
            console.log('📦 Final transformed beneficiary data:', {
              name: transformedBeneficiary.name,
              livesImpacted: transformedBeneficiary.livesImpacted,
              programsActive: transformedBeneficiary.programsActive,
              directToProgramsPercentage: transformedBeneficiary.directToProgramsPercentage,
              impactStatement1: transformedBeneficiary.impactStatement1 
                ? transformedBeneficiary.impactStatement1.substring(0, 60) + '...' 
                : 'null',
              impactStatement2: transformedBeneficiary.impactStatement2 
                ? transformedBeneficiary.impactStatement2.substring(0, 60) + '...' 
                : 'null',
              successStory: transformedBeneficiary.successStory 
                ? transformedBeneficiary.successStory.substring(0, 60) + '...' 
                : 'null',
              whyThisMatters: transformedBeneficiary.whyThisMatters 
                ? transformedBeneficiary.whyThisMatters.substring(0, 60) + '...' 
                : 'null',
            });
            

            setBeneficiary(transformedBeneficiary);
            setDebugInfo(null); // Clear debug info on success
          } else {
            // Beneficiary not found
            console.error('❌ Beneficiary not found with ID:', id);
            setDebugInfo({ 
              step: 'Beneficiary Not Found', 
              id,
              error: 'Beneficiary with this ID does not exist in the API response',
            });
            setBeneficiary({
              id,
              name: 'Unknown Beneficiary',
              category: 'Unknown',
              image: require('../../../assets/images/child-cancer.jpg'),
              likes: 0,
              mutual: 0,
              about: 'Beneficiary information not available. Please check that the beneficiary exists in the system and that the API is returning data correctly.',
              ein: '',
              website: '',
              phone: '',
              social: '',
              posts: [],
            });
          }
      } catch (error) {
        console.error('❌ Failed to load beneficiary:', error);
        console.error('❌ Error details:', {
          message: error.message,
          stack: error.stack,
          response: error.response?.data,
        });
        setDebugInfo({ 
          step: 'API Error', 
          id,
          error: error.message,
          errorDetails: JSON.stringify({
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
          }, null, 2),
        });
        // Fallback to placeholder on error
        setBeneficiary({
          id,
          name: 'Error Loading Beneficiary',
          category: 'Unknown',
          image: require('../../../assets/images/child-cancer.jpg'),
          likes: 0,
          mutual: 0,
          about: 'There was an error loading this beneficiary. Please try again.',
          ein: '',
          website: '',
          phone: '',
          social: '',
          posts: [],
        });
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      console.log('🚀 Starting loadBeneficiary with ID:', id);
      loadBeneficiary();
    } else {
      console.error('❌ No ID provided in params!');
      console.error('❌ Params:', JSON.stringify(params, null, 2));
      setDebugInfo({ 
        step: 'No ID', 
        params: JSON.stringify(params, null, 2),
      });
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on id, not params object (which changes on every render)

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

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#DB8633" />
        <Text style={styles.loadingText}>Loading beneficiary details...</Text>
      </View>
    );
  }

  if (!beneficiary) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <View style={styles.debugBox}>
          <Text style={styles.debugTitle}>🔍 Debug Info (No Beneficiary):</Text>
          <Text style={styles.debugText}>ID from params: {id || 'NOT PROVIDED'}</Text>
          <Text style={styles.debugText}>ID type: {typeof id}</Text>
          <Text style={styles.debugText}>All params: {JSON.stringify(params, null, 2)}</Text>
          {debugInfo && (
            <>
              <Text style={styles.debugText}>Step: {debugInfo.step}</Text>
              {debugInfo.error && <Text style={styles.debugText}>Error: {debugInfo.error}</Text>}
            </>
          )}
        </View>
        <Text style={styles.errorText}>Beneficiary not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.cardContainer}>
        {beneficiary && (
          <BeneficiaryDetailCard data={beneficiary} onSelect={handleBeneficiarySelect} showBackArrow={false} />
        )}
        {!beneficiary && !loading && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Beneficiary not found</Text>
            <Text style={styles.errorSubtext}>Please check your connection and try again.</Text>
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
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    marginBottom: 20,
  },
  debugText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 10,
    textAlign: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#DB8633',
    fontWeight: '600',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
});
