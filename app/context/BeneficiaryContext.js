import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** First non-empty string (trimmed); ignores null / undefined / "". */
export function pickFirstNonEmptyString(...values) {
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null && typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/**
 * Image source for large “hero” cards (Home, etc.). Prefers main/hero URLs over logos.
 */
export function resolveBeneficiaryHeroImageSource(beneficiary) {
  if (!beneficiary) return null;
  const uri = pickFirstNonEmptyString(
    beneficiary.imageUrl,
    beneficiary.image_url,
    typeof beneficiary.image?.uri === 'string' ? beneficiary.image.uri : null,
    beneficiary.logoUrl,
    beneficiary.logo_url,
  );
  if (uri) return { uri };
  if (beneficiary.image !== undefined && beneficiary.image !== null) return beneficiary.image;
  // Charity is donor-suggested and pending verification — no real image
  // exists yet. Fall back to the in-app placeholder so the card never
  // renders a blank tile after an app reload or context rehydrate.
  if (beneficiary.isPendingVerification || beneficiary.is_pending_verification) {
    return require('../../assets/images/pending-charity.png');
  }
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
  if (uri) return { uri };
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
