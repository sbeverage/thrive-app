import React, { createContext, useContext, useState } from 'react';

// 1. Create the context
const BeneficiaryContext = createContext();

// 2. Provider to wrap your app
export const BeneficiaryProvider = ({ children }) => {
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);

  return (
    <BeneficiaryContext.Provider value={{ selectedBeneficiary, setSelectedBeneficiary }}>
      {children}
    </BeneficiaryContext.Provider>
  );
};

// 3. Hook to use the context in your components
export const useBeneficiary = () => useContext(BeneficiaryContext);
