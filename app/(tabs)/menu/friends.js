import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import API from '../../lib/api';

export default function FriendsScreen() {
  const router = useRouter();
  const [friends, setFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFriends = async () => {
      try {
        const data = await API.getReferredFriends();
        setFriends(data?.friends || []);
      } catch (error) {
        console.error('Error loading referred friends:', error);
        setFriends([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadFriends();
  }, []);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
      case 'payment_setup':
      case 'signed_up':
        return <Feather name="check-circle" size={16} color="#10B981" />;
      case 'pending':
        return <Feather name="clock" size={16} color="#F59E0B" />;
      case 'cancelled':
        return <Feather name="x-circle" size={16} color="#EF4444" />;
      default:
        return <Feather name="user" size={16} color="#6B7280" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'paid':
        return 'Active';
      case 'payment_setup':
        return 'Payment Set Up';
      case 'signed_up':
        return 'Signed Up';
      case 'pending':
        return 'Pending';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Invited';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
      case 'payment_setup':
      case 'signed_up':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'cancelled':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
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

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#DB8633" />
        </View>
      ) : friends.length > 0 ? (
        <ScrollView style={styles.friendsList} showsVerticalScrollIndicator={false}>
          {friends.map((friend) => {
            const joinedDate = formatDate(friend.joinedAt || friend.firstPaymentAt);
            return (
              <View key={friend.id} style={styles.friendCard}>
                <View style={styles.friendInfo}>
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {(friend.name || friend.email || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.friendDetails}>
                    <Text style={styles.friendName}>{friend.name || 'Friend'}</Text>
                    {friend.email ? (
                      <Text style={styles.friendEmail}>{friend.email}</Text>
                    ) : null}
                    {joinedDate ? (
                      <Text style={styles.invitedDate}>Joined: {joinedDate}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.statusSection}>
                  {getStatusIcon(friend.status)}
                  <Text style={[styles.statusText, { color: getStatusColor(friend.status) }]}>
                    {getStatusText(friend.status)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Feather name="users" size={48} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No Friends Yet</Text>
          <Text style={styles.emptySubtitle}>Invite friends to join Thrive and start making an impact together!</Text>
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
  backButton: {},
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
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
