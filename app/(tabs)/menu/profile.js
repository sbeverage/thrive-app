import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';
import API from '../../lib/api';

export default function UserProfile() {
  const router = useRouter();
  const { user, loadUserData } = useUser();
  const [badges, setBadges] = useState([]);
  
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
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  useEffect(() => {
    loadBadges();
  }, []);

  const loadBadges = async () => {
    try {
      const data = await API.getReferralInfo();
      console.log('Referral data:', data);
      
      // Default milestones for fallback
      const defaultMilestones = [
        { count: 5, reward: '$25 Credit + Badge', description: 'Earn $25 credit and unlock the "Community Builder" badge' }
      ];
      
      // Use API milestones if available, otherwise use defaults
      const milestones = data?.milestones && data.milestones.length > 0 
        ? data.milestones 
        : defaultMilestones;
      
      // Get paid friends count from API or use 0
      const paidFriendsCount = data?.paidFriendsCount || 0;
      
      // Extract badges from milestones that have "Badge" in reward or description
      const earnedBadges = milestones
        .filter(m => {
          const hasBadge = (m.reward && m.reward.includes('Badge')) || 
                          (m.description && m.description.includes('badge'));
          const isUnlocked = m.unlocked || paidFriendsCount >= m.count;
          return hasBadge && isUnlocked;
        })
        .map(m => {
          // Extract badge name from description (e.g., 'unlock the "Community Builder" badge')
          let badgeName = 'Community Builder'; // Default
          if (m.description) {
            const badgeMatch = m.description.match(/"([^"]+)" badge/i);
            if (badgeMatch) {
              badgeName = badgeMatch[1];
            } else if (m.description.includes('Community Builder')) {
              badgeName = 'Community Builder';
            }
          }
          // Fallback: use milestone count to determine badge
          if (badgeName === 'Community Builder' && !m.description?.includes('Community Builder')) {
            if (m.count === 5) badgeName = 'Community Builder';
            else if (m.count === 10) badgeName = 'VIP Member';
            else if (m.count === 25) badgeName = 'Community Champion';
          }
          return {
            name: badgeName,
            earnedAt: m.earnedAt,
            milestone: m.count,
          };
        });
      
      console.log('🔍 Profile Badge Debug Info:');
      console.log('  - Paid friends count:', paidFriendsCount);
      console.log('  - Milestones:', milestones.map(m => ({ count: m.count, reward: m.reward, unlocked: m.unlocked, hasBadge: (m.reward && m.reward.includes('Badge')) || (m.description && m.description.includes('badge')) })));
      console.log('  - Earned badges:', earnedBadges.length, earnedBadges);
      
      if (earnedBadges.length === 0 && paidFriendsCount < 5) {
        console.log('⚠️ No badges yet - need 5+ paid friends to unlock Community Builder badge');
      }
      
      setBadges(earnedBadges);
    } catch (error) {
      console.error('Error loading badges:', error);
      setBadges([]);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Are you sure?',
      'This action will permanently delete your profile. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Delete', style: 'destructive', onPress: () => console.log('User deleted') },
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
        <TouchableOpacity style={styles.dangerItem} onPress={handleDelete}>
          <View style={styles.actionLeft}>
            <AntDesign name="delete" size={20} color="#EF4444" />
            <Text style={styles.dangerText}>Delete Account</Text>
          </View>
          <AntDesign name="right" size={16} color="#ccc" />
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
