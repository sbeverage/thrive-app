import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useStripe } from "@stripe/stripe-react-native";
import { useSafeApplePay } from "../../utils/safeApplePay";
import API from "../../lib/api";
import {
  hasSetupIntentPaymentSheet,
  presentSetupIntentPaymentSheet,
} from "../../utils/setupIntentPaymentSheet";

function getCardGradient(brand) {
  switch (brand?.toLowerCase()) {
    case "visa":            return ["#c97320", "#DB8633"];
    case "mastercard":      return ["#1a1a1a", "#4a4a4a"];
    case "amex":
    case "american_express":return ["#006fcf", "#00a8e0"];
    case "discover":        return ["#e65c00", "#f9a825"];
    default:                return ["#21555b", "#2d7a82"];
  }
}

function getCardLogo(brand) {
  switch (brand?.toLowerCase()) {
    case "visa":       return require("../../../assets/logos/visa.png");
    case "mastercard": return require("../../../assets/logos/mastercard.png");
    default:           return require("../../../assets/logos/visa.png");
  }
}

export default function CardManagement() {
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { isPlatformPaySupported, confirmPlatformPaySetupIntent } = useSafeApplePay();

  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [addingApplePay, setAddingApplePay] = useState(false);
  const [isApplePaySupported, setIsApplePaySupported] = useState(false);

  useEffect(() => {
    loadPaymentMethods();
    if (Platform.OS === "ios") {
      isPlatformPaySupported().then(setIsApplePaySupported).catch(() => {});
    }
  }, []);

  const loadPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);
      const response = await API.getPaymentMethods();
      const normalized = (response.payment_methods || []).map((method) => {
        if (method?.card) return method;
        if (method?.brand || method?.last4) {
          return {
            ...method,
            card: {
              brand: method.brand || "card",
              last4: method.last4 || "",
              exp_month: method.exp_month || null,
              exp_year: method.exp_year || null,
            },
          };
        }
        return method;
      });
      setPaymentMethods(normalized);
    } catch (error) {
      console.error("Error loading payment methods:", error);
      if (error.response?.status === 404 || error.message?.includes("404")) {
        setPaymentMethods([]);
      } else {
        Alert.alert("Error", "Failed to load payment methods. Please try again.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  const handleAddCard = async () => {
    setAddingCard(true);
    try {
      const response = await API.createSetupIntent();
      if (!hasSetupIntentPaymentSheet(response)) {
        Alert.alert("Payment setup", "Could not start the card payment screen. Please try again.");
        return;
      }
      const payResult = await presentSetupIntentPaymentSheet(
        { initPaymentSheet, presentPaymentSheet },
        response,
      );
      if (!payResult.ok) {
        if (!payResult.canceled && payResult.error) {
          Alert.alert("Payment", payResult.error.message || "Could not complete card setup.");
        }
        return;
      }
      Alert.alert("Success", "Payment method added successfully!");
      await loadPaymentMethods();
    } catch (error) {
      console.error("Error adding payment method:", error);
      Alert.alert("Error", error.message || "Failed to add payment method.");
    } finally {
      setAddingCard(false);
    }
  };

  const handleAddApplePay = async () => {
    setAddingApplePay(true);
    try {
      const response = await API.createSetupIntent();
      if (!response?.client_secret) {
        Alert.alert("Error", "Could not start Apple Pay setup. Please try again.");
        return;
      }

      // confirmPlatformPaySetupIntent presents the Apple Pay sheet and confirms in one call
      const { error } = await confirmPlatformPaySetupIntent(response.client_secret, {
        applePay: {
          cartItems: [{ label: "Thrive Initiative", amount: "0.00", paymentType: "Immediate", isPending: true }],
          merchantCountryCode: "US",
          currencyCode: "USD",
        },
      });

      if (error) {
        if (error.code !== "Canceled") {
          Alert.alert("Apple Pay", error.message || "Apple Pay setup failed.");
        }
        return;
      }

      Alert.alert("Success", "Apple Pay added successfully!");
      await loadPaymentMethods();
    } catch (error) {
      console.error("Error adding Apple Pay:", error);
      Alert.alert("Error", error.message || "Failed to add Apple Pay.");
    } finally {
      setAddingApplePay(false);
    }
  };

  const handleDelete = (paymentMethodId) => {
    Alert.alert(
      "Remove Card",
      "Are you sure you want to remove this payment method?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await API.deletePaymentMethod(paymentMethodId);
              await loadPaymentMethods();
            } catch (error) {
              Alert.alert("Error", "Failed to remove payment method.");
            }
          },
        },
      ],
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#21555b" />
        <Text style={styles.loadingText}>Loading your wallet...</Text>
      </View>
    );
  }

  const validMethods = paymentMethods.filter(
    (m) => m.card?.last4 || m.card?.brand,
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/(tabs)/menu")}
        >
          <Image
            source={require("../../../assets/icons/arrow-left.png")}
            style={{ width: 24, height: 24, tintColor: "#324E58" }}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Billing</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => { setRefreshing(true); loadPaymentMethods(); }}
          disabled={loading}
        >
          <Feather name="refresh-cw" size={20} color="#324E58" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.sectionLabel}>YOUR WALLET</Text>

        {/* Saved card tiles */}
        {validMethods.map((item) => {
          const card = item.card;
          const isApplePay = card.wallet?.type === "apple_pay";
          const gradient = getCardGradient(card.brand);
          const logo = getCardLogo(card.brand);
          const brand = card.brand?.toUpperCase() || "CARD";

          return (
            <LinearGradient
              key={item.id}
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardTile}
            >
              {/* Top row: chip + logo */}
              <View style={styles.cardTopRow}>
                <View style={styles.chip}>
                  <View style={styles.chipInner} />
                </View>
                <View style={styles.cardTopRight}>
                  {isApplePay && (
                    <Image
                      source={require("../../../assets/logos/Apple-Pay.png")}
                      style={styles.applePayBadge}
                    />
                  )}
                  <Image source={logo} style={styles.cardBrandLogo} />
                </View>
              </View>

              {/* Card number */}
              <Text style={styles.cardNumber}>
                ●●●●  ●●●●  ●●●●  {card.last4 || "····"}
              </Text>

              {/* Bottom row: brand + default + delete */}
              <View style={styles.cardBottomRow}>
                <View>
                  <Text style={styles.cardBrandLabel}>{brand}</Text>
                  {item.is_default && (
                    <View style={styles.defaultPill}>
                      <Text style={styles.defaultPillText}>Default</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(item.id)}
                >
                  <Feather name="trash-2" size={16} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          );
        })}

        {/* Apple Pay tile — only shown when device supports Apple Pay */}
        {isApplePaySupported && (
          <TouchableOpacity
            style={[styles.applePayTile, addingApplePay && { opacity: 0.6 }]}
            onPress={handleAddApplePay}
            disabled={addingApplePay || addingCard}
            activeOpacity={0.85}
          >
            {addingApplePay ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Image
                  source={require("../../../assets/logos/Apple-Pay.png")}
                  style={styles.applePayTileLogo}
                />
                <Text style={styles.applePayTileSubtext}>Tap to add via Apple Pay</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Add New Card tile */}
        <TouchableOpacity
          style={[styles.addTile, (addingCard || addingApplePay) && { opacity: 0.5 }]}
          onPress={handleAddCard}
          disabled={addingCard || addingApplePay}
          activeOpacity={0.7}
        >
          {addingCard ? (
            <ActivityIndicator color="#21555b" />
          ) : (
            <>
              <View style={styles.addIcon}>
                <Feather name="plus" size={28} color="#21555b" />
              </View>
              <Text style={styles.addTileText}>Add New Card</Text>
              <Text style={styles.addTileSubtext}>Credit or debit card</Text>
            </>
          )}
        </TouchableOpacity>

        {validMethods.length === 0 && !Platform.OS === "ios" && (
          <Text style={styles.emptyHint}>
            Add a payment method to manage your donations.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 15, color: "#666" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  backButton: { padding: 4 },
  refreshButton: { padding: 4 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#324E58",
    flex: 1,
    textAlign: "center",
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8a9bb0",
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  // Credit card tile
  cardTile: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    height: 170,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  chip: {
    width: 36,
    height: 26,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  chipInner: {
    width: 22,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  applePayBadge: { width: 44, height: 18, resizeMode: "contain" },
  cardBrandLogo: { width: 52, height: 32, resizeMode: "contain" },
  cardNumber: {
    fontSize: 17,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 2,
    alignSelf: "center",
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  cardBrandLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.5,
  },
  defaultPill: {
    marginTop: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  defaultPillText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },
  deleteButton: {
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 20,
  },

  // Apple Pay tile
  applePayTile: {
    backgroundColor: "#000",
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  applePayTileLogo: {
    width: 100,
    height: 42,
    resizeMode: "contain",
  },
  applePayTileSubtext: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },

  // Add new card tile
  addTile: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#21555b",
    borderStyle: "dashed",
    paddingVertical: 28,
    alignItems: "center",
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  addIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(33,85,91,0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  addTileText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#21555b",
  },
  addTileSubtext: {
    fontSize: 13,
    color: "#8a9bb0",
    marginTop: 3,
  },

  emptyHint: {
    textAlign: "center",
    fontSize: 14,
    color: "#8a9bb0",
    marginTop: 8,
  },
});
