// File: app/(tabs)/beneficiaryFilter.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { Feather, AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBeneficiaryFilter } from '../../context/BeneficiaryFilterContext';

const typeOptions = ['Small', 'Medium', 'Large'];
const causeOptions = [
  'Childhood Illness',
  'Foster Care',
  'Disabilities',
  'Mental Health',
  'Animal Welfare',
  'Anti-Human Trafficking',
  'Rehabilitation',
  'Low Income Families',
  'Education',
];
const emergencyOptions = [
  'Myanmar Earthquake',
  '2025 U.S. South/Midwest Tornadoes',
  'Kentucky Flooding',
];

export default function BeneficiaryFilter() {
  const { filters, updateFilters } = useBeneficiaryFilter();
  const [isCauseDropdownOpen, setIsCauseDropdownOpen] = useState(false);
  const [isEmergencyDropdownOpen, setIsEmergencyDropdownOpen] = useState(false);
  const router = useRouter();

  const handleApplyFilters = () => {
    // Filters are already updated in state via the form inputs
    // Navigate back to beneficiary page
    router.back();
  };

  const renderOptions = (options, selected, setSelected) => (
    <View style={styles.optionsContainer}>
      {options.map((option) => (
        <TouchableOpacity
          key={option}
          style={[styles.option, selected === option && styles.optionSelected]}
          onPress={() => setSelected(option)}
        >
          <Text style={[styles.optionText, selected === option && styles.optionTextSelected]}>
            {option}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Back Navigation */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Image 
          source={require('../../../assets/icons/arrow-left.png')} 
          style={{ width: 24, height: 24, tintColor: '#324E58' }} 
        />
      </TouchableOpacity>

      {/* Title */}
      <Text style={styles.header}>Filter Beneficiaries</Text>

      {/* Search Input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Search nearby you</Text>
        <View style={styles.inputRow}>
          <TextInput
            placeholder="Search Location"
            placeholderTextColor="#6d6e72"
            value={filters.location}
            onChangeText={(text) => updateFilters({ location: text })}
            style={styles.input}
          />
          <Feather name="crosshair" size={20} color="#666" style={styles.icon} />
        </View>
      </View>

      {/* Favorites Filter */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Show favorites only</Text>
        <TouchableOpacity
          style={[styles.favoritesToggle, filters.showFavorites && styles.favoritesToggleActive]}
          onPress={() => updateFilters({ showFavorites: !filters.showFavorites })}
        >
          <View style={styles.favoritesToggleContent}>
            {filters.showFavorites ? (
              <AntDesign 
                name="heart" 
                size={20} 
                color="#D0861F" 
              />
            ) : (
              <Image 
                source={require('../../../assets/icons/heart.png')} 
                style={{ width: 20, height: 20, tintColor: '#D0861F' }} 
              />
            )}
            <Text style={[styles.favoritesToggleText, filters.showFavorites && styles.favoritesToggleTextActive]}>
              {filters.showFavorites ? 'Showing Favorites Only' : 'Show All Favorites'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Cause Dropdown */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Beneficiary cause</Text>
        <TouchableOpacity
          style={styles.dropdownToggle}
          onPress={() => setIsCauseDropdownOpen(!isCauseDropdownOpen)}
        >
          <Text style={styles.dropdownToggleText}>{filters.cause || 'Select Category'}</Text>
          <Feather name={isCauseDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
        </TouchableOpacity>
        {isCauseDropdownOpen && (
          <ScrollView style={styles.dropdownScroll}>
            {causeOptions.map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.dropdownItem, filters.cause === option && styles.dropdownItemSelected]}
                onPress={() => {
                  updateFilters({ cause: option });
                  setIsCauseDropdownOpen(false);
                }}
              >
                <Text style={[styles.optionText, filters.cause === option && styles.optionTextSelected]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Size Options */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Size of the organization</Text>
        {renderOptions(typeOptions, filters.type, (type) => updateFilters({ type }))}
      </View>

      {/* Emergency Dropdown */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Who needs help now?</Text>
        <TouchableOpacity
          style={styles.dropdownToggle}
          onPress={() => setIsEmergencyDropdownOpen(!isEmergencyDropdownOpen)}
        >
          <Text style={styles.dropdownToggleText}>{filters.emergency || 'Choose an Emergency Relief Program'}</Text>
          <Feather name={isEmergencyDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
        </TouchableOpacity>
        {isEmergencyDropdownOpen && (
          <ScrollView style={styles.dropdownScroll}>
            {emergencyOptions.map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.dropdownItem, filters.emergency === option && styles.dropdownItemSelected]}
                onPress={() => {
                  updateFilters({ emergency: option });
                  setIsEmergencyDropdownOpen(false);
                }}
              >
                <Text style={[styles.optionText, filters.emergency === option && styles.optionTextSelected]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Continue Button */}
      <TouchableOpacity style={styles.button} onPress={handleApplyFilters}>
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
  backButton: {
    marginBottom: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#324E58',
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
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 0,
  },
  option: {
    backgroundColor: '#f5f5fa',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    marginRight: 8,
    marginTop: 0,
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
    backgroundColor: '#db8633',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Favorites Toggle Styles
  favoritesToggle: {
    backgroundColor: '#f5f5fa',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
  },
  favoritesToggleActive: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
  },
  favoritesToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  favoritesToggleText: {
    fontSize: 16,
    color: '#324E58',
    fontWeight: '500',
  },
  favoritesToggleTextActive: {
    color: '#D0861F',
    fontWeight: '600',
  },
});
