import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../lib/api';

const DiscountContext = createContext();

export const DiscountProvider = ({ children }) => {
  // Initialize with empty arrays - data will load from API only
  const [discounts, setDiscounts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load discounts from API
  const loadDiscounts = async (filters = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await API.getDiscounts(filters);
      const discountsList = data.discounts || [];
      setDiscounts(discountsList);
      console.log('✅ Loaded discounts from API:', discountsList.length);
    } catch (error) {
      // Handle public endpoint auth requirement gracefully
      if (error.message === 'PUBLIC_ENDPOINT_REQUIRES_AUTH') {
        console.warn('⚠️ Discounts endpoint requires authentication');
      } else {
        console.error('❌ Error loading discounts:', error);
      }
      setError(error.message || 'Failed to load discounts');
      // Show empty state if API fails - no fallback to test data
      setDiscounts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load vendors from API
  const loadVendors = async () => {
    try {
      const data = await API.getVendors();
      const vendorsList = data.vendors || [];
      setVendors(vendorsList);
      console.log('✅ Loaded vendors from API:', vendorsList.length);
      if (vendorsList.length > 0) {
        console.log('📋 Vendor names:', vendorsList.map(v => v.name).slice(0, 5));
      }
    } catch (error) {
      // Handle public endpoint auth requirement gracefully
      if (error.message === 'PUBLIC_ENDPOINT_REQUIRES_AUTH') {
        console.warn('⚠️ Vendors endpoint requires authentication');
      } else {
        console.error('❌ Error loading vendors:', error);
      }
      // Show empty state if API fails - no fallback to test data
      setVendors([]);
    }
  };

  // Get discount details
  const getDiscountDetails = async (discountId) => {
    try {
      // First try to find in local discounts array (from API)
      const localDiscount = discounts.find(d => d.id === discountId || d.id === discountId.toString());
      if (localDiscount) {
        console.log('✅ Found discount in local data:', localDiscount.title);
        return localDiscount;
      }
      
      // If not found locally, try API
      const data = await API.getDiscountDetails(discountId);
      return data;
    } catch (error) {
      console.error('❌ Error loading discount details from API:', error.message);
      console.error('❌ Discount not found:', discountId);
      throw new Error('Discount not found');
    }
  };

  // Redeem discount
  const redeemDiscount = async (discountId, userData = {}) => {
    try {
      const data = await API.redeemDiscount(discountId, userData);
      return data;
    } catch (error) {
      console.warn('⚠️ Error redeeming discount:', error);
      throw error;
    }
  };

  // Refresh data from API
  const refreshData = async () => {
    await Promise.all([loadDiscounts(), loadVendors()]);
  };

  // Load data on mount - will load from API only
  useEffect(() => {
    loadDiscounts();
    loadVendors();
  }, []);

  return (
    <DiscountContext.Provider value={{
      discounts,
      vendors,
      isLoading,
      error,
      loadDiscounts,
      loadVendors,
      getDiscountDetails,
      redeemDiscount,
      refreshData,
    }}>
      {children}
    </DiscountContext.Provider>
  );
};

export const useDiscount = () => useContext(DiscountContext);
