import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function AutoPost() {
  const router = useRouter();

  const [settings, setSettings] = useState({
    all: true,
    redeemedDiscount: true,
    volunteerSignup: true,
    badgeEarned: true,
    signedUp: true,
    newCharityVendor: true,
  });

  const toggleSwitch = (key) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(tabs)/menu/settings')}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
        <Text style={styles.header}>Auto Post</Text>
      </TouchableOpacity>

      {[
        { key: 'all', label: 'All Auto Post' },
        { key: 'redeemedDiscount', label: 'When redeems a discount' },
        { key: 'volunteerSignup', label: 'When signs up for a volunteer opportunity' },
        { key: 'badgeEarned', label: 'When earns a new badge' },
        { key: 'signedUp', label: 'Upon signing up to the app' },
        { key: 'newCharityVendor', label: 'Anytime a new charity or vendor joins the app' },
      ].map(({ key, label }) => (
        <View key={key} style={styles.settingRow}>
          <Text style={styles.label}>{label}</Text>
          <Switch
            trackColor={{ false: '#ccc', true: '#DB8633' }}
            thumbColor={settings[key] ? '#fff' : '#fff'}
            onValueChange={() => toggleSwitch(key)}
            value={settings[key]}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 48,
    paddingHorizontal: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#21555B',
    marginLeft: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
  },
  label: {
    fontSize: 14,
    color: '#324E58',
    flex: 1,
    paddingRight: 12,
  },
});
