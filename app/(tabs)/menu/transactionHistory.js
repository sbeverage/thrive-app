// File: app/(tabs)/menu/transactionHistory.js

import React, { useState, useEffect, useCallback } from "react";
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
} from "react-native";
import { AntDesign, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useUser } from "../../context/UserContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../../lib/api";

function toMetadataObject(metadata) {
  if (metadata == null) return {};
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return typeof metadata === "object" ? metadata : {};
}

function parseMoneyRaw(val) {
  if (val == null || val === "") return null;
  const n = parseFloat(String(val).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Amount counted toward “Total Spent” for one list item (discount vs donation). */
function getTransactionSpentAmount(item) {
  const isDonation =
    item.type === "donation" ||
    item.type === "monthly_donation" ||
    item.type === "one_time_gift" ||
    item.isOneTimeGift;
  if (isDonation) {
    if (item.amount == null || item.amount === "") return 0;
    return typeof item.amount === "string"
      ? parseFloat(item.amount.replace(/[$,]/g, "")) || 0
      : parseFloat(item.amount) || 0;
  }
  if (
    typeof item.spentNumeric === "number" &&
    Number.isFinite(item.spentNumeric)
  ) {
    return item.spentNumeric;
  }
  if (item.spending != null && item.spending !== "") {
    return parseFloat(String(item.spending).replace(/[$,]/g, "")) || 0;
  }
  return 0;
}

export default function TransactionHistory() {
  const router = useRouter();
  const { user, loadUserData, addSavings } = useUser();
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Debug logging
  useEffect(() => {
    console.log("🔍 TransactionHistory - User data:", user);
    console.log("🔍 TransactionHistory - Total savings:", user.totalSavings);
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
      setRefreshTrigger((prev) => prev + 1);
    }, []),
  );

  // Load transactions from backend API with fallback to local storage
  // Merges local-only transactions (from Discount Redeemed when API fails) with backend data
  const loadTransactions = async (pageNum = 1, append = false) => {
    const profileBeneficiary =
      user?.selectedBeneficiary || user?.referredCharity || null;
    try {
      setIsLoading(true);

      // Load local transactions — filter to discount redemptions only
      const localRaw = await AsyncStorage.getItem("userTransactions");
      const allLocal = localRaw ? JSON.parse(localRaw) : [];
      const localTransactions = allLocal.filter(
        (t) => !t.type || t.type === 'redemption'
      );

      // Try to load from backend API — only fetch discount redemptions
      try {
        const response = await API.getTransactions(pageNum, 20, { type: 'redemption' });
        const backendTransactions = response.transactions || [];

        // Transform backend transactions to match frontend format
        const transformedBackend = backendTransactions.map((t) => {
          const meta = toMetadataObject(t.metadata);
          const isDonationLike =
            t.type === "one_time_gift" ||
            t.type === "donation" ||
            t.type === "monthly_donation";
          const isGift = t.type === "one_time_gift" || t.type === "donation";

          let spentNum = parseMoneyRaw(t.spending);
          if (spentNum == null) spentNum = parseMoneyRaw(meta.spending);
          if (
            spentNum == null &&
            (t.type === "redemption" ||
              t.type === "monthly_donation" ||
              t.type === "donation") &&
            t.amount != null &&
            t.amount !== ""
          ) {
            spentNum = parseMoneyRaw(t.amount);
          }

          let savingsNum = parseMoneyRaw(t.savings);
          if (savingsNum == null) savingsNum = parseMoneyRaw(meta.savings);
          if (savingsNum == null && t.type === "monthly_donation") {
            savingsNum = 0;
          }

          const amountNum = parseMoneyRaw(t.amount);

          let beneficiaryName = t.beneficiary_name;
          if (
            !beneficiaryName &&
            t.beneficiary_id != null &&
            profileBeneficiary?.id === t.beneficiary_id
          ) {
            beneficiaryName = profileBeneficiary.name;
          }
          if (!beneficiaryName) {
            beneficiaryName =
              user?.selectedBeneficiary?.name ||
              user?.referredCharity?.name ||
              "Charity";
          }

          // For discount redemptions: prefer vendor data, never fall back to charity name
          const brandName =
            t.vendors?.name ||
            t.vendor_name ||
            meta.vendor_name ||
            (isDonationLike ? beneficiaryName : null) ||
            (isDonationLike ? "Charity" : "Vendor");

          // Use vendor logo from join, metadata, or a placeholder (never the piggy coin for discounts)
          const logoUri =
            t.vendors?.logo_url ||
            t.vendor_logo ||
            meta.vendor_logo_url ||
            null;
          const vendorLogo = logoUri
            ? {uri: logoUri}
            : require("../../../assets/images/piggy-coin.png");

          // Clean up description: strip raw redemption code prefix
          const rawDescription = t.description || "";
          const cleanDescription = rawDescription.startsWith("Discount redemption: ")
            ? rawDescription.slice("Discount redemption: ".length)
            : rawDescription;

          return {
            id: t.id,
            giftId: t.gift_id ?? null,
            donationId: t.donation_id ?? null,
            type: t.type,
            brand: brandName,
            date: new Date(t.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            discount: cleanDescription,
            spending: spentNum != null ? `$${spentNum.toFixed(2)}` : undefined,
            savings:
              savingsNum != null ? `$${savingsNum.toFixed(2)}` : undefined,
            amount: amountNum != null ? `$${amountNum.toFixed(2)}` : undefined,
            spentNumeric: isDonationLike
              ? undefined
              : spentNum != null
                ? spentNum
                : undefined,
            isOneTimeGift: isGift,
            isMonthlyDonation: t.type === "monthly_donation",
            beneficiaryName,
            logo: vendorLogo,
          };
        });

        // Deduplicate backend transactions by gift_id / donation_id
        // (Stripe webhook retries can insert the same gift twice)
        const seenGiftIds = new Set();
        const seenDonationIds = new Set();
        const dedupedBackend = transformedBackend.filter((t) => {
          if (t.giftId) {
            if (seenGiftIds.has(t.giftId)) return false;
            seenGiftIds.add(t.giftId);
          }
          if (t.donationId) {
            if (seenDonationIds.has(t.donationId)) return false;
            seenDonationIds.add(t.donationId);
          }
          return true;
        });

        // Merge: server is source of truth — only add locals whose id is NOT on the server
        // (e.g. discount redemption saved offline). Previously we prepended almost all cached
        // rows again and doubled history, inflating Total Spent.
        const backendIdSet = new Set(
          dedupedBackend.map((t) => String(t.id)),
        );
        const localOnly = localTransactions.filter(
          (t) =>
            t.id != null &&
            String(t.id).trim() !== "" &&
            !backendIdSet.has(String(t.id)),
        );
        const merged = [...dedupedBackend, ...localOnly].sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateB - dateA;
        });

        if (append) {
          setTransactions((prev) => [...prev, ...merged]);
        } else {
          setTransactions(merged);
        }

        const pg = response.pagination;
        const morePages =
          pg?.has_more ??
          (pg?.page != null &&
            pg?.totalPages != null &&
            Number(pg.page) < Number(pg.totalPages));
        setHasMore(!!morePages);
        setPage(pageNum);
        console.log(
          "✅ Loaded transactions:",
          merged.length,
          "(backend:",
          transformedBackend.length,
          ", local-only:",
          localOnly.length,
          ")",
        );

        // Save merged result to local storage as backup
        if (!append) {
          await AsyncStorage.setItem(
            "userTransactions",
            JSON.stringify(merged),
          );
        }
      } catch (apiError) {
        console.warn(
          "⚠️ Backend API failed, falling back to local storage:",
          apiError.message,
        );

        // Fallback to local storage
        if (localTransactions.length > 0) {
          setTransactions(localTransactions);
          console.log(
            "✅ Loaded transactions from local storage:",
            localTransactions.length,
          );
        } else {
          setTransactions([]);
          console.log("📭 No transactions found");
        }
      }
    } catch (error) {
      console.error("❌ Error loading transactions:", error);
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
      await AsyncStorage.setItem(
        "userTransactions",
        JSON.stringify(newTransactions),
      );
      setTransactions(newTransactions);
      console.log("✅ Saved transactions to storage:", newTransactions.length);
    } catch (error) {
      console.error("❌ Error saving transactions:", error);
    }
  };

  // Update transaction amounts
  const updateTransactionAmounts = (
    transactionId,
    newSpendingAmount,
    newSavingsAmount,
  ) => {
    const updatedTransactions = transactions.map((transaction) => {
      console.log(
        "🔍 TransactionHistory - updating transaction:=====================`",
        transaction,
      );
      if (transaction.id === transactionId) {
        const oldSavings = transaction.savings
          ? parseFloat(transaction.savings.replace("$", ""))
          : 0;
        const newSavings = parseFloat(newSavingsAmount.replace("$", ""));
        const difference = newSavings - oldSavings;

        // Update the transaction
        const updatedTransaction = {
          ...transaction,
          spending: newSpendingAmount.startsWith("$")
            ? newSpendingAmount
            : `$${newSpendingAmount}`,
          savings: newSavingsAmount.startsWith("$")
            ? newSavingsAmount
            : `$${newSavingsAmount}`,
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
    const transactionToDelete = transactions.find(
      (t) => t.id === transactionId,
    );
    if (transactionToDelete && transactionToDelete.savings) {
      // Subtract the savings from total when deleting (only for regular transactions)
      const savingsAmount = parseFloat(
        transactionToDelete.savings.replace("$", ""),
      );
      addSavings(-savingsAmount); // Subtract the amount
    }

    const updatedTransactions = transactions.filter(
      (t) => t.id !== transactionId,
    );
    saveTransactions(updatedTransactions);
  };

  // Use real user data for totals
  const totalSavings = user.totalSavings || 0;
  const totalSpent = transactions.reduce(
    (sum, item) => sum + getTransactionSpentAmount(item),
    0,
  );

  const renderItem = ({ item }) => {
    const logoSource = item.logo?.uri ? item.logo : null;
    const initials = (item.brand || "V").slice(0, 2).toUpperCase();

    return (
      <View style={styles.transactionCard}>
        <View style={styles.cardHeader}>
          <View style={styles.brandSection}>
            {logoSource ? (
              <Image
                source={logoSource}
                style={styles.brandLogo}
                defaultSource={require("../../../assets/images/piggy-coin.png")}
              />
            ) : (
              <View style={[styles.brandLogo, styles.initialsLogo]}>
                <Text style={styles.initialsText}>{initials}</Text>
              </View>
            )}
            <View style={styles.brandInfo}>
              <Text style={styles.brandName}>{item.brand}</Text>
              <Text style={styles.transactionDate}>{item.date}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setEditingTransaction(item)}
          >
            <Feather name="edit-2" size={16} color="#DB8633" />
          </TouchableOpacity>
        </View>

        {!!item.discount && (
          <View style={styles.discountSection}>
            <Text style={styles.discountLabel}>Discount Used</Text>
            <Text style={styles.discountValue}>{item.discount}</Text>
          </View>
        )}

        <View style={styles.financialSection}>
          <View style={styles.financialItem}>
            <Text style={styles.financialLabel}>Spent</Text>
            <Text style={styles.spentAmount}>{item.spending || "—"}</Text>
          </View>
          <View style={styles.financialDivider} />
          <View style={styles.financialItem}>
            <Text style={styles.financialLabel}>Saved</Text>
            <Text style={styles.savedAmount}>{item.savings || "—"}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container} key={refreshTrigger}>
      {/* Standardized Header */}
      <LinearGradient colors={['#21555b', '#2d7a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push("/(tabs)/menu")}
        >
          <Image
            source={require("../../../assets/icons/arrow-left.png")}
            style={{ width: 24, height: 24, tintColor: "#fff" }}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Savings Tracker</Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>

      {/* Summary Cards */}
      <View style={styles.summarySection}>
        <LinearGradient colors={['#21555b', '#2d7a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Feather name="dollar-sign" size={20} color="#fff" />
          </View>
          <Text style={styles.summaryValue}>${totalSpent.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total Spent</Text>
        </LinearGradient>

        <LinearGradient colors={['#21555b', '#2d7a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Feather name="trending-up" size={20} color="#fff" />
          </View>
          <Text style={styles.summaryValue}>${totalSavings.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total Saved</Text>
        </LinearGradient>
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
            keyExtractor={(item, index) => {
              const id =
                item.id != null && item.id !== "" ? String(item.id) : null;
              return id ? `tx-${id}-${index}` : `tx-local-${index}`;
            }}
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
              Discounts you redeem will appear here. You can also edit your
              spend and savings amounts after the fact.
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
            updateTransactionAmounts(
              editingTransaction.id,
              newSpendingAmount,
              newSavingsAmount,
            );
          }
        }}
      />
    </View>
  );
}

// Edit Transaction Modal Component
function EditSavingsModal({ visible, transaction, onClose, onSave }) {
  const [spendingAmount, setSpendingAmount] = useState("");
  const [savingsAmount, setSavingsAmount] = useState("");

  // Pre-populate amounts when editing
  useEffect(() => {
    if (transaction) {
      setSpendingAmount(
        transaction.spending ? transaction.spending.replace("$", "") : "",
      );
      setSavingsAmount(
        transaction.savings ? transaction.savings.replace("$", "") : "",
      );
    }
  }, [transaction]);

  const handleSave = () => {
    // Basic validation
    if (!spendingAmount || isNaN(parseFloat(spendingAmount))) {
      Alert.alert("Invalid Amount", "Please enter a valid spending amount.");
      return;
    }

    if (!savingsAmount || isNaN(parseFloat(savingsAmount))) {
      Alert.alert("Invalid Amount", "Please enter a valid savings amount.");
      return;
    }

    const spending = parseFloat(spendingAmount);
    const savings = parseFloat(savingsAmount);
    if (savings > spending) {
      Alert.alert(
        "Invalid Amount",
        "Savings cannot be greater than your total bill. Please enter a savings amount that does not exceed the amount spent.",
      );
      return;
    }

    onSave(spendingAmount, savingsAmount);
  };

  if (!transaction) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
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
              <Image
                source={transaction.logo}
                style={styles.transactionInfoLogo}
              />
              <View style={styles.transactionInfoDetails}>
                <Text style={styles.transactionInfoBrand}>
                  {transaction.brand}
                </Text>
                <Text style={styles.transactionInfoDate}>
                  {transaction.date}
                </Text>
              </View>
            </View>
            <Text style={styles.transactionInfoDiscount}>
              {transaction.discount}
            </Text>
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
    backgroundColor: "#fff",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  backButton: {
    // Standard back button with no custom styling
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 32,
  },
  refreshButton: {
    padding: 8,
  },
  summarySection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
  },
  summaryIcon: {
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 5,
  },
  summaryLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
  },
  transactionsSection: {
    marginTop: 20,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#21555b",
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: "#21555b",
    paddingLeft: 10,
  },
  transactionsList: {
    flex: 1,
  },
  listContainer: {
    paddingBottom: 40,
  },
  transactionCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  brandSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  brandLogo: {
    width: 40,
    height: 40,
    resizeMode: "contain",
    borderRadius: 8,
    marginRight: 10,
  },
  brandInfo: {
    flex: 1,
  },
  brandName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#324E58",
  },
  transactionDate: {
    fontSize: 12,
    color: "#888",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2F7",
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statusText: {
    fontSize: 12,
    color: "#10B981",
    marginLeft: 5,
  },
  discountSection: {
    marginBottom: 10,
  },
  discountLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 5,
  },
  discountValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#324E58",
  },
  financialSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  financialItem: {
    alignItems: "center",
  },
  financialLabel: {
    fontSize: 12,
    color: "#999",
  },
  spentAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#324E58",
  },
  financialDivider: {
    width: 1,
    height: "80%",
    backgroundColor: "#eee",
  },
  savedAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#324E58",
  },
  noTransactionsMessage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  noTransactionsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#324E58",
    marginTop: 16,
    marginBottom: 8,
  },
  noTransactionsText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalCancelButton: {
    fontSize: 16,
    color: "#6B7280",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#324E58",
  },
  modalSaveButton: {
    fontSize: 16,
    fontWeight: "600",
    color: "#DB8633",
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
    fontWeight: "600",
    color: "#324E58",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#F9FAFB",
  },
  // Transaction info card styles
  transactionInfoCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  transactionInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  transactionInfoLogo: {
    width: 40,
    height: 40,
    resizeMode: "contain",
    borderRadius: 8,
    marginRight: 12,
  },
  transactionInfoDetails: {
    flex: 1,
  },
  transactionInfoBrand: {
    fontSize: 16,
    fontWeight: "700",
    color: "#324E58",
    marginBottom: 4,
  },
  transactionInfoDate: {
    fontSize: 12,
    color: "#6B7280",
  },
  transactionInfoDiscount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#324E58",
    marginBottom: 8,
  },
  transactionInfoSpending: {
    fontSize: 14,
    color: "#6B7280",
  },
  // Currency input styles
  currencyInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: "600",
    color: "#324E58",
    marginRight: 8,
  },
  currencyTextInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "600",
    color: "#324E58",
  },
  inputHelperText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 8,
    lineHeight: 16,
  },
  initialsLogo: {
    backgroundColor: "#E8F4F5",
    justifyContent: "center",
    alignItems: "center",
  },
  initialsText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#21555b",
  },
});
