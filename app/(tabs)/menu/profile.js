import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../../context/UserContext';
import API from '../../lib/api';
import { milestonesForDisplay } from '../../constants/referralRewards';

export default function UserProfile() {
  const router = useRouter();
  const { user, loadUserData, logout } = useUser();
  const [badges, setBadges] = useState([]);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  
  // Format phone number for display: (XXX) XXX-XXXX
  const formatPhoneNumber = (phone) => {
    if (!phone) return 'Not provided';
    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      // Format: (XXX) XXX-XXXX
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
    // If already formatted or different length, return as is
    return phone;
  };
  
  // Load user data when screen is focused
  const loadBadges = useCallback(async () => {
    try {
      const data = await API.getReferralInfo();
      const paidFriendsCount = data?.paidFriendsCount ?? 0;
      const milestones = milestonesForDisplay(data?.milestones || [], paidFriendsCount);
      const earnedBadges = milestones
        .filter((m) => m.unlocked)
        .map((m) => ({
          name: m.shortLabel || m.reward.replace(/ Badge$/i, '').trim(),
          earnedAt: m.earnedAt,
          milestone: m.count,
        }));
      setBadges(earnedBadges);
    } catch (error) {
      console.error('Error loading badges:', error);
      setBadges([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
      loadBadges();
    }, [loadBadges])
  );

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
        error?.message || 'We could not delete your account. Please try again or contact support.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently removes your Thrive account and associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your account will be deleted from our servers.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, delete my account', style: 'destructive', onPress: performDeleteAccount },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Standardized Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/menu')}>
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <LinearGradient
        colors={["#2C3E50", "#4CA1AF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.profileGradient}
      >
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

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone</Text>
          <Text style={styles.infoValue}>{formatPhoneNumber(user.phone)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total Savings</Text>
          <Text style={styles.infoValue}>${parseFloat(user.totalSavings || 0).toFixed(2)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Monthly Donation</Text>
          <Text style={styles.infoValue}>${parseFloat(user.monthlyDonation || 15).toFixed(2)}</Text>
        </View>
      </LinearGradient>

      {/* Badges Section */}
      {badges.length > 0 && (
        <View style={styles.badgesSection}>
          <Text style={styles.badgesTitle}>Badges & Achievements</Text>
          <View style={styles.badgesContainer}>
            {badges.map((badge, index) => (
              <View key={index} style={styles.badgeItem}>
                <View style={styles.badgeIcon}>
                  <AntDesign name="star" size={32} color="#DB8633" />
                </View>
                <Text style={styles.badgeName}>{badge.name}</Text>
                {badge.earnedAt && (
                  <Text style={styles.badgeDate}>
                    {badge.earnedAt ? `Earned ${new Date(badge.earnedAt).toLocaleDateString()}` : 'Earned'}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actionList}>
        <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/menu/editProfile')}>
          <View style={styles.actionLeft}>
            <AntDesign name="edit" size={20} color="#DB8633" />
            <Text style={styles.actionText}>Edit Profile</Text>
          </View>
          <AntDesign name="right" size={16} color="#ccc" />
        </TouchableOpacity>
        
        <View style={styles.separator} />
        
        <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/menu/changePassword')}>
          <View style={styles.actionLeft}>
            <AntDesign name="lock" size={20} color="#324E58" />
            <Text style={styles.actionText}>Change Password</Text>
          </View>
          <AntDesign name="right" size={16} color="#ccc" />
        </TouchableOpacity>
      </View>

      <View style={styles.dangerSection}>
        <TouchableOpacity
          style={styles.dangerItem}
          onPress={handleDelete}
          disabled={isDeletingAccount}
        >
          <View style={styles.actionLeft}>
            {isDeletingAccount ? (
              <ActivityIndicator size="small" color="#EF4444" style={{ marginRight: 4 }} />
            ) : (
              <AntDesign name="delete" size={20} color="#EF4444" />
            )}
            <Text style={styles.dangerText}>
              {isDeletingAccount ? 'Deleting…' : 'Delete Account'}
            </Text>
          </View>
          {!isDeletingAccount && <AntDesign name="right" size={16} color="#ccc" />}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
    backgroundColor: '#fff',
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
  profileGradient: {
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 24,
    paddingBottom: 30,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    marginVertical: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  email: {
    fontSize: 14,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    paddingBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  infoValue: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  actionList: {
    marginTop: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#324E58',
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 20,
  },
  dangerSection: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  dangerText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '500',
  },
  badgesSection: {
    marginTop: 0,
    marginBottom: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  badgesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 16,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  badgeItem: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    minWidth: 100,
    borderWidth: 2,
    borderColor: '#DB8633',
    borderStyle: 'dashed',
  },
  badgeIcon: {
    marginBottom: 8,
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeDate: {
    fontSize: 11,
    color: '#7A8D9C',
    textAlign: 'center',
  },
  testModeNote: {
    fontSize: 11,
    color: '#DB8633',
    fontStyle: 'italic',
    marginBottom: 8,
    textAlign: 'center',
  },
});
