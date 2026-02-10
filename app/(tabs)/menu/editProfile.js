import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '../../context/UserContext';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, loadUserData, saveUserData, uploadProfilePicture } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fieldsInitialized, setFieldsInitialized] = useState(false);

  // Load user data on mount and when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  // Update form fields when user data loads
  useEffect(() => {
    // Only update fields once when user data is first loaded
    // This prevents clearing fields if user data is temporarily empty or changes
    if (user && !fieldsInitialized) {
      const hasData = user.firstName || user.lastName || user.email || user.phone;
      if (hasData) {
        // Capitalize names when loading
        const capitalizeName = (name) => {
          if (!name) return '';
          return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        };
        setFirstName(capitalizeName(user.firstName || ''));
        setLastName(capitalizeName(user.lastName || ''));
        setPhone(user.phone || '');
        setEmail(user.email || '');
        setProfileImage(user.profileImage || user.profileImageUrl || null);
        setFieldsInitialized(true);
        setIsLoading(false);
      } else {
        // User object exists but has no data yet - wait a bit and try again
        const timer = setTimeout(() => {
          if (!fieldsInitialized) {
            setIsLoading(false);
          }
        }, 500);
        return () => clearTimeout(timer);
      }
    } else if (user && !fieldsInitialized) {
      // User object loaded but we haven't initialized fields yet
      setIsLoading(false);
    }
  }, [user, fieldsInitialized]);

  // Image picker handler - just store the image, don't save yet
  const pickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Just store the image URI in state - don't save yet
        // It will be saved when user clicks "Update Changes"
        const imageUri = result.assets[0].uri;
        setProfileImage(imageUri);
      }
    } catch (error) {
      console.error('❌ Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  // Helper to get initials
  const getInitials = () => {
    if (!firstName && !lastName) {
      if (user?.firstName && user?.lastName) {
        return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
      }
      if (user?.email) {
        return user.email[0].toUpperCase();
      }
      return 'U';
    }
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  // Format phone number as user types: (XXX) XXX-XXXX
  const handlePhoneChange = (text) => {
    // Remove all non-digits
    const cleaned = text.replace(/\D/g, '');
    let formattedNumber = cleaned;

    // Format: (XXX) XXX-XXXX
    if (cleaned.length >= 1) {
      formattedNumber = '(' + cleaned.slice(0, 3);
    }
    if (cleaned.length >= 4) {
      formattedNumber += ') ' + cleaned.slice(3, 6);
    }
    if (cleaned.length >= 7) {
      formattedNumber += '-' + cleaned.slice(6, 10);
    }
    setPhone(formattedNumber);
  };

  // Capitalize first letter of name (proper capitalization)
  const handleFirstNameChange = (text) => {
    if (text.length === 0) {
      setFirstName('');
      return;
    }
    // Ensure first letter is uppercase, rest lowercase for proper capitalization
    const capitalized = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    setFirstName(capitalized);
  };

  // Capitalize first letter of last name (proper capitalization)
  const handleLastNameChange = (text) => {
    if (text.length === 0) {
      setLastName('');
      return;
    }
    // Ensure first letter is uppercase, rest lowercase for proper capitalization
    const capitalized = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    setLastName(capitalized);
  };

  const handleUpdate = async () => {
    try {
      setIsUploading(true);
      
      // Load current user data to preserve existing values
      await loadUserData();
      
      // Prepare profile data - always include current form values
      // saveUserData will merge with existing data, so we include all fields
      const profileData = {
        firstName: firstName.trim() || user?.firstName || '',
        lastName: lastName.trim() || user?.lastName || '',
        phone: phone.trim() || user?.phone || '',
        // Don't update email - it's read-only
        email: user?.email || '',
      };

      // If profile image was selected, upload it first
      if (profileImage && !profileImage.startsWith('http')) {
        // Image is a local URI, need to upload it
        try {
          const uploadResult = await uploadProfilePicture(profileImage);
          if (uploadResult && uploadResult.imageUrl) {
            profileData.profileImage = uploadResult.imageUrl;
            profileData.profileImageUrl = uploadResult.imageUrl;
          } else {
            // If upload fails, keep the local URI
            profileData.profileImage = profileImage;
            profileData.profileImageUrl = profileImage;
          }
        } catch (uploadError) {
          console.error('❌ Profile picture upload failed:', uploadError);
          // Keep the local image even if upload fails
          profileData.profileImage = profileImage;
          profileData.profileImageUrl = profileImage;
        }
      } else if (profileImage) {
        // Image is already a URL, just use it
        profileData.profileImage = profileImage;
        profileData.profileImageUrl = profileImage;
      }

      // Save to backend and local storage
      // saveUserData will merge with existing data, preserving all fields
      await saveUserData(profileData, true);
      
      Alert.alert('🎉 Changes Saved!', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Standardized Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.imageContainer}>
        {profileImage ? (
          <Image source={{ uri: profileImage }} style={styles.profileImage} />
        ) : (
          <View style={[styles.profileImage, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>
              {getInitials()}
            </Text>
          </View>
        )}
        <TouchableOpacity 
          style={styles.imageIcon} 
          onPress={pickImage}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#888" />
          ) : (
            <AntDesign name="picture" size={20} color="#888" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.rowInputs}>
        <View style={styles.searchContainerHalf}>
          <TextInput
            style={styles.searchInput}
            placeholder="First Name"
            placeholderTextColor="#6d6e72"
            value={firstName}
            onChangeText={handleFirstNameChange}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.searchContainerHalf}>
          <TextInput
            style={styles.searchInput}
            placeholder="Last Name"
            placeholderTextColor="#6d6e72"
            value={lastName}
            onChangeText={handleLastNameChange}
            autoCapitalize="words"
          />
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Phone"
          placeholderTextColor="#6d6e72"
          value={phone}
          onChangeText={handlePhoneChange}
          keyboardType="phone-pad"
          maxLength={14}
        />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, styles.emailInputDisabled]}
          placeholder="Email"
          placeholderTextColor="#6d6e72"
          value={email}
          editable={false}
          keyboardType="email-address"
        />
      </View>

      <TouchableOpacity 
        style={[styles.saveButton, (isUploading || isLoading) && styles.saveButtonDisabled]} 
        onPress={handleUpdate}
        disabled={isUploading || isLoading}
      >
        {isUploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>Update Changes</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 20,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 5,
  },
  backButton: {
    // Standard back button with no custom styling
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6d6e72',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 32,
  },
  imageContainer: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    resizeMode: 'cover',
  },
  imageIcon: {
    position: 'absolute',
    bottom: 0,
    right: -5,
    backgroundColor: '#f1f1f1',
    padding: 6,
    borderRadius: 16,
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  searchContainerHalf: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#324E58',
  },
  saveButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#DB8633',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  emailInputDisabled: {
    backgroundColor: '#E5E7EB',
    color: '#6B7280',
  },
});
