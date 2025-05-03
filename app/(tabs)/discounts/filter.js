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
  'Clothing', 'Grocery', 'Books & Stationery'
];
const availabilityOptions = ['In-Store', 'Online', 'Both'];

export default function FilterScreen() {
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const router = useRouter();

  const renderOptions = (options, selected, setSelected, scrollable = false) => {
    const content = options.map((option) => (
      <TouchableOpacity
        key={option}
        style={[styles.option, selected === option && styles.optionSelected]}
        onPress={() => setSelected(option)}
      >
        <Text style={[styles.optionText, selected === option && styles.optionTextSelected]}>
          {option}
        </Text>
      </TouchableOpacity>
    ));

    return scrollable ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
        {content}
      </ScrollView>
    ) : (
      <View style={styles.optionsContainer}>{content}</View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => router.push('/(tabs)/discounts')} style={styles.closeButton}>
        <AntDesign name="close" size={24} color="#21555b" />
      </TouchableOpacity>

      <Text style={styles.header}>Filters for discount</Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Search discount near by you</Text>
        <View style={styles.inputRow}>
          <TextInput
            placeholder="Search Location"
            placeholderTextColor="#aaa"
            value={location}
            onChangeText={setLocation}
            style={styles.input}
          />
          <Feather name="crosshair" size={20} color="#666" style={styles.icon} />
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Select radius</Text>
        {renderOptions(radiusOptions, radius, setRadius, true)}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Discount type</Text>
        {renderOptions(typeOptions, type, setType, true)}
      </View>

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
            {categoryOptions.map(option => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.dropdownItem,
                  category === option && styles.dropdownItemSelected
                ]}
                onPress={() => {
                  setCategory(option);
                  setIsCategoryDropdownOpen(false);
                }}
              >
                <Text style={[
                  styles.optionText,
                  category === option && styles.optionTextSelected
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Availability</Text>
        {renderOptions(availabilityOptions, availability, setAvailability, true)}
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
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#21555b',
    marginBottom: 16,
    marginTop: 48,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
    color: '#000',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: '#000',
  },
  icon: {
    marginLeft: 8,
  },
  scrollRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    backgroundColor: '#f4f4f4',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginRight: 8,
  },
  optionSelected: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
    borderWidth: 1,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f4f4f4',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  dropdownToggleText: {
    fontSize: 14,
    color: '#666',
  },
  dropdownScroll: {
    maxHeight: 160,
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
    borderRadius: 12,
    marginHorizontal: 4,
    marginVertical: 4,
    backgroundColor: '#f4f4f4',
  },
  dropdownItemSelected: {
    backgroundColor: '#FFF5EB',
    borderWidth: 1,
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
