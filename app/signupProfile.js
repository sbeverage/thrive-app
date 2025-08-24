// app/signupProfile.js

import React, { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SignupProfile() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profileImage, setProfileImage] = useState(null);

  // Use static gradient colors for now
  const gradientColors = ["#2C3E50", "#4CA1AF"];

  const handlePhoneChange = (text) => {
    const cleaned = ('' + text).replace(/\D/g, '');
    let formattedNumber = cleaned;

    if (cleaned.length >= 1) {
      formattedNumber = '(' + cleaned.slice(0, 3);
    }
    if (cleaned.length >= 4) {
      formattedNumber += ') ' + cleaned.slice(3, 6);
    }
    if (cleaned.length >= 7) {
      formattedNumber += '-' + cleaned.slice(6, 10);
    }
    setPhoneNumber(formattedNumber);
  };

  const handleContinue = () => {
    router.push('/signupFlow/explainerDonate');
  };

  // Helper to get initials
  const getInitials = () => {
    if (!firstName && !lastName) return '';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  // Image picker handler
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
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
            <Text style={styles.initials}>{getInitials() || <Feather name="user" size={40} color="#324E58" />}</Text>
          </View>
        )}
        <View style={styles.plusIconWrapper}>
          <AntDesign name="pluscircle" size={32} color="#db8633" />
        </View>
      </TouchableOpacity>
            <View style={{ width: '100%' }}>
      <TextInput
        placeholder="First Name"
        value={firstName}
        onChangeText={setFirstName}
        style={styles.input}
        placeholderTextColor="#6d6e72"
        autoCapitalize="words"
      />
      <TextInput
        placeholder="Last Name"
        value={lastName}
        onChangeText={setLastName}
        style={styles.input}
        placeholderTextColor="#6d6e72"
        autoCapitalize="words"
      />
      <TextInput
        placeholder="Phone Number"
        value={phoneNumber}
        onChangeText={handlePhoneChange}
        style={styles.input}
        placeholderTextColor="#6d6e72"
        keyboardType="phone-pad"
      />
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
  input: {
    height: 48,
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    marginBottom: 20,
    fontSize: 16,
    color: '#324E58',
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
