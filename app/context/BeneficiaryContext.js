import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../lib/api';
import { sizedImageUrl, IMAGE_WIDTH } from '../utils/imageUrl';

/** First non-empty string (trimmed); ignores null / undefined / "". */
export function pickFirstNonEmptyString(...values) {
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null && typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/**
 * Is this the THRIVE Initiative row (donor gives to the platform itself)?
 *
 * `formatCharityResponse` emits camelCase `isThrive`, but rows read straight
 * from Postgres carry `is_thrive`. Both spellings appear in stored/rehydrated
 * beneficiaries, so every check goes through here rather than picking one.
 */
export function isThriveCause(beneficiary) {
  if (!beneficiary) return false;
  return beneficiary.isThrive === true || beneficiary.is_thrive === true;
}

/**
 * Image source for large “hero” cards (Home, etc.). Prefers main/hero URLs over logos.
 */
export function resolveBeneficiaryHeroImageSource(beneficiary) {
  if (!beneficiary) return null;
  // THRIVE-as-a-cause always uses the bundled photo. This sits *before* the
  // URL pick on purpose: the THRIVE row does carry an imageUrl (the brand
  // mark), which would otherwise win and the photo would never show. Trade-off
  // — THRIVE's large card art is changed by replacing this asset file, not
  // from the admin panel. Same file as the pending placeholder, one source of
  // truth for the same picture.
  if (isThriveCause(beneficiary)) {
    return require('../../assets/images/pending-charity.png');
  }
  const uri = pickFirstNonEmptyString(
    beneficiary.imageUrl,
    beneficiary.image_url,
    typeof beneficiary.image?.uri === 'string' ? beneficiary.image.uri : null,
    beneficiary.logoUrl,
    beneficiary.logo_url,
  );
  // Hero art fills the screen width, so ask for it at that size rather than
  // whatever was uploaded. Non-Supabase URLs pass through untouched.
  if (uri) return { uri: sizedImageUrl(uri, IMAGE_WIDTH.hero) };
  // Checked before the raw `image` passthrough below. A rehydrated
  // beneficiary carries `image: null` (no URL to store), and a live one can
  // carry a require() module id — a number that is only valid for the bundle
  // that produced it. The boolean flag is the one trustworthy signal, so it
  // decides before either of those gets a say.
  if (beneficiary.isPendingVerification || beneficiary.is_pending_verification) {
    return require('../../assets/images/pending-charity.png');
  }
  if (beneficiary.image !== undefined && beneficiary.image !== null) return beneficiary.image;
  return null;
}

/**
 * Small circular logo source — for compact spots like search-result avatars
 * or modal headers. Same fallback logic as the hero resolver, but uses the
 * dedicated logo placeholder for pending charities.
 */
export function resolveBeneficiaryLogoSource(beneficiary) {
  if (!beneficiary) return null;
  const uri = pickFirstNonEmptyString(
    beneficiary.logoUrl,
    beneficiary.logo_url,
    beneficiary.imageUrl,
    beneficiary.image_url,
  );
  // A logo renders in a small circle; requesting the full upload wasted most
  // of the bytes.
  if (uri) return { uri: sizedImageUrl(uri, IMAGE_WIDTH.logo) };
  if (beneficiary.isPendingVerification || beneficiary.is_pending_verification) {
    return require('../../assets/images/pending-charity-logo.png');
  }
  return null;
}

// 1. Create the context
const BeneficiaryContext = createContext();

const HOLDING_FOR_CHOICE_KEY = 'thrive_holding_for_choice';

// 2. Provider to wrap your app
export const BeneficiaryProvider = ({ children }) => {
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);
  // "Save my spot" intent — true when the donor picked THRIVE while undecided
  // about a cause. Used by the subscribe call (pass held_for_donor_choice=true)
  // and the home tab banner. Cleared when they pick a real cause via redirect.
  const [holdingForChoice, setHoldingForChoiceState] = useState(false);

  // Load saved beneficiary on app start
  useEffect(() => {
    const loadSavedBeneficiary = async () => {
      try {
        const saved = await AsyncStorage.getItem('selectedBeneficiary');
        if (saved) {
          const parsed = JSON.parse(saved);
          console.log('✅ Loaded beneficiary from storage:', parsed?.name || parsed?.id);
          setSelectedBeneficiary(parsed);

          // Records written before isPendingVerification joined the stored
          // whitelist have no flag at all, so a donor-suggested charity keeps
          // showing the wrong Home art until they re-pick it. Re-read the
          // charity once to heal it. Only fires while the key is missing, so
          // it costs one request per install, not one per launch.
          if (parsed?.id && parsed.isPendingVerification === undefined) {
            try {
              const fresh = await API.getCharityById(parsed.id);
              if (fresh) {
                const healed = {
                  ...parsed,
                  isPendingVerification: !!(
                    fresh.isPendingVerification || fresh.is_pending_verification
                  ),
                  isThrive: !!(fresh.isThrive || fresh.is_thrive),
                };
                setSelectedBeneficiary(healed);
                await AsyncStorage.setItem('selectedBeneficiary', JSON.stringify(healed));
                console.log('🩹 Backfilled placeholder flags for', healed.name);
              }
            } catch (e) {
              // Offline or the charity is gone — the stored record still
              // renders, just with the generic fallback art.
              console.warn('Could not backfill beneficiary flags:', e?.message || e);
            }
          }
        } else {
          console.log('⚠️ No beneficiary found in storage');
        }
        const held = await AsyncStorage.getItem(HOLDING_FOR_CHOICE_KEY);
        if (held === 'true') setHoldingForChoiceState(true);
      } catch (error) {
        console.error('❌ Error loading saved beneficiary:', error);
      }
    };

    loadSavedBeneficiary();
  }, []);

  const setHoldingForChoice = useCallback(async (flag) => {
    setHoldingForChoiceState(!!flag);
    try {
      if (flag) {
        await AsyncStorage.setItem(HOLDING_FOR_CHOICE_KEY, 'true');
      } else {
        await AsyncStorage.removeItem(HOLDING_FOR_CHOICE_KEY);
      }
    } catch (e) {
      console.warn('Could not persist holdingForChoice flag:', e);
    }
  }, []);

  // Stable references — avoids useFocusEffect / useEffect re-firing every parent render
  const reloadBeneficiary = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem('selectedBeneficiary');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('🔄 Reloaded beneficiary from storage:', parsed?.name || parsed?.id);
        setSelectedBeneficiary(parsed);
        return parsed;
      }
    } catch (error) {
      console.error('❌ Error reloading beneficiary:', error);
    }
    return null;
  }, []);

  const saveBeneficiary = useCallback(async (beneficiary) => {
    try {
      if (beneficiary) {
        // Prefer main hero image over logo URLs (URLs survive JSON round-trip; require() does not.)
        const heroUri = pickFirstNonEmptyString(
          beneficiary.imageUrl,
          beneficiary.image_url,
          typeof beneficiary.image?.uri === 'string' ? beneficiary.image.uri : null,
          beneficiary.logoUrl,
          beneficiary.logo_url,
        );
        const logoOnly = pickFirstNonEmptyString(
          beneficiary.logoUrl,
          beneficiary.logo_url,
        );
        const mainUrlOnly = pickFirstNonEmptyString(
          beneficiary.imageUrl,
          beneficiary.image_url,
        );
        const rawPending =
          beneficiary.isPendingVerification ?? beneficiary.is_pending_verification;
        const rawThrive = beneficiary.isThrive ?? beneficiary.is_thrive;
        const pendingFlag = rawPending != null ? !!rawPending : undefined;
        const thriveFlag = rawThrive != null ? !!rawThrive : undefined;
        const toStore = {
          id: beneficiary.id,
          name: beneficiary.name || '',
          category: beneficiary.category || '',
          description: beneficiary.description ?? null,
          logo_url: logoOnly,
          imageUrl: mainUrlOnly,
          image: heroUri ? { uri: heroUri } : null,
          location: beneficiary.location || '',
          about: beneficiary.about || '',
          website: beneficiary.website || '',
          phone: beneficiary.phone || '',
          ein: beneficiary.ein || '',
          // These two decide which bundled placeholder the hero resolver
          // picks. Dropping them meant a donor-suggested charity looked
          // right until the first reload, then fell through to an unrelated
          // stock photo on the Home card — the whole point of storing a
          // whitelist is that anything unlisted is silently lost.
          ...(pendingFlag !== undefined ? { isPendingVerification: pendingFlag } : {}),
          ...(thriveFlag !== undefined ? { isThrive: thriveFlag } : {}),
          latitude: beneficiary.latitude ?? null,
          longitude: beneficiary.longitude ?? null,
        };
        await AsyncStorage.setItem('selectedBeneficiary', JSON.stringify(toStore));
        setSelectedBeneficiary({
          ...beneficiary,
          imageUrl: mainUrlOnly ?? beneficiary.imageUrl ?? beneficiary.image_url,
          logo_url: logoOnly ?? beneficiary.logo_url,
          image: heroUri ? { uri: heroUri } : beneficiary.image,
        });
      } else {
        await AsyncStorage.removeItem('selectedBeneficiary');
        setSelectedBeneficiary(null);
      }
    } catch (error) {
      console.error('Error saving beneficiary:', error);
      setSelectedBeneficiary(beneficiary);
    }
  }, []);

  return (
    <BeneficiaryContext.Provider value={{
      selectedBeneficiary,
      setSelectedBeneficiary: saveBeneficiary,
      reloadBeneficiary,
      holdingForChoice,
      setHoldingForChoice,
    }}>
      {children}
    </BeneficiaryContext.Provider>
  );
};

// 3. Hook to use the context in your components
export const useBeneficiary = () => useContext(BeneficiaryContext);
