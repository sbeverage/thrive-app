import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

export default function OneTimeDonationCard() {
  const [amount, setAmount] = useState('');
  const predefined = [10, 15, 25, 50, 100, 250, 500];

  const handleAmountSelect = (val) => {
    setAmount(val.toString());
  };

  const handleInputChange = (text) => {
    const sanitized = text.replace(/[^0-9]/g, '');
    setAmount(sanitized);
  };

  const handleSubmit = () => {
    if (!amount || parseInt(amount) <= 0) return;
    alert(`🎉 Thank you for donating $${amount}!`);
    setAmount('');
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Give a One-Time Donation</Text>
      
      <View style={styles.inputWrapper}>
        <Text style={styles.dollar}>$</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter other amount"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={amount}
          onChangeText={handleInputChange}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.amountScroll}
      >
        {predefined.map((val) => (
          <TouchableOpacity
            key={val}
            style={[
              styles.amountBtn,
              amount === val.toString() && styles.amountSelected,
            ]}
            onPress={() => handleAmountSelect(val)}
          >
            <Text
              style={[
                styles.amountText,
                amount === val.toString() && styles.amountTextSelected,
              ]}
            >
              ${val}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitText}>Send Onetime Gift</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#123A36',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,   
    borderBottomRightRadius: 20,  
    padding: 20,
    paddingBottom: 30,
    marginTop: 24,
    marginHorizontal: 16,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  inputWrapper: {
    backgroundColor: '#fff',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  dollar: {
    fontSize: 16,
    color: '#999',
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    paddingLeft: 6,
    color: '#333',
  },
  amountScroll: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  amountBtn: {
    borderWidth: 1,
    borderColor: '#DB8633',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  amountSelected: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
  },
  amountText: {
    color: '#DB8633',
    fontWeight: '600',
    fontSize: 14,
  },
  amountTextSelected: {
    color: '#D0861F',
  },
  submitBtn: {
    backgroundColor: '#88A5A5',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
