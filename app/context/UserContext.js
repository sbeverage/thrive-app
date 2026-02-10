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

  // Load user data on app start
  useEffect(() => {
    loadUserData();
    // Sync points from backend if authenticated
    const syncPointsOnLoad = async () => {
      try {
        const isAuth = await API.isAuthenticated();
        if (isAuth) {
          await syncPoints();
        }
      } catch (error) {
        console.log('⚠️ Could not sync points on load:', error.message);
      }
    };
    syncPointsOnLoad();
  }, []);

  /**
   * Load user data from local storage
   */
  const loadUserData = async () => {
    try {
      console.log('📱 Loading user data from storage...');
      const userData = await AsyncStorage.getItem('userData');
      
      let loadedUser;
      
      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log('✅ User data loaded from storage:', parsedUser);
        console.log('📱 Loaded firstName:', parsedUser.firstName);
        console.log('📱 Loaded lastName:', parsedUser.lastName);
        console.log('📱 Loaded email:', parsedUser.email);
        console.log('📱 Loaded phone:', parsedUser.phone);
        console.log('📱 Loaded profileImage:', parsedUser.profileImage);
        console.log('📱 Loaded profileImageUrl:', parsedUser.profileImageUrl);
        
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
              console.log('📥 User authenticated, syncing with backend to get latest profile data...');
              const backendProfile = await API.getProfile();
              if (backendProfile) {
                console.log('📥 Backend profile data:', backendProfile);
                // Merge backend data, prioritizing backend values for profile image and other fields
                // This ensures profile image saved to backend is loaded
                const mergedUser = {
                  ...loadedUser,
                  // Use backend values if they exist and are non-empty, otherwise keep local
                  firstName: (backendProfile.firstName && backendProfile.firstName.trim()) ? backendProfile.firstName : (loadedUser.firstName || ''),
                  lastName: (backendProfile.lastName && backendProfile.lastName.trim()) ? backendProfile.lastName : (loadedUser.lastName || ''),
                  phone: (backendProfile.phone && backendProfile.phone.trim()) ? backendProfile.phone : (loadedUser.phone || ''),
                  email: (backendProfile.email && backendProfile.email.trim()) ? backendProfile.email : (loadedUser.email || ''),
                  // IMPORTANT: Prioritize backend profile image to ensure it's loaded
                  profileImage: backendProfile.profileImage || backendProfile.profileImageUrl || loadedUser.profileImage || null,
                  profileImageUrl: backendProfile.profileImageUrl || backendProfile.profileImage || loadedUser.profileImageUrl || null,
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
                console.log('✅ Merged backend data with local data, profileImage:', mergedUser.profileImage);
              } else {
                console.log('⚠️ Backend profile is null (404), keeping local data only');
              }
            }
          } catch (backendError) {
            console.warn('⚠️ Could not fetch from backend:', backendError.message);
            // Continue with local data - don't overwrite anything
          }
        }
        
        console.log('📱 Final loaded user object:', {
          firstName: loadedUser.firstName,
          lastName: loadedUser.lastName,
          phone: loadedUser.phone,
          email: loadedUser.email,
          profileImage: loadedUser.profileImage,
        });
        
        setUser(loadedUser);
        return loadedUser;
      } else {
        console.log('📱 No user data found in storage');
        // CRITICAL: Don't overwrite existing user state if storage is empty
        // If user state already has data (from previous load or context), preserve it
        // Only update isLoading flag
        setUser(prev => {
          // If we have data in memory, preserve it
          // Only clear if this is truly the initial state (no data anywhere)
          const hasDataInMemory = prev.firstName || prev.lastName || prev.email || prev.phone || prev.profileImage;
          if (hasDataInMemory) {
            console.log('⚠️ Storage empty but data exists in memory - preserving memory data');
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
          console.log('⚠️ Error loading but data exists in memory - preserving memory data');
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
      console.log('💾 Saving user data:', userData);
      console.log('💾 Current user state before save:', user);
      console.log('💾 firstName in userData:', userData.firstName);
      console.log('💾 lastName in userData:', userData.lastName);
      
      // CRITICAL: Load existing data from storage first to preserve it
      // This prevents overwriting data when only partial updates are sent
      let existingData = {};
      try {
        const storedData = await AsyncStorage.getItem('userData');
        if (storedData) {
          existingData = JSON.parse(storedData);
          console.log('💾 Loaded existing data from storage to preserve:', {
            firstName: existingData.firstName,
            lastName: existingData.lastName,
            email: existingData.email,
            phone: existingData.phone,
            profileImage: existingData.profileImage,
          });
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
        isLoggedIn: true, 
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
      console.log('💾 Updated user object:', updatedUser);
      console.log('💾 Updated firstName:', updatedUser.firstName);
      console.log('💾 Updated lastName:', updatedUser.lastName);
      console.log('💾 Updated email:', updatedUser.email);
      console.log('💾 Updated phone:', updatedUser.phone);
      console.log('💾 Updated profileImage:', updatedUser.profileImage);
      setUser(updatedUser);
      
      // Save to local storage
      const dataToSave = JSON.stringify(updatedUser);
      console.log('💾 Data being saved to storage:', dataToSave);
      await AsyncStorage.setItem('userData', dataToSave);
      console.log('✅ User data saved to local storage');
      
      // Verify what was actually saved
      const verifyData = await AsyncStorage.getItem('userData');
      const parsedVerify = JSON.parse(verifyData);
      console.log('🔍 Verification - data in storage:', verifyData);
      console.log('🔍 Verification - parsed firstName:', parsedVerify?.firstName);
      console.log('🔍 Verification - parsed lastName:', parsedVerify?.lastName);
      console.log('🔍 Verification - parsed email:', parsedVerify?.email);
      console.log('🔍 Verification - parsed profileImage:', parsedVerify?.profileImage);
      
      // Save to AWS backend if requested and user is authenticated
      if (saveToBackend) {
        try {
          const isAuth = await API.isAuthenticated();
          if (isAuth) {
            console.log('🌐 Saving profile to Supabase backend...');
            // Send the complete updated user data to backend, not just userData
            // This ensures all fields (firstName, lastName, email, phone, etc.) are saved
            await API.saveProfile({
              firstName: updatedUser.firstName,
              lastName: updatedUser.lastName,
              email: updatedUser.email,
              phone: updatedUser.phone,
              profileImage: updatedUser.profileImage || updatedUser.profileImageUrl,
              profileImageUrl: updatedUser.profileImageUrl || updatedUser.profileImage,
            });
            console.log('✅ Profile saved to Supabase backend');
          } else {
            console.log('⚠️ User not authenticated, skipping backend save');
          }
        } catch (backendError) {
          // Handle different error types gracefully
          // Check both response.status and error.status (in case error was enhanced)
          const status = backendError.response?.status || backendError.status;
          const errorMessage = backendError.message || '';
          const errorData = backendError.response?.data || backendError.data;
          
          if (status === 404) {
            // Endpoint not implemented - this is expected and handled gracefully
            console.log('⚠️ Save profile endpoint not implemented yet (404) - data saved locally only');
          } else if (status === 401) {
            // User not authenticated - token expired or invalid
            console.log('⚠️ User authentication expired - data saved locally only');
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
   * Add points to user account (with backend sync)
   */
  const addPoints = async (pointsToAdd, type = 'earned', description = '') => {
    try {
      console.log(`🎯 Adding ${pointsToAdd} points. Current: ${user.points}`);
      
      // Try to add points via backend API
      try {
        const isAuth = await API.isAuthenticated();
        if (isAuth) {
          const response = await API.addPoints(pointsToAdd, type, description);
          const newPoints = response.points || (user.points + pointsToAdd);
          
          // Update local state
          const updatedUser = { ...user, points: newPoints };
          setUser(updatedUser);
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          
          console.log(`✅ Points added via backend. New total: ${newPoints}`);
          return newPoints;
        }
      } catch (apiError) {
        console.warn('⚠️ Backend points API failed, using local storage:', apiError.message);
        // Fall through to local storage fallback
      }
      
      // Fallback to local storage if backend fails or user not authenticated
      const currentUserData = await AsyncStorage.getItem('userData');
      const currentUser = currentUserData ? JSON.parse(currentUserData) : user;
      
      const newPoints = (currentUser.points || 0) + pointsToAdd;
      const updatedUser = { ...currentUser, points: newPoints };
      
      console.log(`🎯 Updated user object for points (local):`, updatedUser);
      setUser(updatedUser);
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
      
      console.log(`✅ Points updated locally. New total: ${newPoints}`);
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
        
        // Update local state if different
        if (backendPoints !== user.points) {
          const updatedUser = { ...user, points: backendPoints };
          setUser(updatedUser);
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          console.log(`✅ Points synced from backend: ${backendPoints}`);
        }
        
        return backendPoints;
      }
    } catch (error) {
      console.warn('⚠️ Could not sync points from backend:', error.message);
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
   * Upload profile picture to Supabase storage with compression
   */
  const uploadProfilePicture = async (imageUri) => {
    try {
      console.log('📸 Uploading profile picture...');
      
      // Check if user is authenticated before attempting Supabase upload
      const isAuth = await API.isAuthenticated();
      let imageUrl = imageUri; // Default to local URI
      
      if (isAuth) {
        console.log('📸 Compressing and uploading profile picture to Supabase storage...');
        
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
        
        // Upload to backend Supabase storage endpoint
        try {
          const response = await API.uploadProfilePicture(compressedImage.uri);
          if (response.success) {
            imageUrl = response.profileImageUrl || response.imageUrl;
            console.log('✅ Profile picture uploaded to Supabase storage:', imageUrl);
          }
        } catch (uploadError) {
          // Handle expected error (endpoint not implemented)
          if (uploadError.message === 'UPLOAD_ENDPOINT_NOT_IMPLEMENTED') {
            console.log('⚠️ Profile picture upload endpoint not available, using local URI');
          } else {
            console.error('❌ Error uploading profile picture:', uploadError);
            console.log('📸 Falling back to local URI');
          }
        }
      } else {
        console.log('⚠️ User not authenticated, using local URI');
      }
      
      // Just return the image URL - don't save here
      // The caller (handleUpdate) will save everything together using saveUserData
      return { imageUrl };
    } catch (error) {
      console.error('❌ Error in uploadProfilePicture:', error);
      // Return local URI as fallback
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
        // Load local data first to preserve it
        const localData = await AsyncStorage.getItem('userData');
        const localUser = localData ? JSON.parse(localData) : user;
        
        const backendProfile = await API.getProfile();
        console.log('📥 Backend profile data:', backendProfile);
        
        // If backend profile is null (404), just use local data
        if (!backendProfile) {
          console.log('⚠️ No backend profile found, using local data only');
          return localUser;
        }
        
        // Merge: local data (preserve) -> backend data (update)
        // Only use backend values if they're actually present and not empty
        // This prevents overwriting local data with empty backend values
        const mergedUser = {
          ...localUser,  // Start with local data (preserve existing)
          // Explicitly preserve local values - only use backend if it has a value
          // This prevents empty backend values from overwriting local data
          firstName: (backendProfile.firstName && backendProfile.firstName.trim()) ? backendProfile.firstName : localUser.firstName || '',
          lastName: (backendProfile.lastName && backendProfile.lastName.trim()) ? backendProfile.lastName : localUser.lastName || '',
          email: (backendProfile.email && backendProfile.email.trim()) ? backendProfile.email : localUser.email || '',
          phone: (backendProfile.phone && backendProfile.phone.trim()) ? backendProfile.phone : localUser.phone || '',
          profileImage: backendProfile.profileImage || backendProfile.profileImageUrl || localUser.profileImage || localUser.profileImageUrl || null,
          profileImageUrl: backendProfile.profileImageUrl || backendProfile.profileImage || localUser.profileImageUrl || localUser.profileImage || null,
          // Preserve other local fields that might not be in backend
          points: localUser.points ?? user.points ?? 0,
          monthlyDonation: localUser.monthlyDonation ?? user.monthlyDonation ?? 15,
          totalSavings: localUser.totalSavings ?? user.totalSavings ?? 0,
          isLoggedIn: localUser.isLoggedIn ?? true,
          isVerified: backendProfile.is_verified !== undefined ? (backendProfile.is_verified === 1 || backendProfile.is_verified === true) : (localUser.isVerified ?? false),
          isLoading: false,
        };
        
        setUser(mergedUser);
        await AsyncStorage.setItem('userData', JSON.stringify(mergedUser));
        
        console.log('✅ User data synced with backend');
        console.log('📥 Merged user data:', {
          firstName: mergedUser.firstName,
          lastName: mergedUser.lastName,
          email: mergedUser.email,
          phone: mergedUser.phone,
        });
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
      await AsyncStorage.multiRemove([
        'authToken',
        'userData',
        'selectedBeneficiary',
        'beneficiaryFavorites',
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
      await AsyncStorage.multiRemove([
        'authToken',
        'userData',
        'selectedBeneficiary',
        'beneficiaryFavorites',
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
      if (!response) {
        console.log('⚠️ No profile found, skipping verification check');
        return;
      }
      
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