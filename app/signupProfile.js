// app/signupProfile.js

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import PhoneInput from 'react-native-phone-number-input';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from './context/UserContext';
import { useLocalSearchParams } from 'expo-router';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SignupProfile() {
  const router = useRouter();
  const params = useLocalSearchParams();
  // Handle email param - it might be a string or array
  const emailParam = params?.email;
  const email = Array.isArray(emailParam) ? emailParam[0] : (emailParam || '');
  const { saveUserData, uploadProfilePicture, user } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNational, setPhoneNational] = useState('');
  const [phoneFormatted, setPhoneFormatted] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const phoneInputRef = useRef(null);

  // Log email extraction for debugging
  useEffect(() => {
    console.log('📧 SignupProfile - Email from params:', email);
    console.log('📧 SignupProfile - All params:', params);
    console.log('📧 SignupProfile - User email:', user?.email);
    
    // Initialize fields from user context if available (e.g. from social login)
    if (user) {
      if (user.firstName && !firstName) setFirstName(user.firstName);
      if (user.lastName && !lastName) setLastName(user.lastName);
      if (user.profileImage && !profileImage) setProfileImage(user.profileImage);
    }
  }, [email, params, user]);

  // Use static gradient colors for now
  const gradientColors = ["#2C3E50", "#4CA1AF"];

  // Filter to letters only (plus spaces, hyphens, apostrophes for names like Mary-Jane, O'Brien)
  const filterAlphabetic = (text) => text.replace(/[^a-zA-Z\s\-']/g, '');

  // Capitalize first letter of name (proper capitalization)
  const handleFirstNameChange = (text) => {
    const filtered = filterAlphabetic(text);
    if (filtered.length === 0) {
      setFirstName('');
      return;
    }
    const capitalized = filtered.charAt(0).toUpperCase() + filtered.slice(1).toLowerCase();
    setFirstName(capitalized);
  };

  // Capitalize first letter of last name (proper capitalization)
  const handleLastNameChange = (text) => {
    const filtered = filterAlphabetic(text);
    if (filtered.length === 0) {
      setLastName('');
      return;
    }
    const capitalized = filtered.charAt(0).toUpperCase() + filtered.slice(1).toLowerCase();
    setLastName(capitalized);
  };

  const handleContinue = async () => {
    // Validate required fields
    if (!firstName.trim()) {
      Alert.alert('Required Field', 'Please enter your first name.');
      return;
    }
    
    if (!lastName.trim()) {
      Alert.alert('Required Field', 'Please enter your last name.');
      return;
    }
    
    if (!phoneNational.trim()) {
      Alert.alert('Required Field', 'Please enter your phone number.');
      return;
    }

    // Validate phone number is valid using the ref
    const isValid = phoneInputRef.current?.isValidNumber(phoneNational);
    if (!isValid) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid phone number.');
      return;
    }
    
    try {
      console.log('💾 Starting profile save process...');
      console.log('📧 Email from params:', email);
      console.log('📧 Email from user context:', user?.email);
      
      // Get email from params, user context, or existing user data
      const emailToSave = email || user?.email || '';
      console.log('📧 Email to save:', emailToSave);
      
      if (!emailToSave) {
        console.warn('⚠️ No email found - this should not happen during signup');
      }
      
      // Prepare profile data
      const profileData = {
        firstName,
        lastName,
        phone: phoneFormatted,
        email: emailToSave, // Use the determined email
      };
      
      console.log('💾 Profile data to save:', profileData);
      
      // Upload profile picture if selected
      if (profileImage) {
        try {
          console.log('📸 Uploading profile picture...');
          const uploadResult = await uploadProfilePicture(profileImage);
          profileData.profileImage = uploadResult.imageUrl; // Use profileImage instead of profileImageUrl
          profileData.profileImageUrl = uploadResult.imageUrl; // Keep both for compatibility
        } catch (uploadError) {
          console.error('❌ Profile picture upload failed:', uploadError);
          // Continue without image - user can add later
        }
      }
      
      // Save profile data (this will save both locally and to backend)
      const savedUserData = await saveUserData({ ...profileData }, true);
      
      // Navigate directly to email verification page with email
      router.push({
        pathname: '/verifyEmail',
        params: { email: email }
      });
    } catch (error) {
      console.error('❌ Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
  };

  // Helper to get initials
  const getInitials = () => {
    if (!firstName && !lastName) return '';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  // Image picker with native crop (allowsEditing - works in Expo Go)
  const pickImage = async () => {
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
      setProfileImage(result.assets[0].uri);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Static gradient background */}
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
    >
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'flex-start' }} keyboardShouldPersistTaps="handled">
          <View style={styles.piggyWelcomeColumn}>
            <Image source={require('../assets/images/bolt-piggy.png')} style={styles.piggyLarge} />
            <Text style={styles.headerTextWhite}>WELCOME</Text>
            <Text style={styles.subheaderTextWhite}>We're so excited to meet you.</Text>
        </View>
          <View style={styles.infoCard}>
      <TouchableOpacity style={styles.profileImageWrapper} onPress={pickImage} activeOpacity={0.8}>
        {profileImage ? (
          <Image source={{ uri: profileImage }} style={styles.profileImage} />
        ) : (
          <View style={styles.profilePlaceholder}>
            {getInitials() ? (
              <Text style={styles.initials}>{getInitials()}</Text>
            ) : (
              <Feather name="user" size={40} color="#324E58" />
            )}
          </View>
        )}
        <View style={styles.plusIconWrapper}>
          <Image 
            source={require('../assets/icons/add.png')} 
            style={{ width: 28, height: 28, tintColor: '#324E58' }} 
          />
        </View>
      </TouchableOpacity>
      <Text style={styles.optionalText}>Profile photo (optional)</Text>
            <View style={{ width: '100%' }}>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>
          First Name <Text style={styles.requiredAsterisk}>*</Text>
        </Text>
        <TextInput
          placeholder="Enter your first name"
          value={firstName}
          onChangeText={handleFirstNameChange}
          style={[styles.input, !firstName.trim() && styles.inputRequired]}
          placeholderTextColor="#6d6e72"
          autoCapitalize="words"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>
          Last Name <Text style={styles.requiredAsterisk}>*</Text>
        </Text>
        <TextInput
          placeholder="Enter your last name"
          value={lastName}
          onChangeText={handleLastNameChange}
          style={[styles.input, !lastName.trim() && styles.inputRequired]}
          placeholderTextColor="#6d6e72"
          autoCapitalize="words"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>
          Phone Number <Text style={styles.requiredAsterisk}>*</Text>
        </Text>
        <View
          style={[
            styles.phoneFieldWrap,
            !phoneNational.trim() && styles.inputRequired,
          ]}
        >
          <PhoneInput
            ref={phoneInputRef}
            defaultCode="US"
            layout="first"
            placeholder="Phone number"
            onChangeText={setPhoneNational}
            onChangeFormattedText={setPhoneFormatted}
            containerStyle={styles.phoneInputContainer}
            textContainerStyle={styles.phoneTextContainer}
            textInputStyle={styles.phoneTextInput}
            codeTextStyle={styles.phoneCodeText}
            flagButtonStyle={styles.phoneFlagButton}
            countryPickerButtonStyle={styles.phoneFlagButton}
            textInputProps={{
              placeholderTextColor: '#6d6e72',
            }}
          />
        </View>
      </View>
            </View>
            <View style={{ width: '100%' }}>
              <TouchableOpacity 
                style={styles.continueButton} 
                onPress={handleContinue}
                activeOpacity={0.8}
              >
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
            </View>
          </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#fff',
    paddingTop: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    marginBottom: 0,
    paddingHorizontal: 10,
  },
  piggySmall: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
    marginRight: 16,
    marginTop: 0,
  },
  headerTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  headerText: { color: '#21555B', fontSize: 28, fontWeight: '800', letterSpacing: 1.5, marginBottom: 2, textAlign: 'center' },
  subheaderText: { color: '#21555B', fontSize: 16, fontWeight: '400', marginBottom: 18, textAlign: 'center' },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: '90%',
    maxWidth: 340,
    alignSelf: 'center',
    marginTop: 40,
    marginBottom: 10,
    alignItems: 'center',
    zIndex: 2,
  },
  profileImageWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: 'center',
    marginBottom: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#f5f5fa',
    borderWidth: 2,
    borderColor: '#324E58',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    resizeMode: 'cover',
  },
  profilePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E5E5E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontSize: 40,
    color: '#324E58',
    fontWeight: '700',
  },
  plusIconWrapper: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 2,
    zIndex: 2,
  },
  inputGroup: {
    marginBottom: 20,
    width: '100%',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: '#DC2626',
    fontWeight: '700',
  },
  input: {
    height: 48,
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#324E58',
  },
  inputRequired: {
    borderColor: '#db8633',
    borderWidth: 2,
  },
  phoneFieldWrap: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    backgroundColor: '#f5f5fa',
    overflow: 'hidden',
  },
  phoneInputContainer: {
    width: '100%',
    height: 48,
    backgroundColor: 'transparent',
  },
  phoneTextContainer: {
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingRight: 12,
    borderRadius: 0,
  },
  phoneTextInput: {
    fontSize: 16,
    color: '#324E58',
    height: 48,
    paddingVertical: 0,
  },
  phoneCodeText: {
    fontSize: 16,
    color: '#324E58',
    fontWeight: '600',
  },
  phoneFlagButton: {
    width: 52,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  optionalText: {
    color: '#6d6e72',
    fontSize: 14,
    textAlign: 'center',
    marginTop: -20,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  continueButton: {
    backgroundColor: '#db8633',
    borderRadius: 8,
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  gradientAbsoluteBg: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.45, zIndex: 0, overflow: 'hidden' },
  gradientBg: { width: SCREEN_WIDTH, height: '100%', borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  piggyWelcomeColumn: { alignItems: 'center', justifyContent: 'center', marginTop: 60, marginBottom: 10, zIndex: 1 },
  piggyLarge: { width: 90, height: 90, resizeMode: 'contain', marginRight: 16, marginBottom: 24 },
  headerTextWhite: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: 1.5, marginBottom: 2, textAlign: 'center' },
  subheaderTextWhite: { color: '#fff', fontSize: 19, fontWeight: '400', marginBottom: 4, textAlign: 'center' },
  speechBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  piggyIcon: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
    marginRight: 16,
  },
  speechBubble: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  speechBubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
    marginLeft: -10,
  },
  speechNormal: {
    color: '#21555B',
    fontSize: 16,
    fontWeight: '400',
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    padding: 10,
  },
});
