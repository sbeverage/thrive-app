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
    Alert.alert('✅ Invitation Sent!', 'Thank you for referring a business.');
    setTimeout(() => router.push('/(tabs)/menu'), 1500);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.header}>Send Invitation</Text>

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
        </View>

        <TextInput
          style={styles.input}
          placeholder="Contact Name"
          value={contactName}
          onChangeText={setContactName}
          placeholderTextColor="#888"
        />
        <TextInput
          style={styles.input}
          placeholder="Company Name"
          value={companyName}
          onChangeText={setCompanyName}
          placeholderTextColor="#888"
        />
        <TextInput
          style={styles.input}
          placeholder="Company Email"
          value={companyEmail}
          onChangeText={setCompanyEmail}
          placeholderTextColor="#888"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Company Phone"
          value={companyPhone}
          onChangeText={(text) => setCompanyPhone(formatPhoneNumber(text))}
          placeholderTextColor="#888"
          keyboardType="phone-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Web URL"
          value={webUrl}
          onChangeText={setWebUrl}
          placeholderTextColor="#888"
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/menu')}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitText}>Send Invitation</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.contactText}>
          Don’t have enough data,{' '}
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 12,
    flex: 1,
  },
  speechText: {
    fontSize: 14,
    color: '#324E58',
  },
  input: {
    backgroundColor: '#f5f7f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 14,
    marginBottom: 16,
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
});
