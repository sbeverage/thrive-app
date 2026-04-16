import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { AntDesign, Feather } from "@expo/vector-icons";
import { useStripe } from "@stripe/stripe-react-native";
import API from "../../lib/api";
import {
  hasSetupIntentPaymentSheet,
  presentSetupIntentPaymentSheet,
} from "../../utils/setupIntentPaymentSheet";

export default function CardManagement() {
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingCard, setAddingCard] = useState(false);

  // Load payment methods from Stripe on mount
  useEffect(() => {
    loadPaymentMethods();
  }, []);

  const loadPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);
      const response = await API.getPaymentMethods();
      const normalizedPaymentMethods = (response.payment_methods || []).map(
        (method) => {
          if (method?.card) return method;

          // Support fallback shape where brand/last4 are top-level.
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
        },
      );
      setPaymentMethods(normalizedPaymentMethods);
    } catch (error) {
      console.error("Error loading payment methods:", error);
      // If 404, user doesn't have a Stripe customer yet - show empty state
      if (error.response?.status === 404 || error.message?.includes("404")) {
        setPaymentMethods([]);
      } else {
        Alert.alert(
          "Error",
          "Failed to load payment methods. Please try again.",
        );
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
      // Create SetupIntent on backend
      const response = await API.createSetupIntent();
      if (!hasSetupIntentPaymentSheet(response)) {
        Alert.alert(
          "Payment setup",
          "Could not start the card payment screen. Please try again.",
        );
        return;
      }

      const payResult = await presentSetupIntentPaymentSheet(
        { initPaymentSheet, presentPaymentSheet },
        response,
      );
      if (!payResult.ok) {
        if (!payResult.canceled && payResult.error) {
          Alert.alert(
            "Payment",
            payResult.error.message || "Could not complete card setup.",
          );
        }
        return;
      }

      // Payment method added successfully
      Alert.alert("Success", "Payment method added successfully!");
      await loadPaymentMethods(); // Refresh the list
    } catch (error) {
      console.error("Error adding payment method:", error);
      Alert.alert("Error", error.message || "Failed to add payment method.");
    } finally {
      setAddingCard(false);
    }
  };

  const handleDelete = (paymentMethodId) => {
    Alert.alert(
      "Delete Payment Method",
      "Are you sure you want to delete this payment method?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            try {
              await API.deletePaymentMethod(paymentMethodId);
              Alert.alert("Success", "Payment method deleted successfully!");
              await loadPaymentMethods(); // Refresh the list
            } catch (error) {
              console.error("Error deleting payment method:", error);
              Alert.alert("Error", "Failed to delete payment method.");
            }
          },
          style: "destructive",
        },
      ],
    );
  };

  // Helper function to get card logo
  const getCardLogo = (brand) => {
    const brandLower = brand?.toLowerCase();
    switch (brandLower) {
      case "visa":
        return require("../../../assets/logos/visa.png");
      case "mastercard":
        return require("../../../assets/logos/mastercard.png");
      case "amex":
      case "american_express":
        return require("../../../assets/logos/visa.png"); // Placeholder
      default:
        return require("../../../assets/logos/visa.png"); // Default
    }
  };

  // Render payment method item
  const renderPaymentMethod = ({ item }) => {
    const card = item.card || {
      brand: item.brand,
      last4: item.last4,
      exp_month: item.exp_month,
      exp_year: item.exp_year,
    };
    if (!card?.last4 && !card?.brand) return null; // Skip non-card payment methods

    const cardLogo = getCardLogo(card.brand);
    const cardBrand = card.brand?.toUpperCase() || "CARD";

    return (
      <TouchableOpacity
        style={[styles.cardItem, item.is_default && styles.activeCard]}
        onPress={() => {
          // Could add logic to set as default here if needed
        }}
      >
        <View style={styles.cardDetails}>
          {/* <View style={styles.radioCircle}>
            <View
              style={[
                styles.innerCircle,
                item.is_default && styles.innerCircleActive,
              ]}
            />
          </View> */}
          <Image source={cardLogo} style={styles.cardLogo} />
          <View>
            <Text style={styles.cardType}>{cardBrand} card</Text>
            <Text style={styles.cardNumber}>****{card.last4 || "****"}</Text>
            {item.is_default && (
              <Text style={styles.defaultBadgeText}>Default</Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={() => handleDelete(item.id)}>
          <Feather name="trash-2" size={22} color="red" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#DB8633" />
        <Text style={styles.loadingText}>Loading payment methods...</Text>
      </View>
    );
  }

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
        <Text style={styles.headerTitle}>Manage Billing</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Credit Cards Section */}
      <View style={styles.creditCardSection}>
        <Text style={styles.sectionTitle}>Credit & Debit Cards</Text>
        {paymentMethods.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No payment methods found.</Text>
            <Text style={styles.emptyStateSubtext}>
              Add a payment method to get started.
            </Text>
          </View>
        ) : (
          <FlatList
            data={paymentMethods}
            renderItem={renderPaymentMethod}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.cardList}
          />
        )}
      </View>

      {/* Add New Card */}
      <TouchableOpacity
        style={[styles.addButton, addingCard && styles.addButtonDisabled]}
        onPress={handleAddCard}
        disabled={addingCard}
      >
        {addingCard ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.addButtonText}>Add New Card</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 20 },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 5,
    marginBottom: 20,
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
  headerSpacer: {
    width: 32,
  },
  cardList: { marginTop: 20 },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#324E58",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  cardItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    width: "100%",
  },
  activeCard: {
    borderWidth: 1,
    borderColor: "#DB8633",
  },
  cardDetails: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  innerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "transparent",
  },
  innerCircleActive: {
    backgroundColor: "#DB8633",
  },
  cardLogo: { width: 40, height: 24, resizeMode: "contain", marginRight: 10 },
  cardType: { fontSize: 14, color: "#666" },
  cardNumber: { fontSize: 16, fontWeight: "bold", color: "#000" },
  addButton: {
    backgroundColor: "#DB8633",
    paddingVertical: 16,
    marginHorizontal: 20,
    borderRadius: 10,
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#324E58",
    marginBottom: 15,
  },
  creditCardSection: {
    flex: 1,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  defaultBadgeText: {
    fontSize: 12,
    color: "#DB8633",
    fontWeight: "600",
    marginTop: 4,
  },
});
