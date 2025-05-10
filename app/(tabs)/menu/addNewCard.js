import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function AddNewCard() {
  const router = useRouter();
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveInfo, setSaveInfo] = useState(false);

  const handleAddCard = () => {
    if (!cardNumber || !cardHolder || !expiry || !cvv) {
      Alert.alert('Missing Fields', 'Please fill out all the fields.');
      return;
    }

    Alert.alert('✅ Card Added!', 'Your card has been saved.', [
      { text: 'OK', onPress: () => router.replace('/menu/manageCards') },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.replace('/menu/manageCards')}>
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Card</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Card Number</Text>
            <TextInput
              placeholder="1234 5678 9012 3456"
              placeholderTextColor="#999"
              style={styles.input}
              value={cardNumber}
              onChangeText={setCardNumber}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Card Holder Name</Text>
            <TextInput
              placeholder="John Doe"
              placeholderTextColor="#999"
              style={styles.input}
              value={cardHolder}
              onChangeText={setCardHolder}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.fieldGroup, styles.halfInput]}>
              <Text style={styles.label}>Expiry</Text>
              <TextInput
                placeholder="MM/YY"
                placeholderTextColor="#999"
                style={styles.input}
                value={expiry}
                onChangeText={setExpiry}
              />
            </View>

            <View style={[styles.fieldGroup, styles.halfInput]}>
              <Text style={styles.label}>CVV</Text>
              <TextInput
                placeholder="123"
                placeholderTextColor="#999"
                style={styles.input}
                value={cvv}
                onChangeText={setCvv}
                secureTextEntry
              />
            </View>
          </View>

          {/* Save Info */}
          <View style={styles.checkboxRow}>
            <Switch
              value={saveInfo}
              onValueChange={setSaveInfo}
              thumbColor={saveInfo ? '#DB8633' : '#ccc'}
              trackColor={{ false: '#ccc', true: '#f5c89e' }}
            />
            <Text style={styles.checkboxLabel}>Use this information for my future use</Text>
          </View>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <TouchableOpacity style={styles.addButton} onPress={handleAddCard}>
        <Text style={styles.addButtonText}>Add Card</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#324E58',
  },
  form: {
    gap: 24,
  },
  fieldGroup: {
    marginBottom: 0,
  },
  label: {
    fontSize: 16,
    color: '#324E58',
    fontWeight: '500',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F5F5FA',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#324E58',
    borderWidth: 1,
    borderColor: '#e1e1e5',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  halfInput: {
    flex: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#324E58',
    flex: 1,
    flexWrap: 'wrap',
  },
  addButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    marginHorizontal: 24,
    borderRadius: 10,
    marginBottom: 30,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
