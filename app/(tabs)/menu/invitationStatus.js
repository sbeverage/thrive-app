import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function InvitationStatus() {
  const router = useRouter();
  const { name, email, group, status, reason } = useLocalSearchParams();

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Pending':
        return { backgroundColor: '#FFF3E6', color: '#E48900' };
      case 'Rejected':
        return { backgroundColor: '#FFEAEA', color: '#FF3B30' };
      case 'Active':
        return { backgroundColor: '#E9FBEF', color: '#34C759' };
      default:
        return { backgroundColor: '#eee', color: '#666' };
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Back Button */}
      <TouchableOpacity onPress={() => router.push('/(tabs)/menu')} style={styles.backWrapper}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
      </TouchableOpacity>

      <Text style={styles.header}>Invitation Status</Text>

      {/* Card Layout */}
      <View style={styles.card}>
        {/* Brand logo placeholder */}
        <Image
          source={require('../../../assets/logos/amazon.png')}
          style={styles.logo}
        />

        <Text style={styles.name}>{name}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{email}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>User Group</Text>
          <Text style={styles.value}>{group}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <View style={[styles.badge, { backgroundColor: getStatusStyle(status).backgroundColor }]}>
            <Text style={{ color: getStatusStyle(status).color, fontWeight: '600' }}>{status}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Rejection Status</Text>
          <Text style={styles.reasonText}>{reason}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  backWrapper: {
    marginBottom: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#21555B',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  logo: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#21555B',
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  label: {
    color: '#324E58',
    fontSize: 14,
    fontWeight: '500',
  },
  value: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  reasonText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#999',
    textAlign: 'right',
    flex: 1,
  },
});
