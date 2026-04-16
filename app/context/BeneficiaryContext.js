import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
        await AsyncStorage.setItem('selectedBeneficiary', JSON.stringify(beneficiary));
      } else {
        await AsyncStorage.removeItem('selectedBeneficiary');
      }
      setSelectedBeneficiary(beneficiary);
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
