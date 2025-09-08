3 // context/UserContext.js - Clean user context with AWS backend integration
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import API from '../lib/api';

const UserContext = createContext();

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    profileImage: null,
    profileImageUrl: null,
    points: 0,
    monthlyDonation: 15, // Default donation amount
    totalSavings: 0, // Track total savings from discounts
    isLoggedIn: false,
    isVerified: false, // Email verification status
    isLoading: true,
  });

  // Load user data on app start
  useEffect(() => {
    loadUserData();
  }, []);

  /**
   * Load user data from local storage
   */
  const loadUserData = async () => {
    try {
      console.log('📱 Loading user data from storage...');
      const userData = await AsyncStorage.getItem('userData');
      
      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log('✅ User data loaded from storage:', parsedUser);
        setUser({ ...parsedUser, isLoading: false });
        return parsedUser;
      } else {
        console.log('📱 No user data found in storage');
        setUser(prev => ({ ...prev, isLoading: false }));
        return null;
      }
    } catch (error) {
      console.error('❌ Error loading user data:', error);
      setUser(prev => ({ ...prev, isLoading: false }));
      return null;
    }
  };

  /**
   * Save user data to both local storage and AWS backend
   */
  const saveUserData = async (userData, saveToBackend = true) => {
    try {
      console.log('💾 Saving user data:', userData);
      console.log('💾 Current user state before save:', user);
      
      // Update local state
      const updatedUser = { ...user, ...userData, isLoggedIn: true };
      console.log('💾 Updated user object:', updatedUser);
      setUser(updatedUser);
      
      // Save to local storage
      const dataToSave = JSON.stringify(updatedUser);
      console.log('💾 Data being saved to storage:', dataToSave);
      await AsyncStorage.setItem('userData', dataToSave);
      console.log('✅ User data saved to local storage');
      
      // Verify what was actually saved
      const verifyData = await AsyncStorage.getItem('userData');
      console.log('🔍 Verification - data in storage:', verifyData);
      
      // Save to AWS backend if requested and user is authenticated
      if (saveToBackend) {
        try {
          const isAuth = await API.isAuthenticated();
          if (isAuth) {
            console.log('🌐 Saving profile to AWS backend...');
            await API.saveProfile(userData);
            console.log('✅ Profile saved to AWS backend');
          } else {
            console.log('⚠️ User not authenticated, skipping backend save');
          }
        } catch (backendError) {
          console.error('❌ Backend save failed:', backendError);
          // Don't throw error - local save succeeded
        }
      }
      
      return updatedUser;
    } catch (error) {
      console.error('❌ Error saving user data:', error);
      throw error;
    }
  };

  /**
   * Update user profile (local only)
   */
  const updateUserProfile = async (profileData) => {
    try {
      const updatedUser = { ...user, ...profileData };
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      console.log('✅ User profile updated locally');
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
    }
  };

  const syncVerificationFromLogin = async (loginResponse) => {
    try {
      if (loginResponse && loginResponse.is_verified !== undefined) {
        const isVerified = loginResponse.is_verified === 1 || loginResponse.is_verified === true;
        console.log('🔄 Syncing verification status from login response:', isVerified);
        
        if (isVerified !== user.isVerified) {
          const updatedUser = { ...user, isVerified };
          setUser(updatedUser);
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          console.log('✅ Verification status synced from login');
        }
      }
    } catch (error) {
      console.log('⚠️ Could not sync verification from login:', error.message);
    }
  };

  /**
   * Add points to user account (simple version)
   */
  const addPoints = async (pointsToAdd) => {
    try {
      console.log(`🎯 Adding ${pointsToAdd} points. Current: ${user.points}`);
      
      // Get current user data from storage to ensure we have the latest data
      const currentUserData = await AsyncStorage.getItem('userData');
      const currentUser = currentUserData ? JSON.parse(currentUserData) : user;
      
      const newPoints = (currentUser.points || 0) + pointsToAdd;
      const updatedUser = { ...currentUser, points: newPoints };
      
      console.log(`🎯 Updated user object for points:`, updatedUser);
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      
      console.log(`✅ Points updated. New total: ${newPoints}`);
      return newPoints;
    } catch (error) {
      console.error('❌ Error adding points:', error);
      return user.points;
    }
  };

  /**
   * Add savings from discount redemptions
   */
  const addSavings = async (savingsAmount) => {
    try {
      console.log(`💰 Adding $${savingsAmount} to savings. Current: $${user.totalSavings}`);
      
      // Get current user data from storage to ensure we have the latest data
      const currentUserData = await AsyncStorage.getItem('userData');
      const currentUser = currentUserData ? JSON.parse(currentUserData) : user;
      
      const newTotalSavings = (currentUser.totalSavings || 0) + savingsAmount;
      const updatedUser = { ...currentUser, totalSavings: newTotalSavings };
      
      console.log(`💰 Updated user object for savings:`, updatedUser);
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      
      console.log(`✅ Savings updated. New total: $${newTotalSavings}`);
      return newTotalSavings;
    } catch (error) {
      console.error('❌ Error adding savings:', error);
      return user.totalSavings;
    }
  };

  /**
   * Upload profile picture to AWS S3 with compression
   */
  const uploadProfilePicture = async (imageUri) => {
    try {
      console.log('📸 Uploading profile picture...');
      
      // Check if user is authenticated before attempting S3 upload
      const isAuth = await API.isAuthenticated();
      if (!isAuth) {
        console.log('⚠️ User not authenticated, saving image locally only');
        const updatedUser = { ...user, profileImage: imageUri, profileImageUrl: imageUri };
        setUser(updatedUser);
        await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
        
        console.log('✅ Profile picture saved locally (user not authenticated)');
        return { imageUrl: imageUri };
      }
      
      console.log('📸 Compressing and uploading profile picture to S3...');
      
      // Compress and resize image
      const compressedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          { resize: { width: 400, height: 400 } }, // Resize to 400x400 max
        ],
        {
          compress: 0.8, // 80% quality
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      
      console.log('📸 Image compressed, size:', compressedImage.width, 'x', compressedImage.height);
      
      // Upload to backend S3 endpoint
      const response = await API.uploadProfilePicture(compressedImage.uri);
      
      if (response.success) {
        const imageUrl = response.imageUrl;
        
        // Update user context with S3 URL
        const updatedUser = { 
          ...user, 
          profileImage: imageUrl,
          profileImageUrl: imageUrl
        };
        
        setUser(updatedUser);
        await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
        
        console.log('✅ Profile picture uploaded to S3:', imageUrl);
        return { imageUrl };
      } else {
        throw new Error(response.data.message || 'Upload failed');
      }
    } catch (error) {
      console.error('❌ Error uploading profile picture to S3:', error);
      
      // Fallback to local storage if S3 upload fails
      console.log('📸 Falling back to local storage...');
      const updatedUser = { 
        ...user, 
        profileImage: imageUri,
        profileImageUrl: imageUri
      };
      
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      
      console.log('✅ Profile picture saved locally (S3 upload failed)');
      return { imageUrl: imageUri };
    }
  };

  /**
   * Sync user data with backend
   */
  const syncWithBackend = async () => {
    try {
      console.log('🔄 Syncing user data with backend...');
      const isAuth = await API.isAuthenticated();
      
      if (isAuth) {
        const backendProfile = await API.getProfile();
        console.log('📥 Backend profile data:', backendProfile);
        
        // Merge backend data with local data
        const mergedUser = { ...user, ...backendProfile };
        setUser(mergedUser);
        await AsyncStorage.setItem('userData', JSON.stringify(mergedUser));
        
        console.log('✅ User data synced with backend');
        return mergedUser;
      } else {
        console.log('⚠️ User not authenticated, skipping sync');
        return user;
      }
    } catch (error) {
      console.error('❌ Error syncing with backend:', error);
      return user;
    }
  };

  /**
   * Logout user
   */
  const logout = async () => {
    try {
      console.log('🚪 Logging out user...');
      await API.logout();
      
      setUser({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        profileImage: null,
        profileImageUrl: null,
        points: 0,
        monthlyDonation: 15,
        totalSavings: 0,
        isLoggedIn: false,
        isLoading: false,
      });
      
      console.log('✅ User logged out successfully');
    } catch (error) {
      console.error('❌ Error logging out:', error);
    }
  };

  /**
   * Clear all user data
   */
  const clearAllData = async () => {
    try {
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('authToken');
      
      setUser({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        profileImage: null,
        profileImageUrl: null,
        points: 0,
        monthlyDonation: 15,
        totalSavings: 0,
        isLoggedIn: false,
        isLoading: false,
      });
      
      console.log('🗑️ All user data cleared');
    } catch (error) {
      console.error('❌ Error clearing data:', error);
    }
  };

  /**
   * Clear only profile image from local storage
   */
  const clearProfileImage = async () => {
    try {
      console.log('🖼️ Clearing profile image...');
      const currentUser = await AsyncStorage.getItem('userData');
      if (currentUser) {
        const userData = JSON.parse(currentUser);
        userData.profileImage = '';
        await AsyncStorage.setItem('userData', JSON.stringify(userData));
        
        setUser(prev => ({
          ...prev,
          profileImage: ''
        }));
        
        console.log('✅ Profile image cleared from local storage');
      }
    } catch (error) {
      console.error('❌ Error clearing profile image:', error);
    }
  };

  /**
   * Mark user as verified after email verification
   */
  const markAsVerified = async () => {
    try {
      console.log('✅ Marking user as verified');
      const updatedUser = { ...user, isVerified: true };
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      console.log('✅ User verification status updated');
      return updatedUser;
    } catch (error) {
      console.error('❌ Error marking user as verified:', error);
      throw error;
    }
  };

  const checkVerificationStatus = async () => {
    try {
      if (!user.email) return;
      
      console.log('🔍 Checking verification status from backend...');
      const response = await API.getProfile();
      
      if (response && response.is_verified !== undefined) {
        const isVerified = response.is_verified === 1 || response.is_verified === true;
        console.log('🔍 Backend verification status:', isVerified);
        
        if (isVerified !== user.isVerified) {
          console.log('🔄 Syncing verification status with backend');
          const updatedUser = { ...user, isVerified };
          setUser(updatedUser);
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          console.log('✅ Verification status synced');
        }
      }
    } catch (error) {
      console.log('⚠️ Could not check verification status:', error.message);
    }
  };

  const value = {
    user,
    saveUserData,
    updateUserProfile,
    addPoints,
    addSavings,
    uploadProfilePicture,
    syncWithBackend,
    loadUserData,
    logout,
    clearAllData,
    clearProfileImage,
    markAsVerified,
    checkVerificationStatus,
    syncVerificationFromLogin,
    isLoading: user.isLoading,
    isLoggedIn: user.isLoggedIn,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}; 