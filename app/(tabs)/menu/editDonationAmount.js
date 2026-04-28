import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { AntDesign } from "@expo/vector-icons";
import { useUser } from "../../context/UserContext";
import { useBeneficiary } from "../../context/BeneficiaryContext";
import API from "../../lib/api";

export default function EditDonationAmount() {
  const router = useRouter();
  const { user, saveUserData } = useUser();
  const MIN_DONATION_AMOUNT = user?.coworking ? 1 : 15;
  const { selectedBeneficiary, reloadBeneficiary } = useBeneficiary();
  const [currentAmount, setCurrentAmount] = useState(
    user.monthlyDonation?.toString() || "15",
  );
  const [newAmount, setNewAmount] = useState(
    user.monthlyDonation?.toString() || "15",
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [savedBeneficiaryId, setSavedBeneficiaryId] = useState(null);

  // Load existing subscription and beneficiary on mount
  useEffect(() => {
    loadSubscription();
    loadSavedBeneficiary();
  }, []);

  // Reload beneficiary when returning from Beneficiary tab (e.g. after selecting one)
  useFocusEffect(
    React.useCallback(() => {
      reloadBeneficiary?.();
      loadSavedBeneficiary();
    }, [reloadBeneficiary]),
  );

  // Resolve beneficiary ID: from context, user prefs, or backend
  const getBeneficiaryId = () => {
    const fromContext = selectedBeneficiary?.id;
    const fromUser = user.preferredCharity || user.beneficiary;
    const fromState = savedBeneficiaryId;
    return fromContext ?? fromUser ?? fromState ?? null;
  };

  const loadSavedBeneficiary = async () => {
    try {
      const profile = await API.getProfile();
      if (profile?.preferredCharity || profile?.beneficiary) {
        setSavedBeneficiaryId(profile.preferredCharity || profile.beneficiary);
      }
    } catch (e) {
      // Profile may 404 - ignore
    }
  };

  const loadSubscription = async () => {
    try {
      const response = await API.getMonthlyDonations();
      if (response.subscriptions && response.subscriptions.length > 0) {
        setSubscription(response.subscriptions[0]);
        const currentAmount =
          response.subscriptions[0].amount || user.monthlyDonation || 15;
        setCurrentAmount(currentAmount.toString());
        setNewAmount(currentAmount.toString());
      }
    } catch (error) {
      console.log(
        "⚠️ No existing subscription found or error loading:",
        error.message,
      );
      // Continue with local data
    }
  };

  const handleSave = async () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount)) {
      Alert.alert("Invalid Amount", "Please enter a valid number.");
      return;
    }
    if (amount < MIN_DONATION_AMOUNT) {
      Alert.alert(
        "Minimum Amount",
        `Please enter the minimum amount: $${MIN_DONATION_AMOUNT} or more per month.`,
      );
      return;
    }

    if (amount > 1000) {
      Alert.alert(
        "Amount Too High",
        "Please enter an amount of $1,000 or less.",
      );
      return;
    }

    setIsLoading(true);
    try {
      // Resolve beneficiary: from context (saved at signup), user prefs, or backend profile
      const beneficiaryId = getBeneficiaryId();

      let response = null;
      let apiSucceeded = false;

      if (subscription) {
        // Update existing subscription - no beneficiary needed
        try {
          console.log("💳 Updating existing subscription...");
          const subscriptionIdForUpdate =
            subscription.stripe_subscription_id ||
            subscription.subscription_id ||
            subscription.id;
          response = await API.upgradeOrDowngradeMonthlyAmount(
            subscriptionIdForUpdate,
            amount,
          );
          apiSucceeded = true;
        } catch (apiError) {
          if (apiError?.status === 409) {
            Alert.alert(
              "Payment setup required",
              "Complete first payment setup before changing amount.",
            );
            return;
          }
          console.warn(
            "⚠️ Update subscription failed, saving locally:",
            apiError.message,
          );
        }
      } else if (beneficiaryId) {
        // Create new subscription with saved beneficiary
        try {
          console.log("💳 Creating new subscription...");
          response = await API.createMonthlySubscription({
            beneficiary_id: beneficiaryId,
            amount: amount,
            currency: "USD",
          });
          apiSucceeded = true;
        } catch (apiError) {
          console.warn(
            "⚠️ Create subscription failed, saving locally:",
            apiError.message,
          );
        }
      }
      // If no beneficiary and no subscription: skip API, save locally only

      // Always save amount locally (works for: update success, create success, or API fallback)
      await saveUserData({ monthlyDonation: amount });
      setCurrentAmount(newAmount);
      setIsEditing(false);

      if (apiSucceeded) {
        const changeTiming =
          response?.change?.timing === "next_invoice" || !!subscription;
        Alert.alert(
          "✅ Amount Updated!",
          changeTiming
            ? `Your monthly donation amount has been updated to $${parseFloat(newAmount || 0).toFixed(2)} and will apply on your next invoice.`
            : `Your monthly donation amount has been ${subscription ? "updated" : "set"} to $${parseFloat(newAmount || 0).toFixed(2)}.`,
          [{ text: "OK" }],
        );
      } else if (!beneficiaryId) {
        Alert.alert(
          "✅ Amount Saved",
          `Your monthly donation amount of $${parseFloat(newAmount || 0).toFixed(2)} has been saved. To enable automatic billing, select a beneficiary from the Beneficiary tab and add a payment method.`,
          [
            { text: "OK" },
            {
              text: "Select Beneficiary",
              onPress: () => router.replace("/(tabs)/beneficiary"),
            },
          ],
        );
      } else {
        Alert.alert(
          "✅ Amount Saved",
          `Your monthly donation amount of $${parseFloat(newAmount || 0).toFixed(2)} has been saved locally. The subscription could not be created at this time—you can try again later.`,
          [{ text: "OK" }],
        );
      }
    } catch (error) {
      console.error("❌ Error saving donation amount:", error);
      // Fallback: save locally so user isn't blocked
      try {
        await saveUserData({ monthlyDonation: amount });
        setCurrentAmount(newAmount);
        setIsEditing(false);
        Alert.alert(
          "Amount Saved Locally",
          `Your amount of $${parseFloat(newAmount || 0).toFixed(2)} has been saved. The subscription service could not be reached—please try again later.`,
          [{ text: "OK" }],
        );
      } catch (fallbackError) {
        Alert.alert(
          "Error",
          error.message || " to save donation amount. Please try again.",
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setNewAmount(currentAmount);
    setIsEditing(false);
  };

  const quickAmounts = user?.coworking
    ? [1, 5, 10, 15, 25, 50]
    : [15, 25, 50, 75, 100, 150];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Standardized Header */}
        <LinearGradient colors={['#21555b', '#2d7a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace("/(tabs)/menu")}
          >
            <Image
              source={require("../../../assets/icons/arrow-left.png")}
              style={{ width: 24, height: 24, tintColor: "#fff" }}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Donation Amount</Text>
          <View style={styles.headerSpacer} />
        </LinearGradient>

        {/* Current Amount Display */}
        <LinearGradient colors={['#21555b', '#2d7a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.currentAmountSection}>
          <Text style={[styles.sectionTitle, { color: '#fff', borderLeftWidth: 0, paddingLeft: 0, textAlign: 'center' }]}>Current Monthly Donation</Text>
          <View style={styles.amountDisplay}>
            <Text style={styles.currencySymbol}>$</Text>
            <Text style={styles.currentAmountText}>{currentAmount}</Text>
            <Text style={styles.perMonthText}>/month</Text>
          </View>
        </LinearGradient>

        {/* Edit Section */}
        <View style={styles.editSection}>
          <Text style={styles.sectionTitle}>New Monthly Amount</Text>

          {isEditing ? (
            <View style={styles.editMode}>
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencyLabel}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={newAmount}
                  onChangeText={setNewAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#999"
                  autoFocus
                />
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancel}
                  disabled={isLoading}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    isLoading && styles.saveButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
              <AntDesign name="edit" size={20} color="#DB8633" />
              <Text style={styles.editButtonText}>Change Amount</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Amount Selection */}
        <View style={styles.quickAmountsSection}>
          <Text style={styles.sectionTitle}>Quick Amounts</Text>
          <View style={styles.quickAmountsGrid}>
            {quickAmounts.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.quickAmountButton,
                  parseFloat(newAmount) === amount &&
                    styles.selectedQuickAmount,
                ]}
                onPress={() => {
                  setNewAmount(amount.toString());
                  if (!isEditing) setIsEditing(true);
                }}
              >
                <Text
                  style={[
                    styles.quickAmountText,
                    parseFloat(newAmount) === amount &&
                      styles.selectedQuickAmountText,
                  ]}
                >
                  ${amount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Information Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Monthly Donations</Text>
          <Text style={styles.infoText}>
            • Your donation amount will be charged monthly on the same date
          </Text>
          <Text style={styles.infoText}>
            • You can change this amount at any time
          </Text>
          <Text style={styles.infoText}>
            • Changes take effect immediately for the next billing cycle
          </Text>
          <Text style={styles.infoText}>
            • Minimum donation: ${MIN_DONATION_AMOUNT} per month
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    textAlign: "center",
    flex: 1,
  },
  headerSpacer: {
    width: 32,
  },
  currentAmountSection: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#21555b",
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#21555b",
    paddingLeft: 10,
  },
  amountDisplay: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: "700",
    color: "#fff",
    marginRight: 4,
  },
  currentAmountText: {
    fontSize: 48,
    fontWeight: "700",
    color: "#fff",
  },
  perMonthText: {
    fontSize: 18,
    color: "rgba(255,255,255,0.75)",
    marginLeft: 8,
  },
  editSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  editMode: {
    gap: 20,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5FA",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  currencyLabel: {
    fontSize: 24,
    fontWeight: "600",
    color: "#324E58",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: "600",
    color: "#324E58",
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  cancelButtonText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#DB8633",
  },
  saveButtonText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: "#F5F5FA",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#324E58",
  },
  quickAmountsSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickAmountsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  quickAmountButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F5F5FA",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 80,
    alignItems: "center",
  },
  selectedQuickAmount: {
    backgroundColor: "#DB8633",
    borderColor: "#DB8633",
  },
  quickAmountText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#324E58",
  },
  selectedQuickAmountText: {
    color: "#fff",
  },
  infoSection: {
    backgroundColor: "#F5F5FA",
    borderRadius: 12,
    padding: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#324E58",
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    lineHeight: 20,
  },
});
