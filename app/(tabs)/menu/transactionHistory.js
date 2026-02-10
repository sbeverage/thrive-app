// File: app/(tabs)/menu/transactionHistory.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useUser } from '../../context/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../../lib/api';

export default function TransactionHistory() {
  const router = useRouter();
  const { user, loadUserData, addSavings } = useUser();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Debug logging
  useEffect(() => {
    console.log('🔍 TransactionHistory - User data:', user);
    console.log('🔍 TransactionHistory - Total savings:', user.totalSavings);
  }, [user]);

  // Load user data when component mounts
  useEffect(() => {
    loadUserData();
    loadTransactions(1, false);
  }, []);

  // Refresh data when page is focused
  useFocusEffect(
    useCallback(() => {
      loadUserData();
      loadTransactions(1, false);
      setRefreshTrigger(prev => prev + 1);
    }, [])
  );

  // Load transactions from backend API with fallback to local storage
  const loadTransactions = async (pageNum = 1, append = false) => {
    try {
      setIsLoading(true);
      
      // Try to load from backend API
      try {
        const response = await API.getTransactions(pageNum, 20);
        const backendTransactions = response.transactions || [];
        
        // Transform backend transactions to match frontend format
        const transformedTransactions = backendTransactions.map(t => ({
          id: t.id,
          type: t.type,
          brand: t.vendor_name || t.beneficiary_name || 'Unknown',
          date: new Date(t.created_at).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          }),
          discount: t.description || '',
          spending: t.spending ? `$${parseFloat(t.spending).toFixed(2)}` : undefined,
          savings: t.savings ? `$${parseFloat(t.savings).toFixed(2)}` : undefined,
          amount: t.amount ? `$${parseFloat(t.amount).toFixed(2)}` : undefined,
          isOneTimeGift: t.type === 'one_time_gift' || t.type === 'donation',
          beneficiaryName: t.beneficiary_name,
          logo: t.vendor_logo || require('../../../assets/images/child-cancer.jpg'),
        }));

        if (append) {
          setTransactions(prev => [...prev, ...transformedTransactions]);
        } else {
          setTransactions(transformedTransactions);
        }

        setHasMore(response.pagination?.has_more || false);
        setPage(pageNum);
        console.log('✅ Loaded transactions from backend:', transformedTransactions.length);
        
        // Also save to local storage as backup
        if (!append) {
          await AsyncStorage.setItem('userTransactions', JSON.stringify(transformedTransactions));
        }
      } catch (apiError) {
        console.warn('⚠️ Backend API failed, falling back to local storage:', apiError.message);
        
        // Fallback to local storage
        const existingTransactions = await AsyncStorage.getItem('userTransactions');
        if (existingTransactions) {
          const localTransactions = JSON.parse(existingTransactions);
          setTransactions(localTransactions);
          console.log('✅ Loaded transactions from local storage:', localTransactions.length);
        } else {
          setTransactions([]);
          console.log('📭 No transactions found');
        }
      }
    } catch (error) {
      console.error('❌ Error loading transactions:', error);
      setTransactions([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh transactions
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    loadTransactions(1, false);
  }, []);

  // Save transactions to AsyncStorage
  const saveTransactions = async (newTransactions) => {
    try {
      await AsyncStorage.setItem('userTransactions', JSON.stringify(newTransactions));
      setTransactions(newTransactions);
      console.log('✅ Saved transactions to storage:', newTransactions.length);
    } catch (error) {
      console.error('❌ Error saving transactions:', error);
    }
  };

  // Update transaction amounts
  const updateTransactionAmounts = (transactionId, newSpendingAmount, newSavingsAmount) => {
    const updatedTransactions = transactions.map(transaction => {
      if (transaction.id === transactionId) {
        const oldSavings = transaction.savings 
          ? parseFloat(transaction.savings.replace('$', '')) 
          : 0;
        const newSavings = parseFloat(newSavingsAmount.replace('$', ''));
        const difference = newSavings - oldSavings;
        
        // Update the transaction
        const updatedTransaction = {
          ...transaction,
          spending: newSpendingAmount.startsWith('$') ? newSpendingAmount : `$${newSpendingAmount}`,
          savings: newSavingsAmount.startsWith('$') ? newSavingsAmount : `$${newSavingsAmount}`,
        };
        
        // Update total savings in user context
        if (difference !== 0) {
          addSavings(difference);
        }
        
        return updatedTransaction;
      }
      return transaction;
    });
    
    saveTransactions(updatedTransactions);
    setEditingTransaction(null);
  };

  // Delete transaction
  const deleteTransaction = (transactionId) => {
    const transactionToDelete = transactions.find(t => t.id === transactionId);
    if (transactionToDelete && transactionToDelete.savings) {
      // Subtract the savings from total when deleting (only for regular transactions)
      const savingsAmount = parseFloat(transactionToDelete.savings.replace('$', ''));
      addSavings(-savingsAmount); // Subtract the amount
    }
    
    const updatedTransactions = transactions.filter(t => t.id !== transactionId);
    saveTransactions(updatedTransactions);
  };

  // Use real user data for totals
  const totalSavings = user.totalSavings || 0;
  const totalSpent = transactions.reduce((sum, item) => {
    // Handle donation transactions (one-time gifts) which use 'amount' instead of 'spending'
    if (item.type === 'donation' || item.isOneTimeGift) {
      const amount = item.amount || '0';
      const numericAmount = typeof amount === 'string' 
        ? parseFloat(amount.replace('$', '').replace(',', '')) || 0
        : parseFloat(amount) || 0;
      return sum + numericAmount;
    }
    
    // Handle regular discount transactions which use 'spending'
    if (item.spending) {
      const spending = typeof item.spending === 'string'
        ? item.spending.replace('$', '').replace(',', '')
        : String(item.spending);
      return sum + (parseFloat(spending) || 0);
    }
    
    // Skip transactions without spending or amount
    return sum;
  }, 0);

  const renderItem = ({ item }) => {
    // Check if this is a one-time gift donation
    const isDonation = item.type === 'donation' || item.isOneTimeGift;
    
    if (isDonation) {
      return (
        <View style={styles.transactionCard}>
          <View style={styles.cardHeader}>
            <View style={styles.brandSection}>
              <View style={[styles.brandLogo, styles.donationLogo]}>
                <Feather name="heart" size={24} color="#DB8633" />
              </View>
              <View style={styles.brandInfo}>
                <Text style={styles.brandName}>{item.beneficiaryName || 'Charity'}</Text>
                <Text style={styles.transactionDate}>{item.date}</Text>
              </View>
            </View>
            <View style={styles.donationBadge}>
              <Feather name="gift" size={14} color="#10B981" />
              <Text style={styles.donationBadgeText}>One-Time Gift</Text>
            </View>
          </View>

          <View style={styles.donationSection}>
            <Text style={styles.donationLabel}>Donation Amount</Text>
            <Text style={styles.donationAmount}>{item.amount}</Text>
          </View>
        </View>
      );
    }

    // Regular discount transaction
    return (
      <View style={styles.transactionCard}>
        <View style={styles.cardHeader}>
          <View style={styles.brandSection}>
            <Image source={item.logo} style={styles.brandLogo} />
            <View style={styles.brandInfo}>
              <Text style={styles.brandName}>{item.brand}</Text>
              <Text style={styles.transactionDate}>{item.date}</Text>
            </View>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => setEditingTransaction(item)}
            >
              <Feather name="edit-2" size={16} color="#DB8633" />
            </TouchableOpacity>
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
  };

  return (
    <View style={styles.container} key={refreshTrigger}>
      {/* Standardized Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(tabs)/menu')}>
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
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
        {isLoading && transactions.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#DB8633" />
            <Text style={styles.loadingText}>Loading transactions...</Text>
          </View>
        ) : transactions.length > 0 ? (
          <FlatList
            data={transactions}
            keyExtractor={(item) => item.id || item.id.toString()}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
            style={styles.transactionsList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            onEndReached={() => {
              if (hasMore && !isLoading) {
                loadTransactions(page + 1, true);
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoading && transactions.length > 0 ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#DB8633" />
                </View>
              ) : null
            }
          />
        ) : (
          <View style={styles.noTransactionsMessage}>
            <Feather name="shopping-bag" size={48} color="#D1D5DB" />
            <Text style={styles.noTransactionsTitle}>No Transactions Yet</Text>
            <Text style={styles.noTransactionsText}>
              Your discount redemptions will appear here once you start using discounts through the app.
            </Text>
          </View>
        )}
      </View>

      {/* Edit Savings Modal */}
      <EditSavingsModal
        visible={editingTransaction !== null}
        transaction={editingTransaction}
        onClose={() => setEditingTransaction(null)}
        onSave={(newSpendingAmount, newSavingsAmount) => {
          if (editingTransaction) {
            updateTransactionAmounts(editingTransaction.id, newSpendingAmount, newSavingsAmount);
          }
        }}
      />
    </View>
  );
}

