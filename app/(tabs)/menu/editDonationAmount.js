import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
  Animated,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useUser } from "../../context/UserContext";
import { useBeneficiary } from "../../context/BeneficiaryContext";
import API from "../../lib/api";

const SERVICE_FEE = 3.0;
const CREDIT_CARD_FEE_RATE = 0.035;

export default function EditDonationAmount() {
  const router = useRouter();
  const { user, saveUserData } = useUser();
  const MIN_DONATION = user?.coworking ? 1 : 15;
  const { selectedBeneficiary, reloadBeneficiary } = useBeneficiary();

  const [amount, setAmount] = useState(
    user.monthlyDonation?.toString() || "15"
  );
  const [coverFees, setCoverFees] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [savedBeneficiaryId, setSavedBeneficiaryId] = useState(null);
  const [showFeeInfo, setShowFeeInfo] = useState(false);
  const [showDonationInfo, setShowDonationInfo] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const amountInputRef = useRef(null);
  const toggleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadSubscription();
    loadSavedBeneficiary();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      reloadBeneficiary?.();
      loadSavedBeneficiary();
    }, [reloadBeneficiary])
  );

  const loadSavedBeneficiary = async () => {
    try {
      const profile = await API.getProfile();
      if (profile?.preferredCharity || profile?.beneficiary) {
        setSavedBeneficiaryId(profile.preferredCharity || profile.beneficiary);
      }
    } catch (_) {}
  };

  const loadSubscription = async () => {
    try {
      const response = await API.getMonthlyDonations();
      if (response.subscriptions?.length > 0) {
        const sub = response.subscriptions[0];
        setSubscription(sub);
        // user.monthlyDonation is the base donation (e.g. $15); sub.amount is the
        // fee-inclusive total charged. Always display the base so the fee summary
        // below doesn't double-count the service and processing fees.
        const amt = user.monthlyDonation || sub.amount || 15;
        setAmount(amt.toString());
      }
    } catch (_) {}
  };

  const getBeneficiaryId = () => {
    return (
      selectedBeneficiary?.id ||
      user.preferredCharity ||
      user.beneficiary ||
      savedBeneficiaryId ||
      null
    );
  };

  // Live fee calculation
  const parsedAmount = parseFloat(amount) || 0;
  const isValidAmount = parsedAmount >= MIN_DONATION && parsedAmount <= 1000;
  const subtotal = parsedAmount + SERVICE_FEE;
  const processingFee = coverFees ? subtotal * CREDIT_CARD_FEE_RATE : 0;
  const totalCharged = subtotal + processingFee;

  const handleToggleFees = () => {
    Animated.spring(toggleAnim, {
      toValue: coverFees ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
    setCoverFees((v) => !v);
  };

  const handleSave = async () => {
    const donation = parseFloat(amount);
    if (isNaN(donation) || !isValidAmount) {
      Alert.alert(
        "Invalid Amount",
        `Please enter an amount between $${MIN_DONATION} and $1,000.`
      );
      return;
    }

    // Round to cents — this is what Stripe actually charges
    const chargeTotal = Math.round(totalCharged * 100) / 100;

    setIsLoading(true);
    try {
      const beneficiaryId = getBeneficiaryId();
      let apiSucceeded = false;
      let response = null;

      if (subscription) {
        try {
          const id =
            subscription.id ||
            subscription.subscription_id ||
            subscription.stripe_subscription_id;
          response = await API.upgradeOrDowngradeMonthlyAmount(id, chargeTotal);
          apiSucceeded = true;
        } catch (err) {
          if (err?.status === 409) {
            Alert.alert(
              "Payment setup required",
              "Complete first payment setup before changing amount."
            );
            return;
          }
        }
      } else if (beneficiaryId) {
        try {
          response = await API.createMonthlySubscription({
            beneficiary_id: beneficiaryId,
            amount: chargeTotal,
            currency: "USD",
          });
          apiSucceeded = true;
        } catch (_) {}
      }

      // Save the base donation (what goes to the beneficiary) — not the charge total
      await saveUserData({ monthlyDonation: donation });

      if (apiSucceeded) {
        const nextInvoice =
          response?.change?.timing === "next_invoice" || !!subscription;
        Alert.alert(
          "Donation Updated",
          nextInvoice
            ? `Your monthly donation has been updated to $${donation.toFixed(2)} and will apply on your next invoice.`
            : `Your monthly donation has been set to $${donation.toFixed(2)}.`,
          [{ text: "OK", onPress: () => router.replace("/(tabs)/menu") }]
        );
      } else if (!beneficiaryId) {
        Alert.alert(
          "Amount Saved",
          `$${donation.toFixed(2)}/month saved. To enable billing, select a beneficiary and add a payment method.`,
          [
            { text: "OK", onPress: () => router.replace("/(tabs)/menu") },
            {
              text: "Select Beneficiary",
              onPress: () => router.replace("/(tabs)/beneficiary"),
            },
          ]
        );
      } else {
        Alert.alert(
          "Amount Saved",
          `$${donation.toFixed(2)}/month saved locally. Subscription could not be updated right now.`,
          [{ text: "OK", onPress: () => router.replace("/(tabs)/menu") }]
        );
      }
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to save. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const thumbTranslate = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      {/* Header */}
      <LinearGradient
        colors={["#2C3E50", "#4CA1AF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/(tabs)/menu")}
        >
          <Image
            source={require("../../../assets/icons/arrow-left.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Donation</Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Amount Input Section */}
        <Text style={styles.sectionLabel}>Monthly donation amount</Text>
        <View style={[styles.amountCard, isFocused && styles.amountCardFocused]}>
          <Text style={styles.currencySign}>$</Text>
          <TextInput
            ref={amountInputRef}
            style={styles.amountInput}
            value={amount}
            onChangeText={(val) => setAmount(val.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#B0BEC5"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            returnKeyType="done"
            selectTextOnFocus
          />
          <Text style={styles.perMonth}>/mo</Text>
          <TouchableOpacity
            style={styles.editIconButton}
            onPress={() => amountInputRef.current?.focus()}
            activeOpacity={0.8}
          >
            <Feather name="edit-2" size={16} color="#F57C00" />
          </TouchableOpacity>
        </View>
        {parsedAmount > 0 && parsedAmount < MIN_DONATION && (
          <Text style={styles.minWarning}>
            Minimum is ${MIN_DONATION}/month
          </Text>
        )}
        {parsedAmount > 1000 && (
          <Text style={styles.minWarning}>Maximum is $1,000/month</Text>
        )}

        {/* Order Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>

          <View style={styles.summaryRow}>
            <View style={styles.labelWithInfo}>
              <Text style={styles.summaryLabel}>Monthly donation</Text>
              <TouchableOpacity
                onPress={() => setShowDonationInfo(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.infoIcon}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.summaryValue}>
              ${parsedAmount > 0 ? parsedAmount.toFixed(2) : "0.00"}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.labelWithInfo}>
              <Text style={styles.summaryLabel}>Platform fee</Text>
              <TouchableOpacity
                onPress={() => setShowFeeInfo(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.infoIcon}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.summaryValue}>${SERVICE_FEE.toFixed(2)}</Text>
          </View>

          {/* Processing fee toggle row */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Text style={styles.summaryLabel}>Cover processing fees</Text>
              <Text style={styles.feeNote}>3.5% — goes directly to card network</Text>
            </View>
            <View style={styles.toggleRight}>
              <Text
                style={[
                  styles.processingAmount,
                  !coverFees && styles.processingAmountOff,
                ]}
              >
                +${coverFees ? processingFee.toFixed(2) : "0.00"}
              </Text>
              <TouchableOpacity
                onPress={handleToggleFees}
                activeOpacity={0.8}
                style={styles.toggleHit}
              >
                <View
                  style={[
                    styles.toggleTrack,
                    coverFees && styles.toggleTrackOn,
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.toggleThumb,
                      { transform: [{ translateX: thumbTranslate }] },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total charged monthly</Text>
            <Text style={styles.totalAmount}>
              ${parsedAmount > 0 ? totalCharged.toFixed(2) : "0.00"}
            </Text>
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            (!isValidAmount || isLoading) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!isValidAmount || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Update Donation</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Monthly donation info modal */}
      <Modal
        visible={showDonationInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDonationInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDonationInfo(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Monthly Donation</Text>
            <Text style={styles.modalBody}>
              This is the direct amount that goes to your beneficiary — the cause you've chosen to support each month.
            </Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowDonationInfo(false)}
            >
              <Text style={styles.modalCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Service fee info modal */}
      <Modal
        visible={showFeeInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFeeInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFeeInfo(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Platform Fee</Text>
            <Text style={styles.modalBody}>
              The $3.00 monthly platform fee helps our nonprofit, THRIVE, cover
              the tech costs, operating costs, building awareness and expanding
              access to more causes and communities.
            </Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowFeeInfo(false)}
            >
              <Text style={styles.modalCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F4F8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 54,
    paddingBottom: 140,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 16,
  },
  backButton: {},
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#fff",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 36,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  scrollView: {
    marginTop: -120,
    backgroundColor: "transparent",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  amountCard: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  amountCardFocused: {
    borderColor: "#21555b",
  },
  currencySign: {
    fontSize: 40,
    fontWeight: "300",
    color: "#21555b",
    marginRight: 4,
    lineHeight: 52,
  },
  amountInput: {
    flex: 1,
    fontSize: 56,
    fontWeight: "700",
    color: "#1A2E35",
    padding: 0,
    lineHeight: 68,
  },
  perMonth: {
    fontSize: 18,
    color: "#90A4AE",
    fontWeight: "500",
    alignSelf: "flex-end",
    marginBottom: 6,
  },
  editIconButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF3E0",
  },
  minWarning: {
    fontSize: 13,
    color: "#E53935",
    marginBottom: 8,
    marginLeft: 4,
  },
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A2E35",
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  labelWithInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  summaryLabel: {
    fontSize: 15,
    color: "#455A64",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A2E35",
  },
  infoIcon: {
    fontSize: 15,
    color: "#DB8633",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
  },
  toggleLeft: {
    flex: 1,
    marginRight: 12,
  },
  feeNote: {
    fontSize: 12,
    color: "#90A4AE",
    marginTop: 2,
  },
  toggleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  processingAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#21555b",
  },
  processingAmountOff: {
    color: "#B0BEC5",
  },
  toggleHit: {
    padding: 4,
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#CFD8DC",
    justifyContent: "center",
  },
  toggleTrackOn: {
    backgroundColor: "#21555b",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#ECEFF1",
    marginBottom: 14,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A2E35",
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: "#21555b",
  },
  aboutCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  aboutTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A2E35",
    marginBottom: 14,
  },
  aboutRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 8,
  },
  bullet: {
    fontSize: 14,
    color: "#21555b",
    fontWeight: "700",
    marginTop: 1,
  },
  aboutText: {
    flex: 1,
    fontSize: 14,
    color: "#607D8B",
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: "#DB8633",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
    shadowColor: "#DB8633",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A2E35",
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 15,
    color: "#607D8B",
    lineHeight: 22,
    marginBottom: 20,
  },
  modalClose: {
    backgroundColor: "#21555b",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
