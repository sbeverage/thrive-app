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
      <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(tabs)/menu/settings')}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
        <Text style={styles.header}>Notifications</Text>
      </TouchableOpacity>

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
