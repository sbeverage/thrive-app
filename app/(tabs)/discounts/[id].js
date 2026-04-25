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
import { LinearGradient } from 'expo-linear-gradient';
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
        setVendor(foundVendor);
        const vendorDiscountList = discounts.filter(d => {
          const dVendorId = d.vendorId?.toString() || d.vendorId;
          const vId = foundVendor.id?.toString() || foundVendor.id;
          return dVendorId === vId;
        });
        setVendorDiscounts(vendorDiscountList);
      }
    }
  }, [vendors, discounts, vendorId]);

  // Load redemption counts from AsyncStorage on mount
  useEffect(() => {
    const loadRedemptionCounts = async () => {
      try {
        const stored = await AsyncStorage.getItem(redemptionCountsKey);
        if (stored) {
          setRedemptionCounts(JSON.parse(stored));
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
      } catch {
        // Non-critical
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
    
    const results = await Promise.all(
      vendorDiscounts.map(async (discount) => {
        try {
          const result = await API.getRedemptionCount(discount.id);
          const serverCount = result.count || 0;
          const currentCount = currentCounts[discount.id] || 0;
          // Only use server count if it's valid and >= current count
          // This prevents 404 responses (which return 0) from overwriting optimistic updates
          const count = serverCount > 0 && serverCount >= currentCount ? serverCount : currentCount;
          return { id: discount.id, count };
        } catch {
          return { id: discount.id, count: currentCounts[discount.id] || 0 };
        }
      })
    );
    const counts = Object.fromEntries(results.map(({ id, count }) => [id, count]));
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
          vendorId: vendor?.id,
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
      const cleaned = vendor.phone.replace(/[^\d+]/g, '');
      Linking.openURL(`tel:${cleaned}`);
    }
  };

  const handleWebsite = () => {
    if (vendor?.website) {
      const url = vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`;
      Linking.openURL(url);
    }
  };

  const handleAddress = () => {
    if (vendor?.address) {
      const { street, city, state, zipCode } = vendor.address;
      const query = encodeURIComponent(`${street}, ${city}, ${state} ${zipCode}`);
      Linking.openURL(`maps://?q=${query}`).catch(() =>
        Linking.openURL(`https://maps.google.com/?q=${query}`)
      );
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Teal Gradient Header */}
        <LinearGradient
          colors={['#21555b', '#2d7a82']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Image
              source={require('../../../assets/icons/arrow-left.png')}
              style={{ width: 20, height: 20, tintColor: '#fff' }}
            />
          </TouchableOpacity>
          <View style={styles.headerLogoWrap}>
            <Image source={logoSource} style={styles.headerLogo} />
          </View>
          <Text style={styles.headerVendorName} numberOfLines={1}>{vendor.name}</Text>
          {vendor.category && (
            <Text style={styles.headerCategoryText}>{vendor.category}</Text>
          )}
        </LinearGradient>

        {/* White body with rounded top */}
        <View style={styles.bodyContent}>
          {/* Available Discounts */}
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
              [...vendorDiscounts].sort((a, b) => {
                const isReached = (d) => {
                  let raw = d.usageLimit || d.usage_limit || null;
                  let limit = null;
                  if (raw !== null && raw !== undefined && raw !== '') {
                    const trimmed = typeof raw === 'string' ? raw.trim() : String(raw);
                    if (trimmed.toLowerCase() !== 'unlimited' && trimmed !== '') {
                      const n = parseInt(trimmed, 10);
                      if (!isNaN(n) && n > 0) limit = n;
                    }
                  }
                  if (limit === null) return false;
                  const used = redemptionCounts[d.id] || 0;
                  return used >= limit;
                };
                return isReached(a) - isReached(b);
              }).map(discount => {
                const formatDiscountAmount = () => {
                  if (!discount.discountType) return null;
                  if (discount.discountType === 'free') return 'Free Item';
                  if (discount.discountType === 'bogo') return 'Buy one, get one';
                  if (!discount.discountValue) return null;
                  const value = discount.discountValue;
                  if (discount.discountType === 'percentage') return `${value}% off`;
                  if (discount.discountType === 'fixed') return `$${value} off`;
                  return null;
                };

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

                const timesUsed = redemptionCounts[discount.id] || 0;
                const remainingUses = usageLimit ? Math.max(0, usageLimit - timesUsed) : null;
                const isLimitReached = usageLimit !== null && usageLimit > 0 && (timesUsed >= usageLimit || remainingUses === 0);

                let usageText;
                if (usageLimit) {
                  if (isLimitReached) {
                    usageText = `${timesUsed}/${usageLimit} used this month`;
                  } else {
                    usageText = `${remainingUses} of ${usageLimit} left this month`;
                  }
                } else {
                  usageText = 'Unlimited uses';
                }

                const discountAmount = formatDiscountAmount();

                return (
                  <View key={discount.id} style={[styles.discountCard, isLimitReached && styles.discountCardDisabled]}>
                    {/* Coupon band */}
                    <LinearGradient
                      colors={isLimitReached ? ['#9CA3AF', '#B0BEC5'] : ['#F2A84E', '#DB8633']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.discountBand}
                    >
                      {discountAmount ? (
                        <Text style={styles.bandAmount}>{discountAmount}</Text>
                      ) : (
                        <Text style={styles.bandTitle} numberOfLines={1}>{discount.title}</Text>
                      )}
                      {isLimitReached && (
                        <View style={styles.limitBadge}>
                          <Text style={styles.limitBadgeText}>Limit Reached</Text>
                        </View>
                      )}
                    </LinearGradient>

                    {/* Card body */}
                    <View style={styles.discountBody}>
                      {discountAmount && (
                        <Text style={[styles.discountTitle, isLimitReached && styles.discountTextDisabled]}>
                          {discount.title}
                        </Text>
                      )}
                      {discount.description && discount.description !== discount.terms && (
                        <Text style={[styles.discountAppliesTo, isLimitReached && styles.discountTextDisabled]} numberOfLines={2}>
                          {discount.description}
                        </Text>
                      )}
                      <View style={styles.discountFooter}>
                        <View style={[styles.usagePill, isLimitReached && styles.usagePillReached]}>
                          <Text style={[styles.usagePillText, isLimitReached && styles.usagePillTextReached]}>
                            {usageText}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.redeemBtn, (isRedeeming || isLimitReached) && styles.redeemBtnDisabled]}
                          onPress={() => {
                            if (!isLimitReached) {
                              setSelectedDiscount(discount);
                              setShowConfirmModal(true);
                            }
                          }}
                          disabled={isRedeeming || isLimitReached}
                        >
                          <Text style={styles.redeemText}>
                            {isLimitReached ? 'Used' : 'Redeem'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {discount.terms && (
                        <Text style={[styles.discountTerms, isLimitReached && styles.discountTextDisabled]}>
                          {discount.terms}
                        </Text>
                      )}
                    </View>
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
            let aboutText = '';
            if (vendor.description) {
              try {
                const parsed = typeof vendor.description === 'string'
                  ? JSON.parse(vendor.description)
                  : vendor.description;
                if (typeof parsed === 'object' && parsed !== null) {
                  aboutText = parsed.description || parsed.about || '';
                } else {
                  aboutText = vendor.description;
                }
              } catch (e) {
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
              <TouchableOpacity style={styles.contactRow} onPress={handleAddress}>
                {Platform.OS === 'web' ? (
                  <Text style={{ fontSize: 20, marginRight: 12 }}>📍</Text>
                ) : (
                  <Feather name="map-pin" size={20} color="#DB8633" />
                )}
                <Text style={styles.contactText}>
                  {vendor.address.street}, {vendor.address.city}, {vendor.address.state} {vendor.address.zipCode}
                </Text>
                {Platform.OS === 'web' ? (
                  <Text style={{ fontSize: 16, color: '#8E9BAE' }}>›</Text>
                ) : (
                  <AntDesign name="right" size={16} color="#8E9BAE" />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Social Links */}
          {vendor.socialLinks && (vendor.socialLinks.facebook || vendor.socialLinks.instagram || vendor.socialLinks.twitter) && (
            <>
              <View style={styles.socialSection}>
                <Text style={styles.sectionTitle}>Follow Us</Text>
                <View style={styles.socialLinks}>
                  {vendor.socialLinks.facebook && (
                    <TouchableOpacity style={styles.socialButton} onPress={() => handleSocial('facebook')}>
                      {Platform.OS === 'web' ? <Text style={{ fontSize: 24 }}>📘</Text> : <Feather name="facebook" size={24} color="#1877F2" />}
                    </TouchableOpacity>
                  )}
                  {vendor.socialLinks.instagram && (
                    <TouchableOpacity style={styles.socialButton} onPress={() => handleSocial('instagram')}>
                      {Platform.OS === 'web' ? <Text style={{ fontSize: 24 }}>📷</Text> : <Feather name="instagram" size={24} color="#E4405F" />}
                    </TouchableOpacity>
                  )}
                  {vendor.socialLinks.twitter && (
                    <TouchableOpacity style={styles.socialButton} onPress={() => handleSocial('twitter')}>
                      {Platform.OS === 'web' ? <Text style={{ fontSize: 24 }}>🐦</Text> : <Feather name="twitter" size={24} color="#1DA1F2" />}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          )}

          {/* Business Hours */}
          {vendor.hours && (
            <View style={styles.hoursSection}>
              <Text style={styles.sectionTitle}>Business Hours</Text>
              {(() => {
                const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                const sortedHours = Object.entries(vendor.hours).sort(([dayA], [dayB]) => {
                  const indexA = dayOrder.indexOf(dayA.toLowerCase());
                  const indexB = dayOrder.indexOf(dayB.toLowerCase());
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
                source={require('../../../assets/images/piggy-coin.png')}
                style={{ width: 72, height: 72 }}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.modalTitle}>Use This Deal?</Text>
            <Text style={styles.modalMessage}>
              Your discount code for{' '}
              <Text style={styles.modalHighlight}>
                {selectedDiscount?.title}
              </Text>{' '}
              is about to be generated.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => {
                  setShowConfirmModal(false);
                  setSelectedDiscount(null);
                }}
              >
                <Text style={styles.modalCancelText}>Not Yet</Text>
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
    backgroundColor: '#21555b',
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
  scroll: {
    flex: 1,
  },

  // Gradient Header
  gradientHeader: {
    paddingTop: 54,
    paddingBottom: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 54,
    left: 20,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
  },
  headerLogoWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  headerLogo: {
    width: 58,
    height: 58,
    borderRadius: 29,
    resizeMode: 'contain',
  },
  headerVendorName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  headerCategoryText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '500',
  },

  // White body
  bodyContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    padding: 20,
    paddingTop: 28,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#21555b',
    marginBottom: 12,
  },

  // Discounts section
  discountsSection: {
    marginBottom: 32,
  },
  discountsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  discountCountBadge: {
    backgroundColor: '#E8F4F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  discountCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#21555b',
  },

  // Coupon-style discount card
  discountCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  discountCardDisabled: {
    opacity: 0.65,
  },
  discountBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  bandAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  bandTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  limitBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  limitBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  discountBody: {
    padding: 16,
  },
  discountTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 6,
  },
  discountAppliesTo: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
    marginBottom: 12,
  },
  discountTextDisabled: {
    color: '#9CA3AF',
  },
  discountFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  usagePill: {
    backgroundColor: '#E8F4F5',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flex: 1,
    marginRight: 12,
  },
  usagePillReached: {
    backgroundColor: '#FEE2E2',
  },
  usagePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#21555b',
  },
  usagePillTextReached: {
    color: '#DC2626',
  },
  discountTerms: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 16,
  },
  redeemBtn: {
    backgroundColor: '#DB8633',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  redeemBtnDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
  },
  redeemText: {
    color: '#fff',
    fontSize: 14,
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

  // About Section
  aboutSection: {
    marginBottom: 32,
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
    marginTop: 4,
  },

  // Contact Section
  contactSection: {
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
    marginBottom: 28,
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
