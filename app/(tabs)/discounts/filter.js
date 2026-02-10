import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Feather, AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const radiusOptions = ['1 mile', '5 miles', '10 miles', '25 miles'];
const typeOptions = ['Percentage', 'Buy One Get One', 'Free Item'];
const categoryOptions = [
  'Coffee Shop', 'Electronics', 'Shopping Store', 'Fitness',
  'Health & Wellness', 'Beauty', 'Restaurants', 'Fast Food',
  'Entertainment', 'Travel', 'Home Services', 'Automotive',
  'Clothing', 'Grocery', 'Books & Stationery', 'Coworking'
];
const availabilityOptions = ['In-Store', 'Online', 'Both'];

export default function FilterScreen() {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  const renderHorizontalOptions = (options, selected, setSelected) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
      {options.map((option) => (
        <TouchableOpacity
          key={option}
          style={[
            styles.optionPill,
            selected === option && styles.optionSelected,
          ]}
          onPress={() => setSelected(option)}
        >
          <Text
            style={[
              styles.optionText,
              selected === option && styles.optionTextSelected,
            ]}
          >
            {option}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => router.push('/(tabs)/discounts')} style={styles.closeButton}>
        <AntDesign name="close" size={24} color="#21555b" />
      </TouchableOpacity>

      <Text style={styles.header}>Filters for discount</Text>

      {/* Search Input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Search discount near by you</Text>
        <View style={styles.inputRow}>
          <TextInput
            placeholder="Search Location"
            placeholderTextColor="#6d6e72"
            value={location}
            onChangeText={setLocation}
            style={styles.input}
          />
          <Feather name="crosshair" size={20} color="#666" style={styles.icon} />
        </View>
      </View>

      {/* Radius */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Select radius</Text>
        {renderHorizontalOptions(radiusOptions, radius, setRadius)}
      </View>

      {/* Discount Type */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Discount type</Text>
        {renderHorizontalOptions(typeOptions, type, setType)}
      </View>

      {/* Availability */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Availability</Text>
        {renderHorizontalOptions(availabilityOptions, availability, setAvailability)}
      </View>

      {/* Category Dropdown */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Discount category</Text>
        <TouchableOpacity
          style={styles.dropdownToggle}
          onPress={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
        >
          <Text style={styles.dropdownToggleText}>{category || 'Select Category'}</Text>
          <Feather name={isCategoryDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
        </TouchableOpacity>
        {isCategoryDropdownOpen && (
          <ScrollView style={styles.dropdownScroll}>
            {categoryOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.dropdownItem,
                  category === option && styles.dropdownItemSelected,
                ]}
                onPress={() => {
                  setCategory(option);
                  setIsCategoryDropdownOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    category === option && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/discounts')}>
        <Text style={styles.buttonText}>Apply Filters</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#21555b',
    marginTop: 48,
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    color: '#324E58',
    fontWeight: '500',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#324E58',
  },
  icon: {
    marginLeft: 8,
  },
  scrollRow: {
    flexDirection: 'row',
  },
  optionPill: {
    backgroundColor: '#f5f5fa',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    marginRight: 8,
  },
  optionSelected: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
  },
  optionText: {
    fontSize: 14,
    color: '#666',
  },
  optionTextSelected: {
    color: '#D0861F',
    fontWeight: '600',
  },
  dropdownToggle: {
    backgroundColor: '#f5f5fa',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownToggleText: {
    fontSize: 16,
    color: '#324E58',
  },
  dropdownScroll: {
    maxHeight: 180,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingVertical: 4,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5fa',
    borderWidth: 1,
    borderColor: '#e1e1e5',
    marginVertical: 4,
    marginHorizontal: 4,
  },
  dropdownItemSelected: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
  },
  button: {
    backgroundColor: '#D0861F',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
