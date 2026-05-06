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
  return null;
}

// 1. Create the context
const BeneficiaryContext = createContext();

// 2. Provider to wrap your app
export const BeneficiaryProvider = ({ children }) => {
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);

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
      } catch (error) {
        console.error('❌ Error loading saved beneficiary:', error);
      }
    };

    loadSavedBeneficiary();
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
    <BeneficiaryContext.Provider value={{ selectedBeneficiary, setSelectedBeneficiary: saveBeneficiary, reloadBeneficiary }}>
      {children}
    </BeneficiaryContext.Provider>
  );
};

// 3. Hook to use the context in your components
export const useBeneficiary = () => useContext(BeneficiaryContext);
