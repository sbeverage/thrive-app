// ========================================
// ADMIN PANEL API SERVICE
// ========================================
// This file contains the correct API service for your admin panel frontend
// Copy this code into your admin panel project

// API Configuration
const API_CONFIG = {
  baseURL: 'https://api.forpurposetechnologies.com', // Update with your actual API URL
  headers: {
    'x-admin-secret': 'test-key', // Update with your actual admin secret
    'Content-Type': 'application/json'
  }
};

// Create axios instance with proper configuration
import axios from 'axios';

const api = axios.create({
  baseURL: API_CONFIG.baseURL,
  headers: API_CONFIG.headers,
  timeout: 10000
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`❌ API Error: ${error.response?.status} ${error.config?.url}`, error.response?.data);
    return Promise.reject(error);
  }
);

// ========================================
// VENDOR API SERVICE
// ========================================
export const vendorAPI = {
  /**
   * Get all vendors
   * Backend returns: { vendors: [...], pagination: {...} }
   */
  async getAll(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.search) params.append('search', filters.search);
      if (filters.category) params.append('category', filters.category);

      const response = await api.get(`/api/admin/vendors?${params.toString()}`);
      
      // Backend returns: { vendors: [...], pagination: {...} }
      return {
        success: true,
        data: response.data,
        vendors: response.data.vendors || [],
        pagination: response.data.pagination || {}
      };
    } catch (error) {
      console.error('❌ Get vendors failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to load vendors'
      };
    }
  },

  /**
   * Get vendor by ID
   * Backend returns: vendor object directly
   */
  async getById(id) {
    try {
      const response = await api.get(`/api/admin/vendors/${id}`);
      
      // Backend returns vendor object directly
      return {
        success: true,
        data: response.data,
        vendor: response.data
      };
    } catch (error) {
      console.error('❌ Get vendor failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to load vendor'
      };
    }
  },

  /**
   * Create vendor
   * Backend returns: vendor object directly
   */
  async create(vendorData) {
    try {
      console.log('🚀 Creating vendor with data:', vendorData);
      
      const response = await api.post('/api/admin/vendors', vendorData);
      
      // Backend returns vendor object directly
      console.log('✅ Vendor created successfully:', response.data);
      
      return {
        success: true,
        data: response.data,
        vendor: response.data
      };
    } catch (error) {
      console.error('❌ Create vendor failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to create vendor'
      };
    }
  },

  /**
   * Update vendor
   * Backend returns: updated vendor object directly
   */
  async update(id, vendorData) {
    try {
      const response = await api.put(`/api/admin/vendors/${id}`, vendorData);
      
      // Backend returns updated vendor object directly
      return {
        success: true,
        data: response.data,
        vendor: response.data
      };
    } catch (error) {
      console.error('❌ Update vendor failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to update vendor'
      };
    }
  },

  /**
   * Delete vendor
   * Backend returns: { message: "Vendor deleted successfully" }
   */
  async delete(id) {
    try {
      const response = await api.delete(`/api/admin/vendors/${id}`);
      
      return {
        success: true,
        data: response.data,
        message: response.data.message || 'Vendor deleted successfully'
      };
    } catch (error) {
      console.error('❌ Delete vendor failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to delete vendor'
      };
    }
  },

  /**
   * Upload vendor logo
   * Backend returns: { logoUrl: "https://..." }
   */
  async uploadLogo(id, file) {
    try {
      const formData = new FormData();
      formData.append('logo', file);
      
      const response = await api.post(`/api/admin/vendors/${id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      return {
        success: true,
        data: response.data,
        logoUrl: response.data.logoUrl
      };
    } catch (error) {
      console.error('❌ Upload logo failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to upload logo'
      };
    }
  }
};

// ========================================
// DISCOUNT API SERVICE
// ========================================
export const discountAPI = {
  /**
   * Get all discounts
   * Backend returns: { discounts: [...], pagination: {...} }
   */
  async getAll(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.search) params.append('search', filters.search);
      if (filters.category) params.append('category', filters.category);
      if (filters.vendorId) params.append('vendorId', filters.vendorId);

      const response = await api.get(`/api/admin/discounts?${params.toString()}`);
      
      return {
        success: true,
        data: response.data,
        discounts: response.data.discounts || [],
        pagination: response.data.pagination || {}
      };
    } catch (error) {
      console.error('❌ Get discounts failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to load discounts'
      };
    }
  },

  /**
   * Get discount by ID
   * Backend returns: discount object directly
   */
  async getById(id) {
    try {
      const response = await api.get(`/api/admin/discounts/${id}`);
      
      return {
        success: true,
        data: response.data,
        discount: response.data
      };
    } catch (error) {
      console.error('❌ Get discount failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to load discount'
      };
    }
  },

  /**
   * Create discount
   * Backend returns: discount object directly
   */
  async create(discountData) {
    try {
      console.log('🚀 Creating discount with data:', discountData);
      
      const response = await api.post('/api/admin/discounts', discountData);
      
      console.log('✅ Discount created successfully:', response.data);
      
      return {
        success: true,
        data: response.data,
        discount: response.data
      };
    } catch (error) {
      console.error('❌ Create discount failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to create discount'
      };
    }
  },

  /**
   * Update discount
   * Backend returns: updated discount object directly
   */
  async update(id, discountData) {
    try {
      const response = await api.put(`/api/admin/discounts/${id}`, discountData);
      
      return {
        success: true,
        data: response.data,
        discount: response.data
      };
    } catch (error) {
      console.error('❌ Update discount failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to update discount'
      };
    }
  },

  /**
   * Delete discount
   * Backend returns: { message: "Discount deleted successfully" }
   */
  async delete(id) {
    try {
      const response = await api.delete(`/api/admin/discounts/${id}`);
      
      return {
        success: true,
        data: response.data,
        message: response.data.message || 'Discount deleted successfully'
      };
    } catch (error) {
      console.error('❌ Delete discount failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to delete discount'
      };
    }
  },

  /**
   * Upload discount image
   * Backend returns: { imageUrl: "https://..." }
   */
  async uploadImage(id, file) {
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await api.post(`/api/admin/discounts/${id}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      return {
        success: true,
        data: response.data,
        imageUrl: response.data.imageUrl
      };
    } catch (error) {
      console.error('❌ Upload image failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to upload image'
      };
    }
  }
};

