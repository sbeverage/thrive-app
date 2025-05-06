import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Switch,
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
      {
        text: 'OK',
        onPress: () => router.replace('/menu/manageCards'),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.replace('/menu/manageCards')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Card</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Form Fields */}
      <View style={styles.form}>
        <TextInput
          placeholder="Card Number"
          placeholderTextColor="#888"
          style={styles.input}
          value={cardNumber}
          onChangeText={setCardNumber}
          keyboardType="numeric"
        />
        <TextInput
          placeholder="Card Holder Name"
          placeholderTextColor="#888"
          style={styles.input}
          value={cardHolder}
          onChangeText={setCardHolder}
        />
        <View style={styles.row}>
          <TextInput
            placeholder="Expiry"
            placeholderTextColor="#888"
            style={[styles.input, styles.halfInput]}
            value={expiry}
            onChangeText={setExpiry}
          />
          <TextInput
            placeholder="CVV"
            placeholderTextColor="#888"
            style={[styles.input, styles.halfInput]}
            value={cvv}
            onChangeText={setCvv}
            secureTextEntry
          />
        </View>

        {/* Save Info */}
        <View style={styles.checkboxRow}>
          <Switch
            value={saveInfo}
            onValueChange={setSaveInfo}
            thumbColor={saveInfo ? '#DB8633' : '#ccc'}
            trackColor={{ false: '#ccc', true: '#f5c89e' }}
          />
          <Text style={styles.checkboxLabel}>
            Use this information for my future use
          </Text>
        </View>
      </View>

      {/* Submit Button */}
      <TouchableOpacity style={styles.addButton} onPress={handleAddCard}>
        <Text style={styles.addButtonText}>Add Card</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#324E58' },
  form: { paddingHorizontal: 20, marginTop: 30 },
  input: {
    backgroundColor: '#F5F5FA',
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    color: '#324E58',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    flex: 0.48,
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
  },
  addButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    marginTop: 40,
    marginHorizontal: 20,
    borderRadius: 10,
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
