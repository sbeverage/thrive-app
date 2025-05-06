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
const typeOptions = ['Non-Profit', 'Foundation', 'Community Org'];
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
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState('');
  const [type, setType] = useState('');
  const [cause, setCause] = useState('');
  const [emergency, setEmergency] = useState('');
  const [isCauseDropdownOpen, setIsCauseDropdownOpen] = useState(false);
  const [isEmergencyDropdownOpen, setIsEmergencyDropdownOpen] = useState(false);
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
      <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
        <AntDesign name="close" size={24} color="#21555b" />
      </TouchableOpacity>

      <Text style={styles.header}>Filters for beneficiaries</Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Search nearby you</Text>
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
        <Text style={styles.label}>Beneficiary Cause</Text>
        <TouchableOpacity
          style={styles.dropdownToggle}
          onPress={() => setIsCauseDropdownOpen(!isCauseDropdownOpen)}
        >
          <Text style={styles.dropdownToggleText}>{cause || 'Select Category'}</Text>
          <Feather name={isCauseDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
        </TouchableOpacity>
        {isCauseDropdownOpen && (
          <ScrollView style={styles.dropdownScroll}>
            {causeOptions.map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.dropdownItem, cause === option && styles.dropdownItemSelected]}
                onPress={() => {
                  setCause(option);
                  setIsCauseDropdownOpen(false);
                }}
              >
                <Text style={[styles.optionText, cause === option && styles.optionTextSelected]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Beneficiary Type</Text>
        {renderOptions(typeOptions, type, setType, true)}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Where to Give Now?</Text>
        <TouchableOpacity
          style={styles.dropdownToggle}
          onPress={() => setIsEmergencyDropdownOpen(!isEmergencyDropdownOpen)}
        >
          <Text style={styles.dropdownToggleText}>{emergency || 'Select Emergency'}</Text>
          <Feather name={isEmergencyDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
        </TouchableOpacity>
        {isEmergencyDropdownOpen && (
          <ScrollView style={styles.dropdownScroll}>
            {emergencyOptions.map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.dropdownItem, emergency === option && styles.dropdownItemSelected]}
                onPress={() => {
                  setEmergency(option);
                  setIsEmergencyDropdownOpen(false);
                }}
              >
                <Text style={[styles.optionText, emergency === option && styles.optionTextSelected]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={() => router.back()}>
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
