// lib/api.js - Clean API client for AWS backend integration
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../utils/constants';

// Create axios instance with proper configuration
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token to all requests
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting auth token:', error);
    }
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - Handle common errors
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Success: ${response.config.method?.toUpperCase()} ${response.config.url}`);
    return response;
  },
  async (error) => {
    console.error(`❌ API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
    console.error('Error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401) {
      console.log('🔐 Token expired, clearing auth data');
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
    }

    return Promise.reject(error);
  }
);

// API Methods
const API = {
  // ===== AUTHENTICATION =====
  
  /**
   * User signup
   */
  signup: async (userData) => {
    try {
      console.log('🚀 Signing up user:', { email: userData.email });
      const response = await api.post('/api/auth/signup', userData);
      
      // Store auth token if provided
      if (response.data.token) {
        await AsyncStorage.setItem('authToken', response.data.token);
      }
      
      return response.data;
    } catch (error) {
      console.error('Signup failed:', error);
      throw new Error(error.response?.data?.message || 'Signup failed. Please try again.');
    }
  },

  /**
   * User login
   */
  login: async (credentials) => {
    try {
      console.log('🔐 Logging in user:', { email: credentials.email });
      const response = await api.post('/api/auth/login', credentials);
      
      // Store auth token
      if (response.data.token) {
        await AsyncStorage.setItem('authToken', response.data.token);
      }
      
      return response.data;
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error(error.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  },

  /**
   * Verify email
   */
  verifyEmail: async (token) => {
    try {
      const response = await api.get(`/api/auth/verify/${token}`);
      return response.data;
    } catch (error) {
      console.error('Email verification failed:', error);
      throw new Error(error.response?.data?.message || 'Email verification failed.');
    }
  },

  /**
   * Resend verification email
   */
  resendVerification: async (email) => {
    try {
      const response = await api.post('/api/auth/resend-verification', { email });
      return response.data;
    } catch (error) {
      console.error('Resend verification failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to resend verification email.');
    }
  },

  /**
   * Forgot password
   */
  forgotPassword: async (email) => {
    try {
      const response = await api.post('/api/auth/forgot-password', { email });
      return response.data;
    } catch (error) {
      console.error('Forgot password failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to send reset email.');
    }
  },

  /**
   * Reset password
   */
  resetPassword: async (token, password) => {
    try {
      const response = await api.post('/api/auth/reset-password', { token, password });
      return response.data;
    } catch (error) {
      console.error('Reset password failed:', error);
      throw new Error(error.response?.data?.message || 'Password reset failed.');
    }
  },

  // ===== USER PROFILE =====

  /**
   * Save user profile to backend
   */
  saveProfile: async (profileData) => {
    try {
      console.log('💾 Saving profile to backend:', profileData);
      const response = await api.post('/api/auth/save-profile', profileData);
      return response.data;
    } catch (error) {
      console.error('Save profile failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to save profile.');
    }
  },

  /**
   * Get user profile from backend
   */
  getProfile: async () => {
    try {
      const response = await api.get('/api/auth/profile');
      return response.data;
    } catch (error) {
      console.error('Get profile failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load profile.');
    }
  },

  // ===== FILE UPLOADS =====

  /**
   * Upload profile picture
   */
  uploadProfilePicture: async (imageUri) => {
    try {
      console.log('📸 Uploading profile picture');
      const formData = new FormData();
      formData.append('profilePicture', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'profile.jpg',
      });

      const response = await api.post('/api/uploads/profile-picture', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Profile picture upload failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to upload profile picture.');
    }
  },

  /**
   * Upload charity logo
   */
  uploadCharityLogo: async (charityId, imageUri) => {
    try {
      const formData = new FormData();
      formData.append('logo', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'logo.jpg',
      });

      const response = await api.post(`/api/uploads/charity-logo/${charityId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Charity logo upload failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to upload charity logo.');
    }
  },

  // ===== DATA RETRIEVAL =====

  /**
   * Get charities list
   */
  getCharities: async () => {
    try {
      const response = await api.get('/api/charities');
      return response.data;
    } catch (error) {
      console.error('Get charities failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load charities.');
    }
  },

  /**
   * Get vendors list
   */
  getVendors: async () => {
    try {
      const response = await api.get('/api/vendors');
      return response.data;
    } catch (error) {
      console.error('Get vendors failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load vendors.');
    }
  },

  /**
   * Create donation
   */
  createDonation: async (donationData) => {
    try {
      const response = await api.post('/api/donations', donationData);
      return response.data;
    } catch (error) {
      console.error('Create donation failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to create donation.');
    }
  },

  // ===== UTILITY METHODS =====

  /**
   * Logout user
   */
  logout: async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      console.log('✅ User logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  /**
   * Get auth token
   */
  getAuthToken: async () => {
    try {
      return await AsyncStorage.getItem('authToken');
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return !!token;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  },

  /**
   * Test backend connection
   */
  testConnection: async () => {
    try {
      const response = await api.get('/api/health');
      return { success: true, status: response.status, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        status: error.response?.status,
        data: error.response?.data 
      };
    }
  },

  /**
   * Delete user account (for testing purposes)
   */
  deleteUser: async (email) => {
    try {
      console.log('🗑️ Deleting user:', email);
      const response = await api.delete(`/api/auth/delete-user`, { data: { email } });
      return response.data;
    } catch (error) {
      console.error('❌ Delete user failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete user.');
    }
  },
};

export default API;