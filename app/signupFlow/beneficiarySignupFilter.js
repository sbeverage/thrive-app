// File: app/signupFlow/beneficiarySignupFilter.js

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
  const [location, setLocation] = useState('');
  const [type, setType] = useState('');
  const [cause, setCause] = useState('');
  const [emergency, setEmergency] = useState('');
  const [isCauseDropdownOpen, setIsCauseDropdownOpen] = useState(false);
  const [isEmergencyDropdownOpen, setIsEmergencyDropdownOpen] = useState(false);
  const router = useRouter();

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
        <AntDesign name="arrowleft" size={24} color="#324E58" />
      </TouchableOpacity>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressSegments}>
          <View style={[styles.segment, { backgroundColor: '#324E58' }]} />
          <View style={[styles.segment, { backgroundColor: '#324E58' }]} />
          <View style={[styles.segment, { backgroundColor: '#324E58' }]} />
          <View style={[styles.segment, { backgroundColor: '#F5F5FA' }]} />
          <View style={[styles.segment, { backgroundColor: '#F5F5FA' }]} />
        </View>
        <View style={styles.piggyContainer}>
          <Image source={require('../../assets/images/walking-piggy.png')} style={styles.walkingPiggy} />
        </View>
      </View>

      {/* Piggy with speech bubble */}
      <View style={styles.speechBubbleContainer}>
        <Image source={require('../../assets/images/bolt-piggy.png')} style={styles.piggyIcon} />
        <View style={styles.speechBubble}>
          <Text style={styles.speechNormal}>Select filters to narrow your favorite causes!</Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Search nearby you</Text>
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

      {/* Cause Dropdown */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Beneficiary cause</Text>
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

      {/* Size Options */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Size of the organization</Text>
        {renderOptions(typeOptions, type, setType)}
      </View>

      {/* Emergency Dropdown */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Who needs help now?</Text>
        <TouchableOpacity
          style={styles.dropdownToggle}
          onPress={() => setIsEmergencyDropdownOpen(!isEmergencyDropdownOpen)}
        >
          <Text style={styles.dropdownToggleText}>{emergency || 'Choose an Emergency Relief Program'}</Text>
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

      {/* Continue Button */}
      <TouchableOpacity style={styles.button} onPress={() => router.push('/signupFlow/beneficiarySignupCause')}>
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
  progressBarContainer: {
    marginBottom: 30,
    position: 'relative',
    alignItems: 'center',
  },
  progressSegments: {
    flexDirection: 'row',
    justifyContent: 'center',
    height: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 10,
    marginHorizontal: 2,
  },
  piggyContainer: {
    position: 'absolute',
    top: -20,
    left: '42%',
  },
  walkingPiggy: {
    width: 30,
    height: 24,
    resizeMode: 'contain',
  },
  speechBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  piggyIcon: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    marginRight: 10,
  },
  speechBubble: {
    backgroundColor: '#f5f5fa',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    flexShrink: 1,
    borderColor: '#E1E1E5',
    borderWidth: 1,
  },
  speechNormal: {
    color: '#324E58',
    fontSize: 16,
    fontWeight: '400',
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
});
