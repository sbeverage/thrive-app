import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  Alert,
  Linking,
} from 'react-native';
import { AntDesign, Feather, MaterialIcons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConfettiCannon from 'react-native-confetti-cannon';

const screenWidth = Dimensions.get('window').width;

export default function BeneficiaryDetailCard({ data, onSelect, showBackArrow = true }) {
  const router = useRouter();
  const segments = useSegments();
  
  // Debug: Log what data we received - COMPREHENSIVE
  useEffect(() => {
    console.log('🔍🔍🔍 FULL DATA OBJECT RECEIVED:', JSON.stringify(data, null, 2));
    console.log('🔍 All keys in data object:', Object.keys(data || {}));
    
    // Use nullish coalescing (??) instead of logical OR (||) to preserve falsy values
    const impact1 = data?.impactStatement1 ?? data?.impact_statement_1 ?? null;
    const impact2 = data?.impactStatement2 ?? data?.impact_statement_2 ?? null;
    const success = data?.successStory ?? data?.success_story ?? null;
    const why = data?.whyThisMatters ?? data?.why_this_matters ?? null;
    const lives = data?.livesImpacted ?? data?.lives_impacted ?? null;
    const programs = data?.programsActive ?? data?.programs_active ?? null;
    const direct = data?.directToProgramsPercentage ?? data?.direct_to_programs_percentage ?? null;
    
    console.log('🔍 BeneficiaryDetailCard received data:', {
      name: data?.name,
      livesImpacted: lives,
      programsActive: programs,
      directToProgramsPercentage: direct,
      impactStatement1: impact1 ? `${typeof impact1} - ${impact1.substring(0, 50)}...` : 'null',
      impactStatement2: impact2 ? `${typeof impact2} - ${impact2.substring(0, 50)}...` : 'null',
      successStory: success ? `${typeof success} - ${success.substring(0, 50)}...` : 'null',
      whyThisMatters: why ? `${typeof why} - ${why.substring(0, 50)}...` : 'null',
    });
    
    // Check conditionals with detailed info
    console.log('🔍 Conditional checks (detailed):', {
      hasWhyThisMatters: !!(data?.whyThisMatters || data?.why_this_matters),
      whyThisMattersValue: data?.whyThisMatters || data?.why_this_matters,
      hasSuccessStory: !!(data?.successStory || data?.success_story),
      successStoryValue: data?.successStory || data?.success_story,
      hasImpact1: !!(data?.impactStatement1 || data?.impact_statement_1),
      impact1Value: data?.impactStatement1 || data?.impact_statement_1,
      hasImpact2: !!(data?.impactStatement2 || data?.impact_statement_2),
      impact2Value: data?.impactStatement2 || data?.impact_statement_2,
      hasAnyImpact: !!((data?.impactStatement1 || data?.impact_statement_1) || (data?.impactStatement2 || data?.impact_statement_2)),
    });
    
  }, [data]);

  const [donation, setDonation] = useState('');
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [showFullAbout, setShowFullAbout] = useState(false);
  const [liked, setLiked] = useState(false);
  
  // Load favorite status from AsyncStorage on mount
  useEffect(() => {
    const loadFavoriteStatus = async () => {
      try {
        const savedFavorites = await AsyncStorage.getItem('beneficiaryFavorites');
        if (savedFavorites) {
          const parsed = JSON.parse(savedFavorites);
          const isFavorite = parsed.includes(data.id);
          setLiked(isFavorite);
          console.log('✅ Loaded favorite status for beneficiary:', data.id, 'isFavorite:', isFavorite);
        }
      } catch (error) {
        console.error('❌ Error loading favorite status:', error);
      }
    };
    if (data?.id) {
      loadFavoriteStatus();
    }
  }, [data?.id]);
  
  // Toggle favorite and persist to AsyncStorage
  // IMPORTANT: This is the ONLY place where favorites should be added/removed.
  // Favorites should ONLY be set when the user explicitly clicks the favorite button.
  // No automatic favoriting should occur.
  const handleToggleFavorite = async () => {
    try {
      const savedFavorites = await AsyncStorage.getItem('beneficiaryFavorites');
      let favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
      
      // Ensure favorites is an array
      if (!Array.isArray(favorites)) {
        favorites = [];
      }
      
      if (liked) {
        // Remove from favorites
        favorites = favorites.filter(id => id !== data.id);
        setLiked(false);
      } else {
        // Add to favorites - only when user explicitly clicks
        if (!favorites.includes(data.id)) {
          favorites.push(data.id);
        }
        setLiked(true);
      }
      
      // Save to AsyncStorage
      await AsyncStorage.setItem('beneficiaryFavorites', JSON.stringify(favorites));
      console.log('💾 Saved favorites to storage:', favorites);
    } catch (error) {
      console.error('❌ Error saving favorite:', error);
    }
  };
  
  // One-time gift state
  const [giftAmount, setGiftAmount] = useState('');
  const [customGiftAmount, setCustomGiftAmount] = useState('');
  const [showGiftSuccess, setShowGiftSuccess] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [isProcessingGift, setIsProcessingGift] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null); // { type: 'card' | 'applepay', cardType?: string, last4?: string }

  const isSignupFlow = segments.includes('signupFlow');
  const presetAmounts = [5, 10, 15];
  const giftPresetAmounts = [10, 25, 50, 100, 250, 500];

  const aboutPreview = data.about?.split(' ').slice(0, 60).join(' ') + '...';

  // Load payment method info
  useEffect(() => {
    const loadPaymentMethod = async () => {
      try {
        // Check for saved payment methods in AsyncStorage
        const savedPaymentMethod = await AsyncStorage.getItem('activePaymentMethod');
        if (savedPaymentMethod) {
          setPaymentMethod(JSON.parse(savedPaymentMethod));
        } else {
          // Default: check if user has any cards saved (simplified - in production, fetch from backend)
          // For now, we'll show a default card if none is saved
          // In a real app, this would come from the backend or payment provider
          setPaymentMethod({ type: 'card', cardType: 'Visa', last4: '4475' }); // Default for demo
        }
      } catch (error) {
        console.error('Error loading payment method:', error);
      }
    };
    
    if (activeTab === 'giveGift') {
      loadPaymentMethod();
    }
  }, [activeTab]);


  return (
    <ScrollView style={styles.containerNoFlex} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Header */}
      <View style={styles.headerRow}>
        {showBackArrow && (
        <TouchableOpacity onPress={router.back}>
          <AntDesign name="left" size={24} color="#21555b" />
        </TouchableOpacity>
        )}
      </View>

      {/* Main Image (from imageUrl) */}
      <View style={styles.imageCarousel}>
        <Image 
          source={data.image} 
          style={styles.mainImage}
          onError={(error) => {
            console.error('❌ Error loading main image:', error);
            console.log('Image source:', data.image);
          }}
          onLoad={() => {
            console.log('✅ Main image loaded successfully');
          }}
        />
      </View>

      {/* Profile Logo (from logoUrl, falls back to main image) */}
      <View style={styles.profileRow}>
        <View style={styles.profileImageContainer}>
          <Image 
            source={data.logoUrl || data.image} 
            style={styles.profileImage}
            onError={(error) => {
              console.error('❌ Error loading logo image:', error);
              console.log('Logo source:', data.logoUrl || data.image);
              // Fallback to main image if logo fails
            }}
            onLoad={() => {
              console.log('✅ Logo image loaded successfully');
            }}
          />
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.title}>{data.name}</Text>
        <Text style={styles.likes}>
          {(() => {
            // Calculate total supporters: likes + mutual (people who are giving back)
            const likes = data.likes ?? 0;
            const mutual = data.mutual ?? 0;
            const totalSupporters = likes + mutual;
            return totalSupporters > 0 ? `${totalSupporters}+ supporters` : 'Join as first supporter';
          })()}
        </Text>
        <Text style={styles.mutual}>Join our community of changemakers</Text>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              if (isSignupFlow) {
                onSelect?.();
              }
            }}
          >
            <Image
              source={require('../assets/icons/donation-box.png')}
              style={[styles.iconLeft, { tintColor: '#fff' }]}
            />
            <Text style={styles.btnText}>
              Select This Cause
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleToggleFavorite}
          >
            <Image
              source={require('../assets/icons/heart.png')}
              style={[
                styles.iconLeft,
                {
                  width: 18,
                  height: 18,
                  tintColor: liked ? '#DB8633' : '#666'
                }
              ]}
            />
            <Text style={[styles.btnTextGray, liked && { color: '#DB8633' }]}>
              {liked ? 'Liked' : 'Favorite'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity onPress={() => setActiveTab('about')}>
            <Text style={activeTab === 'about' ? styles.tabActive : styles.tabInactive}>
              About & Impact
            </Text>
          </TouchableOpacity>
          {!isSignupFlow && (
            <TouchableOpacity onPress={() => setActiveTab('giveGift')}>
              <Text style={activeTab === 'giveGift' ? styles.tabActive : styles.tabInactive}>
                Give Gift
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Content */}
        {activeTab === 'about' && (
          <>
            {/* Enhanced About Section */}
            <View style={styles.aboutSection}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.aboutText}>
                {showFullAbout ? data.about : aboutPreview}
                {!showFullAbout && (
                  <Text onPress={() => setShowFullAbout(true)} style={styles.readMore}>
                    {' '}Read More
                  </Text>
                )}
              </Text>
            </View>

            {/* Why This Matters Section - Always show with placeholder if no data */}
            <View style={styles.impactSection}>
              <Text style={styles.sectionTitle}>Why This Matters</Text>
              {(data?.whyThisMatters ?? data?.why_this_matters) ? (
                <Text style={styles.impactText}>
                  {data?.whyThisMatters ?? data?.why_this_matters}
                </Text>
              ) : (
                <Text style={[styles.impactText, { fontStyle: 'italic', color: '#999' }]}>
                  Information about why this cause matters will appear here.
                </Text>
              )}
            </View>

            {/* Impact Metrics - Always show, use ?? to handle 0 and empty strings correctly */}
            <View style={styles.metricsSection}>
              <Text style={styles.sectionTitle}>Our Impact</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <MaterialIcons name="favorite" size={24} color="#DB8633" />
                  <Text style={styles.metricNumber}>
                    {(data.livesImpacted ?? data.lives_impacted) || '—'}
                  </Text>
                  <Text style={styles.metricLabel}>Lives Impacted</Text>
                </View>
                <View style={styles.metricCard}>
                  <MaterialIcons name="volunteer-activism" size={24} color="#DB8633" />
                  <Text style={styles.metricNumber}>
                    {(data.programsActive ?? data.programs_active) || '—'}
                  </Text>
                  <Text style={styles.metricLabel}>Programs Active</Text>
                </View>
                <View style={styles.metricCard}>
                  <MaterialIcons name="account-balance" size={24} color="#DB8633" />
                  <Text style={styles.metricNumber}>
                    {(data.directToProgramsPercentage ?? data.direct_to_programs_percentage)
                      ? `${parseFloat(data.directToProgramsPercentage ?? data.direct_to_programs_percentage).toFixed(0)}%`
                      : '—'}
                  </Text>
                  <Text style={styles.metricLabel}>Direct to Programs</Text>
                </View>
              </View>
            </View>

            {/* Success Story - Always show with placeholder if no data */}
            <View style={styles.storySection}>
              <Text style={styles.sectionTitle}>Success Story</Text>
              <View style={styles.storyCard}>
                {(data?.successStory ?? data?.success_story) ? (
                  <>
                    <Text style={styles.storyText}>
                      {data?.successStory ?? data?.success_story}
                    </Text>
                    {(data?.storyAuthor ?? data?.story_author) && (
                      <Text style={styles.storyAuthor}>
                        {data?.storyAuthor ?? data?.story_author}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={[styles.storyText, { fontStyle: 'italic', color: '#999' }]}>
                    A success story showcasing the impact of this organization will appear here.
                  </Text>
                )}
              </View>
            </View>

            {/* Your Impact - Always show with placeholders if no data */}
            <View style={styles.yourImpactSection}>
              <Text style={styles.sectionTitle}>Your Impact</Text>
              {(data?.impactStatement1 ?? data?.impact_statement_1) ? (
                <View style={styles.impactCard}>
                  <MaterialIcons name="favorite" size={20} color="#DB8633" />
                  <Text style={styles.impactText}>
                    {data?.impactStatement1 ?? data?.impact_statement_1}
                  </Text>
                </View>
              ) : (
                <View style={styles.impactCard}>
                  <MaterialIcons name="favorite" size={20} color="#DB8633" />
                  <Text style={[styles.impactText, { fontStyle: 'italic', color: '#999' }]}>
                    Your first impact statement will appear here.
                  </Text>
                </View>
              )}
              {(data?.impactStatement2 ?? data?.impact_statement_2) ? (
                <View style={styles.impactCard}>
                  <MaterialIcons name="home" size={20} color="#DB8633" />
                  <Text style={styles.impactText}>
                    {data?.impactStatement2 ?? data?.impact_statement_2}
                  </Text>
                </View>
              ) : (
                <View style={styles.impactCard}>
                  <MaterialIcons name="home" size={20} color="#DB8633" />
                  <Text style={[styles.impactText, { fontStyle: 'italic', color: '#999' }]}>
                    Your second impact statement will appear here.
                  </Text>
                </View>
              )}
            </View>

            {/* Trust & Transparency */}
            <View style={styles.trustSection}>
              <Text style={styles.sectionTitle}>Trust & Transparency</Text>
              <View style={styles.trustRow}>
                <MaterialIcons name="verified" size={20} color="#4CA1AF" />
                <Text style={styles.trustText}>Verified 501(c)(3) Nonprofit</Text>
              </View>
              <View style={styles.trustRow}>
                <MaterialIcons name="account-balance" size={20} color="#4CA1AF" />
                <Text style={styles.trustText}>EIN: {data.ein}</Text>
              </View>
              {data.website && (
                <TouchableOpacity 
                  style={styles.trustRow}
                  onPress={() => {
                    const url = data.website.startsWith('http') ? data.website : `https://${data.website}`;
                    Linking.openURL(url).catch(err => {
                      console.error('Failed to open website:', err);
                      Alert.alert('Error', 'Could not open website');
                    });
                  }}
                >
                  <MaterialIcons name="language" size={20} color="#4CA1AF" />
                  <Text style={[styles.trustText, { color: '#4CA1AF' }]}>
                    Website: {data.website}
                  </Text>
                </TouchableOpacity>
              )}
              {data.phone && (
                <TouchableOpacity 
                  style={styles.trustRow}
                  onPress={() => {
                    const phoneNumber = data.phone.replace(/[^\d+]/g, ''); // Remove non-digit characters except +
                    Linking.openURL(`tel:${phoneNumber}`).catch(err => {
                      console.error('Failed to open phone:', err);
                      Alert.alert('Error', 'Could not make phone call');
                    });
                  }}
                >
                  <MaterialIcons name="phone" size={20} color="#4CA1AF" />
                  <Text style={[styles.trustText, { color: '#4CA1AF' }]}>
                    Phone: {data.phone}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
        {activeTab === 'giveGift' && !isSignupFlow && (
          <View style={styles.giftTabSection}>
            <Text style={styles.sectionTitle}>Give One-Time Gift</Text>
            <Text style={styles.giftSubtext}>
              Make a one-time donation to {data.name}. Every dollar makes a difference!
            </Text>

            {/* Preset Amounts */}
            <View style={styles.giftPresetContainer}>
              {giftPresetAmounts.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.giftPresetButton,
                    giftAmount === preset.toString() && styles.giftPresetButtonSelected
                  ]}
                  onPress={() => {
                    setGiftAmount(preset.toString());
                    setCustomGiftAmount('');
                  }}
                >
                  <Text style={[
                    styles.giftPresetText,
                    giftAmount === preset.toString() && styles.giftPresetTextSelected
                  ]}>
                    ${preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Amount Input */}
            <View style={styles.giftCustomContainer}>
              <Text style={styles.giftCustomLabel}>Or enter custom amount</Text>
              <View style={styles.giftCustomInputWrapper}>
                <Text style={styles.giftCurrencySymbol}>$</Text>
                <TextInput
                  style={styles.giftCustomInput}
                  placeholder="0"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  value={customGiftAmount}
                  onChangeText={(text) => {
                    const numericValue = text.replace(/[^0-9]/g, '');
                    setCustomGiftAmount(numericValue);
                    if (numericValue) {
                      setGiftAmount(numericValue);
                    } else {
                      setGiftAmount('');
                    }
                  }}
                  maxLength={6}
                />
              </View>
            </View>

            {/* Selected Amount Display */}
            {giftAmount && parseFloat(giftAmount) > 0 && (
              <View style={styles.giftSelectedCard}>
                <Text style={styles.giftSelectedLabel}>Your Gift</Text>
                <Text style={styles.giftSelectedAmount}>${parseFloat(giftAmount).toFixed(2)}</Text>
              </View>
            )}

            {/* Payment Method Display */}
            {giftAmount && parseFloat(giftAmount) > 0 && paymentMethod && (
              <View style={styles.giftPaymentMethodCard}>
                <Text style={styles.giftPaymentMethodLabel}>Payment Method</Text>
                <View style={styles.giftPaymentMethodRow}>
                  {paymentMethod.type === 'applepay' ? (
                    <>
                      <View style={styles.giftApplePayBadge}>
                        <Text style={styles.giftApplePayText}>Apple Pay</Text>
                      </View>
                      <Text style={styles.giftPaymentMethodText}>Secure digital payment</Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.giftCardIcon}>
                        <Feather name="credit-card" size={20} color="#324E58" />
                      </View>
                      <View style={styles.giftPaymentMethodInfo}>
                        <Text style={styles.giftPaymentMethodText}>
                          {paymentMethod.cardType || 'Card'} ending in {paymentMethod.last4 || '****'}
                        </Text>
                        <Text style={styles.giftPaymentMethodSubtext}>Will be charged on checkout</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Continue to Checkout Button */}
            <TouchableOpacity
              style={[
                styles.giftCheckoutButton,
                (!giftAmount || parseFloat(giftAmount) < 1) && styles.giftCheckoutButtonDisabled
              ]}
              onPress={async () => {
                const donationAmount = parseFloat(giftAmount);
                
                if (!giftAmount || donationAmount < 1) {
                  return;
                }

                if (donationAmount > 10000) {
                  return;
                }

                if (!data.id) {
                  Alert.alert('Error', 'Beneficiary information is missing. Please try again.');
                  return;
                }

                // Navigate to checkout screen
                router.push({
                  pathname: '/(tabs)/beneficiary/checkout',
                  params: {
                    beneficiaryId: data.id,
                    beneficiaryName: data.name || 'Charity',
                    beneficiaryImage: data.image_url || '',
                    amount: donationAmount.toString(),
                    userCoveredFees: 'true', // Default to user covering fees
                    donorMessage: '',
                    isAnonymous: 'false',
                  },
                });
              }}
              disabled={!giftAmount || parseFloat(giftAmount) < 1}
            >
              <Text style={styles.giftCheckoutButtonText}>
                Continue to Checkout
              </Text>
            </TouchableOpacity>

            {/* Info Note */}
            <Text style={styles.giftInfoNote}>
              💝 Your one-time gift will be processed securely and added to your transaction history.
            </Text>
          </View>
        )}
      </View>

      {/* Success Modal for Gift */}
      {showGiftSuccess && (
        <View style={styles.giftSuccessOverlay}>
          <View style={styles.giftSuccessModal}>
            {confettiTrigger && (
              <ConfettiCannon
                count={200}
                origin={{ x: screenWidth / 2, y: 0 }}
                fadeOut
                autoStart
              />
            )}
            <View style={styles.giftSuccessIconContainer}>
              <AntDesign name="checkcircle" size={64} color="#10B981" />
            </View>
            <Text style={styles.giftSuccessTitle}>Thank You! 🎉</Text>
            <Text style={styles.giftSuccessMessage}>
              Your ${giftAmount ? parseFloat(giftAmount).toFixed(2) : '0.00'} gift to {data.name} has been processed successfully.
            </Text>
            <Text style={styles.giftSuccessSubtext}>
              This donation has been added to your transaction history.
            </Text>
            <TouchableOpacity
              style={styles.giftSuccessButton}
              onPress={() => {
                setShowGiftSuccess(false);
                setConfettiTrigger(false);
              }}
            >
              <Text style={styles.giftSuccessButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerNoFlex: { 
    backgroundColor: '#fff',
    width: '100%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 16 },
  header: { fontSize: 18, fontWeight: '600', marginLeft: 12, color: '#21555b' },
  imageCarousel: { width: '100%', height: 200 },
  mainImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: -40, marginLeft: 16 },
  profileImageContainer: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: '#fff',
    borderWidth: 3, 
    borderColor: '#fff',
    overflow: 'hidden',
  },
  profileImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  infoBox: { 
    paddingBottom: 20,
    width: '100%',
  },
  iconLeft: { width: 18, height: 18, marginRight: 8, resizeMode: 'contain' },
  likes: { 
    fontSize: 14, 
    color: '#666', 
    marginTop: 4,
    paddingLeft: 24,
  },
  mutual: { 
    fontSize: 12, 
    color: '#888', 
    marginVertical: 8,
    paddingLeft: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#DB8633',
    borderRadius: 10,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F2F2F5',
    borderRadius: 10,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  btnTextGray: { color: '#666', fontWeight: '600' },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
    paddingHorizontal: 24,
  },
  tabActive: {
    fontWeight: '700',
    color: '#DB8633',
    borderBottomWidth: 2,
    borderBottomColor: '#DB8633',
    paddingBottom: 4,
  },
  tabInactive: { color: '#999' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
    color: '#21555b',
  },
  aboutText: { fontSize: 14, color: '#444', lineHeight: 20 },
  readMore: { color: '#DB8633', fontWeight: '600' },
  label: { fontWeight: '600', color: '#21555b' },
  infoLine: { marginTop: 8, fontSize: 14 },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    alignItems: 'center',
  },
  viewAll: { color: '#DB8633', fontWeight: '600' },
  postCard: {
    width: screenWidth * 0.6,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginRight: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  postImage: { width: '100%', height: 120, borderRadius: 8, marginBottom: 8 },
  postText: { fontSize: 14, color: '#333', marginBottom: 8 },
  iconRow: { flexDirection: 'row' },
  donationBox: {
    marginTop: 40,
    backgroundColor: '#324E58',
    borderRadius: 20,
    padding: 20,
  },
  sectionTitleWhite: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  donationInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  presetRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  presetButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DB8633',
  },
  presetSelected: { backgroundColor: '#DB8633' },
  presetText: { fontSize: 14, fontWeight: '600', color: '#DB8633' },
  donateBtn: {
    backgroundColor: '#89A6A6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  donateBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  title: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#21555b', 
    marginTop: 8,
    paddingHorizontal: 24,
  },
  aboutSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  impactSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  impactText: { fontSize: 14, color: '#444', lineHeight: 20 },
  metricsSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  metricCard: {
    alignItems: 'center',
    width: screenWidth * 0.25,
    textAlign: 'center',
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DB8633',
    marginTop: 8,
    textAlign: 'center',
  },
  metricLabel: { 
    fontSize: 12, 
    color: '#666', 
    marginTop: 4,
    textAlign: 'center',
  },
  storySection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  storyCard: {
    backgroundColor: '#F2F2F5',
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  storyText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  storyAuthor: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  yourImpactSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  impactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F5',
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  impactText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  trustSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
    marginBottom: 0,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  trustText: {
    fontSize: 14,
    color: '#4CA1AF',
    marginLeft: 8,
  },
  volunteerSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
    marginBottom: 0,
  },
  volunteerText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  volunteerOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  volunteerOption: {
    alignItems: 'center',
  },
  volunteerOptionText: {
    fontSize: 12,
    color: '#DB8633',
    marginTop: 8,
  },
  volunteerNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 16,
    textAlign: 'center',
  },
  // Gift Tab Styles
  giftTabSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  giftSubtext: {
    fontSize: 15,
    color: '#4B5563',
    marginBottom: 28,
    lineHeight: 22,
  },
  giftPresetContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 28,
    justifyContent: 'space-between',
    gap: 10,
  },
  giftPresetButton: {
    width: '30%',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  giftPresetButtonSelected: {
    backgroundColor: '#DB8633',
    borderColor: '#DB8633',
    shadowColor: '#DB8633',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  giftPresetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  giftPresetTextSelected: {
    color: '#FFFFFF',
  },
  giftCustomContainer: {
    marginBottom: 24,
  },
  giftCustomLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  giftCustomInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  giftCurrencySymbol: {
    fontSize: 22,
    fontWeight: '600',
    color: '#324E58',
    marginRight: 10,
  },
  giftCustomInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '600',
    color: '#324E58',
    paddingVertical: 16,
  },
  giftSelectedCard: {
    backgroundColor: '#FFF5EB',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#DB8633',
    marginBottom: 28,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  giftSelectedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DB8633',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  giftSelectedAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#DB8633',
  },
  giftPaymentMethodCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  giftPaymentMethodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  giftPaymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  giftCardIcon: {
    width: 40,
    height: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  giftPaymentMethodInfo: {
    flex: 1,
  },
  giftPaymentMethodText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 2,
  },
  giftPaymentMethodSubtext: {
    fontSize: 12,
    color: '#6B7280',
  },
  giftApplePayBadge: {
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 12,
  },
  giftApplePayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  giftCheckoutButton: {
    backgroundColor: '#DB8633',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  giftCheckoutButtonDisabled: {
    backgroundColor: '#E5E7EB',
    shadowOpacity: 0,
  },
  giftCheckoutButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  giftInfoNote: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  giftSuccessOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  giftSuccessModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 400,
  },
  giftSuccessIconContainer: {
    marginBottom: 16,
  },
  giftSuccessTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 12,
  },
  giftSuccessMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  giftSuccessSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  giftSuccessButton: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 120,
  },
  giftSuccessButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
