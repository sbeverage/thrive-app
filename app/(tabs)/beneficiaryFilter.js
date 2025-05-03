import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import RNPickerSelect from 'react-native-picker-select';

export default function BeneficiaryFilter() {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');

  const handleApplyFilters = () => {
    // You can pass these filters to previous screen via router or a shared state/store
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={router.back}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#324E58', marginLeft: 16 }}>
          Filter
        </Text>
      </View>

      {/* Search Location */}
      <Text style={{ fontSize: 14, color: '#324E58', marginBottom: 6 }}>Search nearby you</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F9', borderRadius: 12, paddingHorizontal: 12, marginBottom: 20, height: 48 }}>
        <TextInput
          placeholder="Search Location"
          placeholderTextColor="#999"
          value={location}
          onChangeText={setLocation}
          style={{ flex: 1, fontSize: 14, color: '#324E58' }}
        />
        <AntDesign name="enviromento" size={20} color="#DB8633" />
      </View>

      {/* Category Dropdown */}
      <Text style={{ fontSize: 14, color: '#324E58', marginBottom: 6 }}>Beneficiary Cause</Text>
      <View style={{ backgroundColor: '#F8F8F9', borderRadius: 12, marginBottom: 20, height: 48, justifyContent: 'center' }}>
        <RNPickerSelect
          onValueChange={setCategory}
          placeholder={{ label: 'Select Category', value: null }}
          items={[
            { label: 'Childhood Illness', value: 'childhood' },
            { label: 'Animal Welfare', value: 'animal' },
            { label: 'Low Income Families', value: 'income' },
          ]}
          style={pickerStyles}
        />
      </View>

      {/* Type Dropdown */}
      <Text style={{ fontSize: 14, color: '#324E58', marginBottom: 6 }}>Beneficiary Type</Text>
      <View style={{ backgroundColor: '#F8F8F9', borderRadius: 12, marginBottom: 40, height: 48, justifyContent: 'center' }}>
        <RNPickerSelect
          onValueChange={setType}
          placeholder={{ label: 'Select Type', value: null }}
          items={[
            { label: 'Non-Profit', value: 'nonprofit' },
            { label: 'Foundation', value: 'foundation' },
            { label: 'Community Org', value: 'community' },
          ]}
          style={pickerStyles}
        />
      </View>

      {/* Apply Filters Button */}
      <TouchableOpacity
        onPress={handleApplyFilters}
        style={{ backgroundColor: '#DB8633', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
      >
        <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Apply Filters</Text>
      </TouchableOpacity>
    </View>
  );
}

const pickerStyles = {
  inputIOS: {
    paddingHorizontal: 12,
    color: '#324E58',
    fontSize: 14,
  },
  placeholder: {
    color: '#999',
  },
};
