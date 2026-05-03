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
import { getCallingCode } from 'react-native-country-picker-modal';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from './context/UserContext';
import { useLocalSearchParams } from 'expo-router';
import API from './lib/api';
import { persistSignupFlowCheckpoint } from './utils/signupFlowCheckpoint';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

/** Regional-indicator pair — always visible (react-native-country-picker Flag can render empty briefly). */
function countryCodeToFlagEmoji(code) {
  if (!code || typeof code !== 'string' || code.length < 2) return '\u{1F3F3}\u{FE0F}';
  const cc = code.toUpperCase().slice(0, 2);
  return String.fromCodePoint(
    127397 + cc.charCodeAt(0),
    127397 + cc.charCodeAt(1),
  );
}

const phoneFlagChevronStyles = StyleSheet.create({
  flagAndChevron: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexShrink: 0,
  },
  flagEmoji: {
    fontSize: 22,
    lineHeight: 26,
    marginRight: 8,
  },
  callingPrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
    marginRight: 6,
    letterSpacing: 0.2,
  },
});

function PhoneFlagAndChevron({ countryCode, callingDigits }) {
  return (
    <View style={phoneFlagChevronStyles.flagAndChevron}>
      <Text style={phoneFlagChevronStyles.flagEmoji} allowFontScaling={false}>
        {countryCodeToFlagEmoji(countryCode)}
      </Text>
      <Text style={phoneFlagChevronStyles.callingPrefix}>+{callingDigits}</Text>
      <Feather name="chevron-down" size={17} color="#324E58" />
    </View>
  );
}

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
  /** Keeps flag image in sync with PhoneInput’s country (default matches defaultCode). */
  const [phoneCountryCode, setPhoneCountryCode] = useState('US');
  /** Shown next to flag immediately; US/CA NANP = 1 before async getCallingCode runs. */
  const [phoneCallingDigits, setPhoneCallingDigits] = useState('1');
  const phoneInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const digits = await getCallingCode(phoneCountryCode);
        if (!cancelled && digits) setPhoneCallingDigits(String(digits));
      } catch {
        if (!cancelled) setPhoneCallingDigits('1');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phoneCountryCode]);
  /** After Continue, `saveUserData` updates context; without this, the "complete profile" guard would send unverified users to home instead of /verifyEmail. */
  const suppressCompleteProfileRedirectRef = useRef(false);

  // Guard: only if they truly should not be on this screen (verified + saved profile incl. phone).
  // Do not redirect on name-only OAuth prefetch — this screen still collects phone and submits to /verifyEmail.
  useEffect(() => {
    if (suppressCompleteProfileRedirectRef.current) return;
    if (!user?.isLoggedIn || !user?.isVerified) return;
    if (!user?.firstName?.trim() || !user?.lastName?.trim() || !user?.phone?.trim()) return;
    console.log('👤 [PROFILE_FLOW] Profile already complete on server, redirecting to home');
    router.replace('/(tabs)/home');
  }, [
    user?.isLoggedIn,
    user?.isVerified,
    user?.firstName,
    user?.lastName,
    user?.phone,
    router,
  ]);

  useEffect(() => {
    if (email) {
      persistSignupFlowCheckpoint('/signupProfile', { email });
    }
  }, [email]);

  // Log email extraction for debugging
  useEffect(() => {
    // Pre-fill form fields from user context if available (e.g. from social login)
    if (user) {
      if (user.firstName && !firstName) setFirstName(user.firstName);
      if (user.lastName && !lastName) setLastName(user.lastName);
      if (user.profileImage && !profileImage) setProfileImage(user.profileImage);
    }
  }, [user?.firstName, user?.lastName, user?.profileImage]);

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
      // Get email from params, user context, or existing user data
      const emailToSave = email || user?.email || '';

      if (!emailToSave) {
        Alert.alert('Error', 'No email found for this account. Please try signing up again.');
        return;
      }

      // After this point, `saveUserData` will refresh context; suppress the "complete profile" effect
      // so unverified users are not sent to home before /verifyEmail.
      suppressCompleteProfileRedirectRef.current = true;

      // Prepare profile data
      const profileData = {
        firstName,
        lastName,
        phone: phoneFormatted,
        email: emailToSave, // Use the determined email
      };
      
      // Upload profile picture if selected
      if (profileImage) {
        try {
          const uploadResult = await uploadProfilePicture(profileImage);
          profileData.profileImage = uploadResult.imageUrl;
          profileData.profileImageUrl = uploadResult.imageUrl;
        } catch (uploadError) {
          console.error('❌ Profile picture upload failed:', uploadError);
          Alert.alert(
            'Photo Upload Failed',
            'Your profile was saved, but the photo could not be uploaded. You can add it later from Edit Profile.',
            [{ text: 'OK' }]
          );
          // Continue without image
        }
      }
      
      // Save profile data (this will save both locally and to backend)
      const savedUserData = await saveUserData({ ...profileData }, true);

      // Send verification email again after profile save so greeting uses the
      // real first/last name instead of falling back to email local-part.
      try {
        await API.resendVerification(emailToSave, firstName.trim());
        console.log('📧 Verification email sent with user name');
      } catch (emailError) {
        // Non-blocking — user can request a resend from the verify screen
        console.warn('⚠️ Verification email send failed (user can resend):', emailError.message);
      }

      // Advance pending route so a mid-flow close resumes at verification
      await persistSignupFlowCheckpoint('/verifyEmail', { email: emailToSave });

      // Replace so a stale "complete profile" guard cannot win a stack race against push → /verifyEmail
      router.replace({
        pathname: '/verifyEmail',
        params: { email: emailToSave },
      });
    } catch (error) {
      console.error('❌ Error saving profile:', error);
      suppressCompleteProfileRedirectRef.current = false;
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
            onChangeCountry={(country) => setPhoneCountryCode(country.cca2)}
            containerStyle={styles.phoneInputContainer}
            textContainerStyle={styles.phoneTextContainer}
            textInputStyle={styles.phoneTextInput}
            codeTextStyle={styles.phoneCodeTextHidden}
            flagButtonStyle={styles.phoneFlagButton}
            countryPickerButtonStyle={styles.phoneFlagButton}
            countryPickerProps={{
              withEmoji: true,
              renderFlagButton: () => null,
            }}
            renderDropdownImage={
              <PhoneFlagAndChevron
                countryCode={phoneCountryCode}
                callingDigits={phoneCallingDigits}
              />
            }
            textInputProps={{
              placeholderTextColor: '#6d6e72',
              ...(Platform.OS === 'android'
                ? { textAlignVertical: 'center', includeFontPadding: false }
                : {}),
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
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 24,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: '90%',
    maxWidth: 340,
    alignSelf: 'center',
    marginTop: 18,
    marginBottom: 12,
    alignItems: 'center',
    zIndex: 2,
  },
  profileImageWrapper: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignSelf: 'center',
    marginBottom: 18,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#f5f5fa',
    borderWidth: 2,
    borderColor: '#324E58',
  },
  profileImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
    resizeMode: 'cover',
  },
  profilePlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#E5E5E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontSize: 36,
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
    marginBottom: 16,
    width: '100%',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 6,
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
    minHeight: 48,
  },
  /** Override library wp(80)/wp(20) so the flag column and number field share space predictably. */
  phoneInputContainer: {
    width: '100%',
    minHeight: 48,
    height: 48,
    backgroundColor: 'transparent',
    alignItems: 'stretch',
  },
  phoneTextContainer: {
    flex: 1,
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  phoneTextInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 22,
    color: '#324E58',
    height: 48,
    paddingVertical: 0,
    paddingLeft: 0,
    paddingRight: 0,
    margin: 0,
  },
  /** Library still mounts +code Text in layout="first"; pull it out of flex flow so digits align. */
  phoneCodeTextHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    left: -200,
    fontSize: 1,
  },
  /** Fixed width overrides react-native-phone-number-input flagButtonView width: wp(20). */
  phoneFlagButton: {
    width: 128,
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: 10,
    paddingRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  optionalText: {
    color: '#6d6e72',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 14,
    fontStyle: 'italic',
  },
  continueButton: {
    backgroundColor: '#db8633',
    borderRadius: 8,
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  gradientAbsoluteBg: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.45, zIndex: 0, overflow: 'hidden' },
  gradientBg: { width: SCREEN_WIDTH, height: '100%', borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  piggyWelcomeColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 52,
    marginBottom: 8,
    zIndex: 1,
  },
  piggyLarge: { width: 76, height: 76, resizeMode: 'contain', marginBottom: 14 },
  headerTextWhite: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  subheaderTextWhite: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '400',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 28,
  },
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
