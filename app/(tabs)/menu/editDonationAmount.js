import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';

export default function EditDonationAmount() {
  const router = useRouter();
  const { user, saveUserData } = useUser();
  const [currentAmount, setCurrentAmount] = useState(user.monthlyDonation?.toString() || '15');
  const [newAmount, setNewAmount] = useState(user.monthlyDonation?.toString() || '15');
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = async () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 15) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount of $15 or more.');
      return;
    }

    if (amount > 1000) {
      Alert.alert('Amount Too High', 'Please enter an amount of $1,000 or less.');
      return;
    }

    try {
      // Save the new donation amount to user context
      await saveUserData({ monthlyDonation: amount });
      
      setCurrentAmount(newAmount);
      setIsEditing(false);
      
      Alert.alert(
        '✅ Amount Updated!',
        `Your monthly donation amount has been updated to $${newAmount}.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('❌ Error saving donation amount:', error);
      Alert.alert('Error', 'Failed to save donation amount. Please try again.');
    }
  };

  const handleCancel = () => {
    setNewAmount(currentAmount);
    setIsEditing(false);
  };

  const quickAmounts = [15, 25, 50, 75, 100, 150];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Standardized Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/menu')}>
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Donation Amount</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Current Amount Display */}
        <View style={styles.currentAmountSection}>
          <Text style={styles.sectionTitle}>Current Monthly Donation</Text>
          <View style={styles.amountDisplay}>
            <Text style={styles.currencySymbol}>$</Text>
            <Text style={styles.currentAmountText}>{currentAmount}</Text>
            <Text style={styles.perMonthText}>/month</Text>
          </View>
        </View>

        {/* Edit Section */}
        <View style={styles.editSection}>
          <Text style={styles.sectionTitle}>New Monthly Amount</Text>
          
          {isEditing ? (
            <View style={styles.editMode}>
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencyLabel}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={newAmount}
                  onChangeText={setNewAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#999"
                  autoFocus
                />
              </View>
              
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
              <AntDesign name="edit" size={20} color="#DB8633" />
              <Text style={styles.editButtonText}>Change Amount</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Amount Selection */}
        <View style={styles.quickAmountsSection}>
          <Text style={styles.sectionTitle}>Quick Amounts</Text>
          <View style={styles.quickAmountsGrid}>
            {quickAmounts.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.quickAmountButton,
                  parseFloat(newAmount) === amount && styles.selectedQuickAmount
                ]}
                onPress={() => {
                  setNewAmount(amount.toString());
                  if (!isEditing) setIsEditing(true);
                }}
              >
                <Text style={[
                  styles.quickAmountText,
                  parseFloat(newAmount) === amount && styles.selectedQuickAmountText
                ]}>
                  ${amount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Information Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Monthly Donations</Text>
          <Text style={styles.infoText}>
            • Your donation amount will be charged monthly on the same date
          </Text>
          <Text style={styles.infoText}>
            • You can change this amount at any time
          </Text>
          <Text style={styles.infoText}>
            • Changes take effect immediately for the next billing cycle
          </Text>
          <Text style={styles.infoText}>
            • Minimum donation: $15 per month
          </Text>
        </View>
      </ScrollView>
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
    paddingTop: 20,
    paddingBottom: 100,
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
  currentAmountSection: {
    backgroundColor: '#F5F5FA',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 16,
  },
  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: '#DB8633',
    marginRight: 4,
  },
  currentAmountText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#DB8633',
  },
  perMonthText: {
    fontSize: 18,
    color: '#666',
    marginLeft: 8,
  },
  editSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editMode: {
    gap: 20,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  currencyLabel: {
    fontSize: 24,
    fontWeight: '600',
    color: '#324E58',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#324E58',
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  cancelButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#DB8633',
  },
  saveButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: '#F5F5FA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
  },
  quickAmountsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickAmountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickAmountButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5FA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 80,
    alignItems: 'center',
  },
  selectedQuickAmount: {
    backgroundColor: '#DB8633',
    borderColor: '#DB8633',
  },
  quickAmountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
  },
  selectedQuickAmountText: {
    color: '#fff',
  },
  infoSection: {
    backgroundColor: '#F5F5FA',
    borderRadius: 12,
    padding: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
});
