import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { AntDesign, Feather, Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useDiscount } from '../../context/DiscountContext';
import { useUser } from '../../context/UserContext';
import API from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DiscountDetails() {
  const router = useRouter();
  const { discountId } = useLocalSearchParams();
  const { getDiscountDetails, redeemDiscount } = useDiscount();
  const { addPoints, addSavings, user } = useUser();
  const redemptionCountsKey = user?.email ? `redemptionCounts:${user.email}` : 'redemptionCounts';
  
  const [discount, setDiscount] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redemptionCount, setRedemptionCount] = useState(0);

  const loadDiscountDetails = async () => {
    try {
      setIsLoading(true);
      const data = await getDiscountDetails(discountId);
      setDiscount(data);
      
      // Fetch redemption count - load from AsyncStorage first, then check server
      try {
        // Load from AsyncStorage first
        const stored = await AsyncStorage.getItem(redemptionCountsKey);
        let storedCount = 0;
        if (stored) {
          const counts = JSON.parse(stored);
          storedCount = counts[discountId] || 0;
          if (storedCount > 0) {
            setRedemptionCount(storedCount);
            console.log(`📊 Loaded redemption count from storage: ${storedCount}`);
          }
        }
        
        // Then check server
        const result = await API.getRedemptionCount(discountId);
        const serverCount = result.count || 0;
        
        // Use server count if it's higher, otherwise use stored count
        const finalCount = (serverCount > 0 && serverCount >= storedCount) ? serverCount : storedCount;
        setRedemptionCount(finalCount);
        
        // Save to AsyncStorage if server count is higher
        if (serverCount > storedCount) {
          const counts = stored ? JSON.parse(stored) : {};
          counts[discountId] = serverCount;
          await AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(counts));
        }
      } catch (error) {
        console.warn('⚠️ Failed to get redemption count:', error);
        // Try to load from storage on error
        try {
          const stored = await AsyncStorage.getItem(redemptionCountsKey);
          if (stored) {
            const counts = JSON.parse(stored);
            const storedCount = counts[discountId] || 0;
            setRedemptionCount(storedCount);
          } else {
            setRedemptionCount(0);
          }
        } catch (storageError) {
          setRedemptionCount(0);
        }
      }
    } catch (error) {
      console.error('Error loading discount details:', error);
      Alert.alert('Error', 'Failed to load discount details');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDiscountDetails();
  }, [discountId]);

  // Refresh redemption count when page comes into focus (e.g., after returning from redemption)
  useFocusEffect(
    useCallback(() => {
      if (discountId) {
        // Load from AsyncStorage first
        AsyncStorage.getItem(redemptionCountsKey)
          .then(stored => {
            let currentCount = redemptionCount;
            if (stored) {
              const counts = JSON.parse(stored);
              const storedCount = counts[discountId] || 0;
              if (storedCount > currentCount) {
                currentCount = storedCount;
                setRedemptionCount(storedCount);
                console.log(`📊 Loaded redemption count from storage: ${storedCount}`);
              }
            }
            
            // Then refresh from server
            return API.getRedemptionCount(discountId)
              .then(result => {
                const serverCount = result.count || 0;
                // Only update if server count is valid and >= current count
                if (serverCount > 0 && serverCount >= currentCount) {
                  setRedemptionCount(serverCount);
                  // Save to AsyncStorage
                  const counts = stored ? JSON.parse(stored) : {};
                  counts[discountId] = serverCount;
                  AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(counts));
                  console.log(`📊 Discount ${discountId} - Updated count from server: ${serverCount}`);
                } else {
                  // Server returned 0 or lower count (likely 404), preserve existing count
                  console.log(`📊 Discount ${discountId} - Preserving existing count: ${currentCount} (server returned: ${serverCount})`);
                }
              });
          })
          .catch(error => {
            console.warn('⚠️ Failed to refresh redemption count:', error);
            // Preserve existing count on error
          });
      }
    }, [discountId, redemptionCount])
  );

  const handleRedeem = async () => {
    try {
      setIsRedeeming(true);
      const result = await redeemDiscount(discountId);
      
      // Add points and savings
      await addPoints(25);
      if (result.savings) {
        await addSavings(result.savings);
      }
      
      // Immediately update redemption count locally (optimistic update)
      const currentCount = redemptionCount;
      const newCount = currentCount + 1;
      setRedemptionCount(newCount);
      
      // Immediately save to AsyncStorage
      try {
        const stored = await AsyncStorage.getItem(redemptionCountsKey);
        const counts = stored ? JSON.parse(stored) : {};
        counts[discountId] = newCount;
        await AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(counts));
        console.log(`💾 Saved redemption count for discount ${discountId} to storage: ${newCount}`);
      } catch (error) {
        console.warn('⚠️ Failed to save redemption count immediately:', error);
      }
      
      // Then refresh from server to get accurate count (with a small delay to ensure backend processed it)
      setTimeout(async () => {
        try {
          const redemptionResult = await API.getRedemptionCount(discountId);
          const serverCount = redemptionResult.count || 0;
          console.log(`📊 Server redemption count for discount ${discountId}: ${serverCount}, optimistic: ${newCount}`);
          
          // Only update if server count is valid and higher than or equal to our optimistic update
          // This prevents 404 responses (which return 0) from overwriting our optimistic update
          const finalCount = (serverCount > 0 && serverCount >= newCount) ? serverCount : newCount;
          setRedemptionCount(finalCount);
          
          // Save to AsyncStorage
          try {
            const stored = await AsyncStorage.getItem(redemptionCountsKey);
            const counts = stored ? JSON.parse(stored) : {};
            counts[discountId] = finalCount;
            await AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(counts));
            console.log(`💾 Saved redemption count after server refresh: ${finalCount}`);
          } catch (error) {
            console.warn('⚠️ Failed to save redemption count after server refresh:', error);
          }
          
          if (serverCount > 0 && serverCount >= newCount) {
            console.log(`✅ Updated redemption count from server: ${serverCount}`);
          } else {
            console.log(`📊 Keeping optimistic redemption count: ${newCount} (server returned: ${serverCount})`);
          }
        } catch (error) {
          console.warn('⚠️ Failed to refresh redemption count:', error);
          // Keep the optimistic update if server refresh fails
          setRedemptionCount(newCount);
          try {
            const stored = await AsyncStorage.getItem(redemptionCountsKey);
            const counts = stored ? JSON.parse(stored) : {};
            counts[discountId] = newCount;
            await AsyncStorage.setItem(redemptionCountsKey, JSON.stringify(counts));
          } catch (saveError) {
            console.warn('⚠️ Failed to save redemption count on error:', saveError);
          }
        }
      }, 500); // Small delay to allow backend to process
      
      // Navigate to discount approved page
      router.push({
        pathname: '/(tabs)/discounts/DiscountApproved',
        params: {
          discountId: discountId,
          discountCode: result.discountCode || discount.discountCode,
          vendorName: discount.vendor.name,
          discountTitle: discount.title,
          vendorLogo: discount.vendor.logoUrl,
          discountType: discount.discountType || '',
          discountValue: discount.discountValue?.toString() || '',
          maxDiscount: discount.maxDiscount?.toString() || '',
          description: discount.description || '',
          terms: discount.terms || '',
          usageLimitPerMonth: discount.usageLimit?.toString() || discount.usage_limit?.toString() || '',
          remainingUses: result?.remainingUses?.toString?.() || result?.availableCount?.toString?.() || '',
          availableCount: result?.availableCount?.toString?.() || '',
          usageLimitDisplay: result?.usageLimitDisplay || discount?.usageLimitDisplay || '',
        }
      });
    } catch (error) {
      console.warn('⚠️ Error redeeming discount (using local fallback):', error);
      Alert.alert('Error', 'Failed to redeem discount. Please try again.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleCall = () => {
    if (discount?.vendor?.phone) {
      Linking.openURL(`tel:${discount.vendor.phone}`);
    }
  };

  const handleWebsite = () => {
    if (discount?.vendor?.website) {
      Linking.openURL(discount.vendor.website);
    }
  };

  const handleSocial = (platform) => {
    const socialUrl = discount?.vendor?.socialLinks?.[platform];
    if (socialUrl) {
      Linking.openURL(socialUrl);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading discount details...</Text>
      </View>
    );
  }

  if (!discount) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Discount not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Calculate if limit is reached for styling
  const calculateLimitStatus = () => {
    let rawUsageLimit = discount.usageLimit || discount.usage_limit || null;
    let usageLimit = null;
    if (rawUsageLimit !== null && rawUsageLimit !== undefined && rawUsageLimit !== '') {
      let numValue;
      if (typeof rawUsageLimit === 'string') {
        const trimmed = rawUsageLimit.trim();
        if (trimmed.toLowerCase() === 'unlimited' || trimmed === '') {
          usageLimit = null;
        } else {
          numValue = parseInt(trimmed, 10);
        }
      } else {
        numValue = Number(rawUsageLimit);
      }
      if (numValue !== undefined && !isNaN(numValue) && numValue > 0) {
        usageLimit = numValue;
      }
    }
    const remainingUses = usageLimit ? Math.max(0, usageLimit - redemptionCount) : null;
    return {
      usageLimit,
      remainingUses,
      isLimitReached: usageLimit && (redemptionCount >= usageLimit || remainingUses === 0)
    };
  };

  const limitStatus = calculateLimitStatus();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Discount Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Discount Image */}
      <View style={styles.imageContainer}>
        <Image 
          source={{ uri: discount.imageUrl }} 
          style={styles.discountImage}
          resizeMode="cover"
        />
        <View style={styles.discountBadge}>
          <Text style={styles.discountBadgeText}>{discount.title}</Text>
        </View>
      </View>

      {/* Vendor Info */}
      <View style={styles.vendorCard}>
        <View style={styles.vendorHeader}>
          <Image 
            source={{ uri: discount.vendor.logoUrl }} 
            style={styles.vendorLogo}
          />
          <View style={styles.vendorInfo}>
            <Text style={styles.vendorName}>{discount.vendor.name}</Text>
            <Text style={styles.vendorCategory}>{discount.vendor.category}</Text>
            <View style={styles.ratingContainer}>
              {Platform.OS === 'web' ? (
                <Text style={{ fontSize: 16, marginRight: 4 }}>⭐</Text>
              ) : (
                <Ionicons name="star" size={16} color="#FFD700" />
              )}
              <Text style={styles.ratingText}>4.8 (127 reviews)</Text>
            </View>
          </View>
        </View>
        
        <Text style={styles.vendorDescription}>{discount.vendor.description}</Text>
      </View>

      {/* Usage Limit Display */}
      {(() => {
        // Backend now returns usageLimit (camelCase) - e.g., "5" or "unlimited"
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
        
        const remainingUses = usageLimit ? Math.max(0, usageLimit - redemptionCount) : null;
        // Limit is reached when: redemptionCount >= usageLimit OR remainingUses === 0
        const isLimitReached = usageLimit && (redemptionCount >= usageLimit || remainingUses === 0);
        
        if (usageLimit) {
          return (
            <View style={styles.usageCard}>
              <Text style={styles.sectionTitle}>Usage Limit</Text>
              {isLimitReached ? (
                <Text style={styles.usageLimitReached}>
                  Limit reached ({redemptionCount}/{usageLimit} used this month)
                </Text>
              ) : (
                <Text style={styles.usageLimitText}>
                  {remainingUses} of {usageLimit} uses remaining this month
                </Text>
              )}
            </View>
          );
        }
        return null;
      })()}

      {/* Discount Details */}
      <View style={[
        styles.detailsCard,
        limitStatus.isLimitReached && styles.detailsCardDisabled
      ]}>
        <Text style={styles.sectionTitle}>Discount Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Offer</Text>
          <Text style={styles.detailValue}>{discount.description}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Discount Code</Text>
          <Text style={styles.discountCode}>{discount.discountCode}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Valid Until</Text>
          <Text style={styles.detailValue}>{new Date(discount.endDate).toLocaleDateString()}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Terms</Text>
          <Text style={styles.detailValue}>{discount.terms}</Text>
        </View>
      </View>

      {/* Contact Information */}
      <View style={styles.contactCard}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        
        <TouchableOpacity style={styles.contactRow} onPress={handleCall}>
          {Platform.OS === 'web' ? (
            <Text style={{ fontSize: 20, marginRight: 12 }}>📞</Text>
          ) : (
            <Feather name="phone" size={20} color="#DB8633" />
          )}
          <Text style={styles.contactText}>{discount.vendor.phone}</Text>
          {Platform.OS === 'web' ? (
            <Text style={{ fontSize: 16, color: '#8E9BAE' }}>›</Text>
          ) : (
            <AntDesign name="right" size={16} color="#8E9BAE" />
          )}
        </TouchableOpacity>

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

        <View style={styles.contactRow}>
          {Platform.OS === 'web' ? (
            <Text style={{ fontSize: 20, marginRight: 12 }}>📍</Text>
          ) : (
            <Feather name="map-pin" size={20} color="#DB8633" />
          )}
          <Text style={styles.contactText}>
            {discount.vendor.address.street}, {discount.vendor.address.city}, {discount.vendor.address.state} {discount.vendor.address.zipCode}
          </Text>
        </View>
      </View>

      {/* Social Links */}
      {discount.vendor.socialLinks && (
        <View style={styles.socialCard}>
          <Text style={styles.sectionTitle}>Follow Us</Text>
          <View style={styles.socialLinks}>
            {discount.vendor.socialLinks.facebook && (
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
            {discount.vendor.socialLinks.instagram && (
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
            {discount.vendor.socialLinks.twitter && (
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
      <View style={styles.hoursCard}>
        <Text style={styles.sectionTitle}>Business Hours</Text>
        {(() => {
          // Define day order: Monday through Sunday
          const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          
          // Sort entries by day order
          const sortedHours = Object.entries(discount.vendor.hours).sort(([dayA], [dayB]) => {
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

      {/* Tags */}
      {discount.tags && discount.tags.length > 0 && (
        <View style={styles.tagsCard}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.tagsContainer}>
            {discount.tags.map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Redeem Button */}
      <View style={styles.redeemContainer}>
        {(() => {
          // Get usage limit from backend - backend now returns usageLimit (camelCase)
          let rawUsageLimit = discount.usageLimit || discount.usage_limit || null;
          let usageLimit = null;
          if (rawUsageLimit !== null && rawUsageLimit !== undefined && rawUsageLimit !== '') {
            let numValue;
            if (typeof rawUsageLimit === 'string') {
              const trimmed = rawUsageLimit.trim();
              if (trimmed.toLowerCase() === 'unlimited' || trimmed === '') {
                usageLimit = null;
              } else {
                numValue = parseInt(trimmed, 10);
              }
            } else {
              numValue = Number(rawUsageLimit);
            }
            if (numValue !== undefined && !isNaN(numValue) && numValue > 0) {
              usageLimit = numValue;
            }
          }
          const remainingUses = usageLimit ? Math.max(0, usageLimit - redemptionCount) : null;
          // Limit is reached when: redemptionCount >= usageLimit OR remainingUses === 0
          const isLimitReached = usageLimit && (redemptionCount >= usageLimit || remainingUses === 0);
          const isDisabled = isRedeeming || isLimitReached;
          
          return (
            <TouchableOpacity 
              style={[styles.redeemButton, isDisabled && styles.redeemButtonDisabled]} 
              onPress={handleRedeem}
              disabled={isDisabled}
            >
              <Text style={styles.redeemButtonText}>
                {isRedeeming ? 'Redeeming...' : isLimitReached ? 'Limit Reached' : 'Redeem Discount'}
              </Text>
            </TouchableOpacity>
          );
        })()}
      </View>

      {/* Bottom Spacer */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
  },
  headerSpacer: {
    width: 24,
  },
  imageContainer: {
    position: 'relative',
    height: 200,
    backgroundColor: '#E5E7EB',
  },
  discountImage: {
    width: '100%',
    height: '100%',
  },
  discountBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: '#DB8633',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  discountBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  vendorCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  vendorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  vendorLogo: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 16,
  },
  vendorInfo: {
    flex: 1,
  },
  vendorName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  vendorCategory: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 4,
  },
  vendorDescription: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  detailsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailsCardDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 16,
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  discountCode: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DB8633',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  contactCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  contactText: {
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 12,
    flex: 1,
  },
  socialCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  socialLinks: {
    flexDirection: 'row',
    gap: 16,
  },
  socialButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hoursCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
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
  tagsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  redeemContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  redeemButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  redeemButtonDisabled: {
    backgroundColor: '#D1D5DB',
    opacity: 0.6,
  },
  usageCard: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  usageLimitText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  usageLimitReached: {
    fontSize: 14,
    color: '#DC2626',
    marginTop: 8,
    fontWeight: '600',
  },
  redeemButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});





