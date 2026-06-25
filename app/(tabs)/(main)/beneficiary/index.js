// Updated to use superior design patterns from Discounts tab
import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from 'react-native';

import { AntDesign, Feather, Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import SuccessModal from '../../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useBeneficiary } from '../../../context/BeneficiaryContext';
import { useBeneficiaryFilter } from '../../../context/BeneficiaryFilterContext';
import { useLocation } from '../../../context/LocationContext';
import MapView, { Marker, Circle } from 'react-native-maps';
import { getCurrentLocation, getDefaultRegion, calculateDistance, formatDistance } from '../../../utils/locationService';
import API from '../../../lib/api';
import SuggestCard from '../../../../components/SuggestCard';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IMAGE_ASSETS } from '../../../utils/assetConstants';
import { beneficiaryLocationMatches } from '../../../utils/beneficiaryLocationMatch';
import { readSignupFlowPending } from '../../../utils/signupFlowCheckpoint';
import SupportThrivePanel from '../../../components/SupportThrivePanel';
import { cityStateFromLocation } from '../../../utils/cityStateFromLocation';

// Warm the piggy + pending-charity placeholders so they don't lazily decode
// after the rest of the hero/card list has painted. Fire-and-forget; failure
// is non-fatal. (Must come AFTER all imports for the bundler to be happy.)
Asset.fromModule(require('../../../../assets/images/piggy-peek.png'))
  .downloadAsync()
  .catch(() => {});
Asset.fromModule(require('../../../../assets/images/pending-charity-logo.png'))
  .downloadAsync()
  .catch(() => {});
Asset.fromModule(require('../../../../assets/images/pending-charity.png'))
  .downloadAsync()
  .catch(() => {});

function normStr(s) {
  return s != null ? String(s).trim().toLowerCase() : '';
}

// Single bullet row inside the branded "Add this charity?" modal. Pulled out
// so the JSX stays readable. Defined as a const arrow to sidestep any
// function-hoisting quirks Hermes can hit when this module gets HMR'd.
const SuggestBullet = ({ text }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#DB8633',
        marginTop: 7,
        marginRight: 10,
      }}
    />
    <Text style={{ flex: 1, fontSize: 13, color: '#5A6470', lineHeight: 18 }}>
      {text}
    </Text>
  </View>
);

