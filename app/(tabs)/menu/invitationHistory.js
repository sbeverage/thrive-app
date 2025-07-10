import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

const invitations = [
  {
    name: 'Starbucks',
    email: 'abcd@gmail.com',
    group: 'Vendor',
    status: 'Pending',
    points: 25,
  },
  {
    name: 'Amazon On-Site Store',
    email: 'abcd@gmail.com',
    group: 'Vendor',
    status: 'Rejected',
    points: 25,
    reason: 'Not a qualified vendor.',
  },
  {
    name: 'United way',
    email: 'abcd@gmail.com',
    group: 'Beneficiary',
    status: 'Active',
    points: 25,
  },
  {
    name: 'John',
    email: 'abcd@gmail.com',
    group: 'Friend',
    status: 'Active',
    points: 25,
  },
  {
    name: 'Zara',
    email: 'abcd@gmail.com',
    group: 'Vendor',
    status: 'Active',
    points: 25,
  },
];

export default function InvitationHistory() {
  const router = useRouter();

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Pending':
        return [styles.statusBadge, { backgroundColor: '#FFF3E6', color: '#E48900' }];
      case 'Rejected':
        return [styles.statusBadge, { backgroundColor: '#FFEAEA', color: '#FF3B30' }];
      case 'Active':
        return [styles.statusBadge, { backgroundColor: '#E9FBEF', color: '#34C759' }];
      default:
        return [styles.statusBadge, { backgroundColor: '#eee', color: '#666' }];
    }
  };

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
      </TouchableOpacity>

      {invitations.map((invite, index) => (
        <View key={index} style={styles.inviteItem}>
          <View style={styles.inviteDetails}>
            <Text style={styles.inviteName}>{invite.name}</Text>
            <Text style={styles.inviteSub}>Email <Text style={styles.gray}>{invite.email}</Text></Text>
            <Text style={styles.inviteSub}>User group <Text style={styles.gray}>{invite.group}</Text></Text>
            {invite.status === 'Rejected' && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/menu/invitationStatus',
                    params: {
                      name: invite.name,
                      email: invite.email,
                      group: invite.group,
                      status: invite.status,
                      reason: invite.reason,
                    },
                  })
                }
              >
                <Text style={styles.reasonText}>View Reason</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.inviteRight}>
            <Text style={[styles.statusText, getStatusStyle(invite.status)[1]]}>{invite.status}</Text>
            <View style={styles.pointsWrapper}>
              <Text style={styles.points}>+{invite.points}</Text>
              <Image source={require('../../../assets/icons/coin.png')} style={styles.coin} />
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 6,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#21555B',
    marginLeft: 16,
  },
  inviteItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  inviteDetails: {
    flex: 1,
    marginRight: 12,
  },
  inviteName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#21555B',
  },
  inviteSub: {
    fontSize: 12,
    color: '#324E58',
  },
  gray: {
    color: '#888',
  },
  reasonText: {
    color: '#DB8633',
    fontSize: 12,
    marginTop: 4,
  },
  inviteRight: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  pointsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  points: {
    fontSize: 14,
    fontWeight: '500',
    color: '#21555B',
    marginRight: 4,
  },
  coin: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
  },
});
