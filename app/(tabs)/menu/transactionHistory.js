// File: app/(tabs)/menu/transactionHistory.js

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const transactions = [
  {
    id: '1',
    brand: 'Starbucks',
    date: 'July 17, 2024',
    discount: 'Free Appetizer',
    spending: '$45.50',
    savings: '$12.99',
    logo: require('../../../assets/logos/starbucks.png'),
    status: 'completed',
  },
  {
    id: '2',
    brand: 'Apple Store',
    date: 'July 15, 2024',
    discount: '10% Off Entire Bill',
    spending: '$1,299.00',
    savings: '$129.90',
    logo: require('../../../assets/logos/apple.png'),
    status: 'completed',
  },
  {
    id: '3',
    brand: 'Amazon',
    date: 'July 12, 2024',
    discount: '$25 Off Order',
    spending: '$89.99',
    savings: '$25.00',
    logo: require('../../../assets/logos/amazon.png'),
    status: 'completed',
  },
  {
    id: '4',
    brand: 'Cisco',
    date: 'July 10, 2024',
    discount: '10% Off Entire Bill',
    spending: '$2,500.00',
    savings: '$250.00',
    logo: require('../../../assets/logos/cisco.png'),
    status: 'completed',
  },
  {
    id: '5',
    brand: 'Zara',
    date: 'July 8, 2024',
    discount: '10% Off Entire Bill',
    spending: '$89.50',
    savings: '$8.95',
    logo: require('../../../assets/logos/zara.png'),
    status: 'completed',
  },
];

export default function TransactionHistory() {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState('all');

  const totalSavings = transactions.reduce((sum, item) => sum + parseFloat(item.savings.replace('$', '')), 0);
  const totalSpent = transactions.reduce((sum, item) => sum + parseFloat(item.spending.replace('$', '')), 0);

  const renderItem = ({ item }) => (
    <View style={styles.transactionCard}>
      <View style={styles.cardHeader}>
        <View style={styles.brandSection}>
          <Image source={item.logo} style={styles.brandLogo} />
          <View style={styles.brandInfo}>
            <Text style={styles.brandName}>{item.brand}</Text>
            <Text style={styles.transactionDate}>{item.date}</Text>
          </View>
        </View>
        <View style={styles.statusBadge}>
          <Feather name="check-circle" size={14} color="#10B981" />
          <Text style={styles.statusText}>Completed</Text>
        </View>
      </View>

      <View style={styles.discountSection}>
        <Text style={styles.discountLabel}>Discount Used</Text>
        <Text style={styles.discountValue}>{item.discount}</Text>
      </View>

      <View style={styles.financialSection}>
        <View style={styles.financialItem}>
          <Text style={styles.financialLabel}>Spent</Text>
          <Text style={styles.spentAmount}>{item.spending}</Text>
        </View>
        <View style={styles.financialDivider} />
        <View style={styles.financialItem}>
          <Text style={styles.financialLabel}>Saved</Text>
          <Text style={styles.savedAmount}>{item.savings}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Standardized Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Summary Cards */}
      <View style={styles.summarySection}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Feather name="dollar-sign" size={20} color="#DB8633" />
          </View>
          <Text style={styles.summaryValue}>${totalSpent.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total Spent</Text>
        </View>
        
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Feather name="trending-up" size={20} color="#10B981" />
          </View>
          <Text style={styles.summaryValue}>${totalSavings.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total Saved</Text>
        </View>
      </View>

      {/* Transactions List */}
      <View style={styles.transactionsSection}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          style={styles.transactionsList}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  summaryIcon: {
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 5,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#888',
  },
  transactionsSection: {
    marginTop: 20,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 15,
  },
  transactionsList: {
    flex: 1,
  },
  listContainer: {
    paddingBottom: 40,
  },
  transactionCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  brandLogo: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
    borderRadius: 8,
    marginRight: 10,
  },
  brandInfo: {
    flex: 1,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
  },
  transactionDate: {
    fontSize: 12,
    color: '#888',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2F7',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#10B981',
    marginLeft: 5,
  },
  discountSection: {
    marginBottom: 10,
  },
  discountLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
  },
  discountValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
  },
  financialSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  financialItem: {
    alignItems: 'center',
  },
  financialLabel: {
    fontSize: 12,
    color: '#999',
  },
  spentAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
  },
  financialDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#eee',
  },
  savedAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
  },
});
