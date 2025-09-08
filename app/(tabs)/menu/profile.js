import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';

export default function UserProfile() {
  const router = useRouter();
  const { user } = useUser();

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
          <AntDesign name="arrowleft" size={24} color="#324E58" />
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
        ) : user.firstName && user.lastName ? (
          <View style={[styles.avatar, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>
              {user.firstName[0]}{user.lastName[0]}
            </Text>
          </View>
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>
              ??
            </Text>
          </View>
        )}
        <Text style={styles.name}>
          {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'User Name'}
        </Text>
        <Text style={styles.email}>{user.email || 'user@example.com'}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone</Text>
          <Text style={styles.infoValue}>{user.phone || 'Not provided'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Points</Text>
          <Text style={styles.infoValue}>{user.points || 0}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total Savings</Text>
          <Text style={styles.infoValue}>${user.totalSavings || 0}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Monthly Donation</Text>
          <Text style={styles.infoValue}>${user.monthlyDonation || 15}</Text>
        </View>
      </LinearGradient>

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
});
