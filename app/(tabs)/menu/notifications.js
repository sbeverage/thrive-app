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

export default function Notifications() {
  const router = useRouter();

  const [settings, setSettings] = useState({
    all: true,
    friendJoined: true,
    newOrg: true,
    invitedOrg: true,
    badge1: true,
    badge2: true,
    upcomingEvent: true,
    givingGoal: true,
  });

  const toggleSwitch = (key) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <ScrollView style={styles.container}>
      {/* Standardized Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      {[
        { key: 'all', label: 'All Notifications' },
        { key: 'friendJoined', label: 'When a friend the user has invited' },
        { key: 'newOrg', label: 'When a new charity or vendor joins the app' },
        { key: 'invitedOrg', label: 'When a charity or vendor the user has invited joins the app' },
        { key: 'badge1', label: 'When the user has earned a new badge' },
        { key: 'badge2', label: 'When the user has earned a new badge' },
        { key: 'upcomingEvent', label: 'When an event a user has signed up for is coming up' },
        { key: 'givingGoal', label: 'When a user has reached the min/max giving goal' },
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
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 5,
  },
  backButton: {
    // Standard back button with no custom styling
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6d6e72',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 32,
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
