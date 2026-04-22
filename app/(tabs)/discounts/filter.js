import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Feather, AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDiscountFilter } from '../../context/DiscountFilterContext';
import { useLocation } from '../../context/LocationContext';
import { useDiscount } from '../../context/DiscountContext';

const radiusOptions = ['1 mile', '5 miles', '10 miles', '25 miles'];
const typeOptions = [
  { label: 'Percentage', value: 'Percentage' },
  { label: 'Fixed Amount', value: 'Fixed Amount' },
  { label: 'Buy 1 Get 1', value: 'Buy 1 Get 1' },
  { label: 'Free', value: 'Free' },
];
const availabilityOptions = ['In-Store', 'Online', 'Both'];

export default function FilterScreen() {
  const router = useRouter();
  const { filters, updateFilters, clearFilters, hasActiveFilters } = useDiscountFilter();
  const { locationAddress, refreshLocation, locationPermission, checkLocationPermission } = useLocation();
  const { vendors } = useDiscount();

  const [location, setLocation] = useState(filters.location || '');
  const [radius, setRadius] = useState(filters.radius || '');
  const [type, setType] = useState(filters.type || '');
  const [availability, setAvailability] = useState(filters.availability || '');
  const [category, setCategory] = useState(filters.category || '');
  const [showFavorites, setShowFavorites] = useState(filters.showFavorites || false);

  const categoryOptions = useMemo(() => {
    if (!vendors) return [];
    const cats = new Set();
    vendors.forEach(v => {
      if (v.category) cats.add(v.category);
      if (v.tags && Array.isArray(v.tags)) v.tags.forEach(t => { if (t) cats.add(t); });
    });
    return Array.from(cats).sort();
  }, [vendors]);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const debounceRef = useRef(null);

  // Pre-fill location with current location on first open if not already set
  useEffect(() => {
    if (!filters.location && locationAddress?.city && locationAddress?.state) {
      setLocation(`${locationAddress.city}, ${locationAddress.state}`);
    }
  }, []);

  const handleUseCurrentLocation = async () => {
    if (locationPermission !== 'granted') {
      checkLocationPermission();
      return;
    }
    setIsLoadingLocation(true);
    await refreshLocation();
    setIsLoadingLocation(false);
    if (locationAddress?.city && locationAddress?.state) {
      const loc = `${locationAddress.city}, ${locationAddress.state}`;
      setLocation(loc);
      setLocationSuggestions([]);
    }
  };

  const handleLocationChange = (text) => {
    setLocation(text);
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

  const handleApplyFilters = () => {
    updateFilters({ location, radius, type, availability, category, showFavorites });
    router.back();
  };

  const handleClearFilters = () => {
    clearFilters();
    setLocation('');
    setRadius('');
    setType('');
    setAvailability('');
    setCategory('');
    setShowFavorites(false);
    setLocationSuggestions([]);
  };

  const renderPills = (options, selected, setSelected) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
      {options.map((opt) => {
        const label = typeof opt === 'string' ? opt : opt.label;
        const value = typeof opt === 'string' ? opt : opt.value;
        const isSelected = selected === value;
        return (
          <TouchableOpacity
            key={value}
            style={[styles.pill, isSelected && styles.pillSelected]}
            onPress={() => setSelected(isSelected ? '' : value)}
          >
            <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
        <AntDesign name="close" size={24} color="#21555b" />
      </TouchableOpacity>

      <Text style={styles.header}>Filter Discounts</Text>

      {/* Location */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Search near a location</Text>
        <View style={styles.inputRow}>
          <Feather name="map-pin" size={18} color="#DB8633" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="City, State"
            placeholderTextColor="#aaa"
            value={location}
            onChangeText={handleLocationChange}
            style={styles.input}
            autoCapitalize="words"
          />
          {location.length > 0 && (
            <TouchableOpacity onPress={() => { setLocation(''); setLocationSuggestions([]); }} style={styles.clearX}>
              <AntDesign name="closecircle" size={16} color="#bbb" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleUseCurrentLocation} style={styles.iconTouchable}>
            {isLoadingLocation
              ? <ActivityIndicator size="small" color="#DB8633" />
              : <Feather name="crosshair" size={20} color="#DB8633" />
            }
          </TouchableOpacity>
        </View>
        {locationSuggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            {locationSuggestions.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.suggestionRow}
                onPress={() => { setLocation(s); setLocationSuggestions([]); }}
              >
                <Feather name="map-pin" size={14} color="#DB8633" style={{ marginRight: 8 }} />
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Radius */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Select radius</Text>
        {renderPills(radiusOptions, radius, setRadius)}
      </View>

      {/* Show Favorites Only */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Show favorites only</Text>
        <TouchableOpacity
          style={[styles.favToggle, showFavorites && styles.favToggleActive]}
          onPress={() => setShowFavorites(p => !p)}
        >
          {showFavorites
            ? <AntDesign name="heart" size={18} color="#D0861F" />
            : <Image source={require('../../../assets/icons/heart.png')} style={{ width: 18, height: 18, tintColor: '#D0861F' }} />
          }
          <Text style={[styles.favToggleText, showFavorites && styles.favToggleTextActive]}>
            {showFavorites ? 'Showing Favorites Only' : 'Show All Favorites'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Discount Type */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Discount type</Text>
        {renderPills(typeOptions, type, setType)}
      </View>

      {/* Availability */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Availability</Text>
        {renderPills(availabilityOptions, availability, setAvailability)}
      </View>

      {/* Category */}
      {categoryOptions.length > 0 && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Category</Text>
          {renderPills(categoryOptions, category, setCategory)}
        </View>
      )}

      {hasActiveFilters() && (
        <TouchableOpacity style={styles.clearButton} onPress={handleClearFilters}>
          <Text style={styles.clearButtonText}>Clear All Filters</Text>
        </TouchableOpacity>
      )}
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
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#21555b',
    marginTop: 48,
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    color: '#324E58',
    fontWeight: '600',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e1e1e5',
    paddingHorizontal: 12,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#324E58',
  },
  clearX: {
    padding: 4,
    marginRight: 4,
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
  scrollRow: {
    flexDirection: 'row',
  },
  pill: {
    backgroundColor: '#f5f5fa',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e1e1e5',
    marginRight: 8,
  },
  pillSelected: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
  },
  pillText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  pillTextSelected: {
    color: '#D0861F',
    fontWeight: '700',
  },
  favToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f5f5fa',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e1e1e5',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  favToggleActive: {
    backgroundColor: '#FFF5EB',
    borderColor: '#D0861F',
  },
  favToggleText: {
    fontSize: 15,
    color: '#324E58',
    fontWeight: '500',
  },
  favToggleTextActive: {
    color: '#D0861F',
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#e1e1e5',
  },
  clearButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#21555b',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
