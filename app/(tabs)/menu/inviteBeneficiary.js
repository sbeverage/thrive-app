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
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

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

  const handleSubmit = () => {
    if (!contactName || !companyName || !companyEmail || !companyPhone || !webUrl) {
      Alert.alert('Please fill in all required fields.');
      return;
    }
    Alert.alert('✅ Invitation Sent!', 'Thank you for referring a charity.');
    setTimeout(() => router.push('/(tabs)/menu'), 1500);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>

        <Text style={styles.header}>Send Invitation</Text>

        <View style={styles.speechWrapper}>
          <Image
            source={require('../../../assets/images/bolt-piggy.png')}
            style={styles.piggyIcon}
          />
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>
              Bring in a charity, boost their donations and unlock +100 bonus points for yourself!
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

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitText}>Send Invitation</Text>
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
    padding: 24,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 16,
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
    position: 'absolute',
    top: 20,
    left: 20,
    padding: 10,
  },
});
