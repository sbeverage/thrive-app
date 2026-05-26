// Transaction-by-transaction breakdown for full donor transparency.
// Shows every monthly subscription + one-time gift with: charity, date, donation
// amount, platform fee (subs only), processing fee, and total charged.
// Numbers come from the same getSubscriptionBilling/getOneTimeBilling helpers
// used on the Donation Summary screen.

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import API from "../../lib/api";

const SERVICE_FEE = 3.0;
const CC_RATE = 0.035;

// Same helpers as donationSummary.js — kept in sync so totals reconcile.
function getSubscriptionBilling(rawAmount) {
  const n = Math.round(parseFloat(rawAmount || 0) * 100) / 100;
  if (n <= 0) return { total: 0, donationAmount: 0, serviceFee: 0, ccFee: 0 };
  const isBase = n === Math.round(n);
  if (isBase) {
    const subtotal = n + SERVICE_FEE;
    const ccFee = Math.round(subtotal * CC_RATE * 100) / 100;
    const total = Math.round((subtotal + ccFee) * 100) / 100;
    return { total, donationAmount: n, serviceFee: SERVICE_FEE, ccFee };
  }
  const baseIfCovered = n / (1 + CC_RATE) - SERVICE_FEE;
  const roundedBase = Math.round(baseIfCovered);
  const expectedTotal =
    Math.round((roundedBase + SERVICE_FEE) * (1 + CC_RATE) * 100) / 100;
  if (Math.abs(n - expectedTotal) < 0.05 && roundedBase > 0) {
    return {
      total: n,
      donationAmount: roundedBase,
      serviceFee: SERVICE_FEE,
      ccFee: Math.round((n - roundedBase - SERVICE_FEE) * 100) / 100,
    };
  }
  return {
    total: n,
    donationAmount: Math.max(0, Math.round((n - SERVICE_FEE) * 100) / 100),
    serviceFee: SERVICE_FEE,
    ccFee: 0,
  };
}

