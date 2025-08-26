import React, { createContext, useContext, useState, useEffect } from 'react';
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
          setSelectedBeneficiary(JSON.parse(saved));
        }
      } catch (error) {
        console.error('Error loading saved beneficiary:', error);
      }
    };

    loadSavedBeneficiary();
  }, []);

  // Save beneficiary when it changes
  const saveBeneficiary = async (beneficiary) => {
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
  };

  return (
    <BeneficiaryContext.Provider value={{ selectedBeneficiary, setSelectedBeneficiary: saveBeneficiary }}>
      {children}
    </BeneficiaryContext.Provider>
  );
};

// 3. Hook to use the context in your components
export const useBeneficiary = () => useContext(BeneficiaryContext);
