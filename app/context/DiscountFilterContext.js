import React, { createContext, useContext, useState } from 'react';

const DiscountFilterContext = createContext();

export const useDiscountFilter = () => {
  const context = useContext(DiscountFilterContext);
  if (!context) {
    throw new Error('useDiscountFilter must be used within a DiscountFilterProvider');
  }
  return context;
};

export const DiscountFilterProvider = ({ children }) => {
  const [filters, setFilters] = useState({
    location: '',
    radius: '',
    type: '',
    category: '',
    availability: '',
    showFavorites: false,
  });

  const updateFilters = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFilters({
      location: '',
      radius: '',
      type: '',
      category: '',
      availability: '',
      showFavorites: false,
    });
  };

  const hasActiveFilters = () => {
    return !!(
      filters.location ||
      filters.radius ||
      filters.type ||
      filters.category ||
      filters.availability ||
      filters.showFavorites
    );
  };

  return (
    <DiscountFilterContext.Provider
      value={{
        filters,
        updateFilters,
        clearFilters,
        hasActiveFilters,
      }}
    >
      {children}
    </DiscountFilterContext.Provider>
  );
};
