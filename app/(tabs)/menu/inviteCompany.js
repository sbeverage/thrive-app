import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import API from '../../lib/api';

// ✅ Phone Formatter Function
const formatPhoneNumber = (value) => {
  const cleaned = value.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);

  if (!match) return value;

  let formatted = '';
  if (match[1]) formatted = `(${match[1]}`;
  if (match[2]) formatted += `) ${match[2]}`;
  if (match[3]) formatted += `-${match[3]}`;

  return formatted;
};

export default function InviteCompany() {
  const router = useRouter();

  const [contactName, setContactName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!contactName || !companyName || !companyEmail || !companyPhone || !webUrl) {
      Alert.alert('Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await API.submitVendorInvitation({
        contact_name: contactName,
        company_name: companyName,
        email: companyEmail,
        phone: companyPhone,
        website: webUrl,
      });

      Alert.alert('✅ Invitation Sent!', 'Thank you for referring a business.');
      setTimeout(() => router.push('/(tabs)/menu'), 1500);
    } catch (error) {
      console.error('❌ Error submitting invitation:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to send invitation. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Standardized Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Image 
              source={require('../../../assets/icons/arrow-left.png')} 
              style={{ width: 24, height: 24, tintColor: '#324E58' }} 
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Invitation</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.speechWrapper}>
          <Image
            source={require('../../../assets/images/bolt-piggy.png')}
            style={styles.piggyIcon}
          />
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>
              Invite a vendor to offer discounts and get a chance to win extra +100 points
            </Text>
          </View>
          <View style={styles.speechBubbleTail} />
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Contact Name"
            placeholderTextColor="#6d6e72"
            value={contactName}
            onChangeText={setContactName}
            style={styles.searchInput}
          />
        </View>
        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Company Name"
            placeholderTextColor="#6d6e72"
            value={companyName}
            onChangeText={setCompanyName}
            style={styles.searchInput}
          />
        </View>
        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Company Email"
            placeholderTextColor="#6d6e72"
            value={companyEmail}
            onChangeText={setCompanyEmail}
            keyboardType="email-address"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Company Phone"
            placeholderTextColor="#6d6e72"
            value={companyPhone}
            onChangeText={(text) => setCompanyPhone(formatPhoneNumber(text))}
            keyboardType="phone-pad"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Web URL"
            placeholderTextColor="#6d6e72"
            value={webUrl}
            onChangeText={setWebUrl}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/menu')}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} 
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Send Invitation</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.contactText}>
          Don't have enough data,{' '}
          <Text style={styles.contactUs}>Contact Us</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 5,
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
  speechWrapper: {
    flexDirection: 'row',
    marginBottom: 24,
    alignItems: 'center',
  },
  piggyIcon: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
    marginRight: 10,
  },
  speechBubble: {
    backgroundColor: '#f5f5fa',
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  speechBubbleTail: {
    position: 'absolute',
    left: -8,
    top: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderBottomWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f5f5fa',
    borderTopColor: 'transparent',
  },
  speechText: {
    fontSize: 16,
    color: '#324E58',
    lineHeight: 22,
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  cancelText: {
    color: '#DB8633',
    fontSize: 16,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  contactText: {
    marginTop: 28,
    textAlign: 'center',
    color: '#324E58',
  },
  contactUs: {
    color: '#DB8633',
    fontWeight: '600',
  },
  backButton: {
    // Standard back button with no custom styling
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
});
