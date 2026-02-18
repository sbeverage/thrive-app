import React, { createContext, useContext, useState } from 'react';

const BeneficiaryFilterContext = createContext();

export const useBeneficiaryFilter = () => {
  const context = useContext(BeneficiaryFilterContext);
  if (!context) {
    throw new Error('useBeneficiaryFilter must be used within a BeneficiaryFilterProvider');
  }
  return context;
};

export const BeneficiaryFilterProvider = ({ children }) => {
  const [filters, setFilters] = useState({
    location: '',
    type: '',
    cause: '',
    emergency: '',
    showFavorites: false,
  });

  const updateFilters = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFilters({
      location: '',
      type: '',
      cause: '',
      emergency: '',
      showFavorites: false,
    });
  };

  const hasActiveFilters = () => {
    return filters.location || 
           filters.type || 
           filters.cause || 
           filters.emergency || 
           filters.showFavorites;
  };

  return (
    <BeneficiaryFilterContext.Provider
      value={{
        filters,
        updateFilters,
        clearFilters,
        hasActiveFilters,
      }}
    >
      {children}
    </BeneficiaryFilterContext.Provider>
  );
};










