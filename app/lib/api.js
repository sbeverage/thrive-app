// lib/api.js - Clean API client for Supabase backend integration
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL, SUPABASE_ANON_KEY } from '../utils/constants';

// Create axios instance with proper configuration
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    // Supabase Edge Functions require apikey header for all requests
    // This is the project identifier, not user authentication
    'apikey': SUPABASE_ANON_KEY,
  },
});

// Public endpoints that don't require authentication
const PUBLIC_ENDPOINTS = [
  '/api/charities',
  '/api/vendors',
  '/api/discounts',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/social-login',
  '/api/auth/verify',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
  '/api/invitations/beneficiary',
];

// Check if an endpoint is public
const isPublicEndpoint = (url) => {
  return PUBLIC_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

// Request interceptor - Add auth token to requests (except public endpoints)
api.interceptors.request.use(
  async (config) => {
    try {
      // Skip token for public endpoints
      if (isPublicEndpoint(config.url)) {
        return config;
      }
      
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
    const status = error.response?.status;
    const url = error.config?.url || '';
    
    // Handle 501 errors (Not Implemented) - Expected for unimplemented endpoints
    if (status === 501) {
      console.warn(`⚠️ Endpoint not implemented: ${error.config?.method?.toUpperCase()} ${url}`);
      console.warn('This endpoint will fall back to local storage');
      // Don't log full error details for expected 501 errors
      return Promise.reject(error);
    }

    // Handle 404 errors (Not Found) - Expected for unimplemented endpoints
    if (status === 404) {
      // Check if it's an expected missing endpoint (like save-profile, profile picture upload)
      const expectedMissingEndpoints = [
        '/api/auth/save-profile', 
        '/api/auth/profile-picture',
        '/api/referrals/info',
        '/api/referrals/friends'
      ];
      if (expectedMissingEndpoints.some(endpoint => url.includes(endpoint))) {
        console.warn(`⚠️ Endpoint not implemented: ${error.config?.method?.toUpperCase()} ${url}`);
        console.warn('This endpoint will fall back to local storage or use fallback data');
        // Don't log full error details for expected 404 errors
        return Promise.reject(error);
      }
      
      // For discount redemption, log more details to help diagnose
      if (url.includes('/discounts/') && url.includes('/redeem')) {
        console.warn(`⚠️ Discount redemption endpoint returned 404: ${error.config?.method?.toUpperCase()} ${url}`);
        console.warn('Error details:', {
          status: status,
          message: error.message,
          responseData: error.response?.data,
          errorMessage: error.response?.data?.error || error.response?.data?.message,
        });
        console.warn('💡 This might indicate:');
        console.warn('   - Endpoint path mismatch (check backend route handler)');
        console.warn('   - Edge Function not deployed or outdated');
        console.warn('   - Route handler not matching the request path');
        return Promise.reject(error);
      }
    }

    // Handle 401 errors (unauthorized) - check this first to suppress noisy logs
    if (status === 401) {
      // If it's a public endpoint that shouldn't need auth, log warning (not error)
      if (isPublicEndpoint(url)) {
        console.warn(`⚠️ Public endpoint returned 401: ${error.config?.method?.toUpperCase()} ${url}`);
        console.warn('⚠️ Backend may require auth for this endpoint, or there may be a backend configuration issue');
        console.warn('⚠️ App will continue using fallback data');
        // Don't log full error details for expected public endpoint 401s
        return Promise.reject(error);
      } else {
        // Protected endpoint - token expired or invalid
        console.log('🔐 Token expired or invalid, clearing auth data');
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('userData');
        // Don't log full error details for expected token expiration
        return Promise.reject(error);
      }
    }

    // Suppress 404 errors for endpoints that might not be implemented yet
    const isRedemptionCountEndpoint = url?.includes('/redemptions/count');
    const isProfileEndpoint = url?.includes('/api/auth/profile');
    const shouldSuppress404 = (isRedemptionCountEndpoint || isProfileEndpoint) && status === 404;
    
    if (!shouldSuppress404) {
      // Log other errors normally (not 401)
      console.error(`❌ API Error: ${error.config?.method?.toUpperCase()} ${url}`);
      console.error('Error details:', {
        message: error.message,
        status: status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        errorMessage: error.response?.data?.error || error.response?.data?.message,
      });
    }

    return Promise.reject(error);
  }
);

// API Methods
const API = {
  // ===== AUTHENTICATION =====
  
  /**
   * User signup
   * Accepts: email, password, city, state, zipCode (or zip_code), role, beneficiary, donationAmount, referralToken
   */
  signup: async (userData) => {
    try {
      console.log('🚀 Signing up user:', { email: userData.email, hasReferralToken: !!userData.referralToken });
      
      // Prepare signup data - include location and referral token if available
      const signupData = {
        email: userData.email,
        password: userData.password,
        role: userData.role || 'donor',
        ...(userData.city && { city: userData.city }),
        ...(userData.state && { state: userData.state }),
        ...(userData.zipCode && { zipCode: userData.zipCode }),
        ...(userData.zip_code && { zipCode: userData.zip_code }), // Support both formats
        ...(userData.beneficiary && { beneficiary: userData.beneficiary }),
        ...(userData.donationAmount && { donationAmount: userData.donationAmount }),
        ...(userData.referralToken && { referralToken: userData.referralToken }), // Include referral token if present
      };
      
      const response = await api.post('/api/auth/signup', signupData);
      
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
   * Social login (Apple, Google, Facebook)
   */
  socialLogin: async (socialData) => {
    try {
      console.log('🔐 Social login:', { provider: socialData.provider, email: socialData.email });
      
      // Prepare data for backend
      const loginData = {
        provider: socialData.provider,
        providerId: socialData.id,
        email: socialData.email,
        firstName: socialData.firstName,
        lastName: socialData.lastName,
        ...(socialData.identityToken && { identityToken: socialData.identityToken }), // Apple
        ...(socialData.authorizationCode && { authorizationCode: socialData.authorizationCode }), // Apple
        ...(socialData.accessToken && { accessToken: socialData.accessToken }), // Google/Facebook
        ...(socialData.idToken && { idToken: socialData.idToken }), // Google
        ...(socialData.picture && { picture: socialData.picture }), // Profile picture
      };
      
      const response = await api.post('/api/auth/social-login', loginData);
      
      // Store auth token
      if (response.data.token) {
        await AsyncStorage.setItem('authToken', response.data.token);
      }
      
      return response.data;
    } catch (error) {
      console.error('Social login failed:', error);
      throw new Error(error.response?.data?.message || 'Social login failed. Please try again.');
    }
  },

  /**
   * Verify email
   */
  verifyEmail: async (token, email) => {
    try {
      // Use the correct backend endpoint: /api/auth/verify-email?token=...
      const response = await api.get(`/api/auth/verify-email?token=${token}`);
      return response.data;
    } catch (error) {
      console.error('Email verification failed:', error);
      throw new Error(error.response?.data?.error || error.response?.data?.message || 'Email verification failed.');
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
      // Handle 404 specifically (endpoint not implemented yet)
      if (error.response?.status === 404) {
        console.warn('⚠️ Resend verification endpoint not available yet (404)');
        throw new Error('This feature is currently being set up. Please check your email for the original verification link.');
      }
      console.error('Resend verification failed:', error);
      throw new Error(error.response?.data?.message || error.response?.data?.error || 'Failed to resend verification email.');
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

  /**
   * Verify donor invitation token
   * Used when donor clicks email verification link
   */
  verifyDonorInvitation: async (token) => {
    try {
      console.log('🔍 Verifying donor invitation token:', token);
      const response = await api.get(`/api/auth/verify-email?token=${token}&format=json`);
      return response.data;
    } catch (error) {
      console.error('Donor invitation verification failed:', error);
      throw new Error(error.response?.data?.message || error.response?.data?.error || 'Verification failed. The link may be invalid or expired.');
    }
  },

  /**
   * Complete donor invitation signup
   * Creates password and completes account setup
   * Uses /api/auth/signup endpoint which handles both regular signups and invited donors
   */
  completeDonorInvitation: async (data) => {
    try {
      console.log('🚀 Completing donor invitation signup...');
      // Use /api/auth/signup endpoint which handles invited donors when token is provided
      const response = await api.post('/api/auth/signup', {
        email: data.email || '', // Email is optional for invited donors (comes from token)
        password: data.password,
        confirmPassword: data.confirmPassword,
        token: data.token, // Verification token for invited donors
        phone: data.phone || null,
        profileImageUrl: data.profileImageUrl || data.profileImage || null,
        coworking: data.coworking || null,
        inviteType: data.inviteType || null,
        sponsorAmount: data.sponsorAmount || null,
        extraDonationAmount: data.extraDonationAmount || null,
        totalMonthlyDonation: data.totalMonthlyDonation || null,
      });
      
      // Store auth token if provided
      if (response.data.token) {
        await AsyncStorage.setItem('authToken', response.data.token);
      }
      
      return response.data;
    } catch (error) {
      console.error('Complete donor signup failed:', error);
      throw new Error(error.response?.data?.message || error.response?.data?.error || 'Failed to complete signup. Please try again.');
    }
  },

  // ===== REFERRALS =====

  /**
   * Get user's referral information
   * Returns: { referralLink, friendsCount, paidFriendsCount, totalEarned, milestones: [{ count, reward, unlocked, earnedAt }] }
   */
  getReferralInfo: async () => {
    try {
      console.log('📧 Getting referral information...');
      const response = await api.get('/api/referrals/info');
      return response.data;
    } catch (error) {
      // Silently handle 404 - endpoint doesn't exist yet (expected)
      if (error.response?.status === 404) {
        console.log('📧 Referral endpoint not implemented yet, using fallback');
      } else {
        console.error('Get referral info failed:', error);
      }
      // Return fallback data if endpoint doesn't exist yet
      // The component will generate the link using the user context
      return {
        referralLink: null, // Will be generated in component
        friendsCount: 0,
        paidFriendsCount: 0,
        totalEarned: 0,
        milestones: [],
      };
    }
  },

  /**
   * Get list of referred friends
   * Returns: { friends: [{ id, name, email, status, monthlyDonation, joinedAt, firstPaymentAt }] }
   * Status can be: "pending", "signed_up", "payment_setup", "paid", "cancelled"
   */
  getReferredFriends: async () => {
    try {
      console.log('👥 Getting referred friends...');
      const response = await api.get('/api/referrals/friends');
      return response.data;
    } catch (error) {
      // Silently handle 404 - endpoint doesn't exist yet (expected)
      if (error.response?.status === 404) {
        console.log('👥 Referred friends endpoint not implemented yet, using fallback');
      } else {
        console.error('Get referred friends failed:', error);
      }
      return { friends: [] };
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
      // Preserve the original error so we can access response.status and response.data
      if (error.response) {
        // Attach response details to the error
        const enhancedError = new Error(error.response?.data?.message || error.response?.data?.error || 'Failed to save profile.');
        enhancedError.response = error.response;
        enhancedError.status = error.response.status;
        enhancedError.data = error.response.data;
        throw enhancedError;
      }
      throw error;
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
      // Handle 404 gracefully - profile endpoint might not exist yet or user might not have profile
      if (error.response?.status === 404) {
        console.log('⚠️ Profile endpoint not found (404) - returning empty profile');
        return null;
      }
      console.error('Get profile failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load profile.');
    }
  },

  // ===== FILE UPLOADS =====

  /**
   * Upload profile picture to Supabase storage
   */
  uploadProfilePicture: async (imageUri) => {
    try {
      console.log('📸 Uploading profile picture to Supabase storage');
      const formData = new FormData();
      formData.append('profilePicture', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'profile.jpg',
      });

      const response = await api.post('/api/auth/profile-picture', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      // Handle 404 gracefully (endpoint not implemented yet)
      if (error.response?.status === 404) {
        console.warn('⚠️ Profile picture upload endpoint not implemented (404)');
        console.warn('Profile picture will be saved locally only');
        throw new Error('UPLOAD_ENDPOINT_NOT_IMPLEMENTED');
      }
      console.warn('⚠️ Profile picture upload failed:', error.response?.status || error.message);
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
   * Backend returns: { success: true, data: [...], pagination: {...} }
   * We unwrap to return: { charities: [...], pagination: {...} } or just the data array
   */
  getCharities: async () => {
    try {
      console.log('📡 API.getCharities() - Making request to /api/charities');
      const response = await api.get('/api/charities');
      console.log('✅ API.getCharities() - Response received');
      console.log('✅ Response status:', response.status);
      console.log('✅ Response data type:', typeof response.data);
      console.log('✅ Full response.data:', JSON.stringify(response.data, null, 2));
      
      // Handle wrapped response: { success: true, data: [...], pagination: {...} }
      let charitiesArray = null;
      let pagination = null;
      
      if (response.data) {
        // Check if response is wrapped in { success: true, data: [...] }
        if (response.data.success && response.data.data) {
          console.log('✅ Response is wrapped in { success, data }');
          charitiesArray = Array.isArray(response.data.data) ? response.data.data : null;
          pagination = response.data.pagination || null;
        }
        // Check if response has charities property directly
        else if (response.data.charities && Array.isArray(response.data.charities)) {
          console.log('✅ Response has charities property');
          charitiesArray = response.data.charities;
          pagination = response.data.pagination || null;
        }
        // Check if response is array directly
        else if (Array.isArray(response.data)) {
          console.log('✅ Response is array directly');
          charitiesArray = response.data;
        }
        // Check if response.data.data is an array (nested data)
        else if (response.data.data && Array.isArray(response.data.data)) {
          console.log('✅ Response has nested data array');
          charitiesArray = response.data.data;
          pagination = response.data.pagination || null;
        }
      }
      
      if (charitiesArray && charitiesArray.length > 0) {
        console.log('✅ Found charities array with', charitiesArray.length, 'items');
        console.log('✅ First 3 charity names:', charitiesArray.slice(0, 3).map(c => c.name));
        // Log field names from first charity to verify what fields are returned
        const firstCharity = charitiesArray[0];
        console.log('✅ First charity field names:', Object.keys(firstCharity));
        console.log('✅ First charity impact fields check:', {
          livesImpacted: firstCharity.livesImpacted ?? firstCharity.lives_impacted ?? 'MISSING',
          programsActive: firstCharity.programsActive ?? firstCharity.programs_active ?? 'MISSING',
          directToProgramsPercentage: firstCharity.directToProgramsPercentage ?? firstCharity.direct_to_programs_percentage ?? 'MISSING',
          impactStatement1: firstCharity.impactStatement1 ?? firstCharity.impact_statement_1 ? 'EXISTS' : 'MISSING',
          impactStatement2: firstCharity.impactStatement2 ?? firstCharity.impact_statement_2 ? 'EXISTS' : 'MISSING',
          successStory: firstCharity.successStory ?? firstCharity.success_story ? 'EXISTS' : 'MISSING',
          whyThisMatters: firstCharity.whyThisMatters ?? firstCharity.why_this_matters ? 'EXISTS' : 'MISSING',
        });
      } else {
        console.warn('⚠️ No charities array found in response');
      }
      
      // Return in consistent format
      if (charitiesArray) {
        return pagination ? { charities: charitiesArray, pagination } : { charities: charitiesArray };
      }
      
      // Fallback: return original response data
      return response.data;
    } catch (error) {
      console.error('❌ API.getCharities() - Request failed');
      console.error('❌ Error type:', error.constructor.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Full error object:', JSON.stringify(error, null, 2));
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        statusCode: error.response?.statusCode,
        data: error.response?.data,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL,
          headers: error.config?.headers,
        },
        request: {
          path: error.request?.path,
          method: error.request?.method,
        }
      });
      
      // Log the full URL that was attempted
      const fullUrl = `${error.config?.baseURL}${error.config?.url}`;
      console.error('❌ Full URL attempted:', fullUrl);
      
      // Provide more helpful error message
      if (error.response) {
        // Server responded with error status
        throw new Error(error.response?.data?.message || error.response?.data?.error || `Server error: ${error.response.status} ${error.response.statusText}`);
      } else if (error.request) {
        // Request was made but no response received
        console.error('❌ No response received from server - network error or server is down');
        throw new Error('Network error: Could not reach the server. Please check your internet connection.');
      } else {
        // Error setting up the request
        console.error('❌ Error setting up request');
        throw new Error(`Request setup error: ${error.message}`);
      }
    }
  },

  /**
   * Get single charity by ID (uses detail endpoint with all fields)
   * Backend returns: { success: true, data: {...} }
   * We unwrap to return the charity object directly
   */
  getCharityById: async (charityId) => {
    try {
      console.log('📡 API.getCharityById() - Making request to /api/charities/' + charityId);
      const response = await api.get(`/api/charities/${charityId}`);
      console.log('✅ API.getCharityById() - Response received');
      console.log('✅ Response status:', response.status);
      console.log('✅ Response data type:', typeof response.data);
      console.log('✅ Response data is array:', Array.isArray(response.data));
      console.log('✅ Response data has id:', !!response.data?.id);
      console.log('✅ Response data has name:', !!response.data?.name);
      console.log('✅ FULL RESPONSE DATA:', JSON.stringify(response.data, null, 2));
      
      // The detail endpoint returns the charity object directly (not wrapped)
      // Just return response.data directly
      const charityData = response.data;
      
      if (charityData) {
        console.log('✅ Charity field names:', Object.keys(charityData));
        console.log('✅ Total fields:', Object.keys(charityData).length);
        console.log('✅ Charity impact fields check:', {
          livesImpacted: charityData.livesImpacted ?? charityData.lives_impacted ?? 'MISSING',
          programsActive: charityData.programsActive ?? charityData.programs_active ?? 'MISSING',
          directToProgramsPercentage: charityData.directToProgramsPercentage ?? charityData.direct_to_programs_percentage ?? 'MISSING',
          impactStatement1: charityData.impactStatement1 ?? charityData.impact_statement_1 ? 'EXISTS' : 'MISSING',
          impactStatement2: charityData.impactStatement2 ?? charityData.impact_statement_2 ? 'EXISTS' : 'MISSING',
          successStory: charityData.successStory ?? charityData.success_story ? 'EXISTS' : 'MISSING',
          whyThisMatters: charityData.whyThisMatters ?? charityData.why_this_matters ? 'EXISTS' : 'MISSING',
        });
        
        // Log actual values for debugging
        console.log('✅ ACTUAL VALUES:', {
          livesImpacted: charityData.livesImpacted,
          programsActive: charityData.programsActive,
          directToProgramsPercentage: charityData.directToProgramsPercentage,
          impactStatement1: charityData.impactStatement1 ? charityData.impactStatement1.substring(0, 50) + '...' : null,
          impactStatement2: charityData.impactStatement2 ? charityData.impactStatement2.substring(0, 50) + '...' : null,
          successStory: charityData.successStory ? charityData.successStory.substring(0, 50) + '...' : null,
          whyThisMatters: charityData.whyThisMatters ? charityData.whyThisMatters.substring(0, 50) + '...' : null,
        });
        
        return charityData;
      }
      
      // Fallback: return original response data
      console.warn('⚠️ No charity data found in response');
      return response.data;
    } catch (error) {
      console.error('❌ API.getCharityById() - Request failed');
      console.error('❌ Error type:', error.constructor.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Full error object:', JSON.stringify(error, null, 2));
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        statusCode: error.response?.statusCode,
        data: error.response?.data,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL,
          headers: error.config?.headers,
        },
        request: {
          path: error.request?.path,
          method: error.request?.method,
        }
      });
      
      // Log the full URL that was attempted
      const fullUrl = `${error.config?.baseURL}${error.config?.url}`;
      console.error('❌ Full URL attempted:', fullUrl);
      
      // Provide more helpful error message
      if (error.response) {
        // Server responded with error status
        throw new Error(error.response?.data?.message || error.response?.data?.error || `Server error: ${error.response.status} ${error.response.statusText}`);
      } else if (error.request) {
        // Request was made but no response received
        console.error('❌ No response received from server - network error or server is down');
        throw new Error('Network error: Could not reach the server. Please check your internet connection.');
      } else {
        // Error setting up the request
        console.error('❌ Error setting up request');
        throw new Error(`Request setup error: ${error.message}`);
      }
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
      // Silently fail for public endpoints - fallback data will be used
      if (error.response?.status === 401 && isPublicEndpoint('/api/vendors')) {
        console.warn('⚠️ Vendors endpoint requires auth - using fallback data');
        throw new Error('PUBLIC_ENDPOINT_REQUIRES_AUTH');
      }
      console.error('Get vendors failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load vendors.');
    }
  },

  /**
   * Get discounts list
   */
  getDiscounts: async (filters = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (filters.category) queryParams.append('category', filters.category);
      if (filters.location) queryParams.append('location', filters.location);
      if (filters.search) queryParams.append('search', filters.search);
      
      const response = await api.get(`/api/discounts?${queryParams.toString()}`);
      return response.data;
    } catch (error) {
      // Silently fail for public endpoints - fallback data will be used
      if (error.response?.status === 401 && isPublicEndpoint('/api/discounts')) {
        console.warn('⚠️ Discounts endpoint requires auth - using fallback data');
        throw new Error('PUBLIC_ENDPOINT_REQUIRES_AUTH');
      }
      console.error('Get discounts failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load discounts.');
    }
  },

  /**
   * Get discount details by ID
   */
  getDiscountDetails: async (discountId) => {
    try {
      const response = await api.get(`/api/discounts/${discountId}`);
      return response.data;
    } catch (error) {
      console.error('Get discount details failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load discount details.');
    }
  },

  /**
   * Get redemption count for a discount this month
   * Returns { count: number } - defaults to 0 if endpoint doesn't exist
   */
  getRedemptionCount: async (discountId) => {
    try {
      const response = await api.get(`/api/discounts/${discountId}/redemptions/count`);
      return response.data;
    } catch (error) {
      // If endpoint doesn't exist yet (404), silently return 0
      if (error.response?.status === 404) {
        // Endpoint not implemented yet - this is expected
        return { count: 0 };
      }
      // For other errors, log but still return 0
      console.warn('⚠️ Get redemption count failed:', error.response?.status || error.message);
      return { count: 0 };
    }
  },

  /**
   * Redeem discount
   */
  redeemDiscount: async (discountId, userData = {}) => {
    try {
      const response = await api.post(`/api/discounts/${discountId}/redeem`, userData);
      return response.data;
    } catch (error) {
      // Log error but don't throw - let the component handle it gracefully
      console.warn('⚠️ Redeem discount API failed (will use local fallback):', error.response?.status || error.message);
      throw new Error(error.response?.data?.message || 'Failed to redeem discount.');
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

  // ===== ONE-TIME GIFTS =====

  /**
   * Create one-time gift payment intent
   * Returns: { payment_intent: { id, client_secret, amount, currency, status }, gift: {...} }
   */
  createOneTimeGiftPaymentIntent: async (giftData) => {
    try {
      console.log('💳 Creating one-time gift payment intent:', giftData);
      const response = await api.post('/api/one-time-gifts/create-payment-intent', giftData);
      return response.data;
    } catch (error) {
      console.error('Create payment intent failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to create payment intent.');
    }
  },

  /**
   * Confirm one-time gift payment
   * Returns: { success: true, gift: {...}, transaction: {...} }
   */
  confirmOneTimeGiftPayment: async (paymentIntentId, paymentMethodId = null) => {
    try {
      console.log('✅ Confirming one-time gift payment:', { paymentIntentId, paymentMethodId });
      const response = await api.post('/api/one-time-gifts/confirm-payment', {
        payment_intent_id: paymentIntentId,
        payment_method_id: paymentMethodId,
      });
      return response.data;
    } catch (error) {
      console.error('Confirm payment failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to confirm payment.');
    }
  },

  /**
   * Get user's one-time gift history
   * Returns: { gifts: [...], pagination: {...}, summary: {...} }
   */
  getOneTimeGiftHistory: async (page = 1, limit = 20, beneficiaryId = null) => {
    try {
      const params = { page, limit };
      if (beneficiaryId) params.beneficiary_id = beneficiaryId;
      const response = await api.get('/api/one-time-gifts/history', { params });
      return response.data;
    } catch (error) {
      console.error('Get gift history failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load gift history.');
    }
  },

  /**
   * Get beneficiary one-time gift stats
   * Returns: { beneficiary_id, beneficiary_name, stats: {...} }
   */
  getBeneficiaryOneTimeGiftStats: async (beneficiaryId) => {
    try {
      const response = await api.get(`/api/beneficiaries/${beneficiaryId}/one-time-gifts/stats`);
      return response.data;
    } catch (error) {
      console.error('Get beneficiary stats failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load beneficiary stats.');
    }
  },

  // ===== MONTHLY DONATIONS =====

  /**
   * Create monthly donation subscription
   * Returns: { subscription: {...}, clientSecret: string }
   */
  createMonthlySubscription: async (subscriptionData) => {
    try {
      console.log('💳 Creating monthly subscription:', subscriptionData);
      const response = await api.post('/api/donations/monthly/subscribe', subscriptionData);
      return response.data;
    } catch (error) {
      console.error('Create monthly subscription failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to create subscription.');
    }
  },

  /**
   * Get user's monthly donation subscriptions
   * Returns: { subscriptions: [...], summary: {...} }
   */
  getMonthlyDonations: async () => {
    try {
      const response = await api.get('/api/donations/monthly');
      return response.data;
    } catch (error) {
      console.error('Get monthly donations failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load monthly donations.');
    }
  },

  /**
   * Update monthly donation amount
   * Returns: { subscription: {...}, clientSecret?: string }
   */
  updateMonthlyDonationAmount: async (subscriptionId, amount) => {
    try {
      console.log('💳 Updating monthly donation amount:', { subscriptionId, amount });
      const response = await api.put('/api/donations/monthly/amount', {
        subscription_id: subscriptionId,
        amount: amount,
      });
      return response.data;
    } catch (error) {
      console.error('Update monthly donation amount failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to update donation amount.');
    }
  },

  /**
   * Get monthly donation summary
   * Returns: { summary: { total_monthly_amount, total_donated, active_subscriptions, monthly_breakdown: [...] } }
   */
  getMonthlyDonationSummary: async () => {
    try {
      const response = await api.get('/api/donations/monthly/summary');
      return response.data;
    } catch (error) {
      console.error('Get monthly donation summary failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load donation summary.');
    }
  },

  /**
   * Cancel monthly donation subscription
   */
  cancelMonthlyDonation: async (subscriptionId) => {
    try {
      console.log('💳 Cancelling monthly subscription:', subscriptionId);
      const response = await api.delete(`/api/donations/monthly/subscription/${subscriptionId}`);
      return response.data;
    } catch (error) {
      console.error('Cancel monthly donation failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to cancel subscription.');
    }
  },

  // ===== TRANSACTIONS =====

  /**
   * Get transaction history
   * Returns: { transactions: [...], pagination: {...}, summary: {...} }
   */
  getTransactions: async (page = 1, limit = 20, filters = {}) => {
    try {
      const params = { page, limit, ...filters };
      const response = await api.get('/api/transactions', { params });
      return response.data;
    } catch (error) {
      console.error('Get transactions failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load transactions.');
    }
  },

  /**
   * Create transaction
   * Returns: { transaction: {...} }
   */
  createTransaction: async (transactionData) => {
    try {
      const response = await api.post('/api/transactions', transactionData);
      return response.data;
    } catch (error) {
      console.error('Create transaction failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to create transaction.');
    }
  },

  /**
   * Get transaction summary
   * Returns: { summary: { total_spent, total_saved, total_transactions, by_type: {...} } }
   */
  getTransactionSummary: async () => {
    try {
      const response = await api.get('/api/transactions/summary');
      return response.data;
    } catch (error) {
      console.error('Get transaction summary failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load transaction summary.');
    }
  },

  // ===== PAYMENT METHODS =====

  /**
   * Get user's payment methods
   * Returns: { payment_methods: [...] }
   */
  getPaymentMethods: async () => {
    try {
      const response = await api.get('/api/payment-methods');
      return response.data;
    } catch (error) {
      // Handle 404 gracefully (no Stripe customer yet)
      if (error.response?.status === 404) {
        console.log('⚠️ No payment methods found (user may not have Stripe customer yet)');
        return { payment_methods: [] };
      }
      console.error('Get payment methods failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load payment methods.');
    }
  },

  /**
   * Create SetupIntent for adding payment method
   * Returns: { client_secret: string }
   */
  createSetupIntent: async () => {
    try {
      const response = await api.post('/api/payment-methods');
      return response.data;
    } catch (error) {
      console.error('Create setup intent failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to create setup intent.');
    }
  },

  /**
   * Delete payment method
   */
  deletePaymentMethod: async (paymentMethodId) => {
    try {
      const response = await api.delete(`/api/payment-methods/${paymentMethodId}`);
      return response.data;
    } catch (error) {
      console.error('Delete payment method failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete payment method.');
    }
  },

  // ===== POINTS SYSTEM =====

  /**
   * Get user's current points balance
   * Returns: { points: number }
   */
  getPoints: async () => {
    try {
      const response = await api.get('/api/user/points');
      return response.data;
    } catch (error) {
      console.error('Get points failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load points.');
    }
  },

  /**
   * Add points to user account
   * Returns: { points: number, transaction: {...} }
   */
  addPoints: async (points, type = 'earned', description = '') => {
    try {
      console.log('🎯 Adding points:', { points, type, description });
      const response = await api.post('/api/user/points/add', {
        points,
        type,
        description,
      });
      return response.data;
    } catch (error) {
      console.error('Add points failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to add points.');
    }
  },

  /**
   * Get points transaction history
   * Returns: { transactions: [...], pagination: {...} }
   */
  getPointsHistory: async (page = 1, limit = 20) => {
    try {
      const response = await api.get('/api/user/points/history', {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      console.error('Get points history failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load points history.');
    }
  },

  // ===== INVITATIONS =====

  /**
   * Submit vendor invitation
   * Returns: { invitation: {...} }
   */
  submitVendorInvitation: async (invitationData) => {
    try {
      console.log('📧 Submitting vendor invitation:', invitationData);
      const response = await api.post('/api/invitations/vendor', invitationData);
      return response.data;
    } catch (error) {
      console.error('Submit vendor invitation failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to submit invitation.');
    }
  },

  /**
   * Submit beneficiary invitation
   * Returns: { invitation: {...} }
   */
  submitBeneficiaryInvitation: async (invitationData) => {
    try {
      console.log('📧 Submitting beneficiary invitation:', invitationData);
      const response = await api.post('/api/invitations/beneficiary', invitationData);
      return response.data;
    } catch (error) {
      console.error('Submit beneficiary invitation failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to submit invitation.');
    }
  },

  /**
   * Get invitation history
   * Returns: { invitations: [...] }
   */
  getInvitations: async (filters = {}) => {
    try {
      const params = filters;
      const response = await api.get('/api/invitations', { params });
      return response.data;
    } catch (error) {
      console.error('Get invitations failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load invitations.');
    }
  },

  /**
   * Get invitation status
   * Returns: { invitation: {...}, status: string }
   */
  getInvitationStatus: async (invitationId) => {
    try {
      const response = await api.get(`/api/invitations/${invitationId}/status`);
      return response.data;
    } catch (error) {
      console.error('Get invitation status failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to load invitation status.');
    }
  },

  /**
   * Submit beneficiary request
   * Accepts: contact_name, company_name, email, phone (optional), website (optional), message (optional)
   * Returns: { success: true, invitation: {...} }
   * Note: This endpoint works with or without authentication
   */
  submitBeneficiaryRequest: async (requestData) => {
    try {
      console.log('📝 Submitting beneficiary request:', { 
        company_name: requestData.company_name,
        email: requestData.email 
      });
      
      const response = await api.post('/api/invitations/beneficiary', {
        contact_name: requestData.contact_name,
        company_name: requestData.company_name,
        email: requestData.email,
        phone: requestData.phone || null,
        website: requestData.website || null,
        message: requestData.message || null,
      });
      
      console.log('✅ Beneficiary request submitted successfully');
      return response.data;
    } catch (error) {
      console.error('❌ Submit beneficiary request failed:', error);
      throw new Error(error.response?.data?.message || 'Failed to submit request. Please try again.');
    }
  },
};

export default API;