// ========================================
// ANALYTICS API SERVICE
// ========================================
export const analyticsAPI = {
  /**
   * Get dashboard analytics
   * Backend returns: analytics object directly
   */
  async getDashboard() {
    try {
      const response = await api.get('/api/admin/analytics');
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Get analytics failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to load analytics'
      };
    }
  },

  /**
   * Get users analytics
   * Backend returns: { users: [...], pagination: {...} }
   */
  async getUsers(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);

      const response = await api.get(`/api/admin/users?${params.toString()}`);
      
      return {
        success: true,
        data: response.data,
        users: response.data.users || [],
        pagination: response.data.pagination || {}
      };
    } catch (error) {
      console.error('❌ Get users failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to load users'
      };
    }
  },

  /**
   * Get transactions analytics
   * Backend returns: { transactions: [...], pagination: {...} }
   */
  async getTransactions(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await api.get(`/api/admin/transactions?${params.toString()}`);
      
      return {
        success: true,
        data: response.data,
        transactions: response.data.transactions || [],
        pagination: response.data.pagination || {}
      };
    } catch (error) {
      console.error('❌ Get transactions failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to load transactions'
      };
    }
  },

  /**
   * Get redeemed discounts analytics
   * Backend returns: { redeemedDiscounts: [...], pagination: {...} }
   */
  async getRedeemedDiscounts(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await api.get(`/api/admin/redeemed-discounts?${params.toString()}`);
      
      return {
        success: true,
        data: response.data,
        redeemedDiscounts: response.data.redeemedDiscounts || [],
        pagination: response.data.pagination || {}
      };
    } catch (error) {
      console.error('❌ Get redeemed discounts failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to load redeemed discounts'
      };
    }
  }
};

// ========================================
// EXPORT ALL API SERVICES
// ========================================
export default {
  vendorAPI,
  discountAPI,
  analyticsAPI
};

// ========================================
// USAGE EXAMPLES
// ========================================

/*
// Example 1: Create a vendor
const result = await vendorAPI.create({
  name: "Starbucks",
  category: "Food & Beverage",
  description: "Coffee shop chain",
  website: "https://starbucks.com",
  address: {
    street: "123 Main St",
    city: "Alpharetta",
    state: "GA",
    zipCode: "30004",
    latitude: 34.0754,
    longitude: -84.2941
  }
});

if (result.success) {
  console.log('✅ Vendor created:', result.vendor);
  // result.vendor contains the created vendor object
} else {
  console.error('❌ Error:', result.error);
}

// Example 2: Get all vendors
const vendorsResult = await vendorAPI.getAll({ page: 1, limit: 10 });
if (vendorsResult.success) {
  console.log('✅ Vendors loaded:', vendorsResult.vendors);
  console.log('📄 Pagination:', vendorsResult.pagination);
} else {
  console.error('❌ Error:', vendorsResult.error);
}

// Example 3: Create a discount
const discountResult = await discountAPI.create({
  vendorId: "vendor_id_here",
  title: "20% Off Coffee",
  description: "Get 20% off any coffee drink",
  discountType: "percentage",
  discountValue: 20,
  minPurchaseAmount: 5,
  maxDiscountAmount: 10,
  validFrom: "2024-01-01",
  validTo: "2024-12-31",
  termsAndConditions: "Valid for coffee drinks only"
});

if (discountResult.success) {
  console.log('✅ Discount created:', discountResult.discount);
} else {
  console.error('❌ Error:', discountResult.error);
}
*/



























