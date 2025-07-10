// lib/api.js - Mock API for development
import axios from 'axios';

// Mock API responses for development
const mockAPI = {
  post: async (endpoint, data) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    switch (endpoint) {
      case '/api/auth/signup':
        return { data: { success: true, message: 'User created successfully' } };
      case '/auth/login':
        return { data: { success: true, is_verified: true, user: { email: data.email } } };
      case '/api/auth/resend-verification':
        return { data: { success: true, message: 'Verification email sent' } };
      case '/auth/forgot-password':
        return { data: { success: true, message: 'Reset link sent' } };
      default:
        return { data: { success: true } };
    }
  },
  
  get: async (endpoint) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (endpoint.includes('/api/auth/check-verification/')) {
      return { data: { isVerified: true } };
    }
    
    return { data: { success: true } };
  }
};

// Use mock API instead of real backend
const API = mockAPI;

export default API;
