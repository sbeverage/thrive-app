import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { AntDesign, Feather, MaterialIcons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import { useRouter, useSegments } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConfettiCannon from 'react-native-confetti-cannon';
import { resolveRemoteImageUri } from '../app/utils/resolveRemoteImageUri';
import API from '../app/lib/api';

const ACTIVE_PAYMENT_METHOD_KEY = 'activePaymentMethod';

function formatCardBrand(brand) {
  if (!brand) return 'Card';
  const b = String(brand).toLowerCase();
  if (b === 'amex' || b === 'american express' || b === 'american_express') return 'Amex';
  if (b === 'diners') return 'Diners';
  if (b === 'unionpay') return 'UnionPay';
  return b.charAt(0).toUpperCase() + b.slice(1);
}

function normalizePaymentMethodsList(methods) {
  return (methods || []).map((method) => {
    if (method?.card) return method;
    if (method?.brand || method?.last4) {
      return {
        ...method,
        card: {
          brand: method.brand || 'card',
          last4: method.last4 || '',
          exp_month: method.exp_month || null,
          exp_year: method.exp_year || null,
        },
      };
    }
    return method;
  });
}

function paymentMethodToUiState(method) {
  if (!method?.id) return null;
  const card = method.card || {};
  const brand = card.brand || method.brand;
  const last4 = card.last4 || method.last4 || '';
  return {
    type: 'card',
    id: method.id,
    cardType: formatCardBrand(brand),
    last4,
  };
}

function pickSavedPaymentMethod(normalized, storedRaw) {
  if (!normalized?.length) return null;
  let stored = null;
  try {
    stored = storedRaw ? JSON.parse(storedRaw) : null;
  } catch {
    stored = null;
  }
  if (stored?.id) {
    const match = normalized.find((m) => m.id === stored.id);
    if (match) return match;
  }
  const def = normalized.find((m) => m.is_default);
  if (def) return def;
  return normalized[0];
}

const screenWidth = Dimensions.get('window').width;

export default function BeneficiaryDetailCard({
  data,
  onSelect,
  showBackArrow = true,
  /** When true (e.g. viewing your chosen charity from Home), primary CTA shows selected state instead of “Select”. */
  isUsersMainCause = false,
  /** When set, overrides segment-based signup detection (beneficiary detail lives under `(tabs)` during signup). */
  isSignupFlow: isSignupFlowProp,
}) {
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
  // Tabs removed: "About & Impact" / "Give Gift" split buried the gift behind
  // a tap and made the profile feel like two half-pages. About is now the
  // page; the gift is a card that opens a modal.
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [giftInfoVisible, setGiftInfoVisible] = useState(false);
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
  /** Display + AsyncStorage: { type, id, cardType, last4 } from Stripe payment methods API */
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [paymentMethodsList, setPaymentMethodsList] = useState([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);

  const isSignupFlow =
    isSignupFlowProp != null ? !!isSignupFlowProp : segments.includes('signupFlow');
  const presetAmounts = [5, 10, 15];
  const giftPresetAmounts = [10, 25, 50, 100, 250, 500];

  const aboutPreview = data.about?.split(' ').slice(0, 60).join(' ') + '...';

  const loadPaymentMethodsFromApi = useCallback(async () => {
    setLoadingPaymentMethods(true);
    try {
      const response = await API.getPaymentMethods();
      const normalized = normalizePaymentMethodsList(response.payment_methods || []);
      setPaymentMethodsList(normalized);
      const storedRaw = await AsyncStorage.getItem(ACTIVE_PAYMENT_METHOD_KEY);
      const selected = pickSavedPaymentMethod(normalized, storedRaw);
      const ui = paymentMethodToUiState(selected);
      setPaymentMethod(ui);
      if (storedRaw && ui) {
        try {
          const s = JSON.parse(storedRaw);
          if (s?.id && !normalized.some((m) => m.id === s.id)) {
            await AsyncStorage.setItem(ACTIVE_PAYMENT_METHOD_KEY, JSON.stringify(ui));
          }
        } catch {
          await AsyncStorage.setItem(ACTIVE_PAYMENT_METHOD_KEY, JSON.stringify(ui));
        }
      }
    } catch (error) {
      console.error('Error loading payment methods:', error);
      setPaymentMethod(null);
      setPaymentMethodsList([]);
    } finally {
      setLoadingPaymentMethods(false);
    }
  }, []);

  useEffect(() => {
    if (giftModalVisible && !isSignupFlow) {
      loadPaymentMethodsFromApi();
    }
  }, [giftModalVisible, isSignupFlow, loadPaymentMethodsFromApi]);

  useFocusEffect(
    useCallback(() => {
      if (giftModalVisible && !isSignupFlow) {
        loadPaymentMethodsFromApi();
      }
    }, [giftModalVisible, isSignupFlow, loadPaymentMethodsFromApi]),
  );

  const persistSelectedPaymentMethod = async (method) => {
    const ui = paymentMethodToUiState(method);
    if (!ui) return;
    setPaymentMethod(ui);
    try {
      await AsyncStorage.setItem(ACTIVE_PAYMENT_METHOD_KEY, JSON.stringify(ui));
    } catch (e) {
      console.error('Error saving payment method preference:', e);
    }
    setShowCardPicker(false);
  };


  // The narrative sections (Why This Matters, Our Impact, Success Story, Your
  // Impact) were removed: most charities had none of it, so the profile read
  // as half-built. Photos and video carry the story instead. Git history has
  // the markup if they come back.
  //
  // hasValue treats 0 as present but rejects null/undefined/''/'null' (the
  // string, which the API returns for some columns).
  // Photos + video. imageUrls is capped at 5 by a DB CHECK; videoUrl is either
  // an uploaded file (played inline) or a YouTube/Vimeo link (opened out).
  const galleryImages = Array.isArray(data?.imageUrls)
    ? data.imageUrls.filter((u) => typeof u === 'string' && u.trim())
    : [];
  const videoUrl = (data?.videoUrl ?? data?.video_url ?? '').toString().trim();
  // Turn a share link into its embeddable player URL so the video stays in
  // the app. expo-av can only play a direct media file, so hosted videos go
  // through a WebView pointed at the host's own player.
  const toEmbedUrl = (url) => {
    if (!url) return null;
    // https://vimeo.com/1177313764?fl=pl -> https://player.vimeo.com/video/1177313764
    const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    // watch?v=ID, youtu.be/ID, /embed/ID
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}?playsinline=1`;
    return null;
  };

  // expo-av plays a direct file but cannot render a YouTube/Vimeo page.
  const videoIsPlayable = /\.(mp4|mov|m4v)(\?|$)/i.test(videoUrl);
  const videoEmbedUrl = videoIsPlayable ? null : toEmbedUrl(videoUrl);

  const hasValue = (v) =>
    v !== null &&
    v !== undefined &&
    String(v).trim() !== '' &&
    String(v).trim().toLowerCase() !== 'null';

  return (
    <>
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
        {(() => {
          const likes = data.likes ?? 0;
          const mutual = data.mutual ?? 0;
          const totalSupporters = likes + mutual;
          if (totalSupporters <= 0) return null;
          return <Text style={styles.likes}>{`${totalSupporters}+ supporters`}</Text>;
        })()}

        {/* Buttons — same two-column width when already selected (neutral left + Favorite). */}
        <View style={styles.buttonRow}>
          {isUsersMainCause ? (
            <View
              style={styles.selectedCauseSlot}
              pointerEvents="none"
              accessible
              accessibilityRole="text"
              accessibilityLabel="This is the cause you currently support"
            >
              <Image
                source={require('../assets/icons/donation-box.png')}
                style={[styles.iconLeft, styles.selectedCauseIcon]}
                resizeMode="contain"
              />
              <Text style={styles.selectedCauseText}>Your cause</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => onSelect?.()}
            >
              <Image
                source={require('../assets/icons/donation-box.png')}
                style={[styles.iconLeft, { tintColor: '#fff' }]}
              />
              <Text style={styles.btnText}>Select This Cause</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleToggleFavorite}>
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

        {(
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





            {/* Photos — up to 5 tiles in a 4:3 horizontal strip, matching the
                vendor gallery. Hidden entirely when the charity has none, so a
                profile without photos still reads as finished. */}
            {galleryImages.length > 0 && (
              <View style={styles.charityGallerySection}>
                <Text style={styles.sectionTitle}>Photos</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.charityGalleryScroll}
                >
                  {galleryImages.map((uri, i) => (
                    <Image
                      key={`${uri}_${i}`}
                      source={{ uri }}
                      style={styles.charityGalleryTile}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Video. A direct file plays inline with native controls; a
                YouTube/Vimeo link becomes a tappable card that opens the browser,
                because expo-av cannot render those pages. */}
            {videoUrl !== '' && (
              <View style={styles.charityVideoSection}>
                <Text style={styles.sectionTitle}>Video</Text>
                {videoIsPlayable ? (
                  <Video
                    source={{ uri: videoUrl }}
                    style={styles.charityVideoPlayer}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping={false}
                  />
                ) : videoEmbedUrl ? (
                  // Host's own player inside a WebView, so playback stays in
                  // the app. allowsInlineMediaPlayback matters on iOS —
                  // without it tapping play hands off to the fullscreen
                  // native player instead of playing in place.
                  <View style={styles.charityVideoPlayer}>
                    <WebView
                      source={{ uri: videoEmbedUrl }}
                      style={styles.charityVideoWebView}
                      allowsInlineMediaPlayback
                      allowsFullscreenVideo
                      javaScriptEnabled
                      domStorageEnabled
                      // Require a tap — never autoplay at someone.
                      mediaPlaybackRequiresUserAction
                      startInLoadingState
                      renderLoading={() => (
                        <View style={styles.charityVideoLoading}>
                          <ActivityIndicator size="small" color="#DB8633" />
                        </View>
                      )}
                    />
                  </View>
                ) : (
                  // Unrecognised host and not a direct file — nothing can be
                  // embedded safely, so offer the link rather than a dead box.
                  <TouchableOpacity
                    style={styles.charityVideoLinkCard}
                    onPress={() => {
                      Linking.openURL(videoUrl).catch(() => {
                        Alert.alert('Error', 'Could not open the video link.');
                      });
                    }}
                  >
                    <MaterialIcons name="play-circle-outline" size={34} color="#DB8633" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.charityVideoLinkTitle}>Watch their story</Text>
                      <Text style={styles.charityVideoLinkSub} numberOfLines={1}>
                        Opens in your browser
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color="#8E9BAE" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {!isSignupFlow && (
              <View style={styles.giftCtaCard}>
                <View style={styles.giftCtaHeaderRow}>
                  <Text style={styles.giftCtaTitle}>Give a one-time gift</Text>
                  <TouchableOpacity
                    onPress={() => setGiftInfoVisible(true)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="info-outline" size={18} color="#8A5A12" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.giftCtaButton}
                  onPress={() => setGiftModalVisible(true)}
                >
                  <Text style={styles.giftCtaButtonText}>Choose an amount</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Trust & Transparency */}
            <View style={styles.trustSection}>
              <Text style={styles.sectionTitle}>Trust & Transparency</Text>
              <View style={styles.trustRow}>
                <MaterialIcons name="verified" size={20} color="#4CA1AF" />
                <Text style={styles.trustText}>Verified 501(c)(3) Nonprofit</Text>
              </View>
              {hasValue(data.ein) && (
                <View style={styles.trustRow}>
                  <MaterialIcons name="account-balance" size={20} color="#4CA1AF" />
                  <Text style={styles.trustText}>EIN: {data.ein}</Text>
                </View>
              )}
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
        {/* One-time gift — a card on the page rather than a hidden tab.
            Deliberately loud (filled, own colour block) because it is the one
            action a donor can take here beyond switching their cause. */}

        {/* What a one-time gift is — and, more importantly, what it isn't.
            Donors on a recurring plan need to know this won't touch it. */}
        <Modal
          visible={giftInfoVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setGiftInfoVisible(false)}
        >
          <View style={styles.giftInfoBackdrop}>
            <View style={styles.giftInfoCard}>
              <View style={styles.giftInfoHeader}>
                <Text style={styles.giftInfoTitle}>About one-time gifts</Text>
                <TouchableOpacity
                  onPress={() => setGiftInfoVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
              <Text style={styles.giftInfoBody}>
                This does not change your monthly donation. Your recurring gift
                continues exactly as it is.
              </Text>
              <Text style={styles.giftInfoBody}>
                A one-time gift is an extra amount you give right now, on top of
                your monthly giving — for a specific need, a moment that moved
                you, or simply because you want to do more this month.
              </Text>
              <TouchableOpacity
                style={styles.giftInfoCta}
                onPress={() => setGiftInfoVisible(false)}
              >
                <Text style={styles.giftInfoCtaText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* The amount picker. Same flow that lived in the tab — presets,
            custom amount, saved cards, checkout — just presented as a sheet. */}
        {!isSignupFlow && (
          <Modal
            visible={giftModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setGiftModalVisible(false)}
          >
            <View style={styles.giftSheetBackdrop}>
              <View style={styles.giftSheet}>
                <View style={styles.giftSheetHeader}>
                  <Text style={styles.giftSheetTitle}>Give a one-time gift</Text>
                  <TouchableOpacity
                    onPress={() => setGiftModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <MaterialIcons name="close" size={22} color="#666" />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.giftSheetScroll}
                  contentContainerStyle={{ paddingBottom: 16 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
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

                {/* Payment Method: real saved cards from API (demo placeholder removed) */}
                {giftAmount && parseFloat(giftAmount) > 0 && (
                  <View style={styles.giftPaymentMethodCard}>
                    <Text style={styles.giftPaymentMethodLabel}>Payment Method</Text>
                    {loadingPaymentMethods ? (
                      <View style={styles.giftPaymentMethodLoadingRow}>
                        <ActivityIndicator color="#DB8633" />
                        <Text style={[styles.giftPaymentMethodSubtext, styles.giftPaymentMethodLoadingText]}>
                          Loading saved cards…
                        </Text>
                      </View>
                    ) : !paymentMethod ? (
                      <View>
                        <Text style={styles.giftPaymentMethodSubtext}>
                          No saved card on file yet. Add one under Menu → Manage Billing, or use any card at
                          checkout.
                        </Text>
                        <TouchableOpacity
                          style={styles.giftManageCardsLink}
                          onPress={() => router.push('/menu/manageCards')}
                          accessibilityRole="button"
                          accessibilityLabel="Manage saved cards"
                        >
                          <Text style={styles.giftManageCardsLinkText}>Manage saved cards</Text>
                          <Feather name="chevron-right" size={18} color="#21555b" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.giftPaymentMethodRow}>
                        {paymentMethod.type === 'applepay' ? (
                          <>
                            <View style={styles.giftApplePayBadge}>
                              <Text style={styles.giftApplePayText}>Apple Pay</Text>
                            </View>
                            <Text style={[styles.giftPaymentMethodText, { flex: 1 }]}>Secure digital payment</Text>
                          </>
                        ) : (
                          <>
                            <View style={styles.giftCardIcon}>
                              <Feather name="credit-card" size={20} color="#324E58" />
                            </View>
                            <View style={styles.giftPaymentMethodInfo}>
                              <Text style={styles.giftPaymentMethodText}>
                                {paymentMethod.cardType || 'Card'} ending in {paymentMethod.last4 || '····'}
                              </Text>
                              <Text style={styles.giftPaymentMethodSubtext}>
                                You can confirm or switch cards on the next screen.
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.giftChangeCardBtn}
                              onPress={() => setShowCardPicker(true)}
                              accessibilityRole="button"
                              accessibilityLabel="Change payment card"
                            >
                              <Text style={styles.giftChangeCardText}>Change</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}
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
                        beneficiaryImage:
                          resolveRemoteImageUri(data.logoUrl || data.image) ||
                          resolveRemoteImageUri(data.image_url) ||
                          '',
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
                </ScrollView>
              </View>
            </View>
          </Modal>
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
              <Image
                source={require('../assets/images/piggy-confetti.png')}
                style={{ width: 100, height: 100 }}
                resizeMode="contain"
              />
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

    <Modal
      visible={showCardPicker}
      transparent
      animationType="fade"
      onRequestClose={() => setShowCardPicker(false)}
    >
      <View style={styles.cardPickerRoot}>
        <Pressable style={styles.cardPickerBackdrop} onPress={() => setShowCardPicker(false)} />
        <View style={styles.cardPickerSheet}>
          <Text style={styles.cardPickerTitle}>Choose a card</Text>
          <ScrollView
            style={styles.cardPickerList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {paymentMethodsList.map((pm) => {
              const ui = paymentMethodToUiState(pm);
              if (!ui) return null;
              const selected = paymentMethod?.id === pm.id;
              return (
                <TouchableOpacity
                  key={pm.id}
                  style={[styles.cardPickerRow, selected && styles.cardPickerRowSelected]}
                  onPress={() => persistSelectedPaymentMethod(pm)}
                >
                  <Text style={styles.cardPickerRowText}>
                    {ui.cardType} ···· {ui.last4 || '····'}
                  </Text>
                  {selected ? (
                    <Feather name="check" size={22} color="#DB8633" />
                  ) : (
                    <View style={{ width: 22 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={styles.cardPickerFooterBtn}
            onPress={() => {
              setShowCardPicker(false);
              router.push('/menu/manageCards');
            }}
          >
            <Text style={styles.cardPickerFooterText}>Add or remove cards in profile</Text>
            <Feather name="chevron-right" size={18} color="#21555b" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  charityGallerySection: { paddingHorizontal: 20, marginTop: 4, marginBottom: 18 },
  charityGalleryScroll: { paddingRight: 20, paddingTop: 4, paddingBottom: 4 },
  charityGalleryTile: {
    width: 220,
    height: 165, // 4:3
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#EDF0F3',
  },
  charityVideoSection: { paddingHorizontal: 20, marginBottom: 18 },
  charityVideoPlayer: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#000',
    // clips the WebView to the rounded corners
    overflow: 'hidden',
  },
  charityVideoWebView: {
    flex: 1,
    backgroundColor: '#000',
  },
  charityVideoLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  charityVideoLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ECEFF3',
  },
  charityVideoLinkTitle: { fontSize: 15, fontWeight: '700', color: '#324E58' },
  charityVideoLinkSub: { fontSize: 12, color: '#8E9BAE', marginTop: 2 },
  // ── One-time gift CTA ──────────────────────────────────────────────
  giftCtaCard: {
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 6,
    backgroundColor: '#FFF5EB',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F3D9B8',
  },
  giftCtaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Was 6 — the description line below used to supply this gap.
    marginBottom: 14,
  },
  giftCtaTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#8A5A12',
  },
  giftCtaButton: {
    backgroundColor: '#DB8633',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  giftCtaButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── "What is a one-time gift" explainer ────────────────────────────
  giftInfoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 32, 40, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  giftInfoCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
  },
  giftInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  giftInfoTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#324E58',
  },
  giftInfoBody: {
    fontSize: 14,
    color: '#5D6D7E',
    lineHeight: 21,
    marginBottom: 12,
  },
  giftInfoCta: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  giftInfoCtaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Amount-picker sheet ────────────────────────────────────────────
  giftSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 32, 40, 0.55)',
    justifyContent: 'flex-end',
  },
  giftSheet: {
    // Percentage resolves against the backdrop, which is flex:1 — put this on
    // a child of a content-height wrapper instead and it silently does
    // nothing, which is how a sheet ends up clipping its own submit button.
    maxHeight: '88%',
    backgroundColor: '#F5F5FA',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 16,
    paddingBottom: 12,
  },
  giftSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  giftSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
  },
  giftSheetScroll: {
    flexShrink: 1,
  },
  container: { flex: 1, backgroundColor: '#fff' },
  containerNoFlex: { 
    backgroundColor: '#fff',
    width: '100%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 16 },
  header: { fontSize: 18, fontWeight: '600', marginLeft: 12, color: '#21555b' },
  imageCarousel: { width: '100%', height: 200 },
  mainImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: -55, marginLeft: 16 },
  profileImageContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
    marginBottom: 10,
    paddingHorizontal: 24,
  },
  /** Same flex + padding as secondaryBtn so the row stays visually balanced vs Select + Favorite. */
  selectedCauseSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F5',
    borderRadius: 10,
    padding: 18,
  },
  selectedCauseIcon: {
    width: 18,
    height: 18,
    tintColor: '#4CA1AF',
  },
  selectedCauseText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
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
    // sectionTitle already carries marginTop: 24, so this was stacking to 48
    // above the heading while the photo/video sections sat at ~28. Trimmed to
    // match them.
    marginTop: 4,
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
    // Same doubling as aboutSection — see note there.
    marginTop: 4,
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
    paddingVertical: 18,
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
    marginRight: 4,
  },
  giftCustomInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '600',
    color: '#324E58',
    textAlign: 'left',
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
  giftPaymentMethodLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  giftPaymentMethodLoadingText: {
    marginLeft: 0,
  },
  giftManageCardsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  giftManageCardsLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#21555b',
    flex: 1,
  },
  giftChangeCardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginLeft: 8,
  },
  giftChangeCardText: {
    color: '#21555b',
    fontWeight: '700',
    fontSize: 15,
  },
  cardPickerRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  cardPickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  cardPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 12,
  },
  cardPickerList: {
    maxHeight: 280,
  },
  cardPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardPickerRowSelected: {
    borderColor: '#DB8633',
    backgroundColor: '#FFF5EB',
  },
  cardPickerRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
    flex: 1,
  },
  cardPickerFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cardPickerFooterText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#21555b',
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
