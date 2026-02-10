// File: app/(tabs)/menu.js

import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, SafeAreaView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Entypo, Feather, FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';

export default function MenuScreen() {
  const router = useRouter();
  const { user, loadUserData, logout } = useUser();
  
  // Load user data when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.card}>
          <LinearGradient
            colors={["#2C3E50", "#4CA1AF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => router.replace('/(tabs)/home')}
            >
              <Image 
                source={require('../../../assets/icons/arrow-left.png')} 
                style={{ width: 24, height: 24, tintColor: '#324E58' }} 
              />
            </TouchableOpacity>
          {user.profileImage ? (
            <Image source={{ uri: user.profileImage }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>
                {(() => {
                  if (user.firstName && user.lastName) {
                    return `${user.firstName[0].toUpperCase()}${user.lastName[0].toUpperCase()}`;
                  } else if (user.firstName) {
                    return user.firstName[0].toUpperCase();
                  } else if (user.lastName) {
                    return user.lastName[0].toUpperCase();
                  } else if (user.email) {
                    return user.email[0].toUpperCase();
                  } else {
                    return 'U';
                  }
                })()}
              </Text>
            </View>
          )}
          <Text style={styles.name}>
            {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'User Name'}
          </Text>
          <Text style={styles.email}>{user.email || 'user@example.com'}</Text>
          </LinearGradient>

      {menuItems.map((section, idx) => (
        <View key={idx} style={styles.sectionWrapper}>
          <Text style={styles.sectionTitle}>{section.section}</Text>
          {section.data.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.row}
              onPress={() => {
                if (item.page) {
                  // Handle routes that already start with / (like /(tabs)/...)
                  const route = item.page.startsWith('/') ? item.page : `/${item.page}`;
                  router.push(route);
                }
              }}
            >
              <Feather name={item.icon} size={20} color="#324E58" style={styles.icon} />
              <Text style={styles.rowText}>{item.title}</Text>
              <Feather name="chevron-right" size={18} color="#ccc" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
      >
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
        </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'white' },
  container: { backgroundColor: 'white', flex: 1 },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    paddingBottom: 20,
    paddingTop: 20,
    flexGrow: 1,
  },
  header: { 
    alignItems: 'center', 
    marginTop: 0, 
    marginBottom: 20,
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginHorizontal: 0,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
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
  },
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