export default function BeneficiaryScreen({ isSignupFlow = false, signupParams = null } = {}) {
  const router = useRouter();
  const localParams = useLocalSearchParams();
  const routeParams = signupParams || localParams;
  const { selectedBeneficiary, setSelectedBeneficiary, setHoldingForChoice, holdingForChoice } = useBeneficiary();
  const [thriveCharity, setThriveCharity] = useState(null);
  const { filters, updateFilters, hasActiveFilters } = useBeneficiaryFilter();
  const { location: userLocation, locationAddress, locationPermission, checkLocationPermission, refreshLocation, isLoadingLocation } = useLocation();

  useFocusEffect(
    useCallback(() => {
      if (isSignupFlow) return undefined;
      let cancelled = false;
      const run = async () => {
        try {
          const pending = await readSignupFlowPending();
          if (cancelled || !pending?.route) return;
          router.replace({ pathname: pending.route, params: pending.params || {} });
        } catch {
          /* non-fatal */
        }
      };
      run();
      return () => {
        cancelled = true;
      };
    }, [router, isSignupFlow]),
  );

  const [searchText, setSearchText] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingBeneficiary, setPendingBeneficiary] = useState(null);
  const [favorites, setFavorites] = useState([]);
  // Results from the IRS 501(c)(3) registry (via our ProPublica proxy). The
  // donor sees them inline below the local-DB matches so they never have
  // to search twice. Only populated during the signup flow.
  const [registryResults, setRegistryResults] = useState([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  // The registry result currently being confirmed (drives the branded
  // "Add this charity?" modal). null when the modal is closed.
  const [suggestConfirmFor, setSuggestConfirmFor] = useState(null);
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const beneficiarySectionRef = useRef(null);
  
  // Load favorites from AsyncStorage on mount
  // IMPORTANT: Favorites should ONLY be set when the user explicitly selects them.
  // No automatic favoriting should occur - favorites start empty unless user selects them.
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const savedFavorites = await AsyncStorage.getItem('beneficiaryFavorites');
        if (savedFavorites) {
          const parsed = JSON.parse(savedFavorites);
          // Ensure we're loading an array, and don't add any default favorites
          setFavorites(Array.isArray(parsed) ? parsed : []);
          console.log('✅ Loaded favorites from storage:', parsed);
        } else {
          // If no favorites exist, explicitly set to empty array (don't add any defaults)
          setFavorites([]);
        }
      } catch (error) {
        console.error('❌ Error loading favorites:', error);
        // On error, set to empty array (don't add any defaults)
        setFavorites([]);
      }
    };
    loadFavorites();
  }, []);
  
  // Save favorites to AsyncStorage whenever they change
  useEffect(() => {
    const saveFavorites = async () => {
      try {
        await AsyncStorage.setItem('beneficiaryFavorites', JSON.stringify(favorites));
        console.log('💾 Saved favorites to storage:', favorites);
      } catch (error) {
        console.error('❌ Error saving favorites:', error);
      }
    };
    saveFavorites();
  }, [favorites]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showMap, setShowMap] = useState(false);
  const [mapRegion, setMapRegion] = useState(getDefaultRegion());
  const [locationDisplay, setLocationDisplay] = useState('Detecting location...');
  const [locationSearch, setLocationSearch] = useState('');
  
  const [selectedMarker, setSelectedMarker] = useState(null);

  const categories = ['All', 'Favorites', 'Animal Welfare', 'Arts & Culture', 'Childhood Illness', 'Disabilities', 'Disaster Relief', 'Education', 'Elderly Care', 'Environment', 'Healthcare', 'Homelessness', 'Hunger Relief', 'International Aid', 'Low Income Families', 'Veterans', 'Youth Development'];

  // State for beneficiaries from API
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);

  // Load beneficiaries from API
  const loadBeneficiaries = async () => {
    try {
      setLoadingBeneficiaries(true);
      const data = await API.getCharities();
      // Fetch THRIVE separately so it appears in the Support-THRIVE panel
      // (only on signup) instead of mixed into the regular cause list.
      if (isSignupFlow) {
        API.getThriveCharity().then((c) => {
          if (c) setThriveCharity(c);
        }).catch(() => {});
      }

      // Handle different response formats
      let charitiesArray = null;
      if (data && data.charities && Array.isArray(data.charities)) {
        charitiesArray = data.charities;
      } else if (Array.isArray(data)) {
        charitiesArray = data;
      } else if (data && data.data && Array.isArray(data.data)) {
        charitiesArray = data.data;
      }

      if (charitiesArray && charitiesArray.length > 0) {
        // Transform backend data to frontend format
        const transformed = charitiesArray.map(charity => {
          // Calculate distance from user location
          let distanceStr = null;
          if (userLocation && charity.latitude && charity.longitude) {
            const distanceInMiles = calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              charity.latitude,
              charity.longitude
            );
            distanceStr = formatDistance(distanceInMiles);
          }

          // Handle image - use URL if available, otherwise fallback to local asset
          let imageSource;
          if (charity.imageUrl) {
            imageSource = { uri: charity.imageUrl };
          } else {
            // Fallback to default image based on category
            if (charity.category === 'Childhood Illness') {
              imageSource = require('../../../../assets/images/child-cancer.jpg');
            } else if (charity.category === 'Animal Welfare') {
              imageSource = require('../../../../assets/images/humane-society.jpg');
            } else {
              imageSource = require('../../../../assets/images/charity-water.jpg');
            }
          }

          return {
            id: charity.id,
            name: charity.name,
            category: charity.category,
            type: charity.type,
            image: imageSource,
            location: charity.location,
            latitude: charity.latitude,
            longitude: charity.longitude,
            distance: distanceStr,
            likes: charity.likes || 0,
            mutual: charity.mutual || 0,
            about: charity.about || '',
            ein: charity.ein || '',
            website: charity.website || '',
            phone: charity.phone || '',
            social: charity.social || '',
          };
        });

        setBeneficiaries(transformed);
      } else {
        setBeneficiaries([]);
      }
    } catch (error) {
      console.error('❌ Failed to load beneficiaries from API:', error.message);
      Alert.alert(
        'Could Not Load Charities',
        'There was a problem loading charities. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
      setBeneficiaries([]);
    } finally {
      setLoadingBeneficiaries(false);
    }
  };

  // Load beneficiaries on mount
  useEffect(() => {
    loadBeneficiaries();
  }, []);

  // Modal cause overrides category chips — reset a conflicting pill so labels match what's listed
  useEffect(() => {
    const c = filters.cause?.trim();
    if (!c) return;
    if (activeCategory === 'All' || activeCategory === 'Favorites') return;
    if (normStr(activeCategory) !== normStr(c)) {
      setActiveCategory('All');
    }
  }, [filters.cause]);

  // Reload beneficiaries every time the tab is focused (catches admin additions/changes)
  useFocusEffect(
    useCallback(() => {
      loadBeneficiaries();
    }, [])
  );

  // Recalculate distances when user location changes
  useEffect(() => {
    if (userLocation && beneficiaries.length > 0) {
      setBeneficiaries(prev => prev.map(b => {
        if (b.latitude && b.longitude) {
          const distanceInMiles = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            b.latitude,
            b.longitude
          );
          return {
            ...b,
            distance: formatDistance(distanceInMiles),
          };
        }
        return b;
      }));
    }
  }, [userLocation]);

  // Search the IRS 501(c)(3) registry as the donor types (signup flow only).
  // Debounced so we're not hammering ProPublica on every keystroke. Results
  // are rendered as a second section below the local matches so the donor
  // doesn't have to search twice for a charity that isn't onboarded yet.
  const lastRegistryQueryRef = useRef('');
  useEffect(() => {
    if (!isSignupFlow) {
      setRegistryResults([]);
      setRegistryLoading(false);
      return undefined;
    }
    const q = searchText.trim();
    if (q.length < 3) {
      setRegistryResults([]);
      setRegistryLoading(false);
      return undefined;
    }
    const t = setTimeout(async () => {
      lastRegistryQueryRef.current = q;
      setRegistryLoading(true);
      try {
        const results = await API.searchCharities(q);
        if (lastRegistryQueryRef.current !== q) return;
        // Drop anything already in our DB — they're rendered as normal
        // (live) charity cards via filteredBeneficiaries, no need to
        // duplicate them down in the registry section.
        const novel = (results || []).filter((r) => !r.existingCharityId);
        setRegistryResults(novel.slice(0, 8));
      } catch (e) {
        if (lastRegistryQueryRef.current === q) {
          console.warn('Registry search failed:', e?.message || e);
          setRegistryResults([]);
        }
      } finally {
        if (lastRegistryQueryRef.current === q) setRegistryLoading(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [searchText, isSignupFlow]);

  const filteredBeneficiaries = beneficiaries.filter(b => {
    // Search text filter
    const matchesSearch =
      b.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (b.location && b.location.toLowerCase().includes(searchText.toLowerCase()));

    /*
     * Cause (filter screen) + chips: do not AND a chip category with modal cause — that produced
     * empty lists (e.g. chip Education + cause Healthcare). When cause is set, it drives category;
     * Favorites chip further narrows. Otherwise chips behave as before.
     */
    const causeTrim = filters.cause && String(filters.cause).trim();
    let matchesCategoryDimension = true;
    if (causeTrim) {
      const causeMatch = normStr(b.category) === normStr(causeTrim);
      matchesCategoryDimension =
        activeCategory === 'Favorites' ? causeMatch && favorites.includes(b.id) : causeMatch;
    } else if (activeCategory === 'All') {
      matchesCategoryDimension = true;
    } else if (activeCategory === 'Favorites') {
      matchesCategoryDimension = favorites.includes(b.id);
    } else {
      matchesCategoryDimension = normStr(b.category) === normStr(activeCategory);
    }

    const locFilter = (filters.location && filters.location.trim()) || '';
    const matchesLocation = beneficiaryLocationMatches(locFilter, b.location || '');

    const wantsOrgType = normStr(filters.type);
    const matchesType =
      !wantsOrgType ||
      !normStr(b.type) ||
      normStr(b.type) === wantsOrgType;

    const matchesFavorites = !filters.showFavorites || favorites.includes(b.id);

    const matchesEmergency = !filters.emergency;

    return (
      matchesSearch &&
      matchesCategoryDimension &&
      matchesLocation &&
      matchesType &&
      matchesFavorites &&
      matchesEmergency
    );
  });

  /** Pin selected cause to top of list when it appears in current filters (no duplicate). */
  let listOrderedWithSelectedFirst = filteredBeneficiaries;
  if (selectedBeneficiary?.id != null && filteredBeneficiaries.length > 0) {
    const selId = selectedBeneficiary.id;
    const idx = filteredBeneficiaries.findIndex(
      (b) => b.id === selId || String(b.id) === String(selId),
    );
    if (idx > 0) {
      const chosen = filteredBeneficiaries[idx];
      listOrderedWithSelectedFirst = [
        chosen,
        ...filteredBeneficiaries.slice(0, idx),
        ...filteredBeneficiaries.slice(idx + 1),
      ];
    }
  }

  const highlightedBeneficiaries = listOrderedWithSelectedFirst.slice(0, 2);
  const remainingBeneficiaries = listOrderedWithSelectedFirst.slice(2);
  const beneficiariesSectionTitle =
    activeCategory === 'All' ? 'All Beneficiaries' : `All ${activeCategory}`;
  const displayedBeneficiaryCount =
    filteredBeneficiaries.length > 50 ? '50+' : String(filteredBeneficiaries.length);

  const filterRoute = isSignupFlow
    ? '/signupFlow/beneficiaryFilter'
    : '/(tabs)/beneficiary/beneficiaryFilter';
  const detailRoute = isSignupFlow
    ? '/signupFlow/beneficiaryDetail'
    : '/(tabs)/beneficiary/beneficiaryDetail';
  const detailParamsFor = (beneficiaryId) => {
    const out = { id: String(beneficiaryId) };
    if (isSignupFlow) {
      out.fromSignup = 'true';
      if (routeParams?.flow === 'coworking') {
        out.flow = 'coworking';
        out.sponsorAmount = String(routeParams?.sponsorAmount ?? '15');
      }
    }
    return out;
  };

  // Navigate forward in the signup wizard using whichever beneficiary is
  // already selected. Used by the "Continue" button rendered on an already-
  // selected card so a donor who hit Back can finish their flow without
  // having to re-select the same charity.
  // Tapping a registry card opens the branded "Add this charity?" modal
  // (state below). Submission goes through API.suggestCharity → pending
  // charity row → existing confirm-selection flow.
  const handleSuggestRegistryResult = (item) => {
    setSuggestConfirmFor(item);
  };

  const handleConfirmSuggestRegistry = async () => {
    if (!suggestConfirmFor || suggestSubmitting) return;
    setSuggestSubmitting(true);
    try {
      const item = suggestConfirmFor;
      const created = await API.suggestCharity({
        ein: item.ein,
        name: item.name,
        city: item.city,
        state: item.state,
        ntee_code: item.ntee_code,
      });
      setSuggestConfirmFor(null);
      setPendingBeneficiary({
        ...created,
        image: created.imageUrl
          ? { uri: created.imageUrl }
          : require('../../../../assets/images/pending-charity.png'),
      });
      setConfirmModalVisible(true);
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const advanceFromSelected = () => {
    const beneficiaryId = selectedBeneficiary?.id;
    if (!beneficiaryId || !isSignupFlow) return;
    if (routeParams?.flow === 'coworking') {
      router.push({
        pathname: '/signupFlow/coworkingDonationPrompt',
        params: { sponsorAmount: String(routeParams?.sponsorAmount ?? '15') },
      });
    } else {
      router.push({
        pathname: '/signupFlow/donationAmount',
        params: { beneficiaryId: String(beneficiaryId) },
      });
    }
  };

  const handleConfirmBeneficiary = async () => {
    if (!pendingBeneficiary) return;
    setConfirmModalVisible(false);
    // _saveMySpot is set by the Support-THRIVE panel's "Set aside" CTA so we
    // know whether to pass held_for_donor_choice through. Any other pick
    // (including "Help THRIVE grow") clears the held flag.
    const willBeHeld = !!pendingBeneficiary._saveMySpot;
    setHoldingForChoice(willBeHeld);

    // Outside signup, if the donor is already in held-mode and is picking a
    // real cause (not THRIVE), use the redirect endpoint — it updates their
    // active subscription's beneficiary AND releases prior held charges to
    // the new cause in one shot.
    const isLeavingHeldMode =
      !isSignupFlow && !willBeHeld && !pendingBeneficiary.is_thrive && holdingForChoice;

    try {
      if (isLeavingHeldMode) {
        const result = await API.redirectHeldDonations(pendingBeneficiary.id);
        if ((result?.released_amount ?? 0) > 0) {
          setSuccessMessage(
            `Done! $${Number(result.released_amount).toFixed(2)} you'd set aside is now headed to ${pendingBeneficiary.name}.`,
          );
        }
      } else {
        await API.saveProfile({ beneficiary: pendingBeneficiary.id });
      }
    } catch (e) {
      console.warn('⚠️ Could not persist beneficiary change:', e.message);
    }
    setSelectedBeneficiary(pendingBeneficiary);
    if (isSignupFlow) {
      if (routeParams?.flow === 'coworking') {
        router.push({
          pathname: '/signupFlow/coworkingDonationPrompt',
          params: { sponsorAmount: String(routeParams?.sponsorAmount ?? '15') },
        });
      } else {
        router.push({
          pathname: '/signupFlow/donationAmount',
          params: { beneficiaryId: String(pendingBeneficiary.id) },
        });
      }
    } else {
      setSuccessMessage("Awesome! You've selected your cause!");
      setShowSuccessModal(true);
      setConfettiTrigger(true);
    }
    setPendingBeneficiary(null);
  };

  const toggleFavorite = id => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const updateMapRegion = async () => {
    const userLocation = await getCurrentLocation();
    if (userLocation) {
      setMapRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  };

  const updateUserLocation = async () => {
    if (locationPermission === 'granted') {
      setLocationSearch('');
      updateFilters({ location: '' });
      await refreshLocation();
    } else {
      checkLocationPermission();
    }
  };

  // Helper function to get friendly location name from coordinates
  const getFriendlyLocationName = (latitude, longitude) => {
    // Alpharetta area (roughly)
    if (latitude >= 34.05 && latitude <= 34.10 && longitude >= -84.35 && longitude <= -84.25) {
      return 'Alpharetta, GA';
    }
    // Woodstock area (roughly)
    else if (latitude >= 34.09 && latitude <= 34.12 && longitude >= -84.52 && longitude <= -84.50) {
      return 'Woodstock, GA';
    }
    // Atlanta area (roughly)
    else if (latitude >= 33.70 && latitude <= 33.80 && longitude >= -84.40 && longitude <= -84.35) {
      return 'Atlanta, GA';
    }
    // General Atlanta metro area
    else if (latitude >= 33.50 && latitude <= 34.50 && longitude >= -84.80 && longitude <= -84.00) {
      return 'Atlanta Metro, GA';
    }
    else {
      return 'Current Location';
    }
  };

  useEffect(() => {
    if (showMap) {
      updateMapRegion();
    }
  }, [showMap]);

  // Auto-detect user location when component mounts
  useEffect(() => {
    checkLocationPermission();
  }, []);

  // Update location display when location context changes
  useEffect(() => {
    const updateLocationDisplay = async () => {
      if (userLocation && locationPermission === 'granted') {
        let display = 'Current Location';

        // Use locationAddress from context if available (more accurate)
        if (locationAddress?.city && locationAddress?.state) {
          display = `${locationAddress.city}, ${locationAddress.state}`;
        } else if (userLocation.latitude && userLocation.longitude) {
          // Fallback: try to get friendly name from coordinates
          try {
            display = await getFriendlyLocationName(userLocation.latitude, userLocation.longitude);
          } catch (error) {
            console.error('Error getting friendly location name:', error);
          }
        }

        setLocationDisplay(display);
        console.log('📍 Location display updated:', display);

        // Show detected city in the input field (display only - don't apply as filter)
        setLocationSearch(prev => {
          if (!prev) return display;
          return prev;
        });

        // Update map region
        setMapRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } else if (locationPermission === 'denied') {
        setLocationDisplay('Location not available');
      } else if (isLoadingLocation) {
        setLocationDisplay('Detecting location...');
      } else if (locationPermission === null) {
        setLocationDisplay('Tap to set location');
      }
    };

    updateLocationDisplay();
  }, [userLocation, locationAddress, locationPermission, isLoadingLocation]);

  const closeModal = () => {
    setShowSuccessModal(false);
    setSearchText('');
  };

  // IRS-registry results section — rendered after the local cards so the
  // donor never has to search twice. Only visible during signup, and only
  // when the typed query is long enough to have triggered a registry search.
  const renderRegistrySection = () => {
    if (!isSignupFlow) return null;
    if (searchText.trim().length < 3) return null;
    if (!registryLoading && registryResults.length === 0) return null;

    return (
      <View style={styles.registrySection}>
        <View style={styles.registrySectionHeader}>
          <View style={styles.registrySectionDivider} />
          <Text style={styles.registrySectionLabel}>Not on THRIVE yet</Text>
          <View style={styles.registrySectionDivider} />
        </View>
        <Text style={styles.registrySectionSubtitle}>
          From the IRS 501(c)(3) registry. We'll verify before they go live.
        </Text>

        {registryLoading ? (
          <View style={{ paddingVertical: 18, alignItems: 'center' }}>
            <Text style={{ color: '#8E9BAE', fontSize: 13 }}>
              Searching the registry…
            </Text>
          </View>
        ) : (
          registryResults.map((item) => {
            const location = [item.city, item.state].filter(Boolean).join(', ');
            return (
              <TouchableOpacity
                key={item.ein}
                style={styles.registryCard}
                onPress={() => handleSuggestRegistryResult(item)}
                activeOpacity={0.85}
              >
                <Image
                  source={require('../../../../assets/images/pending-charity-logo.png')}
                  style={styles.registryCardImage}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.registryCardName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <View style={styles.registryCardMetaRow}>
                    {item.suggestedCategory ? (
                      <>
                        <Text style={styles.registryCardCategory}>
                          {item.suggestedCategory}
                        </Text>
                        <View style={styles.registryCardMetaDot} />
                      </>
                    ) : null}
                    {location ? (
                      <Text style={styles.registryCardLocation}>{location}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.registryCardEin}>EIN {item.ein}</Text>
                </View>
                <View style={styles.registryCardCta}>
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={styles.registryCardCtaText}>Add</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <LinearGradient
        colors={['#2C3E50', '#4CA1AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.miniBrandHeader,
          isSignupFlow && styles.signupBrandHeader,
        ]}
      >
        {/* Signup-only back button — sends the user back to the discount
            teaser. Explicit replace (not router.back) because BeneficiaryScreen
            also lives under /(tabs); router.back() can pop into the wrong
            stack depending on how the user arrived. */}
        {isSignupFlow && (
          <TouchableOpacity
            style={styles.signupBackButton}
            onPress={() => router.replace('/signupFlow/discountTeaser')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Image
              source={require('../../../../assets/icons/arrow-left.png')}
              style={{ width: 22, height: 22, tintColor: '#fff' }}
            />
          </TouchableOpacity>
        )}

        {isSignupFlow ? (
          <>
            <Text style={styles.signupHeaderTitle}>Select a Beneficiary</Text>
            <Text style={styles.signupHeaderSubtitle}>Pick a cause and make a real impact</Text>
          </>
        ) : (
          <Image
            source={{ uri: IMAGE_ASSETS.INITIATIVE_LOGO_NO_WEB_WHITE }}
            style={styles.miniBrandLogo}
            resizeMode="contain"
          />
        )}
      </LinearGradient>

      {/* Signup-only: piggy floats above the search card, same trick as the
          discount teaser. Keeps the brand mascot visible during onboarding. */}
      {isSignupFlow && (
        <View style={styles.signupPiggyOverlay} pointerEvents="none">
          <Image
            source={require('../../../../assets/images/piggy-peek.png')}
            style={styles.signupHeaderPiggy}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Header with Search and Toggle */}
      <View style={styles.header}>


        {/* Search Row */}
        <View style={styles.searchRow}>
          <Feather name="search" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search beneficiaries"
            placeholderTextColor="#6d6e72"
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
          />
        </View>

        {/* Category Tags */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagsRow}
          contentContainerStyle={{ paddingRight: 8 }}
        >
          {categories.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, activeCategory === tag && styles.tagActive]}
              onPress={() => {
                setActiveCategory(tag);
                const c = filters.cause?.trim();
                if (!c) return;
                if (tag === 'All') {
                  updateFilters({ cause: '' });
                  return;
                }
                if (tag !== 'Favorites' && normStr(tag) !== normStr(c)) {
                  updateFilters({ cause: '' });
                }
              }}
            >
              <View style={styles.tagContent}>
                {tag === 'Favorites' && (
                  <Image
                    source={require('../../../../assets/icons/heart.png')}
                    style={[styles.tagIcon, { width: 14, height: 14, tintColor: activeCategory === tag ? '#D0861F' : '#666' }]}
                  />
                )}
                <Text style={[styles.tagText, activeCategory === tag && styles.tagTextActive]}>{tag}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* List/Map Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity 
            style={[styles.toggleBtn, !showMap && styles.toggleActive]} 
            onPress={() => setShowMap(false)}
          >
            <Feather name="list" size={16} color={!showMap ? "#fff" : "#666"} />
            <Text style={[styles.toggleText, !showMap && styles.toggleTextActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, showMap && styles.toggleActive]} 
            onPress={() => setShowMap(true)}
          >
            <Feather name="map" size={16} color={showMap ? "#fff" : "#666"} />
            <Text style={[styles.toggleText, showMap && styles.toggleTextActive]}>Map</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {showMap ? (
          <View style={styles.mapContainer}>
            {Platform.OS === 'web' ? (
              <View style={[StyleSheet.absoluteFill, styles.webMapFallback]}>
                <Text style={styles.webMapText}>Map view is not available on web</Text>
                <Text style={styles.webMapSubtext}>Please use the mobile app for full map functionality</Text>
                <TouchableOpacity
                  style={styles.switchToListButton}
                  onPress={() => setShowMap(false)}
                >
                  <Text style={styles.switchToListButtonText}>Switch to List View</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <MapView
                style={StyleSheet.absoluteFill}
                initialRegion={mapRegion}
                region={mapRegion}
                showsUserLocation={true}
                showsMyLocationButton={false}
                onMapReady={updateMapRegion}
              >
                <Circle
                  center={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                  radius={15000}
                  strokeColor="#DB8633"
                  fillColor="rgba(219, 134, 51, 0.1)"
                />
                {!loadingBeneficiaries && filteredBeneficiaries.filter(b => b.latitude != null && b.longitude != null).map(b => (
                  <Marker
                    key={b.id}
                    coordinate={{ latitude: parseFloat(b.latitude), longitude: parseFloat(b.longitude) }}
                    onPress={() => setSelectedMarker(b)}
                    tracksViewChanges={false}
                  >
                    <View style={styles.customMarkerContainer}>
                      <View style={styles.customMarkerBubble}>
                        {b.image && typeof b.image === 'object' && b.image.uri ? (
                          <Image source={{ uri: b.image.uri }} style={styles.customMarkerLogo} resizeMode="cover" />
                        ) : (
                          <Feather name="heart" size={12} color="#fff" />
                        )}
                        <Text style={styles.customMarkerText} numberOfLines={1}>{b.name}</Text>
                      </View>
                      <View style={styles.customMarkerTail} />
                    </View>
                  </Marker>
                ))}
              </MapView>
            )}

            {/* Floating Filter Button */}
            <TouchableOpacity
              style={[styles.mapFilterBtn, styles.mapFilterBtnActive]}
              onPress={() => router.push(filterRoute)}
            >
              <Feather name="filter" size={15} color="#fff" />
              <Text style={[styles.mapFilterBtnText, styles.mapFilterBtnTextActive]}>Filter</Text>
            </TouchableOpacity>

            {/* Inline Info Window */}
            {selectedMarker && (
              <View style={styles.infoWindow}>
                <View style={styles.infoWindowHeader}>
                  {selectedMarker.image && typeof selectedMarker.image === 'object' && selectedMarker.image.uri ? (
                    <Image source={{ uri: selectedMarker.image.uri }} style={styles.infoWindowLogo} resizeMode="cover" />
                  ) : (
                    <View style={[styles.infoWindowLogo, styles.infoWindowLogoFallback]}>
                      <Feather name="heart" size={22} color="#21555b" />
                    </View>
                  )}
                  <View style={styles.infoWindowText}>
                    <Text style={styles.infoWindowTitle}>{selectedMarker.name}</Text>
                    <Text style={styles.infoWindowCategory}>{selectedMarker.category}</Text>
                    <Text style={styles.infoWindowLocation}>{selectedMarker.location}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setSelectedMarker(null)}
                  >
                    <AntDesign name="close" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
                <View style={styles.infoWindowActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                      setSelectedMarker(null);
                      router.push({
                        pathname: detailRoute,
                        params: detailParamsFor(selectedMarker.id),
                      });
                    }}
                  >
                    <Feather name="info" size={16} color="#fff" />
                    <Text style={styles.actionButtonText}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButtonSecondary}
                    onPress={() => {
                      setPendingBeneficiary(selectedMarker);
                      setSelectedMarker(null);
                      setConfirmModalVisible(true);
                    }}
                  >
                    <Feather name="heart" size={16} color="#DB8633" />
                    <Text style={styles.actionButtonTextSecondary}>Select</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={true}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderTextCol}>
                <Text style={styles.sectionTitle}>{beneficiariesSectionTitle}</Text>
                <View style={styles.sectionSubtitleRow}>
                  <Feather name="map-pin" size={13} color="#8E9BAE" />
                  <Text style={styles.sectionSubtitle}>
                    {(() => {
                      // The donor's filter pick takes priority — if they
                      // chose "Alpharetta, GA" in the filter view, the
                      // subtitle should reflect that, not their GPS city.
                      const filterLoc = filters?.location && String(filters.location).trim();
                      if (filterLoc) {
                        return `${filterLoc} (${displayedBeneficiaryCount})`;
                      }
                      if (locationPermission === 'granted') {
                        return `${locationDisplay || 'Current Location'} (${displayedBeneficiaryCount})`;
                      }
                      return `${locationDisplay ? `${locationDisplay} ` : ''}(${displayedBeneficiaryCount})`;
                    })()}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => router.push(filterRoute)}
                style={[styles.filterBtn, hasActiveFilters() && styles.filterBtnActive]}
              >
                <Feather name="filter" size={15} color={hasActiveFilters() ? '#fff' : '#DB8633'} />
                <Text style={[styles.filterBtnText, hasActiveFilters() && styles.filterBtnTextActive]}>Filter</Text>
              </TouchableOpacity>
            </View>

            {loadingBeneficiaries ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#666', fontSize: 16 }}>Loading beneficiaries...</Text>
              </View>
            ) : filteredBeneficiaries.length > 0 ? (
              <>
                <View ref={beneficiarySectionRef}>
                  {highlightedBeneficiaries.map((b) => {
                    const isSelected = selectedBeneficiary?.id === b.id;
                    return (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.beneficiaryCard,
                        isSelected && styles.selectedBeneficiaryCard
                      ]}
                      onPress={() => {
                        router.push({
                          pathname: detailRoute,
                          params: detailParamsFor(b.id),
                        });
                      }}
                    >
                      <Image source={b.image} style={styles.beneficiaryImage} />
                      <TouchableOpacity 
                        onPress={() => toggleFavorite(b.id)} 
                        style={styles.favoriteButton}
                      >
                        {favorites.includes(b.id) ? (
                          <AntDesign
                            name="heart"
                            size={20}
                            color="#DB8633"
                          />
                        ) : (
                          <Image 
                            source={require('../../../../assets/icons/heart.png')} 
                            style={{ width: 20, height: 20, tintColor: '#DB8633' }} 
                          />
                        )}
                      </TouchableOpacity>
                      <View style={styles.beneficiaryCardContent}>
                        <Text style={styles.beneficiaryName}>{b.name}</Text>
                        <Text style={styles.beneficiaryCategory}>{b.category}</Text>
                        {!isSignupFlow && (
                          <View style={styles.beneficiaryLocation}>
                            <Ionicons name="location" size={14} color="#8E9BAE" />
                            <Text style={styles.beneficiaryLocationText}>{cityStateFromLocation(b.location)} • {b.distance}</Text>
                          </View>
                        )}
                        
                        <View style={[styles.buttonsRow, isSelected && styles.buttonsRowSingle]}>
                          <TouchableOpacity 
                            style={[
                              styles.viewDetailsButton,
                              isSelected && styles.viewDetailsButtonAlone,
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              router.push({
                                pathname: detailRoute,
                                params: detailParamsFor(b.id),
                              });
                            }}
                          >
                            <Text style={[
                              styles.viewDetailsButtonText,
                              isSelected && styles.viewDetailsButtonAloneText,
                            ]}>Details</Text>
                          </TouchableOpacity>
                          {!isSelected ? (
                            <TouchableOpacity
                              style={styles.changeToThisButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                setPendingBeneficiary(b);
                                setConfirmModalVisible(true);
                              }}
                            >
                              <Text style={styles.changeToThisButtonText}>Select</Text>
                            </TouchableOpacity>
                          ) : isSignupFlow ? (
                            // Charity is already selected and we're mid-signup
                            // — let the user continue forward instead of dead-
                            // ending them when they come back via Back.
                            <TouchableOpacity
                              style={styles.changeToThisButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                advanceFromSelected();
                              }}
                            >
                              <Text style={styles.changeToThisButtonText}>Continue</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                    );
                  })}
                </View>

                {remainingBeneficiaries.map((b) => {
                  const isSelected = selectedBeneficiary?.id === b.id;
                  return (
                  <TouchableOpacity
                    key={b.id}
                    style={[
                      styles.beneficiaryCard,
                      isSelected && styles.selectedBeneficiaryCard
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: detailRoute,
                        params: detailParamsFor(b.id),
                      });
                    }}
                  >
                    <Image source={b.image} style={styles.beneficiaryImage} />
                    <TouchableOpacity 
                      onPress={() => toggleFavorite(b.id)} 
                      style={styles.favoriteButton}
                    >
                      {favorites.includes(b.id) ? (
                        <AntDesign
                          name="heart"
                          size={20}
                          color="#DB8633"
                        />
                      ) : (
                        <Image 
                          source={require('../../../../assets/icons/heart.png')} 
                          style={{ width: 20, height: 20, tintColor: '#DB8633' }} 
                        />
                      )}
                    </TouchableOpacity>
                    <View style={styles.beneficiaryCardContent}>
                      <Text style={styles.beneficiaryName}>{b.name}</Text>
                      <Text style={styles.beneficiaryCategory}>{b.category}</Text>
                      {!isSignupFlow && (
                        <View style={styles.beneficiaryLocation}>
                          <Ionicons name="location" size={14} color="#8E9BAE" />
                          <Text style={styles.beneficiaryLocationText}>{cityStateFromLocation(b.location)} • {b.distance}</Text>
                        </View>
                      )}
                      
                      <View style={[styles.buttonsRow, isSelected && styles.buttonsRowSingle]}>
                        <TouchableOpacity
                          style={[
                            styles.viewDetailsButton,
                            isSelected && styles.viewDetailsButtonAlone,
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push({
                              pathname: detailRoute,
                              params: detailParamsFor(b.id),
                            });
                          }}
                        >
                          <Text style={[
                            styles.viewDetailsButtonText,
                            isSelected && styles.viewDetailsButtonAloneText,
                          ]}>Details</Text>
                        </TouchableOpacity>

                        {!isSelected ? (
                          <TouchableOpacity
                            style={styles.changeToThisButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              setPendingBeneficiary(b);
                              setConfirmModalVisible(true);
                            }}
                          >
                            <Text style={styles.changeToThisButtonText}>Select</Text>
                          </TouchableOpacity>
                        ) : isSignupFlow ? (
                          // Same Continue-out-of-back-button-trap fix as the
                          // first list above — signup users who return to this
                          // screen with a charity already selected need a way
                          // to move forward without re-selecting.
                          <TouchableOpacity
                            style={styles.changeToThisButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              advanceFromSelected();
                            }}
                          >
                            <Text style={styles.changeToThisButtonText}>Continue</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                  );
                })}

                {/* Inline IRS-registry results — blends seamlessly under the
                    local matches so the donor only ever searches once. */}
                {renderRegistrySection()}

                {/* End-of-list Support-THRIVE panel: shown only during signup
                    so donors who have browsed the cause cards still have a
                    landing pad. Outside signup, the home-tab banner handles
                    nudging held-mode donors to choose. */}
                {isSignupFlow && (
                  <SupportThrivePanel
                    thriveCharity={thriveCharity}
                    isLoading={false}
                    onPickGrow={(c) => {
                      setHoldingForChoice(false);
                      setPendingBeneficiary({ ...c, image: { uri: c.imageUrl || c.image_url } });
                      setConfirmModalVisible(true);
                    }}
                    onPickHold={(c) => {
                      setHoldingForChoice(true);
                      setPendingBeneficiary({ ...c, image: { uri: c.imageUrl || c.image_url }, _saveMySpot: true });
                      setConfirmModalVisible(true);
                    }}
                  />
                )}
              </>
            ) : (
              <View>
                {/* Soften the "no results" header — during signup the donor
                    almost always has a follow-up (registry suggestion or
                    pick-later panel below), so a giant "No results found"
                    feels punitive. */}
                <View style={[styles.emptyState, { paddingTop: 24 }]}>
                  {isSignupFlow ? (
                    <Text style={styles.emptySubtitle}>
                      {searchText
                        ? `We haven't onboarded "${searchText}" yet — but you can add them below.`
                        : 'Try a different search to find your cause.'}
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.emptyTitle}>No results found</Text>
                      <Text style={styles.emptySubtitle}>
                        {searchText ? `No beneficiaries found for "${searchText}"` : 'Try adjusting your search or filters'}
                      </Text>
                      <SuggestCard
                        type="charity"
                        searchQuery={searchText}
                        onSubmit={({ name, website }) =>
                          API.submitBeneficiaryRequest({ company_name: name, website })
                        }
                      />
                    </>
                  )}
                </View>

                {/* Inline IRS-registry results — shown immediately under the
                    "no results" header so the donor's next step is obvious. */}
                {renderRegistrySection()}

                {/* When the search comes up empty during signup, the panel
                    sits below the registry results as a second path forward
                    so the donor never hits a dead end. */}
                {isSignupFlow && (
                  <SupportThrivePanel
                    thriveCharity={thriveCharity}
                    isLoading={false}
                    onPickGrow={(c) => {
                      setHoldingForChoice(false);
                      setPendingBeneficiary({ ...c, image: { uri: c.imageUrl || c.image_url } });
                      setConfirmModalVisible(true);
                    }}
                    onPickHold={(c) => {
                      setHoldingForChoice(true);
                      setPendingBeneficiary({ ...c, image: { uri: c.imageUrl || c.image_url }, _saveMySpot: true });
                      setConfirmModalVisible(true);
                    }}
                  />
                )}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Confirmation Modal — copy adapts to which of the three pick paths
          the donor took (Save my spot vs Help THRIVE grow vs regular cause). */}
      {/* Branded confirmation for registry suggestions. Uses the same modal
          chrome as the regular "Confirm Your Beneficiary" prompt so it feels
          like part of the app instead of a native iOS Alert. */}
      <Modal
        visible={!!suggestConfirmFor}
        transparent
        animationType="fade"
        onRequestClose={() => !suggestSubmitting && setSuggestConfirmFor(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.suggestModalBox}>
            <View style={styles.suggestModalIcon}>
              <Image
                source={require('../../../../assets/images/pending-charity-logo.png')}
                style={{ width: 60, height: 60, borderRadius: 30 }}
              />
            </View>
            <Text style={styles.modalTitle}>Add {suggestConfirmFor?.name}?</Text>
            <Text style={styles.modalText}>
              We'll verify this 501(c)(3) within 5 business days. Until they're
              approved:
            </Text>
            <View style={styles.suggestBulletList}>
              <SuggestBullet text="Your monthly donations are held safely" />
              <SuggestBullet text="You'll be notified the moment they're live" />
              <SuggestBullet text="If we can't verify, we'll email so you can pick another cause" />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={handleConfirmSuggestRegistry}
                style={[styles.confirmBtn, suggestSubmitting && { opacity: 0.7 }]}
                disabled={suggestSubmitting}
              >
                <Text style={styles.confirmBtnText}>
                  {suggestSubmitting ? 'Saving…' : 'Pick this charity'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => !suggestSubmitting && setSuggestConfirmFor(null)}
                style={styles.cancelBtn}
                disabled={suggestSubmitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalBox}>
            <Text style={styles.modalTitle}>
              {pendingBeneficiary?._saveMySpot
                ? 'Start Now, Pick Later.'
                : pendingBeneficiary?.is_thrive
                ? 'Give to THRIVE Initiative'
                : 'Confirm Your Beneficiary'}
            </Text>
            <Text style={styles.modalText}>
              {pendingBeneficiary?._saveMySpot
                ? "You're starting your monthly gift today. No rush — we'll hold it with THRIVE until you find a cause you love to give to."
                : pendingBeneficiary?.is_thrive
                ? 'Your monthly donation will go directly toward growing the platform and reaching more donors and cities.'
                : `Set "${pendingBeneficiary?.name}" as your monthly beneficiary?`}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleConfirmBeneficiary} style={styles.confirmBtn}>
                <Text style={styles.confirmBtnText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SuccessModal visible={showSuccessModal} onClose={closeModal} message={successMessage} />
      {confettiTrigger && (
        <ConfettiCannon
          count={100}
          origin={{ x: 200, y: 0 }}
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
  miniBrandHeader: {
    height: 96,
    paddingTop: 8,
    marginBottom: -22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBrandLogo: {
    width: 190,
    height: 60,
    opacity: 0.98,
    marginTop: -20,
  },
  // Signup-flow variant: blue header is taller (room for title + subtitle +
  // piggy overlay), matching the discount-teaser hero in app/signupFlow.
  signupBrandHeader: {
    height: 180,
    paddingTop: 36,
    paddingBottom: 80,
    paddingHorizontal: 24,
  },
  signupHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
  },
  signupHeaderSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    fontWeight: '500',
  },
  signupBackButton: {
    position: 'absolute',
    top: 18,
    left: 16,
    zIndex: 50,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 18,
    padding: 6,
  },
  // ─── IRS-registry inline section ───
  registrySection: {
    marginTop: 18,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  registrySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  registrySectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  registrySectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 1.2,
    marginHorizontal: 10,
    textTransform: 'uppercase',
  },
  registrySectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 17,
    paddingHorizontal: 12,
  },
  registryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFE6CC',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  registryCardImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFF5EB',
    marginRight: 12,
    resizeMode: 'cover',
  },
  registryCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C4F7D',
    marginBottom: 2,
  },
  registryCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  registryCardCategory: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  registryCardMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 6,
  },
  registryCardLocation: {
    fontSize: 11,
    color: '#8E9BAE',
  },
  registryCardEin: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  registryCardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DB8633',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginLeft: 10,
  },
  registryCardCtaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Empty-state CTA card that opens the IRS-registry search modal. Same
  // visual rhythm as the live discounts page's "Suggest" cards.
  searchRegistryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5EB',
    borderColor: '#FFE6CC',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 18,
    marginHorizontal: 4,
    gap: 12,
    shadowColor: '#DB8633',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchRegistryIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FFE6CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRegistryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  searchRegistrySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  signupPiggyOverlay: {
    position: 'absolute',
    top: 63,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
    elevation: 8,
  },
  signupHeaderPiggy: {
    width: 130,
    height: 100,
  },
  header: {
    marginHorizontal: 16,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 15,
    backgroundColor: '#fff',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    marginBottom: 16,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
    height: 46,
    lineHeight: 20,
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    marginBottom: 16,
    height: 48,
  },
  locationInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
  },
  locationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationText: {
    fontSize: 16,
    color: '#324E58',
    fontWeight: '500',
  },
  refreshLocationButton: {
    padding: 8,
    marginLeft: 8,
  },
  tagsRow: {
    marginBottom: 10,
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#f2f2f2',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 10,
  },
  tagActive: {
    backgroundColor: '#FFF5EB',
    borderWidth: 1,
    borderColor: '#D0861F',
  },
  tagContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagIcon: {
    marginRight: 6,
  },
  tagText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tagTextActive: {
    color: '#D0861F',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    padding: 4,
    marginTop: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: '#DB8633',
  },
  toggleText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#f5f5fa',
  },
  listContent: {
    paddingBottom: 80,
  },
  sectionHeader: {
    paddingHorizontal: 25,
    paddingTop: 20,
    paddingBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderTextCol: {
    flex: 1,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  sectionSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  beneficiaryCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 10,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedBeneficiaryCard: {
    borderColor: '#DB8633',
    backgroundColor: '#FFFBF7',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  beneficiaryImage: {
    width: 120,
    height: '100%',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    resizeMode: 'cover',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
  },
  beneficiaryCardContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  beneficiaryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  beneficiaryCategory: {
    fontSize: 13,
    color: '#6d6e72',
    marginBottom: 6,
  },
  beneficiaryLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
  },
  beneficiaryLocationText: {
    fontSize: 12,
    color: '#8E9BAE',
    marginLeft: 4,
  },
  viewDetailsButton: {
    backgroundColor: '#FFF5EB',
    borderWidth: 1,
    borderColor: '#DB8633',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  viewDetailsButtonText: {
    fontSize: 12,
    color: '#DB8633',
    fontWeight: '500',
  },
  changeToThisButton: {
    backgroundColor: 'transparent',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    marginLeft: 8,
  },
  changeToThisButtonText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 13,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  /** Selected cause: one primary action, full width inside card padding */
  buttonsRowSingle: {
    justifyContent: 'center',
    marginTop: 8,
    gap: 0,
  },
  viewDetailsButtonAlone: {
    flex: 0,
    flexGrow: 1,
    alignSelf: 'stretch',
    width: '100%',
    marginRight: 0,
    marginLeft: 0,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#FFF5EB',
    borderColor: '#DB8633',
  },
  viewDetailsButtonAloneText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#DB8633',
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  requestSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  requestTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 5,
  },
  requestSubtitle: {
    fontSize: 14,
    color: '#6d6e72',
    textAlign: 'center',
  },
  requestForm: {
    width: '100%',
    marginTop: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    color: '#324E58',
    width: '100%',
  },
  requestButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  requestButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  successMessage: {
    backgroundColor: '#FFF5EB',
    borderWidth: 1,
    borderColor: '#DB8633',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  successText: {
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  requestButtonDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  confirmModalBox: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    width: '85%',
    alignItems: 'center',
  },
  // Same chrome as confirmModalBox but a bit taller (icon + bullets).
  suggestModalBox: {
    backgroundColor: 'white',
    padding: 24,
    paddingTop: 18,
    borderRadius: 16,
    width: '88%',
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  suggestModalIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF5EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE6CC',
  },
  suggestBulletList: {
    marginTop: 4,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    color: '#5A6470',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 10,
  },
  confirmBtnText: {
    color: 'white',
    fontWeight: '700',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#324E58',
    fontWeight: '700',
  },
  
  // Mini Popup Styles
  miniPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  miniPopupContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  miniPopupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  miniPopupTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
    marginRight: 16,
  },
  miniPopupCloseButton: {
    padding: 4,
  },
  miniPopupAbout: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4A5568',
    marginBottom: 24,
  },
  miniPopupButtons: {
    gap: 12,
  },
  miniPopupChangeButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  miniPopupChangeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  miniPopupLearnButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  miniPopupLearnButtonText: {
    color: '#4A5568',
    fontSize: 16,
    fontWeight: '500',
  },
  // Web fallback styles
  webMapFallback: {
    backgroundColor: '#f5f5fa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  webMapText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 8,
  },
  webMapSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  switchToListButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  switchToListButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DB8633',
    backgroundColor: '#FFF5EB',
  },
  filterBtnActive: {
    backgroundColor: '#DB8633',
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB8633',
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  clearFiltersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5EB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D0861F',
    alignSelf: 'flex-start',
  },
  clearFiltersText: {
    color: '#D0861F',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapFilterBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DB8633',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 100,
  },
  mapFilterBtnActive: {
    backgroundColor: '#DB8633',
    borderColor: '#DB8633',
  },
  mapFilterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB8633',
  },
  mapFilterBtnTextActive: {
    color: '#fff',
  },
  customMarkerContainer: {
    alignItems: 'center',
  },
  customMarkerBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#21555b',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: 160,
    gap: 5,
  },
  customMarkerLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  customMarkerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  customMarkerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#21555b',
  },
  infoWindow: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 9999,
  },
  infoWindowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoWindowLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  infoWindowLogoFallback: {
    backgroundColor: '#e8f0f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoWindowText: {
    flex: 1,
  },
  infoWindowTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  infoWindowCategory: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  infoWindowLocation: {
    fontSize: 12,
    color: '#8E9BAE',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5fa',
  },
  infoWindowActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DB8633',
    gap: 8,
  },
  actionButtonTextSecondary: {
    color: '#DB8633',
    fontSize: 14,
    fontWeight: '600',
  },
});