// Edit Transaction Modal Component
function EditSavingsModal({ visible, transaction, onClose, onSave }) {
  const [spendingAmount, setSpendingAmount] = useState('');
  const [savingsAmount, setSavingsAmount] = useState('');

  // Pre-populate amounts when editing
  useEffect(() => {
    if (transaction) {
      setSpendingAmount(transaction.spending ? transaction.spending.replace('$', '') : '');
      setSavingsAmount(transaction.savings ? transaction.savings.replace('$', '') : '');
    }
  }, [transaction]);

  const handleSave = () => {
    // Basic validation
    if (!spendingAmount || isNaN(parseFloat(spendingAmount))) {
      Alert.alert('Invalid Amount', 'Please enter a valid spending amount.');
      return;
    }
    
    if (!savingsAmount || isNaN(parseFloat(savingsAmount))) {
      Alert.alert('Invalid Amount', 'Please enter a valid savings amount.');
      return;
    }

    onSave(spendingAmount, savingsAmount);
  };

  if (!transaction) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Edit Transaction</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.modalSaveButton}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {/* Transaction Info Display */}
          <View style={styles.transactionInfoCard}>
            <View style={styles.transactionInfoHeader}>
              <Image source={transaction.logo} style={styles.transactionInfoLogo} />
              <View style={styles.transactionInfoDetails}>
                <Text style={styles.transactionInfoBrand}>{transaction.brand}</Text>
                <Text style={styles.transactionInfoDate}>{transaction.date}</Text>
              </View>
            </View>
            <Text style={styles.transactionInfoDiscount}>{transaction.discount}</Text>
          </View>

          {/* Spending Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Amount Spent *</Text>
            <View style={styles.currencyInputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.currencyTextInput}
                value={spendingAmount}
                onChangeText={setSpendingAmount}
                placeholder="0.00"
                keyboardType="numeric"
                autoFocus
              />
            </View>
            <Text style={styles.inputHelperText}>
              Enter the total amount you spent at this store
            </Text>
          </View>

          {/* Savings Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Amount Saved *</Text>
            <View style={styles.currencyInputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.currencyTextInput}
                value={savingsAmount}
                onChangeText={setSavingsAmount}
                placeholder="0.00"
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.inputHelperText}>
              Enter the amount you saved from this discount redemption
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
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
  refreshButton: {
    padding: 8,
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
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
  noTransactionsMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  noTransactionsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginTop: 16,
    marginBottom: 8,
  },
  noTransactionsText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalCancelButton: {
    fontSize: 16,
    color: '#6B7280',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
  },
  modalSaveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DB8633',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
  },
  // Transaction info card styles
  transactionInfoCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  transactionInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionInfoLogo: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
    borderRadius: 8,
    marginRight: 12,
  },
  transactionInfoDetails: {
    flex: 1,
  },
  transactionInfoBrand: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  transactionInfoDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  transactionInfoDiscount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 8,
  },
  transactionInfoSpending: {
    fontSize: 14,
    color: '#6B7280',
  },
  // Currency input styles
  currencyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    marginRight: 8,
  },
  currencyTextInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
  },
  inputHelperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 16,
  },
  // Donation-specific styles
  donationLogo: {
    backgroundColor: '#FFF5EB',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  donationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  donationBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  donationSection: {
    marginTop: 12,
  },
  donationLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  donationAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
  },
});
