// Full donationSummary.js with ScrollPicker integrated + fixes

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useFocusEffect } from "expo-router";
import { AntDesign, Feather } from "@expo/vector-icons";
import { useUser } from "../../context/UserContext";
import { useBeneficiary } from "../../context/BeneficiaryContext";
import API from "../../lib/api";

function formatDonationBreakdownDate(donation) {
  if (donation.created_at) {
    const d = new Date(donation.created_at);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  if (donation.date) {
    const d = new Date(donation.date);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  const m = donation.month;
  if (m && /^\d{4}-\d{2}$/.test(String(m))) {
    const [y, mo] = String(m).split("-").map(Number);
    const d = new Date(y, mo - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (m) return String(m);
  return "—";
}

function formatNextPaymentLabel(isoDate) {
  if (!isoDate) return null;
  const s = String(isoDate);
  const d = s.includes("T") ? new Date(s) : new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBillingDate(value) {
  if (!value) return "—";
  if (typeof value === "number") {
    const d = new Date(value * 1000);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  const s = String(value);
  const d = s.includes("T") ? new Date(s) : new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DonationSummary() {
  const router = useRouter();
  const { user, loadUserData } = useUser();
  const { selectedBeneficiary, reloadBeneficiary } = useBeneficiary();
  const [donationSummary, setDonationSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSubscriptionId, setActiveSubscriptionId] = useState(null);
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [billingPreview, setBillingPreview] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const isFetchingRef = useRef(false);
  const lastFetchTsRef = useRef(0);
  const loadUserDataRef = useRef(loadUserData);
  loadUserDataRef.current = loadUserData;

  // Debug logging
  useEffect(() => {
    console.log("🔍 DonationSummary - User data:", user);
    console.log("🔍 DonationSummary - Monthly donation:", user.monthlyDonation);
    console.log(
      "🔍 DonationSummary - Selected beneficiary:",
      selectedBeneficiary,
    );
  }, [user, selectedBeneficiary]);

  const { currentPeriodStart, currentPeriodEnd, effectiveFrom } = useMemo(() => {
    const start = formatBillingDate(
      activeSubscription?.current_period_start,
    );
    const end = formatBillingDate(
      billingPreview?.billing?.current_period_end ||
        activeSubscription?.current_period_end_date ||
        activeSubscription?.current_period_end ||
        activeSubscription?.next_payment_date,
    );
    const effective = formatBillingDate(
      billingPreview?.billing?.effective_from ||
        activeSubscription?.effective_from ||
        activeSubscription?.current_period_end_date ||
        activeSubscription?.current_period_end,
    );
    return {
      currentPeriodStart: start,
      currentPeriodEnd: end,
      effectiveFrom: effective,
    };
  }, [billingPreview, activeSubscription]);

  useEffect(() => {
    console.log("📅 DonationSummary Billing Schedule (UI values):", {
      currentPeriodStart,
      currentPeriodEnd,
      effectiveFrom,
      raw: {
        billingPreview: billingPreview?.billing ?? null,
        activeSubscription: activeSubscription
          ? {
              current_period_start: activeSubscription.current_period_start,
              current_period_end: activeSubscription.current_period_end,
              current_period_end_date:
                activeSubscription.current_period_end_date,
              next_payment_date: activeSubscription.next_payment_date,
              effective_from: activeSubscription.effective_from,
            }
          : null,
      },
    });
  }, [
    currentPeriodStart,
    currentPeriodEnd,
    effectiveFrom,
    billingPreview,
    activeSubscription,
  ]);

  const loadActiveSubscriptionId = async () => {
    try {
      setIsLoading(true);
      const response = await API.getMonthlyDonations();
      const subscriptions = response?.subscriptions || [];
      const activeSubscription = (response?.subscriptions || []).find((sub) => {
        const status = String(sub?.status || "").toLowerCase();
        return (
          status === "active" ||
          status === "trialing" ||
          status === "cancelling"
        );
      });
      setActiveSubscription(activeSubscription || null);

      // Build screen summary from the same payload to avoid extra API calls.
      const monthlyBreakdown = subscriptions.map((sub) => ({
        amount: sub?.amount || 0,
        status: sub?.status || "",
        created_at: sub?.created_at || sub?.last_payment_date || null,
        beneficiary_name: sub?.charity_name || null,
        charity_name: sub?.charity_name || null,
      }));
      const paidTotal = subscriptions.reduce((sum, sub) => {
        const status = String(sub?.status || "").toLowerCase();
        if (
          status === "paid" ||
          status === "completed" ||
          status === "succeeded"
        ) {
          return sum + Number(sub?.amount || 0);
        }
        return sum;
      }, 0);
      setDonationSummary({
        total_monthly_amount: activeSubscription?.amount || 0,
        total_donated: paidTotal,
        active_subscriptions: subscriptions.filter((sub) => {
          const status = String(sub?.status || "").toLowerCase();
          return (
            status === "active" ||
            status === "trialing" ||
            status === "cancelling"
          );
        }).length,
        monthly_breakdown: monthlyBreakdown,
        next_payment_date: activeSubscription?.next_payment_date || null,
        beneficiary_name: activeSubscription?.charity_name || null,
      });

      setActiveSubscriptionId(
        activeSubscription?.stripe_subscription_id ||
          activeSubscription?.subscription_id ||
          activeSubscription?.id ||
          null,
      );
    } catch (error) {
      console.error("❌ Error loading donation summary:", error);
      setDonationSummary(null);
      setActiveSubscription(null);
      setActiveSubscriptionId(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBillingPreview = async () => {
    try {
      const raw = await AsyncStorage.getItem("monthlyBillingPreview");
      if (!raw) {
        setBillingPreview(null);
        return;
      }
      const parsed = JSON.parse(raw);
      setBillingPreview(parsed);
    } catch (error) {
      setBillingPreview(null);
    }
  };

  const loadScreenData = useCallback(async (force = false) => {
    const now = Date.now();
    const last = lastFetchTsRef.current;
    const recentlyFetched = last > 0 && now - last < 5000;

    if (!force && (isFetchingRef.current || recentlyFetched)) {
      return;
    }

    isFetchingRef.current = true;
    try {
      await Promise.all([loadActiveSubscriptionId(), loadBillingPreview()]);
      lastFetchTsRef.current = Date.now();
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // One path per focus: avoids duplicate GET /api/donations/* from mount + focus + unstable deps
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const run = async () => {
        await loadUserDataRef.current();
        await reloadBeneficiary?.();
        if (!cancelled) {
          await loadScreenData();
        }
      };
      run();
      return () => {
        cancelled = true;
      };
    }, [reloadBeneficiary, loadScreenData]),
  );

  const handleCancelSubscription = () => {
    if (!activeSubscriptionId || isCancelling) return;
    Alert.alert(
      "Cancel Monthly Subscription",
      "Your subscription will remain active until the end of the current billing period and then cancel automatically.",
      [
        { text: "Keep Subscription", style: "cancel" },
        {
          text: "Cancel at Period End",
          style: "destructive",
          onPress: async () => {
            try {
              setIsCancelling(true);
              await API.cancelMonthlyAtPeriodEnd(activeSubscriptionId);
              Alert.alert(
                "Cancellation Scheduled",
                "Your subscription will cancel at the end of the current billing period.",
              );
              await Promise.all([
                loadActiveSubscriptionId(),
                AsyncStorage.removeItem("monthlyBillingPreview"),
              ]);
              setBillingPreview(null);
            } catch (error) {
              Alert.alert(
                "Cancellation Failed",
                error.message ||
                  "Could not cancel subscription. Please try again.",
              );
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ],
    );
  };

  // Use API data if available, otherwise fallback to local data
  const monthlyDonationAmount =
    donationSummary?.total_monthly_amount || user.monthlyDonation || 15;
  const beneficiaryFromUser =
    user?.selectedBeneficiary || user?.referredCharity || null;
  const resolvedBeneficiary = selectedBeneficiary || beneficiaryFromUser;
  const currentCharity =
    resolvedBeneficiary?.name ||
    donationSummary?.beneficiary_name ||
    "No charity selected";
  const totalDonated = donationSummary?.total_donated || 0;
  const monthlyBreakdown = donationSummary?.monthly_breakdown || [];
  const hasCompletedDonations = totalDonated > 0 || monthlyBreakdown.length > 0;
  const nextPaymentLabel = formatNextPaymentLabel(
    donationSummary?.next_payment_date,
  );
  const currentBillingAmount =
    Number(
      billingPreview?.billing?.current_amount ??
        activeSubscription?.current_amount ??
        activeSubscription?.amount ??
        monthlyDonationAmount,
    ) || 0;
  const nextBillingAmount =
    Number(
      billingPreview?.billing?.next_amount ??
        activeSubscription?.next_amount ??
        activeSubscription?.amount ??
        monthlyDonationAmount,
    ) || 0;

  return (
    <View style={styles.container}>
      {/* Standardized Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/(tabs)/menu")}
        >
          <Image
            source={require("../../../assets/icons/arrow-left.png")}
            style={{ width: 24, height: 24, tintColor: "#324E58" }}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Donation Summary</Text>
        <TouchableOpacity
          style={styles.downloadButton}
          onPress={() => {
            loadUserData();
            loadScreenData(true);
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#DB8633" />
          ) : (
            <Feather name="refresh-cw" size={20} color="#DB8633" />
          )}
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Charity Card */}
        <View style={styles.charityCard}>
          <View style={styles.charityHeader}>
            <Image
              source={
                resolvedBeneficiary?.image ||
                require("../../../assets/images/child-cancer.jpg")
              }
              style={styles.charityLogo}
            />
            <View style={styles.charityInfo}>
              <Text style={styles.charityTitle}>Current Beneficiary</Text>
              <Text style={styles.charityName}>{currentCharity}</Text>
            </View>
          </View>
          <View style={styles.charityStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                ${parseFloat(totalDonated || 0).toFixed(2)}
              </Text>
              <Text style={styles.statLabel}>Total Donated</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                ${parseFloat(monthlyDonationAmount || 0).toFixed(2)}
              </Text>
              <Text style={styles.statLabel}>Monthly Amount</Text>
              <TouchableOpacity
                style={styles.editAmountButton}
                onPress={() => router.push("/menu/editDonationAmount")}
              >
                <Text style={styles.editAmountText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {donationSummary?.active_subscriptions ||
                  monthlyBreakdown.filter(
                    (d) => d.status === "completed" || d.status === "paid",
                  ).length ||
                  0}
              </Text>
              <Text style={styles.statLabel}>Months Active</Text>
            </View>
          </View>
          {!!activeSubscriptionId && (
            <TouchableOpacity
              style={[
                styles.cancelSubscriptionButton,
                isCancelling && styles.cancelSubscriptionButtonDisabled,
              ]}
              onPress={handleCancelSubscription}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.cancelSubscriptionButtonText}>
                  Cancel at Period End
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Monthly Breakdown */}
        <View style={styles.breakdownSection}>
          <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#DB8633" />
              <Text style={styles.loadingText}>
                Loading donation history...
              </Text>
            </View>
          ) : hasCompletedDonations && monthlyBreakdown.length > 0 ? (
            monthlyBreakdown.map((donation, index) => (
              <View
                key={
                  donation.created_at
                    ? `${donation.created_at}-${index}`
                    : `row-${index}`
                }
                style={styles.donationRow}
              >
                <View style={styles.donationInfo}>
                  <Text style={styles.donationMonth}>
                    {formatDonationBreakdownDate(donation)}
                  </Text>
                  <Text style={styles.donationCharity}>
                    {donation.charity_name ||
                      donation.beneficiary_name ||
                      resolvedBeneficiary?.name ||
                      currentCharity}
                  </Text>
                </View>
                <View style={styles.donationRight}>
                  <Text style={styles.donationAmount}>
                    $
                    {parseFloat(
                      donation.amount || donation.donation_amount || 0,
                    ).toFixed(2)}
                  </Text>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          donation.status === "completed" ||
                          donation.status === "paid"
                            ? "#10B981"
                            : "#F59E0B",
                      },
                    ]}
                  />
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noDonationsMessage}>
              <Text style={styles.noDonationsText}>
                You haven't made any donations yet. Your first donation of $
                {parseFloat(monthlyDonationAmount || 0).toFixed(2)} will be
                processed this month.
              </Text>
            </View>
          )}
        </View>

        {/* Tax Summary */}
        <View style={styles.taxSection}>
          <Text style={styles.sectionTitle}>Tax Summary</Text>
          <View style={styles.taxCard}>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Total Donations (2024)</Text>
              <Text style={styles.taxValue}>
                ${parseFloat(totalDonated || 0).toFixed(2)}
              </Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Charity Name</Text>
              <Text style={styles.taxValue}>Thrive Initiative, Inc.</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>EIN Number</Text>
              <Text style={styles.taxValue}>81-3223950</Text>
            </View>
            {!hasCompletedDonations && (
              <View style={styles.taxRow}>
                <Text style={styles.taxLabel}>Next Donation</Text>
                <Text style={styles.taxValue}>
                  ${parseFloat(monthlyDonationAmount || 0).toFixed(2)}
                  {nextPaymentLabel ? ` (due ${nextPaymentLabel})` : ""}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.taxSection}>
          <Text style={styles.sectionTitle}>Billing Schedule</Text>
          <View style={styles.taxCard}>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Current Amount</Text>
              <Text style={styles.taxValue}>
                ${currentBillingAmount.toFixed(2)}
              </Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Next Amount</Text>
              <Text style={styles.taxValue}>
                ${nextBillingAmount.toFixed(2)}
              </Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Current Period Start</Text>
              <Text style={styles.taxValue}>{currentPeriodStart}</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Current Period End</Text>
              <Text style={styles.taxValue}>{currentPeriodEnd}</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Effective From</Text>
              <Text style={styles.taxValue}>{effectiveFrom}</Text>
            </View>
          </View>
        </View>

        {/* Bottom Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 20 },
  scrollContainer: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backButton: {
    // Standard back button with no custom styling
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6d6e72",
    textAlign: "center",
    flex: 1,
  },
  downloadButton: {
    padding: 8,
  },
  charityCard: {
    backgroundColor: "#F5F5FA",
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    alignItems: "center",
  },
  charityHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  charityLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  charityInfo: {
    flex: 1,
  },
  charityTitle: {
    fontSize: 14,
    color: "#324E58",
    marginBottom: 2,
  },
  charityName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#DB8633",
  },
  charityStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#DB8633",
  },
  statLabel: {
    fontSize: 12,
    color: "#324E58",
    marginTop: 5,
  },
  editAmountButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#DB8633",
    borderRadius: 6,
  },
  editAmountText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "600",
  },
  statDivider: {
    width: 1,
    height: "80%",
    backgroundColor: "#eee",
  },
  breakdownSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: "#F5F5FA",
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#324E58",
    marginBottom: 15,
  },
  donationsList: {
    // No specific styles needed for ScrollView, content is handled by donationRow
  },
  donationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  donationInfo: {
    flex: 1,
  },
  donationMonth: {
    fontSize: 16,
    color: "#324E58",
    marginBottom: 2,
  },
  donationCharity: {
    fontSize: 14,
    color: "#666",
  },
  donationRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  donationAmount: {
    fontSize: 16,
    fontWeight: "500",
    color: "#324E58",
    marginRight: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  taxSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: "#F5F5FA",
    borderRadius: 12,
  },
  taxCard: {
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  taxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  taxLabel: {
    fontSize: 14,
    color: "#324E58",
  },
  taxValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DB8633",
  },
  noDonationsMessage: {
    padding: 20,
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E9ECEF",
    borderStyle: "dashed",
  },
  noDonationsText: {
    fontSize: 14,
    color: "#6C757D",
    textAlign: "center",
    lineHeight: 20,
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: "#6C757D",
  },
  cancelSubscriptionButton: {
    marginTop: 16,
    backgroundColor: "#D9534F",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelSubscriptionButtonDisabled: {
    opacity: 0.7,
  },
  cancelSubscriptionButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
    textAlign: "center",
  },
});
