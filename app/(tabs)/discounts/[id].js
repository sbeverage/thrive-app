import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  Dimensions,
  SafeAreaView,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useDiscount } from '../../context/DiscountContext';
import { useUser } from '../../context/UserContext';
import API from '../../lib/api';
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height } = Dimensions.get('window');

export default function VendorDetails() {
  const router = useRouter();
  const { id: vendorId } = useLocalSearchParams();
  const { vendors, discounts, redeemDiscount, isLoading } = useDiscount();
  const { addSavings, user } = useUser();
  const redemptionCountsKey = user?.email ? `redemptionCounts:${user.email}` : 'redemptionCounts';
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [vendor, setVendor] = useState(null);
  const [vendorDiscounts, setVendorDiscounts] = useState([]);
  const [redemptionCounts, setRedemptionCounts] = useState({}); // { discountId: count }

  // Load vendor and discounts
  useEffect(() => {
    if (vendors && vendors.length > 0 && vendorId) {
      // Find vendor by ID
      const foundVendor = vendors.find(v => {
        const vId = v.id?.toString() || v.id;
        const searchId = vendorId?.toString() || vendorId;
        return vId === searchId;
      });
      
      if (foundVendor) {
        console.log('✅ Found vendor:', foundVendor.name, 'ID:', foundVendor.id);
        setVendor(foundVendor);
        
        // Find all discounts for this vendor
        const vendorDiscountList = discounts.filter(d => {
          const dVendorId = d.vendorId?.toString() || d.vendorId;
          const vId = foundVendor.id?.toString() || foundVendor.id;
          const matches = dVendorId === vId;
          if (matches) {
            console.log('✅ Found matching discount:', d.title, 'for vendor:', foundVendor.name);
          }
          return matches;
        });
        console.log(`📊 Vendor ${foundVendor.name} has ${vendorDiscountList.length} discount(s)`);
        setVendorDiscounts(vendorDiscountList);
      } else {
        console.warn('⚠️ Vendor not found for ID:', vendorId);
        console.log('📊 Available vendor IDs:', vendors.map(v => v.id));
      }
    }
  }, [vendors, discounts, vendorId]);

  // Load redemption counts from AsyncStorage on mount
  useEffect(() => {
    const loadRedemptionCounts = async () => {
      try {
        const stored = await AsyncStorage.getItem(redemptionCountsKey);
        if (stored) {
          const counts = JSON.parse(stored);
          setRedemptionCounts(counts);
          console.log('📊 Loaded redemption counts from storage:', counts);
        }
      } catch (error) {
        console.warn('⚠️ Failed to load redemption counts from storage:', error);
      }
    };
    loadRedemptionCounts();
  }, []);

  // Save redemption counts to AsyncStorage whenever they change
  useEffect(() => {
    const saveRedemptionCounts = async () => {
      try {
        await AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(redemptionCounts));
        console.log('💾 Saved redemption counts to storage:', redemptionCounts);
      } catch (error) {
        console.warn('⚠️ Failed to save redemption counts to storage:', error);
      }
    };
    if (Object.keys(redemptionCounts).length > 0) {
      saveRedemptionCounts();
    }
  }, [redemptionCounts]);

  // Fetch redemption counts for all discounts
  const fetchRedemptionCounts = async () => {
    if (vendorDiscounts.length === 0) return;
    
    // Load existing counts from storage first
    let currentCounts = { ...redemptionCounts };
    try {
      const stored = await AsyncStorage.getItem(redemptionCountsKey);
      if (stored) {
        const storedCounts = JSON.parse(stored);
        currentCounts = { ...currentCounts, ...storedCounts };
      }
    } catch (error) {
      console.warn('⚠️ Failed to load redemption counts from storage:', error);
    }
    
    const counts = {};
    
    for (const discount of vendorDiscounts) {
      try {
        const result = await API.getRedemptionCount(discount.id);
        const serverCount = result.count || 0;
        const currentCount = currentCounts[discount.id] || 0;
        
        // Only use server count if it's valid and >= current count
        // This prevents 404 responses (which return 0) from overwriting optimistic updates
        if (serverCount > 0 && serverCount >= currentCount) {
          counts[discount.id] = serverCount;
          console.log(`📊 Discount ${discount.id} - Updated count from server: ${serverCount}`);
        } else {
          // Server returned 0 or lower count (likely 404), preserve existing count
          counts[discount.id] = currentCount;
          console.log(`📊 Discount ${discount.id} - Preserving existing count: ${currentCount} (server returned: ${serverCount})`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to get redemption count for discount ${discount.id}:`, error);
        // Preserve existing count on error
        counts[discount.id] = currentCounts[discount.id] || 0;
      }
    }
    setRedemptionCounts(counts);
  };

  useEffect(() => {
    fetchRedemptionCounts();
  }, [vendorDiscounts]);

  // Refresh redemption counts when page comes into focus (e.g., after returning from redemption)
  useFocusEffect(
    useCallback(() => {
      fetchRedemptionCounts();
    }, [vendorDiscounts])
  );

  const handleRedeem = async () => {
    if (!selectedDiscount) return;
    
    try {
      setIsRedeeming(true);
      setShowConfirmModal(false);
      
      // Redeem the discount - handle API errors gracefully
      let result;
      try {
        result = await redeemDiscount(selectedDiscount.id);
      } catch (redeemError) {
        // If API fails, still allow redemption with local data
        console.warn('⚠️ API redemption failed, using local data:', redeemError);
        result = {
          discountCode: selectedDiscount.discountCode || 'N/A',
          success: true,
          message: 'Discount redeemed successfully (offline mode)'
        };
      }
      
      // Add savings if provided
      if (result.savings) {
        await addSavings(result.savings);
      }
      
      // Immediately update redemption count locally (optimistic update)
      const currentCount = redemptionCounts[selectedDiscount.id] || 0;
      const newCount = currentCount + 1;
      console.log(`🔄 Updating redemption count for discount ${selectedDiscount.id}: ${currentCount} -> ${newCount}`);
      const updatedCounts = {
        ...redemptionCounts,
        [selectedDiscount.id]: newCount
      };
      setRedemptionCounts(updatedCounts);
      // Immediately save to AsyncStorage
      try {
        await AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(updatedCounts));
        console.log(`💾 Saved redemption counts to storage immediately:`, updatedCounts);
      } catch (error) {
        console.warn('⚠️ Failed to save redemption counts immediately:', error);
      }
      
      // Then refresh from server to get accurate count (with a small delay to ensure backend processed it)
      setTimeout(async () => {
        try {
          const redemptionResult = await API.getRedemptionCount(selectedDiscount.id);
          const serverCount = redemptionResult.count || 0;
          console.log(`📊 Server redemption count for discount ${selectedDiscount.id}: ${serverCount}, optimistic: ${newCount}`);
          
          // Only update if server count is valid and higher than or equal to our optimistic update
          // This prevents 404 responses (which return 0) from overwriting our optimistic update
          const finalCount = (serverCount > 0 && serverCount >= newCount) ? serverCount : newCount;
          const updatedCounts = {
            ...redemptionCounts,
            [selectedDiscount.id]: finalCount
          };
          
          setRedemptionCounts(updatedCounts);
          // Save to AsyncStorage
          try {
            await AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(updatedCounts));
            console.log(`💾 Saved redemption counts after server refresh:`, updatedCounts);
          } catch (error) {
            console.warn('⚠️ Failed to save redemption counts after server refresh:', error);
          }
          
          if (serverCount > 0 && serverCount >= newCount) {
            console.log(`✅ Updated redemption count from server: ${serverCount}`);
          } else {
            console.log(`📊 Keeping optimistic redemption count: ${newCount} (server returned: ${serverCount})`);
          }
        } catch (error) {
          console.warn('⚠️ Failed to refresh redemption count:', error);
          // Keep the optimistic update if server refresh fails
          const updatedCounts = {
            ...redemptionCounts,
            [selectedDiscount.id]: newCount
          };
          setRedemptionCounts(updatedCounts);
          try {
            await AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(updatedCounts));
          } catch (saveError) {
            console.warn('⚠️ Failed to save redemption counts on error:', saveError);
          }
        }
      }, 500); // Small delay to allow backend to process
      
      // Navigate to DiscountApproved page with all the data
      router.push({
        pathname: '/(tabs)/discounts/DiscountApproved',
        params: {
          discountId: selectedDiscount.id,
          discountCode: result.discountCode || selectedDiscount.discountCode,
          vendorName: vendor?.name || 'Vendor',
          discountTitle: selectedDiscount.title,
          vendorLogo: vendor?.logoUrl || '',
          discountType: selectedDiscount.discountType || '',
          discountValue: selectedDiscount.discountValue?.toString() || '',
          maxDiscount: selectedDiscount.maxDiscount?.toString() || '',
          description: selectedDiscount.description || '',
          terms: selectedDiscount.terms || '',
          usageLimitPerMonth: selectedDiscount.frequency?.toString() || selectedDiscount.usageLimitPerMonth?.toString() || selectedDiscount.maxUsesPerMonth?.toString() || selectedDiscount.usage_limit_per_month?.toString() || selectedDiscount.max_uses_per_month?.toString() || '',
          remainingUses: result?.remainingUses?.toString?.() || result?.availableCount?.toString?.() || '',
          availableCount: result?.availableCount?.toString?.() || '',
          usageLimitDisplay: result?.usageLimitDisplay || selectedDiscount?.usageLimitDisplay || '',
        }
      });
    } catch (error) {
      console.warn('⚠️ Error redeeming discount (using local fallback):', error);
      Alert.alert('Error', error.message || 'Failed to redeem discount. Please try again.');
      setIsRedeeming(false);
    }
  };

  const handleCall = () => {
    if (vendor?.phone) {
      Linking.openURL(`tel:${vendor.phone}`);
    }
  };

  const handleWebsite = () => {
    if (vendor?.website) {
      Linking.openURL(vendor.website);
    }
  };

  const handleSocial = (platform) => {
    const socialUrl = vendor?.socialLinks?.[platform];
    if (socialUrl) {
      Linking.openURL(socialUrl);
    }
  };

  if (isLoading || !vendor) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#DB8633" />
        <Text style={styles.loadingText}>Loading vendor details...</Text>
      </View>
    );
  }

  // Map vendor names to their local logo files
  const getLogoSource = (vendorName, logoUrl) => {
    // If logoUrl exists and is a valid URL, use it
    if (logoUrl && logoUrl.startsWith('http')) {
      return { uri: logoUrl };
    }
    
    // Otherwise, use local logo based on vendor name
    const logoMap = {
      'Starbucks': require('../../../assets/images/logos/starbucks.png'),
      'Apple Store': require('../../../assets/images/logos/apple.png'),
      'Pizza Palace': require('../../../assets/images/logos/starbucks.png'), // Fallback
      'Fashion Forward': require('../../../assets/images/logos/zara.png'),
      'Local Coffee House': require('../../../assets/images/logos/starbucks.png'), // Fallback
      'Fresh Market': require('../../../assets/images/logos/starbucks.png'), // Fallback
      'Cinema Plus': require('../../../assets/images/logos/starbucks.png'), // Fallback
      'FitZone Gym': require('../../../assets/images/logos/starbucks.png'), // Fallback
    };
    
    return logoMap[vendorName] || require('../../../assets/images/logos/starbucks.png');
  };
  
  const logoSource = getLogoSource(vendor?.name, vendor?.logoUrl);


  return (
    <SafeAreaView style={styles.container}>
      {/* Scrollable Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {/* Compact Horizontal Header */}
          <View style={styles.compactHeader}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Image 
                source={require('../../../assets/icons/arrow-left.png')} 
                style={{ width: 20, height: 20, tintColor: '#324E58' }} 
              />
            </TouchableOpacity>
            <View style={styles.vendorInfoRow}>
              <Image source={logoSource} style={styles.compactLogo} />
              <View style={styles.vendorTextContainer}>
                <Text style={styles.vendorName} numberOfLines={1}>{vendor.name}</Text>
                {vendor.category && (
                  <Text style={styles.categoryText} numberOfLines={1}>{vendor.category}</Text>
                )}
              </View>
            </View>
          </View>

          {/* AVAILABLE DISCOUNTS - IMMEDIATELY VISIBLE */}
          <View style={styles.discountsSection}>
            <View style={styles.discountsHeader}>
              <Text style={styles.sectionTitle}>Available Discounts</Text>
              <View style={styles.discountCountBadge}>
                <Text style={styles.discountCountText}>
                  {vendorDiscounts.length} {vendorDiscounts.length === 1 ? 'discount' : 'discounts'}
                </Text>
              </View>
            </View>
            
            {vendorDiscounts.length > 0 ? (
              vendorDiscounts.map(discount => {
                // Format discount amount (H2)
                const formatDiscountAmount = () => {
                  if (!discount.discountType || !discount.discountValue) {
                    return null; // No discount amount to show
                  }
                  
                  const value = discount.discountValue;
                  
                  if (discount.discountType === 'percentage') {
                    return `${value}% off`;
                  } else if (discount.discountType === 'fixed') {
                    return `$${value} off`;
                  } else if (discount.discountType === 'bogo') {
                    return 'Buy one, get one';
                  } else if (discount.discountType === 'free') {
                    return 'Free Item';
                  }
                  return null;
                };

                // Get usage limit from backend - backend now returns usageLimit (camelCase)
                // Backend returns: usageLimit (string) - e.g., "5" or "unlimited"
                let rawUsageLimit = discount.usageLimit || discount.usage_limit || null;
                
                // Convert to number, handling string values like "5", "0", "", null, undefined, "unlimited"
                let usageLimit = null;
                if (rawUsageLimit !== null && rawUsageLimit !== undefined && rawUsageLimit !== '') {
                  // Handle string values - parse to integer
                  let numValue;
                  if (typeof rawUsageLimit === 'string') {
                    // Trim whitespace and parse
                    const trimmed = rawUsageLimit.trim();
                    // Check for "unlimited" or empty string
                    if (trimmed.toLowerCase() === 'unlimited' || trimmed === '') {
                      usageLimit = null;
                    } else {
                      numValue = parseInt(trimmed, 10);
                    }
                  } else {
                    numValue = Number(rawUsageLimit);
                  }
                  
                  // Only set usageLimit if we got a valid positive number
                  if (numValue !== undefined && !isNaN(numValue) && numValue > 0) {
                    usageLimit = numValue;
                  }
                }
                
                const timesUsed = redemptionCounts[discount.id] || 0;
                const remainingUses = usageLimit ? Math.max(0, usageLimit - timesUsed) : null;
                // Limit is reached when: timesUsed >= usageLimit OR remainingUses === 0
                // This handles both cases: when timesUsed equals or exceeds the limit
                const isLimitReached = usageLimit !== null && usageLimit > 0 && (timesUsed >= usageLimit || remainingUses === 0);
                
                console.log(`🔍 Discount ${discount.id} - usageLimit: ${usageLimit}, timesUsed: ${timesUsed}, remainingUses: ${remainingUses}, isLimitReached: ${isLimitReached}`);
                
                // Debug: Log the redemption counts state
                console.log(`📊 Current redemptionCounts state:`, redemptionCounts);
                
                // Format usage text
                let usageText;
                if (usageLimit) {
                  if (isLimitReached) {
                    usageText = `Limit reached (${timesUsed}/${usageLimit} used this month)`;
                  } else {
                    usageText = `${remainingUses} of ${usageLimit} uses remaining this month`;
                  }
                } else {
                  usageText = 'Unlimited uses per month';
                }

                const discountAmount = formatDiscountAmount();
                
                return (
                  <View key={discount.id} style={[
                    styles.discountCard,
                    isLimitReached && styles.discountCardDisabled
                  ]}>
                    <View style={styles.discountInfo}>
                      {/* H1: Title */}
                      <Text style={[
                        styles.discountTitle,
                        isLimitReached && styles.discountTextDisabled
                      ]}>{discount.title}</Text>
                      
                      {/* H2: Discount Amount */}
                      {discountAmount && (
                        <Text style={[
                          styles.discountAmount,
                          isLimitReached && styles.discountTextDisabled
                        ]}>{discountAmount}</Text>
                      )}
                      
                      {/* H3: Applies to (Description) */}
                      {discount.description && discount.description !== discount.terms && (
                        <Text style={[
                          styles.discountAppliesTo,
                          isLimitReached && styles.discountTextDisabled
                        ]}>{discount.description}</Text>
                      )}
                      
                      {/* H4: Frequency */}
                      <Text style={isLimitReached ? styles.discountFrequencyReached : styles.discountFrequency}>
                        {usageText}
                      </Text>
                      
                      {/* H5: Terms */}
                      {discount.terms && (
                        <Text style={[
                          styles.discountTerms,
                          isLimitReached && styles.discountTextDisabled
                        ]}>{discount.terms}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.redeemBtn, 
                        (isRedeeming || isLimitReached) && styles.redeemBtnDisabled
                      ]}
                      onPress={() => {
                        if (!isLimitReached) {
                          setSelectedDiscount(discount);
                          setShowConfirmModal(true);
                        }
                      }}
                      disabled={isRedeeming || isLimitReached}
                    >
                      <Text style={styles.redeemText}>
                        {isLimitReached ? 'Limit Reached' : 'Redeem'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            ) : (
              <View style={styles.noDiscountsCard}>
                <Text style={styles.noDiscountsText}>No discounts available at this time</Text>
              </View>
            )}
          </View>

          {/* About Section */}
          {(() => {
            // Parse description if it's JSON, otherwise use as-is
            let aboutText = '';
            if (vendor.description) {
              try {
                // Try to parse as JSON
                const parsed = typeof vendor.description === 'string' 
                  ? JSON.parse(vendor.description) 
                  : vendor.description;
                
                // If it's an object, extract the description field
                if (typeof parsed === 'object' && parsed !== null) {
                  aboutText = parsed.description || parsed.about || '';
                } else {
                  aboutText = vendor.description;
                }
              } catch (e) {
                // If parsing fails, use the description as-is
                aboutText = vendor.description;
              }
            }
            
            return aboutText ? (
              <View style={styles.aboutSection}>
                <Text style={styles.sectionTitle}>About Us</Text>
                <Text style={styles.description}>{aboutText}</Text>
              </View>
            ) : null;
          })()}

          {/* Contact Information */}
          <View style={styles.contactSection}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            
            {vendor.phone && (
              <TouchableOpacity style={styles.contactRow} onPress={handleCall}>
                {Platform.OS === 'web' ? (
                  <Text style={{ fontSize: 20, marginRight: 12 }}>📞</Text>
                ) : (
                  <Feather name="phone" size={20} color="#DB8633" />
                )}
                <Text style={styles.contactText}>{vendor.phone}</Text>
                {Platform.OS === 'web' ? (
                  <Text style={{ fontSize: 16, color: '#8E9BAE' }}>›</Text>
                ) : (
                  <AntDesign name="right" size={16} color="#8E9BAE" />
                )}
              </TouchableOpacity>
            )}

            {vendor.website && (
              <TouchableOpacity style={styles.contactRow} onPress={handleWebsite}>
                {Platform.OS === 'web' ? (
                  <Text style={{ fontSize: 20, marginRight: 12 }}>🌐</Text>
                ) : (
                  <Feather name="globe" size={20} color="#DB8633" />
                )}
                <Text style={styles.contactText}>Visit Website</Text>
                {Platform.OS === 'web' ? (
                  <Text style={{ fontSize: 16, color: '#8E9BAE' }}>›</Text>
                ) : (
                  <AntDesign name="right" size={16} color="#8E9BAE" />
                )}
              </TouchableOpacity>
            )}

            {vendor.address && (
              <View style={styles.contactRow}>
                {Platform.OS === 'web' ? (
                  <Text style={{ fontSize: 20, marginRight: 12 }}>📍</Text>
                ) : (
                  <Feather name="map-pin" size={20} color="#DB8633" />
                )}
                <Text style={styles.contactText}>
                  {vendor.address.street}, {vendor.address.city}, {vendor.address.state} {vendor.address.zipCode}
                </Text>
              </View>
            )}
          </View>

          {/* Social Links */}
          {vendor.socialLinks && (vendor.socialLinks.facebook || vendor.socialLinks.instagram || vendor.socialLinks.twitter) && (
            <View style={styles.socialSection}>
              <Text style={styles.sectionTitle}>Follow Us</Text>
              <View style={styles.socialLinks}>
                {vendor.socialLinks.facebook && (
                  <TouchableOpacity 
                    style={styles.socialButton} 
                    onPress={() => handleSocial('facebook')}
                  >
                    {Platform.OS === 'web' ? (
                      <Text style={{ fontSize: 24 }}>📘</Text>
                    ) : (
                      <Feather name="facebook" size={24} color="#1877F2" />
                    )}
                  </TouchableOpacity>
                )}
                {vendor.socialLinks.instagram && (
                  <TouchableOpacity 
                    style={styles.socialButton} 
                    onPress={() => handleSocial('instagram')}
                  >
                    {Platform.OS === 'web' ? (
                      <Text style={{ fontSize: 24 }}>📷</Text>
                    ) : (
                      <Feather name="instagram" size={24} color="#E4405F" />
                    )}
                  </TouchableOpacity>
                )}
                {vendor.socialLinks.twitter && (
                  <TouchableOpacity 
                    style={styles.socialButton} 
                    onPress={() => handleSocial('twitter')}
                  >
                    {Platform.OS === 'web' ? (
                      <Text style={{ fontSize: 24 }}>🐦</Text>
                    ) : (
                      <Feather name="twitter" size={24} color="#1DA1F2" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Business Hours */}
          {vendor.hours && (
            <View style={styles.hoursSection}>
              <Text style={styles.sectionTitle}>Business Hours</Text>
              {(() => {
                // Define day order: Monday through Sunday
                const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                
                // Sort entries by day order
                const sortedHours = Object.entries(vendor.hours).sort(([dayA], [dayB]) => {
                  const indexA = dayOrder.indexOf(dayA.toLowerCase());
                  const indexB = dayOrder.indexOf(dayB.toLowerCase());
                  // If day not found in order, put it at the end
                  if (indexA === -1) return 1;
                  if (indexB === -1) return -1;
                  return indexA - indexB;
                });
                
                return sortedHours.map(([day, hours]) => (
                  <View key={day} style={styles.hoursRow}>
                    <Text style={styles.dayText}>{day.charAt(0).toUpperCase() + day.slice(1)}</Text>
                    <Text style={styles.hoursText}>{hours}</Text>
                  </View>
                ));
              })()}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={showConfirmModal} transparent animationType="fade">
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Image 
                source={require('../../../assets/icons/question.png')} 
                style={{ width: 48, height: 48, tintColor: '#DB8633' }} 
              />
            </View>
            <Text style={styles.modalTitle}>Ready to Redeem?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to redeem the{' '}
              <Text style={styles.modalHighlight}>
                {selectedDiscount?.title}
              </Text>{' '}
              discount?
            </Text>
            <Text style={styles.modalSubtitle}>
              This will generate your discount code
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => {
                  setShowConfirmModal(false);
                  setSelectedDiscount(null);
                }}
              >
                <Text style={styles.modalCancelText}>No</Text>
              </TouchableOpacity>
              
              {(() => {
                // Check if selected discount has reached its limit
                const selectedDiscountLimit = selectedDiscount?.usageLimit || selectedDiscount?.usage_limit || null;
                let selectedUsageLimit = null;
                if (selectedDiscountLimit !== null && selectedDiscountLimit !== undefined && selectedDiscountLimit !== '') {
                  if (typeof selectedDiscountLimit === 'string') {
                    const trimmed = selectedDiscountLimit.trim();
                    if (trimmed.toLowerCase() !== 'unlimited' && trimmed !== '') {
                      const numValue = parseInt(trimmed, 10);
                      if (!isNaN(numValue) && numValue > 0) {
                        selectedUsageLimit = numValue;
                      }
                    }
                  } else {
                    const numValue = Number(selectedDiscountLimit);
                    if (!isNaN(numValue) && numValue > 0) {
                      selectedUsageLimit = numValue;
                    }
                  }
                }
                const selectedTimesUsed = selectedDiscount ? (redemptionCounts[selectedDiscount.id] || 0) : 0;
                const selectedRemainingUses = selectedUsageLimit ? Math.max(0, selectedUsageLimit - selectedTimesUsed) : null;
                const selectedIsLimitReached = selectedUsageLimit && (selectedTimesUsed >= selectedUsageLimit || selectedRemainingUses === 0);
                const isModalDisabled = isRedeeming || selectedIsLimitReached;
                
                return (
                  <TouchableOpacity 
                    style={[styles.modalConfirmButton, isModalDisabled && styles.modalConfirmButtonDisabled]} 
                    onPress={handleRedeem}
                    disabled={isModalDisabled}
                  >
                    {isRedeeming ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.modalConfirmText}>
                        {selectedIsLimitReached ? 'Limit Reached' : 'Yes'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    position: 'relative',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vendorInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  compactLogo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    resizeMode: 'cover',
    marginRight: 12,
    backgroundColor: '#F3F4F6',
  },
  vendorTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    paddingBottom: 20,
    paddingTop: 20,
    flexGrow: 1,
  },
  vendorName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 2,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 12,
    marginTop: 0,
  },
  discountsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  discountCountBadge: {
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  discountCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DB8633',
  },
  // Discounts Section - Prominent at Top
  discountsSection: {
    marginBottom: 32,
  },
  discountCard: {
    backgroundColor: '#F8F9FA',
    padding: 20,
    borderRadius: 16,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  discountCardDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
    borderColor: '#D1D5DB',
  },
  discountTextDisabled: {
    opacity: 0.5,
    color: '#9CA3AF',
  },
  discountInfo: {
    marginBottom: 16,
  },
  // H1: Title
  discountTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 12,
  },
  // H2: Discount Amount
  discountAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DB8633',
    marginBottom: 12,
  },
  // H3: Applies to (Description)
  discountAppliesTo: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 12,
  },
  // H4: Frequency
  discountFrequency: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
    fontWeight: '500',
  },
  discountFrequencyReached: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: 12,
    fontWeight: '600',
  },
  discountCodeBadge: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  discountCodeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DB8633',
  },
  // H5: Terms
  discountTerms: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 16,
  },
  redeemBtn: {
    backgroundColor: '#DB8633',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  redeemBtnDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    opacity: 0.6,
  },
  redeemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  noDiscountsCard: {
    backgroundColor: '#F8F9FA',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  noDiscountsText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
    marginTop: 4,
  },
  // About Section
  aboutSection: {
    marginTop: 32,
    marginBottom: 32,
  },
  // Contact Section
  contactSection: {
    marginTop: 32,
    marginBottom: 32,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  contactText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 12,
  },
  // Social Section
  socialSection: {
    marginTop: 32,
    marginBottom: 32,
  },
  socialLinks: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  socialButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Hours Section
  hoursSection: {
    marginTop: 32,
    marginBottom: 32,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  hoursText: {
    fontSize: 14,
    color: '#6B7280',
  },
  // Modal Styles
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  modalIconContainer: {
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  modalHighlight: {
    color: '#DB8633',
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E9BAE',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
