3 // context/UserContext.js - Clean user context with Supabase backend integration
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
    coworking: false,
    sponsorAmount: 0,
    extraDonationAmount: 0,
    totalMonthlyDonation: 0,
    points: 0,
    monthlyDonation: 15, // Default donation amount
    totalSavings: 0, // Track total savings from discounts
    isLoggedIn: false,
    isVerified: false, // Email verification status
    isLoading: true,
  });

  // Load user data on app start, then sync points sequentially to avoid race condition
  useEffect(() => {
    const initializeData = async () => {
      await loadUserData();
      try {
        const isAuth = await API.isAuthenticated();
        if (isAuth) {
          await syncPoints();
        }
      } catch (error) {
        console.log('⚠️ Could not sync points on load:', error.message);
      }
    };
    initializeData();
  }, []);

  /**
   * Load user data from local storage
   */
  const loadUserData = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      
      let loadedUser;

      if (userData) {
        const parsedUser = JSON.parse(userData);
        
        // Ensure all fields are properly set, including firstName and lastName
        // CRITICAL: Only use values from storage if they're actually present (not empty strings)
        // This prevents empty strings in storage from overwriting good data in memory
        loadedUser = {
          ...parsedUser,
          isLoading: false,
          // Only use storage values if they're non-empty
          // If storage has empty strings, check if we have data in current state first
          firstName: (parsedUser.firstName && parsedUser.firstName.trim()) ? parsedUser.firstName : (user.firstName || ''),
          lastName: (parsedUser.lastName && parsedUser.lastName.trim()) ? parsedUser.lastName : (user.lastName || ''),
          phone: (parsedUser.phone && parsedUser.phone.trim()) ? parsedUser.phone : (user.phone || ''),
          email: (parsedUser.email && parsedUser.email.trim()) ? parsedUser.email : (user.email || ''),
          // Ensure profileImage is set from either field
          profileImage: parsedUser.profileImage || parsedUser.profileImageUrl || user.profileImage || user.profileImageUrl || null,
          profileImageUrl: parsedUser.profileImageUrl || parsedUser.profileImage || user.profileImageUrl || user.profileImage || null,
          // Preserve other fields from current state if storage doesn't have them
          points: parsedUser.points ?? user.points ?? 0,
          monthlyDonation: parsedUser.monthlyDonation ?? user.monthlyDonation ?? 15,
          totalSavings: parsedUser.totalSavings ?? user.totalSavings ?? 0,
          isLoggedIn: parsedUser.isLoggedIn ?? user.isLoggedIn ?? false,
          isVerified: parsedUser.isVerified ?? user.isVerified ?? false,
        };
        
        // If user is authenticated, always try to sync with backend to get latest data (especially profile image)
        // This ensures profile image and other data saved to backend is loaded
        if (parsedUser.email) {
          try {
            const isAuth = await API.isAuthenticated();
            if (isAuth) {
              const backendProfile = await API.getProfile();
              if (backendProfile) {
                // Merge backend data, prioritizing backend values for profile image and other fields
                // This ensures profile image saved to backend is loaded
                const profileData = backendProfile.profile || backendProfile;
                const mergedUser = {
                  ...loadedUser,
                  // Use backend values if they exist and are non-empty, otherwise keep local
                  firstName: (profileData.firstName && profileData.firstName.trim()) ? profileData.firstName : (loadedUser.firstName || ''),
                  lastName: (profileData.lastName && profileData.lastName.trim()) ? profileData.lastName : (loadedUser.lastName || ''),
                  phone: (profileData.phone && profileData.phone.trim()) ? profileData.phone : (loadedUser.phone || ''),
                  email: (profileData.email && profileData.email.trim()) ? profileData.email : (loadedUser.email || ''),
                  // IMPORTANT: Prioritize backend profile image to ensure it's loaded
                  profileImage: profileData.profileImage || profileData.profileImageUrl || loadedUser.profileImage || null,
                  profileImageUrl: profileData.profileImageUrl || profileData.profileImage || loadedUser.profileImageUrl || null,
                  // Preserve all other local fields
                  points: loadedUser.points ?? 0,
                  monthlyDonation: loadedUser.monthlyDonation ?? 15,
                  totalSavings: loadedUser.totalSavings ?? 0,
                  isLoggedIn: loadedUser.isLoggedIn ?? true,
                  isVerified: backendProfile.is_verified !== undefined ? (backendProfile.is_verified === 1 || backendProfile.is_verified === true) : (loadedUser.isVerified ?? false),
                };
                loadedUser = mergedUser;
                // Save the merged data back to storage
                await AsyncStorage.setItem('userData', JSON.stringify(loadedUser));
              }
            }
          } catch (backendError) {
            console.warn('⚠️ Could not fetch from backend:', backendError.message);
            // Continue with local data - don't overwrite anything
          }
        }
        
        setUser(loadedUser);
        return loadedUser;
      } else {
        // CRITICAL: Don't overwrite existing user state if storage is empty
        // If user state already has data (from previous load or context), preserve it
        // Only update isLoading flag
        setUser(prev => {
          const hasDataInMemory = prev.firstName || prev.lastName || prev.email || prev.phone || prev.profileImage;
          if (hasDataInMemory) {
            return { ...prev, isLoading: false };
          }
          // Only set empty values if we truly have no data
          return { 
            ...prev, 
            isLoading: false,
          };
        });
        return null;
      }
    } catch (error) {
      console.error('❌ Error loading user data:', error);
      // CRITICAL: Don't overwrite existing user state on error
      // Preserve whatever data we have in memory
      setUser(prev => {
        const hasDataInMemory = prev.firstName || prev.lastName || prev.email || prev.phone || prev.profileImage;
        if (hasDataInMemory) {
          return { ...prev, isLoading: false };
        }
        // Only update isLoading if we have no data
        return { ...prev, isLoading: false };
      });
      return null;
    }
  };

  /**
   * Save user data to both local storage and Supabase backend
   */
  const saveUserData = async (userData, saveToBackend = true) => {
    try {
      // CRITICAL: Load existing data from storage first to preserve it
      // This prevents overwriting data when only partial updates are sent
      let existingData = {};
      try {
        const storedData = await AsyncStorage.getItem('userData');
        if (storedData) {
          existingData = JSON.parse(storedData);
        }
      } catch (storageError) {
        console.warn('⚠️ Could not load existing data from storage:', storageError);
      }
      
      // If this is a new signup (email changed and no existing email), reset points to 0
      // Otherwise, preserve existing points unless explicitly set in userData
      const isNewSignup = userData.email && userData.email !== existingData.email && !existingData.email;
      const pointsToSet = userData.points !== undefined ? userData.points : (isNewSignup ? 0 : (existingData.points ?? user.points));
      
      // Merge: existing data (from storage) -> current state -> new userData
      // This ensures we never lose data that was previously saved
      // CRITICAL: Only use values from userData if they're non-empty (not empty strings)
      // This prevents empty strings from overwriting good data
      const updatedUser = { 
        ...existingData,  // Start with what's in storage (most complete)
        ...user,          // Then apply current state
        ...userData,      // Then apply new data
        isLoggedIn: userData.isLoggedIn ?? existingData.isLoggedIn ?? user.isLoggedIn ?? false,
        points: pointsToSet,
        // Explicitly preserve firstName, lastName, email, phone, profileImage
        // Only use userData values if they're non-empty strings
        firstName: (userData.firstName && userData.firstName.trim()) 
          ? userData.firstName 
          : (existingData.firstName && existingData.firstName.trim()) 
            ? existingData.firstName 
            : (user.firstName && user.firstName.trim()) 
              ? user.firstName 
              : '',
        lastName: (userData.lastName && userData.lastName.trim()) 
          ? userData.lastName 
          : (existingData.lastName && existingData.lastName.trim()) 
            ? existingData.lastName 
            : (user.lastName && user.lastName.trim()) 
              ? user.lastName 
              : '',
        email: (userData.email && userData.email.trim()) 
          ? userData.email 
          : (existingData.email && existingData.email.trim()) 
            ? existingData.email 
            : (user.email && user.email.trim()) 
              ? user.email 
              : '',
        phone: (userData.phone && userData.phone.trim()) 
          ? userData.phone 
          : (existingData.phone && existingData.phone.trim()) 
            ? existingData.phone 
            : (user.phone && user.phone.trim()) 
              ? user.phone 
              : '',
        profileImage: userData.profileImage || userData.profileImageUrl || existingData.profileImage || existingData.profileImageUrl || user.profileImage || null,
        profileImageUrl: userData.profileImageUrl || userData.profileImage || existingData.profileImageUrl || existingData.profileImage || user.profileImageUrl || null,
        // Preserve other fields
        points: pointsToSet,
        monthlyDonation: userData.monthlyDonation ?? existingData.monthlyDonation ?? user.monthlyDonation ?? 15,
        coworking: userData.coworking ?? existingData.coworking ?? user.coworking ?? false,
        sponsorAmount: userData.sponsorAmount ?? existingData.sponsorAmount ?? user.sponsorAmount ?? 0,
        extraDonationAmount: userData.extraDonationAmount ?? existingData.extraDonationAmount ?? user.extraDonationAmount ?? 0,
        totalMonthlyDonation: userData.totalMonthlyDonation ?? existingData.totalMonthlyDonation ?? user.totalMonthlyDonation ?? 0,
        totalSavings: userData.totalSavings ?? existingData.totalSavings ?? user.totalSavings ?? 0,
        isVerified: userData.isVerified ?? existingData.isVerified ?? user.isVerified ?? false,
      };
      setUser(updatedUser);

      // Save to local storage
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      
      // Save to AWS backend if requested and user is authenticated
      if (saveToBackend) {
        try {
          const isAuth = await API.isAuthenticated();
          if (isAuth) {
            await API.saveProfile({
              firstName: updatedUser.firstName,
              lastName: updatedUser.lastName,
              email: updatedUser.email,
              phone: updatedUser.phone,
              profileImage: updatedUser.profileImage || updatedUser.profileImageUrl,
              profileImageUrl: updatedUser.profileImageUrl || updatedUser.profileImage,
            });
          }
        } catch (backendError) {
          const status = backendError.response?.status || backendError.status;
          const errorMessage = backendError.message || '';
          const errorData = backendError.response?.data || backendError.data;

          if (status === 404) {
            // Expected: endpoint not implemented
          } else if (status === 401) {
            // Expected: token expired
          } else if (status === 500) {
            // Server error - log detailed error for debugging
            console.error('❌ Backend save failed (500 Server Error):');
            console.error('   Error message:', errorMessage);
            console.error('   Response data:', errorData);
            console.error('   Full error:', backendError);
            console.error('💡 This indicates a backend bug. Check backend logs in Supabase Dashboard.');
          } else if (backendError.message?.includes('Network') || !status) {
            // Network error or no status code
            console.warn('⚠️ Network error saving to backend - data saved locally only');
            console.warn('   Error:', errorMessage);
          } else {
            // Other errors
            console.error('❌ Backend save failed:', {
              status: status,
              message: errorMessage,
              response: errorData,
            });
          }
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
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
    }
  };

  const syncVerificationFromLogin = async (loginResponse) => {
    try {
      if (loginResponse && loginResponse.is_verified !== undefined) {
        const isVerified = loginResponse.is_verified === 1 || loginResponse.is_verified === true;
        if (isVerified !== user.isVerified) {
          const updatedUser = { ...user, isVerified };
          setUser(updatedUser);
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
        }
      }
    } catch {
      // Non-critical sync — ignore
    }
  };

  /**
   * Add points to user account (with backend sync)
   */
  const addPoints = async (pointsToAdd, type = 'earned', description = '') => {
    try {
      // Try to add points via backend API
      try {
        const isAuth = await API.isAuthenticated();
        if (isAuth) {
          const response = await API.addPoints(pointsToAdd, type, description);
          const newPoints = response.points || (user.points + pointsToAdd);
          const updatedUser = { ...user, points: newPoints };
          setUser(updatedUser);
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          return newPoints;
        }
      } catch {
        // Fall through to local storage fallback
      }

      // Fallback to local storage if backend fails or user not authenticated
      const currentUserData = await AsyncStorage.getItem('userData');
      const currentUser = currentUserData ? JSON.parse(currentUserData) : user;
      const newPoints = (currentUser.points || 0) + pointsToAdd;
      const updatedUser = { ...currentUser, points: newPoints };
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      return newPoints;
    } catch (error) {
      console.error('❌ Error adding points:', error);
      return user.points;
    }
  };

  /**
   * Sync points from backend
   */
  const syncPoints = async () => {
    try {
      const isAuth = await API.isAuthenticated();
      if (isAuth) {
        const response = await API.getPoints();
        const backendPoints = response.points || 0;
        if (backendPoints !== user.points) {
          const updatedUser = { ...user, points: backendPoints };
          setUser(updatedUser);
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
        }
        return backendPoints;
      }
    } catch {
      return user.points;
    }
  };

  /**
   * Add savings from discount redemptions
   */
  const addSavings = async (savingsAmount) => {
    try {
      const currentUserData = await AsyncStorage.getItem('userData');
      const currentUser = currentUserData ? JSON.parse(currentUserData) : user;
      const newTotalSavings = (currentUser.totalSavings || 0) + savingsAmount;
      const updatedUser = { ...currentUser, totalSavings: newTotalSavings };
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      return newTotalSavings;
    } catch (error) {
      console.error('❌ Error adding savings:', error);
      return user.totalSavings;
    }
  };

  /**
   * Upload profile picture to Supabase storage with compression
   */
  const uploadProfilePicture = async (imageUri) => {
    try {
      const isAuth = await API.isAuthenticated();
      let imageUrl = imageUri;

      if (isAuth) {
        // Compress and resize image before upload
        const compressedImage = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 400, height: 400 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        try {
          const response = await API.uploadProfilePicture(compressedImage.uri);
          if (response.success) {
            imageUrl = response.profileImageUrl || response.imageUrl;
          }
        } catch (uploadError) {
          if (uploadError.message !== 'UPLOAD_ENDPOINT_NOT_IMPLEMENTED') {
            console.error('❌ Error uploading profile picture:', uploadError);
          }
        }
      }

      return { imageUrl };
    } catch (error) {
      console.error('❌ Error in uploadProfilePicture:', error);
      return { imageUrl: imageUri };
    }
  };

  /**
   * Sync user data with backend
   */
  const syncWithBackend = async () => {
    try {
      const isAuth = await API.isAuthenticated();
      if (!isAuth) return user;

      const localData = await AsyncStorage.getItem('userData');
      const localUser = localData ? JSON.parse(localData) : user;

      const backendProfile = await API.getProfile();
      if (!backendProfile) return localUser;

      const profileData = backendProfile.profile || backendProfile;
      const mergedUser = {
        ...localUser,
        firstName: (profileData.firstName && profileData.firstName.trim()) ? profileData.firstName : localUser.firstName || '',
        lastName: (profileData.lastName && profileData.lastName.trim()) ? profileData.lastName : localUser.lastName || '',
        email: (profileData.email && profileData.email.trim()) ? profileData.email : localUser.email || '',
        phone: (profileData.phone && profileData.phone.trim()) ? profileData.phone : localUser.phone || '',
        profileImage: profileData.profileImage || profileData.profileImageUrl || localUser.profileImage || localUser.profileImageUrl || null,
        profileImageUrl: profileData.profileImageUrl || profileData.profileImage || localUser.profileImageUrl || localUser.profileImage || null,
        points: localUser.points ?? user.points ?? 0,
        monthlyDonation: localUser.monthlyDonation ?? user.monthlyDonation ?? 15,
        totalSavings: localUser.totalSavings ?? user.totalSavings ?? 0,
        isLoggedIn: localUser.isLoggedIn ?? true,
        isVerified: backendProfile.is_verified !== undefined ? (backendProfile.is_verified === 1 || backendProfile.is_verified === true) : (localUser.isVerified ?? false),
        isLoading: false,
      };

      setUser(mergedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(mergedUser));
      return mergedUser;
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
      await API.logout();
      await AsyncStorage.multiRemove([
        'authToken',
        'userData',
        'selectedBeneficiary',
        'beneficiaryFavorites',
        'userTransactions',
      ]);
      
      setUser({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        profileImage: null,
        profileImageUrl: null,
        coworking: false,
        sponsorAmount: 0,
        extraDonationAmount: 0,
        totalMonthlyDonation: 0,
        points: 0,
        monthlyDonation: 15,
        totalSavings: 0,
        isLoggedIn: false,
        isLoading: false,
      });
    } catch (error) {
      console.error('❌ Error logging out:', error);
    }
  };

  /**
   * Clear all user data
   */
  const clearAllData = async () => {
    try {
      await AsyncStorage.multiRemove([
        'authToken',
        'userData',
        'selectedBeneficiary',
        'beneficiaryFavorites',
        'userTransactions',
      ]);
      
      setUser({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        profileImage: null,
        profileImageUrl: null,
        coworking: false,
        sponsorAmount: 0,
        extraDonationAmount: 0,
        totalMonthlyDonation: 0,
        points: 0,
        monthlyDonation: 15,
        totalSavings: 0,
        isLoggedIn: false,
        isLoading: false,
      });
    } catch (error) {
      console.error('❌ Error clearing data:', error);
    }
  };

  /**
   * Clear only profile image from local storage
   */
  const clearProfileImage = async () => {
    try {
      const currentUser = await AsyncStorage.getItem('userData');
      if (currentUser) {
        const userData = JSON.parse(currentUser);
        userData.profileImage = '';
        await AsyncStorage.setItem('userData', JSON.stringify(userData));
        setUser(prev => ({ ...prev, profileImage: '' }));
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
      const updatedUser = { ...user, isVerified: true };
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      return updatedUser;
    } catch (error) {
      console.error('❌ Error marking user as verified:', error);
      throw error;
    }
  };

  const checkVerificationStatus = async () => {
    try {
      if (!user.email) return;
      const response = await API.getProfile();
      if (response && response.is_verified !== undefined) {
        const isVerified = response.is_verified === 1 || response.is_verified === true;
        if (isVerified !== user.isVerified) {
          const updatedUser = { ...user, isVerified };
          setUser(updatedUser);
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
        }
      }
    } catch {
      // Non-critical — ignore
    }
  };

  const value = {
    user,
    saveUserData,
    updateUserProfile,
    addPoints,
    syncPoints,
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