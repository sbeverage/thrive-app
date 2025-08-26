// File: app/(tabs)/menu.js

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Entypo, Feather, FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function MenuScreen() {
  const router = useRouter();

  const menuItems = [
    { section: 'Account', data: [
      { title: 'My Profile', icon: 'user', page: 'menu/profile' },
      { title: 'Friends', icon: 'users', page: 'menu/friends' },
    ]},
    { section: 'Donations & Savings', data: [
      { title: 'Donation Summary', icon: 'bar-chart-2', page: 'menu/donationSummary' },
      { title: 'Edit Donation Amount', icon: 'dollar-sign', page: 'menu/editDonationAmount' },
      { title: 'Transaction History', icon: 'clock', page: 'menu/transactionHistory' },
      { title: 'Manage Billing', icon: 'credit-card', page: 'menu/manageCards' },
    ]},
    { section: 'App', data: [
      { title: 'Send Feedback', icon: 'message-square', page: 'menu/feedback' },
    ]},
  ];

  return (
    <ScrollView style={styles.container}>
      <LinearGradient
        colors={["#2C3E50", "#4CA1AF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Image source={require('../../../assets/images/profile.jpg')} style={styles.avatar} />
        <Text style={styles.name}>Stephanie Beverage</Text>
        <Text style={styles.email}>stephanie@gmail.com</Text>
        <View style={styles.coinsBox}>
          <Text style={styles.coins}>🏆 50</Text>
        </View>
      </LinearGradient>

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
  header: { 
    alignItems: 'center', 
    marginTop: 30, 
    marginBottom: 20,
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginHorizontal: 20,
  },
  avatar: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    marginBottom: 10,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  name: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  email: { 
    fontSize: 14, 
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
  },
  coinsBox: { 
    marginTop: 10, 
    backgroundColor: 'rgba(255, 255, 255, 0.2)', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  coins: { color: '#ffffff', fontWeight: '700' },
  sectionWrapper: { marginBottom: 20, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#324E58', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F0F0F0' },
  rowText: { fontSize: 15, color: '#324E58' },
  icon: { marginRight: 15 },
  logoutButton: { 
    margin: 20, 
    padding: 14, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#DB8633', 
    alignItems: 'center',
    alignSelf: 'center',
    minWidth: 120,
  },
  logoutText: { color: '#DB8633', fontWeight: '700', fontSize: 16 },
});
