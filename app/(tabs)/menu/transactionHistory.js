// File: app/(tabs)/menu/transactionHistory.js

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const transactions = [
  {
    id: '1',
    brand: 'Starbucks',
    date: '17 July, 2023',
    discount: 'Free appetizer | up to 4x per month',
    spending: '$200',
    savings: '$15',
    logo: require('../../../assets/logos/starbucks.png'),
  },
  {
    id: '2',
    brand: 'Apple Store',
    date: '17 July, 2023',
    discount: '10% discount on entire bill | unlimited',
    spending: '$200',
    savings: '$15',
    logo: require('../../../assets/logos/apple.png'),
  },
  {
    id: '3',
    brand: 'Amazon On-Site Store',
    date: '17 July, 2023',
    discount: '$25 off entire order, with a minimum spend',
    spending: '$200',
    savings: '$20',
    logo: require('../../../assets/logos/amazon.png'),
  },
  {
    id: '4',
    brand: 'Cisco',
    date: '17 July, 2023',
    discount: '10% discount on entire bill | unlimited',
    spending: '$200',
    savings: '$15',
    logo: require('../../../assets/logos/cisco.png'),
  },
  {
    id: '5',
    brand: 'Zara',
    date: '17 July, 2023',
    discount: '10% discount on entire bill | unlimited',
    spending: '$200',
    savings: '$5',
    logo: require('../../../assets/logos/zara.png'),
  },
];

export default function TransactionHistory() {
  const router = useRouter();

  const renderItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <Image source={item.logo} style={styles.logo} />
      <View style={styles.details}>
        <Text style={styles.brand}>{item.brand}</Text>
        <Text style={styles.text}>Date  <Text style={styles.dim}>{item.date}</Text></Text>
        <Text style={styles.text}>Discount  <Text style={styles.dim}>{item.discount}</Text></Text>
        <Text style={styles.text}>Total spending  <Text style={styles.dim}>{item.spending}</Text></Text>
      </View>
      <View style={styles.savingsContainer}>
        <Text style={styles.discountLabel}>Discount</Text>
        <Text style={styles.savings}>{item.savings}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Back Button */}
      <TouchableOpacity onPress={() => router.push('/(tabs)/menu')} style={styles.backRow}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
        <Text style={styles.header}>Transaction History</Text>
      </TouchableOpacity>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={<ActivityIndicator size="small" color="#ccc" style={{ marginVertical: 24 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  header: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  logo: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
    borderRadius: 8,
  },
  details: {
    flex: 1,
  },
  brand: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  text: {
    fontSize: 13,
    color: '#324E58',
  },
  dim: {
    color: '#888',
  },
  savingsContainer: {
    alignItems: 'flex-end',
  },
  discountLabel: {
    fontSize: 12,
    color: '#999',
  },
  savings: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
});
