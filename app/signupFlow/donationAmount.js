import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Alert,
  TextInput,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { AntDesign } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { useBeneficiary } from "../context/BeneficiaryContext";
import { useUser } from "../context/UserContext";
import { resolveCheckoutBeneficiaryId } from "../utils/resolveCheckoutBeneficiaryId";
import { persistSignupFlowCheckpointFromParams } from "../utils/signupFlowCheckpoint";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

export default function DonationAmount() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const { selectedBeneficiary } = useBeneficiary();
  const { saveUserData, user } = useUser();

  const isCoworkingUser =
    user?.coworking === true ||
    routeParams?.flow === "coworking" ||
    routeParams?.isCoworking === "true";
  const MIN_AMOUNT = isCoworkingUser ? 1 : 15;
  const [amount, setAmount] = useState(MIN_AMOUNT);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT));
  const MAX_AMOUNT = 250;

  const routeParamsSnapshot = JSON.stringify(routeParams ?? {});

  useEffect(() => {
    persistSignupFlowCheckpointFromParams(
      "/signupFlow/donationAmount",
      routeParams,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParamsSnapshot]);

  useEffect(() => {
    // Keep slider value valid when coworking flag resolves after initial render.
    if (amount < MIN_AMOUNT) {
      setAmount(MIN_AMOUNT);
    }
  }, [MIN_AMOUNT, amount]);

  useEffect(() => {
    setAmountInput(String(Math.round(amount || MIN_AMOUNT)));
  }, [amount, MIN_AMOUNT]);

  const handleSliderChange = (value) => {
    const rounded = Math.round(value);
    setAmount(rounded);
    setAmountInput(String(rounded));
  };

  const commitManualAmount = () => {
    const parsed = parseInt(String(amountInput || "").replace(/[^0-9]/g, ""), 10);
    const safe = Number.isFinite(parsed) ? parsed : amount;
    const clamped = Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, safe));
    setAmount(clamped);
    setAmountInput(String(clamped));
    setIsEditingAmount(false);
  };

  const handleSaveAndContinue = async () => {
    try {
      console.log("🎉 Donation amount set!", amount);

      // Save the donation amount to user context
      await saveUserData({ monthlyDonation: amount });

      const beneficiaryId = await resolveCheckoutBeneficiaryId({
        params: routeParams,
        selectedBeneficiary,
      });

      router.push({
        pathname: "/signupFlow/stripeIntegration",
        params: {
          amount: amount.toString(),
          ...(beneficiaryId ? { beneficiaryId } : {}),
        },
      });
    } catch (error) {
      console.error("❌ Error saving donation amount:", error);
      Alert.alert("Error", "Failed to save donation amount. Please try again.");
    }
  };

  const handleSkip = () => {
    router.replace("/(tabs)/home");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Modern blue gradient background for slider area with curved bottom */}
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 0 }}
      >
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientCurvedBg}
          pointerEvents="none"
        />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: 60,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Navigation */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Image
              source={require("../../assets/icons/arrow-left.png")}
              style={{ width: 24, height: 24, tintColor: "#324E58" }}
            />
          </TouchableOpacity>
          {isCoworkingUser ? (
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>
          ) : null}
          {/* Piggy and Speech Bubble in blue area */}
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              marginTop: 36,
              marginBottom: 6,
              zIndex: 1,
            }}
          >
            {/* Piggy Icon (image) */}
            <Image
              source={require("../../assets/images/piggy-coin.png")}
              style={{
                width: 130,
                height: 130,
                marginBottom: 10,
                resizeMode: "contain",
              }}
            />
            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontWeight: "bold",
                  fontSize: 22,
                  marginBottom: 4,
                  color: "#fff",
                  textAlign: "center",
                }}
              >
                Give to {selectedBeneficiary?.name || "Your Cause"}!
              </Text>
              <Text
                style={{
                  fontWeight: "400",
                  fontSize: 16,
                  color: "#fff",
                  textAlign: "center",
                }}
              >
                Every dollar makes a difference
              </Text>
            </View>
          </View>

          {/* Donation amount, slider, and button directly on the gradient */}
          <View style={styles.infoCardCurved}>
            <View style={styles.amountCardProminentCurved}>
              {isEditingAmount ? (
                <View style={styles.amountEditRow}>
                  <Text style={styles.amountDollarSign}>$</Text>
                  <TextInput
                    value={amountInput}
                    onChangeText={setAmountInput}
                    style={styles.amountInput}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onBlur={commitManualAmount}
                    onSubmitEditing={commitManualAmount}
                    autoFocus
                    maxLength={3}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setIsEditingAmount(true)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.amountProminent}>
                    ${Math.round(amount || 0)}
                  </Text>
                </TouchableOpacity>
              )}
              <Text style={styles.perMonthProminent}>per month</Text>
            </View>
            <View style={styles.sliderRowWrapCurved}>
              <Text style={styles.amountLabelCard}>${MIN_AMOUNT}</Text>
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Slider
                  style={styles.sliderCentered}
                  minimumValue={MIN_AMOUNT}
                  maximumValue={MAX_AMOUNT}
                  value={amount}
                  onValueChange={handleSliderChange}
                  minimumTrackTintColor="#4CA1AF"
                  maximumTrackTintColor="#e0e0e0"
                  thumbTintColor="#2C3E50"
                />
              </View>
              <Text style={styles.amountLabelCard}>$250</Text>
            </View>
            <TouchableOpacity
              onPress={handleSaveAndContinue}
              style={styles.continueButtonCard}
            >
              <Text style={styles.continueButtonTextCard}>
                {selectedBeneficiary?.name
                  ? `Support ${selectedBeneficiary.name}`
                  : "Set monthly giving"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.45,
    zIndex: 0,
    overflow: "hidden",
  },
  piggyLarge: {
    width: 90,
    height: 90,
    resizeMode: "contain",
    marginBottom: 10,
  },
  speechBubbleCard: {
    backgroundColor: "#F5F5FA",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E1E1E5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: "relative",
    marginBottom: 8,
    maxWidth: 340,
  },
  speechTextCard: {
    color: "#324E58",
    fontSize: 16,
    textAlign: "left",
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: "90%",
    maxWidth: 340,
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 30,
    alignItems: "center",
    zIndex: 2,
  },
  sliderContainerCard: {
    marginTop: 10,
    marginBottom: 30,
    height: 60,
    justifyContent: "center",
    width: "100%",
    alignItems: "center",
  },
  sliderLabelsCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingHorizontal: 5,
    width: "100%",
  },
  amountLabelCard: {
    fontSize: 16,
    color: "#324E58",
  },
  inputContainerCard: {
    backgroundColor: "#F5F5FA",
    borderRadius: 10,
    paddingHorizontal: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E1E1E5",
    width: "100%",
    marginBottom: 20,
  },
  inputCard: {
    height: 50,
    fontSize: 16,
    color: "#324E58",
    width: "100%",
  },
  continueButtonCard: {
    backgroundColor: "#DB8633",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
    width: "100%",
    marginTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  continueButtonTextCard: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
  backButton: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 20,
    padding: 6,
    marginBottom: 25,
  },
  skipButton: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 100,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  skipButtonText: {
    color: "#324E58",
    fontSize: 14,
    fontWeight: "700",
  },
  slider: {
    width: "90%",
    height: 40,
    alignSelf: "center",
    position: "relative",
    zIndex: 2,
  },
  amountCardProminent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 40,
    alignItems: "center",
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    alignSelf: "center",
    marginTop: 10,
  },
  amountProminent: {
    color: "#2C3E50",
    fontSize: 38,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  perMonthProminent: {
    color: "#4CA1AF",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  sliderRowWrap: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 0,
  },
  gradientCurvedBg: {
    height: SCREEN_HEIGHT * 0.6,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
    overflow: "hidden",
  },
  infoCardCurved: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: "90%",
    maxWidth: 360,
    alignSelf: "center",
    marginTop: 30, // Lower the card to avoid overlap with piggy and chat bubble
    marginBottom: 30,
    alignItems: "center",
    zIndex: 2,
  },
  amountCardProminentCurved: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 40,
    alignItems: "center",
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    alignSelf: "center",
    marginTop: 0,
  },
  sliderRowWrapCurved: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 0,
  },
  sliderCentered: {
    width: "100%",
    minWidth: 120,
    maxWidth: 200,
    alignSelf: "center",
  },
  amountEditRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  amountDollarSign: {
    color: "#2C3E50",
    fontSize: 38,
    fontWeight: "bold",
    marginRight: 4,
  },
  amountInput: {
    minWidth: 90,
    textAlign: "center",
    color: "#2C3E50",
    fontSize: 38,
    fontWeight: "bold",
    borderBottomWidth: 1,
    borderBottomColor: "#d0d7de",
    paddingVertical: 0,
  },
});
