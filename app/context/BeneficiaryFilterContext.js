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

  /** Clears cause, type, favorites, etc. Search location is preserved (user baseline). */
  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      type: '',
      cause: '',
      emergency: '',
      showFavorites: false,
    }));
  };

  const hasActiveFilters = () => {
    return !!(
      filters.location ||
      filters.type ||
      filters.cause ||
      filters.emergency ||
      filters.showFavorites
    );
  };

  /** True when Clear can change something other than location (used for “Clear all” affordance). */
  const hasClearableFilterFields = () => {
    return !!(
      filters.type ||
      filters.cause ||
      filters.emergency ||
      filters.showFavorites
    );
  };

  return (
    <BeneficiaryFilterContext.Provider
      value={{
        filters,
        updateFilters,
        clearFilters,
        hasActiveFilters,
        hasClearableFilterFields,
      }}
    >
      {children}
    </BeneficiaryFilterContext.Provider>
  );
};










