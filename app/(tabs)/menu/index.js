// File: app/(tabs)/menu.js

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Entypo, Feather, FontAwesome, MaterialIcons } from '@expo/vector-icons';

export default function MenuScreen() {
  const router = useRouter();

  const menuItems = [
    { section: 'Account', data: [
      { title: 'My Profile', icon: 'user', page: 'menu/profile' },
      { title: 'Friends', icon: 'users', page: 'menu/friends' },
    ]},
    { section: 'Donations', data: [
      { title: 'Change Donation Preferences', icon: 'sliders', page: 'menu/donationPreferences' },
      { title: 'View Donation Summary', icon: 'rotate-ccw', page: 'menu/donationSummary' },
      { title: 'Transaction History', icon: 'dollar-sign', page: 'menu/transactionHistory' },
      { title: 'Manage Cards', icon: 'credit-card', page: 'menu/manageCards' },
    ]},
    { section: 'Beneficiary', data: [
      { title: 'Change Beneficiary Preferences', icon: 'sliders', page: 'menu/beneficiaryPreferences' },
      { title: 'Volunteered Events', icon: 'calendar', page: 'menu/events' },
    ]},
    { section: "Help + FAQ's", data: [
      { title: 'Send Feedback', icon: 'message-square', page: 'menu/feedback' },
      { title: "FAQ's", icon: 'file-text', page: 'menu/faqs' },
    ]},
    { section: 'More', data: [
      { title: 'Invite Company', icon: 'briefcase', page: 'menu/inviteCompany' },
      { title: 'Invite Beneficiary', icon: 'user-plus', page: 'menu/inviteBeneficiary' },
      { title: 'Invitation History', icon: 'users', page: 'menu/invitationHistory' },
      { title: 'Settings', icon: 'settings', page: 'menu/settings' },
    ]},
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Image source={require('../../../assets/images/profile.jpg')} style={styles.avatar} />
        <Text style={styles.name}>Stephanie Beverage</Text>
        <Text style={styles.email}>stephanie@gmail.com</Text>
        <View style={styles.coinsBox}>
          <Text style={styles.coins}>🏆 50</Text>
        </View>
      </View>

      {menuItems.map((section, idx) => (
        <View key={idx} style={styles.sectionWrapper}>
          <Text style={styles.sectionTitle}>{section.section}</Text>
          {section.data.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.row}
              onPress={() => router.push(`/${item.page}`)}
            >
              <Feather name={item.icon} size={20} color="#324E58" style={styles.icon} />
              <Text style={styles.rowText}>{item.title}</Text>
              <Feather name="chevron-right" size={18} color="#ccc" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <TouchableOpacity style={styles.logoutButton}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: 'white', flex: 1 },
  header: { alignItems: 'center', marginTop: 30, marginBottom: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 10 },
  name: { fontSize: 18, fontWeight: '700', color: '#324E58' },
  email: { fontSize: 14, color: '#999' },
  coinsBox: { marginTop: 10, backgroundColor: '#FFE6C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  coins: { color: '#B67219', fontWeight: '700' },
  sectionWrapper: { marginBottom: 20, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#324E58', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F0F0F0' },
  rowText: { fontSize: 15, color: '#324E58' },
  icon: { marginRight: 15 },
  logoutButton: { margin: 20, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#DB8633', alignItems: 'center' },
  logoutText: { color: '#DB8633', fontWeight: '700', fontSize: 16 },
});
