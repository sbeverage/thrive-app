import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';

export default function FriendsScreen() {
  const router = useRouter();

  // Sample data - replace with actual data from your backend
  const friends = [
    { id: 1, name: 'Sarah Johnson', email: 'sarah.j@email.com', status: 'joined', invitedDate: '2024-01-15' },
    { id: 2, name: 'Mike Chen', email: 'mike.chen@email.com', status: 'pending', invitedDate: '2024-01-20' },
    { id: 3, name: 'Emily Rodriguez', email: 'emily.r@email.com', status: 'joined', invitedDate: '2024-01-10' },
    { id: 4, name: 'David Kim', email: 'david.kim@email.com', status: 'pending', invitedDate: '2024-01-25' },
    { id: 5, name: 'Lisa Thompson', email: 'lisa.t@email.com', status: 'joined', invitedDate: '2024-01-05' },
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'joined':
        return <Feather name="check-circle" size={16} color="#10B981" />;
      case 'pending':
        return <Feather name="clock" size={16} color="#F59E0B" />;
      default:
        return <Feather name="user" size={16} color="#6B7280" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'joined':
        return 'Joined';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'joined':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  return (
    <View style={styles.container}>
      {/* Standardized Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friends</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Friends List */}
      <ScrollView style={styles.friendsList} showsVerticalScrollIndicator={false}>
        {friends.map((friend) => (
          <View key={friend.id} style={styles.friendCard}>
            <View style={styles.friendInfo}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{friend.name.charAt(0)}</Text>
              </View>
              <View style={styles.friendDetails}>
                <Text style={styles.friendName}>{friend.name}</Text>
                <Text style={styles.friendEmail}>{friend.email}</Text>
                <Text style={styles.invitedDate}>Invited: {friend.invitedDate}</Text>
              </View>
            </View>
            <View style={styles.statusSection}>
              {getStatusIcon(friend.status)}
              <Text style={[styles.statusText, { color: getStatusColor(friend.status) }]}>
                {getStatusText(friend.status)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Empty State (if no friends) */}
      {friends.length === 0 && (
        <View style={styles.emptyState}>
          <Feather name="users" size={48} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No Friends Yet</Text>
          <Text style={styles.emptySubtitle}>Invite friends to join Thrive and start earning points together!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
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
  friendsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6B7280',
  },
  friendDetails: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 4,
  },
  friendEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  invitedDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});