function getOneTimeBilling(rawAmount) {
  const n = Math.round(parseFloat(rawAmount || 0) * 100) / 100;
  if (n <= 0) return { total: 0, donationAmount: 0, ccFee: 0 };
  const isBase = n === Math.round(n);
  if (isBase) {
    const ccFee = Math.round((n * CC_RATE + 0.3) * 100) / 100;
    return { total: n + ccFee, donationAmount: n, ccFee };
  }
  // Fee-inclusive: total = base * 1.029 + 0.30
  const base = Math.max(0, Math.round(((n - 0.3) / 1.029) * 100) / 100);
  return {
    total: n,
    donationAmount: base,
    ccFee: Math.round((n - base) * 100) / 100,
  };
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusPillStyle(status) {
  const s = String(status || "").toLowerCase();
  if (["paid", "completed", "succeeded", "active"].includes(s)) {
    return { bg: "#E6F4EA", fg: "#1E7A3D", label: "Paid" };
  }
  if (["pending", "processing"].includes(s)) {
    return { bg: "#FFF4E0", fg: "#A05A00", label: "Pending" };
  }
  if (["failed", "canceled", "cancelled", "refunded"].includes(s)) {
    return { bg: "#FCE8E8", fg: "#A02020", label: s.charAt(0).toUpperCase() + s.slice(1) };
  }
  return { bg: "#EEF2F5", fg: "#324E58", label: s ? s.charAt(0).toUpperCase() + s.slice(1) : "—" };
}

export default function TransactionDetails() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  // Shared info modals — same explanation regardless of which row was tapped.
  const [showDonationAmountInfo, setShowDonationAmountInfo] = useState(false);
  const [showPlatformFeeInfo, setShowPlatformFeeInfo] = useState(false);
  const [showCardFeeInfo, setShowCardFeeInfo] = useState(false);

  const loadTransactions = useCallback(async () => {
    try {
      const [monthlyRes, giftsRes] = await Promise.all([
        API.getMonthlyDonations().catch(() => null),
        API.getOneTimeGiftHistory(1, 200).catch(() => null),
      ]);

      const subs = Array.isArray(monthlyRes?.subscriptions)
        ? monthlyRes.subscriptions
        : [];
      const gifts = Array.isArray(giftsRes?.gifts) ? giftsRes.gifts : [];

      const monthlyEntries = subs.map((sub) => {
        const billing = getSubscriptionBilling(sub?.amount);
        const charity =
          sub?.charity_name ||
          sub?.beneficiary_name ||
          sub?.beneficiary?.name ||
          "Your chosen charity";
        return {
          id: `sub-${sub?.id ?? sub?.stripe_subscription_id ?? Math.random()}`,
          kind: "subscription",
          charity,
          date: sub?.created_at || sub?.last_payment_date || sub?.next_payment_date,
          status: sub?.status,
          billing,
        };
      });

      const giftEntries = gifts
        .filter((g) => {
          const s = String(g?.status || "").toLowerCase();
          return !["failed", "canceled", "cancelled", "refunded"].includes(s);
        })
        .map((g) => {
          const billing = getOneTimeBilling(g?.amount);
          const charity =
            g?.charity_name ||
            g?.beneficiary_name ||
            g?.beneficiary?.name ||
            "Your chosen charity";
          return {
            id: `gift-${g?.id ?? Math.random()}`,
            kind: "one_time",
            charity,
            date: g?.created_at || g?.donation_date,
            status: g?.status,
            billing,
          };
        });

      const all = [...monthlyEntries, ...giftEntries].sort((a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();
        return db - da;
      });
      setTransactions(all);
    } catch (e) {
      console.warn("[TransactionDetails] load failed:", e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTransactions();
    }, [loadTransactions]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadTransactions();
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Image
            source={require("../../../assets/icons/arrow-left.png")}
            style={{ width: 24, height: 24, tintColor: "#324E58" }}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#DB8633"
          />
        }
      >
        <View style={styles.introCard}>
          <Feather name="info" size={18} color="#21555b" />
          <Text style={styles.introText}>
            Every dollar, broken down. We believe in 100% transparency — here's
            exactly where each gift goes.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#DB8633" />
            <Text style={styles.loadingText}>Loading transactions…</Text>
          </View>
        ) : transactions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptySubtitle}>
              Your monthly donations and one-time gifts will appear here as
              soon as your first payment processes.
            </Text>
          </View>
        ) : (
          transactions.map((t) => {
            const pill = statusPillStyle(t.status);
            const isSubscription = t.kind === "subscription";
            return (
              <View key={t.id} style={styles.txCard}>
                <View style={styles.txHeader}>
                  <View style={styles.txHeaderLeft}>
                    <Text style={styles.txCharity} numberOfLines={1}>
                      {t.charity}
                    </Text>
                    <Text style={styles.txDate}>
                      {formatDate(t.date)} ·{" "}
                      {isSubscription ? "Monthly" : "One-time gift"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: pill.bg },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: pill.fg }]}>
                      {pill.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.donationHero}>
                  <View style={styles.labelWithInfo}>
                    <Text style={styles.donationHeroLabel}>Donation Amount</Text>
                    <TouchableOpacity
                      onPress={() => setShowDonationAmountInfo(true)}
                      style={styles.infoIconButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Image
                        source={require("../../../assets/icons/info.png")}
                        style={styles.infoIcon}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.donationHeroAmount}>
                    ${t.billing.donationAmount.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.feeRows}>
                  {isSubscription && (
                    <View style={styles.feeRow}>
                      <View style={styles.labelWithInfo}>
                        <Text style={styles.feeLabel}>Platform Fee</Text>
                        <TouchableOpacity
                          onPress={() => setShowPlatformFeeInfo(true)}
                          style={styles.infoIconButton}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Image
                            source={require("../../../assets/icons/info.png")}
                            style={styles.infoIcon}
                          />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.feeValue}>
                        ${(t.billing.serviceFee || 0).toFixed(2)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.feeRow}>
                    <View style={styles.labelWithInfo}>
                      <Text style={styles.feeLabel}>Card Processing Fee</Text>
                      <TouchableOpacity
                        onPress={() => setShowCardFeeInfo(true)}
                        style={styles.infoIconButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Image
                          source={require("../../../assets/icons/info.png")}
                          style={styles.infoIcon}
                        />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.feeValue}>
                      ${(t.billing.ccFee || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.feeDivider} />
                  <View style={styles.feeRow}>
                    <Text style={styles.totalLabel}>Total Charged</Text>
                    <Text style={styles.totalValue}>
                      ${(t.billing.total || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.footnote}>
          <Text style={styles.footnoteText}>
            Platform fees keep THRIVE running. Card processing fees go to the
            payment provider. <Text style={styles.footnoteBold}>100%</Text> of
            your donation amount goes directly to the charity you chose.
          </Text>
        </View>
      </ScrollView>

      {/* Donation Amount Info Modal */}
      <Modal
        visible={showDonationAmountInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDonationAmountInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDonationAmountInfo(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Donation Amount</Text>
            <Text style={styles.modalText}>
              100% of this amount goes directly to your chosen charity. No
              fees come out of this — it goes straight to the cause you support.
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowDonationAmountInfo(false)}
            >
              <Text style={styles.modalCloseButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Platform Fee Info Modal */}
      <Modal
        visible={showPlatformFeeInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPlatformFeeInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPlatformFeeInfo(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Platform Fee</Text>
            <Text style={styles.modalText}>
              Your $3 monthly platform fee helps power THRIVE — supporting the
              technology, operations, and growth needed to expand impact
              across more communities.
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowPlatformFeeInfo(false)}
            >
              <Text style={styles.modalCloseButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Card Processing Fee Info Modal */}
      <Modal
        visible={showCardFeeInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCardFeeInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCardFeeInfo(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Card Processing Fee</Text>
            <Text style={styles.modalText}>
              Payment processors charge a small fee (3.5%) to securely handle
              your donation. This fee goes to the payment provider — not to
              THRIVE or your charity.
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowCardFeeInfo(false)}
            >
              <Text style={styles.modalCloseButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5FA" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#324E58",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  introCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#EAF3F4",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  introText: {
    flex: 1,
    color: "#21555b",
    fontSize: 13,
    lineHeight: 19,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#7A8D9C",
    fontSize: 13,
  },
  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#324E58",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#7A8D9C",
    textAlign: "center",
    lineHeight: 19,
  },
  txCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#21555b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  txHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  txHeaderLeft: { flex: 1, paddingRight: 10 },
  txCharity: {
    fontSize: 16,
    fontWeight: "700",
    color: "#21555b",
  },
  txDate: {
    marginTop: 3,
    fontSize: 12,
    color: "#7A8D9C",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  donationHero: {
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#DB8633",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  donationHeroLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#324E58",
  },
  labelWithInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  infoIconButton: {
    padding: 2,
    marginLeft: 3,
  },
  infoIcon: {
    width: 16,
    height: 16,
    tintColor: "#DB8633",
  },
  donationHeroAmount: {
    fontSize: 20,
    fontWeight: "800",
    color: "#DB8633",
  },
  feeRows: {
    paddingHorizontal: 4,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  feeLabel: {
    fontSize: 13,
    color: "#7A8D9C",
  },
  feeValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#324E58",
  },
  feeDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#21555b",
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#21555b",
  },
  footnote: {
    marginTop: 10,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  footnoteText: {
    fontSize: 12,
    color: "#7A8D9C",
    lineHeight: 18,
  },
  footnoteBold: {
    fontWeight: "800",
    color: "#21555b",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "50%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E1E1E5",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#324E58",
    marginBottom: 16,
    textAlign: "center",
  },
  modalText: {
    fontSize: 16,
    color: "#6d6e72",
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 24,
  },
  modalCloseButton: {
    backgroundColor: "#DB8633",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: "center",
  },
  modalCloseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
