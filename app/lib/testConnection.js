// testConnection.js - Test backend connectivity
import { BACKEND_URL } from '../utils/constants';

export const testBackendConnection = async () => {
  console.log('🔍 Testing backend connection...');
  console.log('📍 Backend URL:', BACKEND_URL);
  
  try {
    // Test basic connectivity
    console.log('📡 Testing basic connectivity...');
    const response = await fetch(`${BACKEND_URL}/api/health`);
    console.log('✅ Backend is reachable:', response.status);
    
    if (response.ok) {
      console.log('🎉 Backend connection test passed!');
      return true;
    } else {
      console.log('⚠️ Backend reachable but returned status:', response.status);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Backend connection test failed:', error);
    return false;
  }
};













