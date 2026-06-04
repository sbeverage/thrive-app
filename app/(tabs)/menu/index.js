// File: app/(tabs)/menu.js

import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Entypo, Feather, FontAwesome, MaterialIcons, AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';
import API from '../../lib/api';

export default function MenuScreen() {
  const router = useRouter();
  const { user, loadUserData, logout } = useUser();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Account deletion lives on the Menu screen (in addition to My Profile)
  // so reviewers and users can find it in a single tap — required by App
  // Store Review Guideline 5.1.1(v).
  const performDeleteAccount = async () => {
    const email = (user?.email || '').trim();
    if (!email) {
      Alert.alert('Cannot delete account', 'No email is associated with this session. Please log in again.');
      return;
    }
    setIsDeletingAccount(true);
    try {
      await API.deleteUser(email);
      await AsyncStorage.removeItem('userTransactions');
      await logout();
      router.replace('/');
    } catch (error) {
      console.error('Delete account failed:', error);
      Alert.alert(
        'Delete failed',
        error?.message || 'We could not delete your account. Please try again or contact support.',
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your THRIVE account?',
      "This will permanently delete:\n\n" +
      "• Your account and profile\n" +
      "• Your saved vendors and redemption history\n" +
      "• Your donation records\n\n" +
      "We'll also cancel any active monthly donation so you won't be charged again. This happens immediately and cannot be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              "Tap 'Yes, delete my account' to permanently remove everything. This cannot be undone.",
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, delete my account', style: 'destructive', onPress: performDeleteAccount },
              ],
            );
          },
        },
      ],
    );
  };
  
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
      // Surface deletion as a regular menu row — App Store reviewers expect to
      // find it inline in the Account section, not as a button at the bottom.
      { title: 'Delete Account', icon: 'trash-2', action: 'deleteAccount', danger: true },
    ]},
    { section: 'Donations & Savings', data: [
      { title: 'Savings Tracker', icon: 'trending-up', page: 'menu/transactionHistory' },
      { title: 'Donation Summary', icon: 'bar-chart-2', page: 'menu/donationSummary' },
      { title: 'Manage Billing', icon: 'credit-card', page: 'menu/manageCards' },
    ]},
    { section: 'App', data: [
      { title: 'Send Feedback', icon: 'message-circle', page: 'menu/feedback' },
      { title: 'FAQs', icon: 'book-open', page: 'menu/faqs' },
    ]},
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
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
            {(user.firstName || user.lastName)
              ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
              : (user.email || 'Your Account')}
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
                if (item.action === 'deleteAccount') {
                  handleDeleteAccount();
                } else if (item.page) {
                  // Handle routes that already start with / (like /(tabs)/...)
                  const route = item.page.startsWith('/') ? item.page : `/${item.page}`;
                  router.push(route);
                }
              }}
              disabled={item.action === 'deleteAccount' && isDeletingAccount}
            >
              <Feather
                name={item.icon}
                size={20}
                color={item.danger ? '#EF4444' : '#324E58'}
                style={styles.icon}
              />
              <Text style={[styles.rowText, item.danger && { color: '#EF4444', fontWeight: '600' }]}>
                {item.action === 'deleteAccount' && isDeletingAccount ? 'Deleting account…' : item.title}
              </Text>
              <Feather
                name="chevron-right"
                size={18}
                color={item.danger ? '#FCA5A5' : '#ccc'}
                style={{ marginLeft: 'auto' }}
              />
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

      <TouchableOpacity
        style={styles.deleteAccountButton}
        onPress={handleDeleteAccount}
        disabled={isDeletingAccount}
      >
        {isDeletingAccount ? (
          <ActivityIndicator size="small" color="#EF4444" style={{ marginRight: 8 }} />
        ) : (
          <AntDesign name="delete" size={18} color="#EF4444" style={{ marginRight: 8 }} />
        )}
        <Text style={styles.deleteAccountText}>
          {isDeletingAccount ? 'Deleting account…' : 'Delete Account'}
        </Text>
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
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 32,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    alignSelf: 'center',
    minWidth: 160,
  },
  deleteAccountText: { color: '#EF4444', fontWeight: '600', fontSize: 14 },
});
