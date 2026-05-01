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
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
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
  if (donation.next_payment_date) {
    const s = String(donation.next_payment_date);
    const d = s.includes("T") ? new Date(s) : new Date(`${s}T12:00:00`);
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

function statusDotColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed" || s === "paid" || s === "succeeded") {
    return "#10B981";
  }
  if (
    s === "active" ||
    s === "trialing" ||
    s === "cancelling" ||
    s === "pending"
  ) {
    return "#3B82F6";
  }
  if (s === "canceled" || s === "cancelled" || s === "unpaid") {
    return "#9CA3AF";
  }
  return "#F59E0B";
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

/** Stripe subscription id for cancel API — must start with sub_ */
function pickStripeSubscriptionId(sub) {
  if (!sub || typeof sub !== "object") return null;
  const candidates = [
    sub.stripe_subscription_id,
    sub.stripeSubscriptionId,
    sub.subscription_stripe_id,
    sub.subscription_id,
  ];
  for (const c of candidates) {
    if (c != null && String(c).startsWith("sub_")) {
      return String(c);
    }
  }
  return null;
}

function isSubscriptionRowEligible(sub) {
  const status = String(sub?.status || "").toLowerCase();
  return [
    "active",
    "trialing",
    "cancelling",
    "pending",
    "past_due",
    "incomplete",
    "unpaid",
  ].includes(status);
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

/** Stripe often omits current_period_start for incomplete/pending subs; match billing-preview API: ~1 month before period end. */
function approximatePeriodStartFromEnd(dateStr) {
  if (dateStr == null || dateStr === "") return null;
  const s = String(dateStr).trim();
  const d = s.includes("T") ? new Date(s) : new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setMonth(start.getMonth() - 1);
  return start.toISOString().split("T")[0];
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
  const [oneTimeYearTotal, setOneTimeYearTotal] = useState(0);
  const [oneTimeAllTimeTotal, setOneTimeAllTimeTotal] = useState(0);
  const [oneTimeGifts, setOneTimeGifts] = useState([]);
  const isFetchingRef = useRef(false);
  const lastFetchTsRef = useRef(0);
  /** Last good Stripe billing-preview API payload — survives transient failures / re-fetches that would clear state */
  const stripeBillingCacheRef = useRef(null);
  const loadUserDataRef = useRef(loadUserData);
  loadUserDataRef.current = loadUserData;

  const { currentPeriodStart, currentPeriodEnd, effectiveFrom } =
    useMemo(() => {
      const cache = stripeBillingCacheRef.current;
      const cacheOk =
        cache?.forMonthlyDonationId != null &&
        activeSubscription?.id != null &&
        cache.forMonthlyDonationId === activeSubscription.id;
      const b = billingPreview?.billing;
      const c = cacheOk ? cache?.billing : null;

      const rawEnd =
        b?.current_period_end ||
        c?.current_period_end ||
        activeSubscription?.current_period_end_date ||
        activeSubscription?.current_period_end ||
        activeSubscription?.next_payment_date;

      let rawStart =
        b?.current_period_start ||
        c?.current_period_start ||
        activeSubscription?.current_period_start;
      if (!rawStart && rawEnd) {
        rawStart = approximatePeriodStartFromEnd(rawEnd);
      }
      if (!rawStart && activeSubscription?.created_at) {
        rawStart = String(activeSubscription.created_at).split("T")[0];
      }

      const rawEffective =
        b?.effective_from ||
        c?.effective_from ||
        activeSubscription?.effective_from ||
        activeSubscription?.current_period_end_date ||
        activeSubscription?.current_period_end ||
        activeSubscription?.next_payment_date;

      const start = formatBillingDate(rawStart);
      const end = formatBillingDate(rawEnd);
      const effective = formatBillingDate(rawEffective);

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[DonationSummary] Billing schedule period fields", {
          raw: {
            fromState: b ?? null,
            fromCache: c ?? null,
            rawStartBeforeFormat: rawStart,
            activeSubscriptionPeriod: activeSubscription
              ? {
                  current_period_start: activeSubscription.current_period_start,
                  current_period_end: activeSubscription.current_period_end,
                  current_period_end_date:
                    activeSubscription.current_period_end_date,
                  next_payment_date: activeSubscription.next_payment_date,
                  effective_from: activeSubscription.effective_from,
                  created_at: activeSubscription.created_at,
                }
              : null,
          },
          resolved: {
            currentPeriodStart: start,
            currentPeriodEnd: end,
            effectiveFrom: effective,
          },
        });
      }

      return {
        currentPeriodStart: start,
        currentPeriodEnd: end,
        effectiveFrom: effective,
      };
    }, [billingPreview, activeSubscription]);

  const { currentBillingAmount, nextBillingAmount } = useMemo(() => {
    const rows = donationSummary?.monthly_breakdown || [];
    const amounts = rows
      .map((d) => Number(d.amount || d.donation_amount || 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const maxBreakdown = amounts.length ? Math.max(...amounts) : 0;
    const minBreakdown = amounts.length ? Math.min(...amounts) : 0;
    const multiDistinct = amounts.length >= 2 && maxBreakdown > minBreakdown;

    const base =
      Number(activeSubscription?.amount ?? user.monthlyDonation ?? 0) || 0;

    const cache = stripeBillingCacheRef.current;
    const cacheOk =
      cache?.forMonthlyDonationId != null &&
      activeSubscription?.id != null &&
      cache.forMonthlyDonationId === activeSubscription.id;

    const pickNum = (v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const mergedBilling = {
      current_amount:
        billingPreview?.billing?.current_amount ??
        (cacheOk ? cache?.billing?.current_amount : undefined),
      next_amount:
        billingPreview?.billing?.next_amount ??
        (cacheOk ? cache?.billing?.next_amount : undefined),
    };
    const currentFromPreview = pickNum(mergedBilling.current_amount);
    const nextFromPreview = pickNum(mergedBilling.next_amount);

    let current = currentFromPreview ?? 0;
    if (!current) {
      current =
        Number(
          activeSubscription?.current_amount ??
            activeSubscription?.invoice_total ??
            null,
        ) || 0;
    }
    if (!current && maxBreakdown > 0) {
      current = maxBreakdown;
    }
    if (!current) {
      current =
        base ||
        Number(
          donationSummary?.total_monthly_amount || user.monthlyDonation || 0,
        ) ||
        0;
    }
    if (maxBreakdown > base && maxBreakdown > current) {
      current = maxBreakdown;
    }

    // Next recurring: Stripe preview first; never use activeSubscription.amount (often invoice total w/ fees, e.g. 261 vs plan 100)
    let nextAmt;
    if (nextFromPreview !== null) {
      nextAmt = nextFromPreview;
    } else {
      const nextFromSubscriptionOrProfile = Number(
        activeSubscription?.next_amount ?? user.monthlyDonation ?? null,
      );
      if (
        Number.isFinite(nextFromSubscriptionOrProfile) &&
        nextFromSubscriptionOrProfile > 0
      ) {
        nextAmt = nextFromSubscriptionOrProfile;
      } else if (multiDistinct) {
        nextAmt = minBreakdown;
      } else {
        nextAmt = Number(donationSummary?.total_monthly_amount ?? 0) || 0;
      }
    }

    return {
      currentBillingAmount: current,
      nextBillingAmount: nextAmt,
    };
  }, [
    billingPreview,
    activeSubscription,
    donationSummary,
    user.monthlyDonation,
  ]);

  useEffect(() => {
    console.log("[DonationSummary ================== Next Amount", {
      nextBillingAmount,
    });
  }, [nextBillingAmount]);

  const loadActiveSubscriptionId = async () => {
    try {
      setIsLoading(true);
      const response = await API.getMonthlyDonations();
      const subscriptions = response?.subscriptions || [];
      const activeSubscription =
        subscriptions.find((sub) => isSubscriptionRowEligible(sub)) ||
        subscriptions.find((sub) => pickStripeSubscriptionId(sub)) ||
        subscriptions[0] ||
        null;
      setActiveSubscription(activeSubscription || null);

      // Build screen summary from the same payload to avoid extra API calls.
      const monthlyBreakdown = subscriptions.map((sub) => {
        const charityLabel =
          sub?.charity_name ||
          sub?.beneficiary?.name ||
          sub?.beneficiary_name ||
          null;
        return {
          id: sub?.id,
          stripe_subscription_id: sub?.stripe_subscription_id,
          amount: sub?.amount || 0,
          status: sub?.status || "",
          created_at: sub?.created_at || sub?.last_payment_date || null,
          next_payment_date: sub?.next_payment_date || null,
          beneficiary_name: charityLabel,
          charity_name: charityLabel,
        };
      });
      const currentYear = new Date().getFullYear();
      const subscriptionAllTimeTotal = subscriptions.reduce(
        (sum, sub) => sum + Number(sub?.amount || 0),
        0,
      );
      const subscriptionYearTotal = subscriptions.reduce((sum, sub) => {
        const date = new Date(sub?.created_at || sub?.last_payment_date || 0);
        return date.getFullYear() === currentYear
          ? sum + Number(sub?.amount || 0)
          : sum;
      }, 0);
      setDonationSummary({
        total_monthly_amount: activeSubscription?.amount || 0,
        total_donated: subscriptionAllTimeTotal,
        total_donated_this_year: subscriptionYearTotal,
        active_subscriptions: subscriptions.filter((sub) => {
          const status = String(sub?.status || "").toLowerCase();
          return !["canceled", "cancelled"].includes(status);
        }).length,
        monthly_breakdown: monthlyBreakdown,
        next_payment_date: activeSubscription?.next_payment_date || null,
        beneficiary_name: activeSubscription?.charity_name || null,
      });

      const stripeSubId =
        pickStripeSubscriptionId(activeSubscription) ||
        subscriptions.map(pickStripeSubscriptionId).find(Boolean) ||
        null;
      setActiveSubscriptionId(stripeSubId);

      try {
        const preview = await API.getMonthlyBillingPreview(
          activeSubscription?.id,
        );
        if (preview?.success && preview?.billing) {
          const payload = {
            billing: preview.billing,
            subscription: preview.subscription ?? null,
          };
          setBillingPreview(payload);
          stripeBillingCacheRef.current = {
            billing: preview.billing,
            subscription: preview.subscription ?? null,
            forMonthlyDonationId: activeSubscription?.id ?? null,
          };
        } else if (
          preview?.success &&
          !preview?.billing &&
          !preview?.subscription
        ) {
          setBillingPreview(null);
          stripeBillingCacheRef.current = null;
        }
        // On network / 502 errors: keep prior billing + cache so Next Amount does not jump to DB invoice total
      } catch {
        /* keep billingPreview + stripeBillingCacheRef */
      }

      try {
        const oneTimeRes = await API.getOneTimeGiftHistory(1, 100);
        const yearTotal = oneTimeRes?.summary?.this_year_total;
        setOneTimeYearTotal(Number.isFinite(Number(yearTotal)) ? Number(yearTotal) : 0);
        const gifts = (oneTimeRes?.gifts || []).filter((g) => {
          const s = String(g?.status || '').toLowerCase();
          return s === 'succeeded' || s === 'completed' || s === 'paid';
        });
        setOneTimeGifts(gifts);
        const allTimeTotal = gifts.reduce((sum, g) => sum + Number(g.amount || 0), 0);
        setOneTimeAllTimeTotal(allTimeTotal);
      } catch {
        /* keep existing oneTimeYearTotal / oneTimeGifts */
      }
    } catch (error) {
      console.error("❌ Error loading donation summary:", error);
      setDonationSummary(null);
      setActiveSubscription(null);
      setActiveSubscriptionId(null);
      setBillingPreview(null);
    } finally {
      setIsLoading(false);
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
      await loadActiveSubscriptionId();
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
              await loadActiveSubscriptionId();
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
  const totalDonated = (donationSummary?.total_donated || 0) + oneTimeAllTimeTotal;
  const totalDonatedThisYear = (donationSummary?.total_donated_this_year || 0) + (oneTimeYearTotal || 0);
  const monthlyBreakdown = donationSummary?.monthly_breakdown || [];
  const hasCompletedDonations = totalDonated > 0 || monthlyBreakdown.length > 0;
  const nextPaymentLabel = formatNextPaymentLabel(
    donationSummary?.next_payment_date,
  );

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
            <ActivityIndicator size="small" color="#324E58" />
          ) : (
            <Feather name="refresh-cw" size={20} color="#324E58" />
          )}
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Charity Card */}
        <LinearGradient colors={['#21555b', '#2d7a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.charityCard}>
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
                ${Math.round(totalDonated)}
              </Text>
              <Text style={styles.statLabel}>Total Donated</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                ${Math.round(monthlyDonationAmount || 0)}
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
        </LinearGradient>

        {/* Donation Breakdown */}
        <View style={styles.breakdownSection}>
          <Text style={styles.sectionTitle}>Donation Breakdown</Text>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#DB8633" />
              <Text style={styles.loadingText}>
                Loading donation history...
              </Text>
            </View>
          ) : (monthlyBreakdown.length > 0 || oneTimeGifts.length > 0) ? (
            [
              ...monthlyBreakdown.map((d) => ({ ...d, _kind: 'subscription' })),
              ...oneTimeGifts.map((g) => ({ ...g, _kind: 'one_time' })),
            ]
              .sort((a, b) => {
                const dateA = new Date(a.created_at || a.date || 0);
                const dateB = new Date(b.created_at || b.date || 0);
                return dateB - dateA;
              })
              .map((donation, index) => (
              <View
                key={
                  donation._kind === 'one_time'
                    ? `gift-${donation.id ?? index}`
                    : donation.stripe_subscription_id
                      ? `stripe-${donation.stripe_subscription_id}`
                      : donation.id != null
                        ? `sub-${donation.id}`
                        : `row-${index}`
                }
                style={styles.donationRow}
              >
                <View style={styles.donationInfo}>
                  <View style={styles.donationMonthRow}>
                    <Text style={styles.donationMonth}>
                      {formatDonationBreakdownDate(donation)}
                    </Text>
                    {donation._kind === 'one_time' && (
                      <View style={styles.oneTimePill}>
                        <Text style={styles.oneTimePillText}>One-time</Text>
                      </View>
                    )}
                  </View>
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
                      { backgroundColor: statusDotColor(donation.status) },
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
              <Text style={styles.taxLabel}>Total Donations ({new Date().getFullYear()})</Text>
              <Text style={styles.taxValue}>
                ${Math.round(totalDonatedThisYear)}
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
    paddingTop: 8,
    paddingBottom: 8,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  backButton: {
    // Standard back button with no custom styling
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#324E58",
    textAlign: "center",
    flex: 1,
  },
  downloadButton: {
    padding: 8,
  },
  charityCard: {
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 0,
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
    borderWidth: 2,
    borderColor: "#fff",
  },
  charityInfo: {
    flex: 1,
  },
  charityTitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 2,
  },
  charityName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
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
    color: "#fff",
  },
  statLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 5,
  },
  editAmountButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: "#DB8633",
    borderRadius: 8,
  },
  editAmountText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "700",
  },
  statDivider: {
    width: 1,
    height: "80%",
    backgroundColor: "rgba(255,255,255,0.3)",
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
    fontWeight: "700",
    color: "#21555b",
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: "#21555b",
    paddingLeft: 10,
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
  donationMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  donationMonth: {
    fontSize: 16,
    color: "#324E58",
  },
  oneTimePill: {
    backgroundColor: "#FFF3E0",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  oneTimePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#DB8633",
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
