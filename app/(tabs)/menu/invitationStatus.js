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
      {/* Standardized Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(tabs)/menu')}>
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invitation Status</Text>
        <View style={styles.headerSpacer} />
      </View>

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
    paddingTop: 20,
    paddingHorizontal: 24,
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
