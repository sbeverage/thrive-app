// File: app/(tabs)/beneficiaryFilter.js

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Feather, AntDesign, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBeneficiaryFilter } from '../../context/BeneficiaryFilterContext';
import { useLocation } from '../../context/LocationContext';

const typeOptions = ['Small', 'Medium', 'Large'];
// Must match the categories used in the charities table
const causeOptions = [
  'Animal Welfare',
  'Arts & Culture',
  'Childhood Illness',
  'Disabilities',
  'Disaster Relief',
  'Education',
  'Elderly Care',
  'Environment',
  'Healthcare',
  'Homelessness',
  'Hunger Relief',
  'International Aid',
  'Low Income Families',
  'Veterans',
  'Youth Development',
];

export default function BeneficiaryFilter() {
  const { filters, updateFilters } = useBeneficiaryFilter();
  const [isCauseDropdownOpen, setIsCauseDropdownOpen] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const debounceRef = useRef(null);
  const { locationAddress, refreshLocation, locationPermission, checkLocationPermission } = useLocation();
  const router = useRouter();

  const handleLocationChange = (text) => {
    updateFilters({ location: text });
    setLocationSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&addressdetails=1&limit=5&countrycodes=us`,
          { headers: { 'User-Agent': 'ThriveApp/1.0' } }
        );
        const data = await res.json();
        const suggestions = data
          .filter(r => r.address?.city || r.address?.town || r.address?.village || r.address?.county)
          .map(r => {
            const city = r.address?.city || r.address?.town || r.address?.village || r.address?.county || '';
            const state = r.address?.state || '';
            return city && state ? `${city}, ${state}` : null;
          })
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 5);
        setLocationSuggestions(suggestions);
      } catch {}
    }, 400);
  };

  // Pre-fill location with current location on first open if not already set.
  // Depends on locationAddress so it fires when GPS resolves after mount.
  useEffect(() => {
    if (!filters.location && locationAddress?.city && locationAddress?.state) {
      updateFilters({ location: `${locationAddress.city}, ${locationAddress.state}` });
    }
  }, [locationAddress]);

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
        <Text style={styles.label}>Search near you</Text>
        <View style={styles.inputRow}>
          <MaterialIcons name="place" size={22} color="#DB8633" style={{ marginRight: 6 }} />
          <TextInput
            placeholder="City, State"
            placeholderTextColor="#aaa"
            value={filters.location}
            onChangeText={handleLocationChange}
            style={styles.input}
            autoCapitalize="words"
          />
          {filters.location.length > 0 && (
            <TouchableOpacity onPress={() => { updateFilters({ location: '' }); setLocationSuggestions([]); }} style={{ padding: 4, marginRight: 4 }}>
              <Feather name="x-circle" size={18} color="#bbb" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={async () => {
              if (locationPermission !== 'granted') { checkLocationPermission(); return; }
              setIsLoadingLocation(true);
              await refreshLocation();
              setIsLoadingLocation(false);
              if (locationAddress?.city && locationAddress?.state) {
                updateFilters({ location: `${locationAddress.city}, ${locationAddress.state}` });
                setLocationSuggestions([]);
              }
            }}
            style={styles.iconTouchable}
          >
            {isLoadingLocation
              ? <ActivityIndicator size="small" color="#DB8633" />
              : <Feather name="navigation" size={20} color="#DB8633" />
            }
          </TouchableOpacity>
        </View>
        {locationSuggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            {locationSuggestions.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.suggestionRow}
                onPress={() => { updateFilters({ location: s }); setLocationSuggestions([]); }}
              >
                <MaterialIcons name="place" size={18} color="#DB8633" style={{ marginRight: 6 }} />
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  iconTouchable: {
    padding: 6,
    marginLeft: 4,
  },
  suggestionsBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    marginTop: 6,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#324E58',
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
