import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { AntDesign, MaterialIcons } from "@expo/vector-icons";
import ProfileCompleteModal from "../../components/ProfileCompleteModal";
import { LinearGradient } from "expo-linear-gradient";
import { Animated } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { useLocalSearchParams } from "expo-router";
import { SvgXml } from "react-native-svg";
import { Asset } from "expo-asset";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStripe } from "@stripe/stripe-react-native";
import { useSafeApplePay } from "../utils/safeApplePay";
import { useBeneficiary } from "../context/BeneficiaryContext";
import { useUser } from "../context/UserContext";
import API from "../lib/api";
import {
  hasMonthlySubscriptionPaymentSheet,
  isStripeExpoGoHost,
  presentMonthlySubscriptionNativeWallet,
  presentMonthlySubscriptionPaymentSheet,
} from "../utils/monthlySubscriptionPaymentSheet";
import { resolveCheckoutBeneficiaryId } from "../utils/resolveCheckoutBeneficiaryId";
import { persistSignupFlowCheckpointFromParams } from "../utils/signupFlowCheckpoint";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

/** Platform service fee (USD) — included in Stripe subscription total. */
const SERVICE_FEE = 3.0;
/** Applied to (donation + service fee) when "cover fees" is on — same value drives UI label + amount sent to Stripe. */
const CREDIT_CARD_FEE_RATE = 0.035;
const CREDIT_CARD_FEE_LABEL = `(${(CREDIT_CARD_FEE_RATE * 100).toFixed(1)}%)`;

// Apple Pay SVG asset
const applePaySvgAsset = require("../../assets/logos/Apple-Pay.svg");

export default function StripeIntegration() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { selectedBeneficiary } = useBeneficiary();
  const [applePaySvg, setApplePaySvg] = useState(null);
  /** Which payment action is in progress — spinners only on that button */
  const [paymentLoading, setPaymentLoading] = useState(null);
  const { saveUserData, user } = useUser();
  const { initPaymentSheet, presentPaymentSheet, confirmPlatformPayPayment } =
    useStripe();
  const { isPlatformPaySupported } = useSafeApplePay();
  const [isWalletSupported, setIsWalletSupported] = useState(
    Platform.OS === "android" ? true : null,
  );

  const stripeParamsSnapshot = JSON.stringify(params ?? {});

  useEffect(() => {
    persistSignupFlowCheckpointFromParams(
      "/signupFlow/stripeIntegration",
      params,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeParamsSnapshot]);

  // Load SVG content
  useEffect(() => {
    const loadSvg = async () => {
      try {
        const asset = Asset.fromModule(applePaySvgAsset);
        await asset.downloadAsync();
        const response = await fetch(asset.localUri || asset.uri);
        const svgContent = await response.text();
        setApplePaySvg(svgContent);
      } catch (error) {
        console.error("Error loading SVG:", error);
      }
    };
    loadSvg();
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkWalletSupport = async () => {
      if (Platform.OS !== "ios") {
        setIsWalletSupported(true);
        return;
      }
      try {
        const supported = await isPlatformPaySupported();
        if (mounted) setIsWalletSupported(!!supported);
      } catch {
        if (mounted) setIsWalletSupported(false);
      }
    };
    checkWalletSupport();
    return () => {
      mounted = false;
    };
  }, [isPlatformPaySupported]);
  const baseAmount = params.amount ? parseFloat(params.amount) : 15;
  const sponsorAmount = params.sponsorAmount
    ? parseFloat(params.sponsorAmount)
    : 0;
  const isCoworkingExtra = params.isCoworkingExtra === "true";
  const totalMonthlyDonation = params.totalMonthlyDonation
    ? parseFloat(params.totalMonthlyDonation)
    : isCoworkingExtra
      ? sponsorAmount + baseAmount
      : baseAmount;
  const [cardNumber, setCardNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [coverFees, setCoverFees] = useState(true);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("card"); // 'card' or 'applepay'
  const [showServiceFeeInfo, setShowServiceFeeInfo] = useState(false);
  const [showMonthlyDonationInfo, setShowMonthlyDonationInfo] = useState(false);
  const [showProcessingFeesInfo, setShowProcessingFeesInfo] = useState(false);

  // For coworking extras, the sponsor amount ($15) is already billed externally —
  // only charge the user's extra donation. For all other flows, charge the full donation.
  const chargeBase = isCoworkingExtra ? baseAmount : totalMonthlyDonation;
  const donationSubtotal = chargeBase + SERVICE_FEE;
  const creditCardFee = coverFees ? donationSubtotal * CREDIT_CARD_FEE_RATE : 0;
  const totalAmountNumber = donationSubtotal + creditCardFee;
  const totalAmount = totalAmountNumber.toFixed(2);

  // Animation values
  const cardAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(cardAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
      Animated.spring(buttonAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
    ]).start();
  }, []);

  const finishSubscriptionAfterSuccessfulPayment = async (
    donationAmountForProfile,
  ) => {
    await saveUserData({ monthlyDonation: donationAmountForProfile });

    try {
      await AsyncStorage.removeItem("@thrive_walkthrough_completed");
      await AsyncStorage.removeItem("@thrive_walkthrough_current_step");
      await AsyncStorage.removeItem("signupFlowPending");
      const completedEmail = (user?.email || "").toLowerCase();
      if (completedEmail) {
        await AsyncStorage.setItem(
          `onboardingCompleted:${completedEmail}`,
          "true",
        );
      }
    } catch (e) {
      console.warn("Could not persist onboarding flags:", e.message);
    }

    router.replace("/(tabs)/home");
  };

  /**
   * Stripe Payment Sheet only (card / Link / etc.) — no Apple Pay row in sheet.
   * @see https://stripe.com/docs/payments/accept-a-payment?platform=react-native
   */
  const handleContinue = async () => {
    setSelectedPaymentMethod("card");
    await runSubscriptionCheckout({ useNativeWallet: false });
  };

  /**
   * On real dev/production builds: native Apple/Google Pay (`confirmPlatformPayPayment`) —
   * goes straight to the wallet sheet (no Stripe Payment Sheet “tap Apple Pay again” step).
   * Expo Go still uses Payment Sheet with wallet buttons (native wallet is unreliable there).
   */
  const handleApplePay = async () => {
    if (Platform.OS === "ios" && isWalletSupported === false) {
      Alert.alert(
        "Apple Pay Unavailable",
        "Apple Pay isn't available on this device/build yet. Please use Pay with card for now.",
      );
      return;
    }
    setSelectedPaymentMethod("applepay");
    await runSubscriptionCheckout({ useNativeWallet: true });
  };

  /**
   * Card: Payment Sheet card-only (`cardOnly`).
   * Wallet (iOS/Android, non–Expo Go): `confirmPlatformPayPayment` native sheet.
   * Wallet on Expo Go: Payment Sheet with `applePay`/`googlePay` in initPaymentSheet (fallback).
   */
  const runSubscriptionCheckout = async ({ useNativeWallet }) => {
    if (paymentLoading) return;
    try {
      // Verify session token exists before hitting the payment API.
      // If absent the Edge Function returns "Missing Authorization header" —
      // catch this early and ask the user to log in again instead.
      const authToken = await AsyncStorage.getItem("authToken");
      if (!authToken) {
        Alert.alert(
          "Session Expired",
          "Your session has expired. Please log in again to continue.",
          [{ text: "OK", onPress: () => router.replace("/") }],
        );
        return;
      }

      const beneficiaryIdForPayload = await resolveCheckoutBeneficiaryId({
        params,
        selectedBeneficiary,
      });
      const subscriptionChargeAmount =
        Math.round(totalAmountNumber * 100) / 100;
      const donationAmountForProfile = Math.round(totalMonthlyDonation);

      console.log(
        "🎉 Subscription charge (incl. fees):",
        subscriptionChargeAmount,
      );
      console.log(
        "🎉 Monthly donation (excl. fees):",
        donationAmountForProfile,
      );
      console.log("🎯 Beneficiary for donation:", beneficiaryIdForPayload);

      if (!beneficiaryIdForPayload) {
        Alert.alert("Error", "Please select a beneficiary before continuing.");
        return;
      }

      setPaymentLoading(useNativeWallet ? "wallet" : "card");

      const response = await API.createMonthlySubscription({
        amount: subscriptionChargeAmount,
        beneficiary_id: beneficiaryIdForPayload,
        role: "donor",
        currency: "USD",
      });

      // Backend returned 409: subscription already exists (e.g. user re-entered signup flow).
      // Treat as a completed payment and proceed to home.
      if (response?.alreadySubscribed) {
        await finishSubscriptionAfterSuccessfulPayment(donationAmountForProfile);
        return;
      }

      if (!hasMonthlySubscriptionPaymentSheet(response)) {
        const keys =
          response && typeof response === "object"
            ? Object.keys(response)
            : [];
        console.warn(
          "[subscribe] Missing client secret for Payment Sheet; response keys:",
          keys,
        );
        Alert.alert(
          "Payment setup",
          "Could not start the card payment screen. Please try again.",
        );
        return;
      }

      const useWalletWithoutHostedSheet =
        useNativeWallet && !isStripeExpoGoHost();

      const payResult = useWalletWithoutHostedSheet
        ? await presentMonthlySubscriptionNativeWallet(
            { confirmPlatformPayPayment },
            response,
            { amountUsd: subscriptionChargeAmount },
          )
        : await presentMonthlySubscriptionPaymentSheet(
            { initPaymentSheet, presentPaymentSheet },
            response,
            { cardOnly: !useNativeWallet },
          );

      if (!payResult.ok) {
        if (!payResult.canceled && payResult.error) {
          const message =
            typeof payResult.error.message === "string"
              ? payResult.error.message
              : "";
          const looksLikeApplePayUnexpectedError =
            useNativeWallet &&
            /unexpected error/i.test(message || "");
          Alert.alert(
            "Payment",
            looksLikeApplePayUnexpectedError
              ? "Apple Pay had an unexpected issue on this device/build. Please use Pay with card and try Apple Pay again after a fresh app build."
              : payResult.error.message || "Could not complete payment.",
          );
        }
        return;
      }

      await finishSubscriptionAfterSuccessfulPayment(donationAmountForProfile);
    } catch (error) {
      console.error("❌ Error saving donation amount:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to save donation amount. Please try again.",
      );
    } finally {
      setPaymentLoading(null);
    }
  };

  const handleSkip = () => {
    router.replace("/(tabs)/home");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Blue gradient as absolute background for top half */}
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
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
            width: "100%",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: 100,
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
              style={{ width: 24, height: 24, tintColor: "#fff" }}
            />
          </TouchableOpacity>

          {/* Main Checkout Card */}
          <Animated.View
            style={{
              opacity: cardAnim,
              width: "100%",
              paddingHorizontal: 12,
              transform: [
                {
                  translateY: cardAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            }}
          >
            <View style={styles.mainCard}>
              {/* Donation Summary Section */}
              <View style={styles.summarySection}>
                <Text style={styles.sectionTitle}>Donation Summary</Text>

                {/* Donation Summary */}
                {isCoworkingExtra && sponsorAmount > 0 ? (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, styles.coveredLabel]}>
                        Coworking Sponsor{'\n'}
                        <Text style={styles.coveredNote}>(already billed by coworking)</Text>
                      </Text>
                      <Text style={[styles.summaryAmount, styles.coveredAmount]}>
                        ${sponsorAmount.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>
                        Your Extra Donation
                      </Text>
                      <Text style={styles.summaryAmount}>
                        ${baseAmount.toFixed(2)}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.summaryRow}>
                    <View style={styles.labelWithInfo}>
                      <Text style={styles.summaryLabel}>Monthly Donation</Text>
                      <TouchableOpacity
                        onPress={() => setShowMonthlyDonationInfo(true)}
                        style={styles.infoIconButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Image
                          source={require("../../assets/icons/info.png")}
                          style={styles.infoIcon}
                        />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.summaryAmount}>
                      ${baseAmount.toFixed(2)}
                    </Text>
                  </View>
                )}

                {/* Platform Fee */}
                <View style={styles.summaryRow}>
                  <View style={styles.labelWithInfo}>
                    <Text style={styles.summaryLabel}>Platform Fee</Text>
                    <TouchableOpacity
                      onPress={() => setShowServiceFeeInfo(true)}
                      style={styles.infoIconButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Image
                        source={require("../../assets/icons/info.png")}
                        style={styles.infoIcon}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.summaryAmount}>
                    ${SERVICE_FEE.toFixed(2)}
                  </Text>
                </View>

                {/* Credit Card Fees with Toggle */}
                <View style={styles.summaryRow}>
                  <View style={styles.labelWithToggle}>
                    <View style={styles.labelWithInfo}>
                      <Text style={styles.summaryLabel}>Credit Card Fees</Text>
                      <TouchableOpacity
                        onPress={() => setShowProcessingFeesInfo(true)}
                        style={styles.infoIconButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Image
                          source={require("../../assets/icons/info.png")}
                          style={styles.infoIcon}
                        />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        if (!coverFees) setConfettiTrigger(true);
                        setCoverFees(!coverFees);
                      }}
                      style={styles.toggleButton}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.toggleSwitch,
                          coverFees && styles.toggleSwitchActive,
                        ]}
                      >
                        <View
                          style={[
                            styles.toggleThumb,
                            coverFees && styles.toggleThumbActive,
                          ]}
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                  <Text
                    style={[
                      styles.summaryAmount,
                      styles.creditCardFeeAmount,
                      !coverFees && styles.disabledAmount,
                    ]}
                  >
                    ${coverFees ? creditCardFee.toFixed(2) : "0.00"}
                  </Text>
                </View>

                {/* Total - Prominent */}
                <View style={styles.totalSection}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalAmount}>${totalAmount}</Text>
                  </View>
                </View>

                <View style={styles.summarySupportCallout}>
                  <Text style={styles.summarySupportCalloutText}>
                    Help us cover processing fees so more of your donation goes
                    directly to {selectedBeneficiary?.name || "your cause"}.
                  </Text>
                </View>
              </View>

              {/* Payment — card + wallet side by side */}
              <View style={styles.paymentSection}>
                <Text style={styles.sectionTitle}>Payment</Text>

                <Animated.View
                  style={[
                    styles.paymentMethodsRow,
                    {
                      opacity: buttonAnim,
                      transform: [
                        {
                          scale: buttonAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.97, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <TouchableOpacity
                    onPress={handleContinue}
                    style={[
                      styles.continueButton,
                      styles.paymentMethodHalf,
                      paymentLoading !== null && styles.continueButtonDisabled,
                    ]}
                    disabled={paymentLoading !== null}
                    accessibilityRole="button"
                    accessibilityLabel="Pay with card using Stripe"
                  >
                    {paymentLoading === "card" ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.continueButtonTextInRow}>
                        Pay with card
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.walletPayButton,
                      styles.paymentMethodHalf,
                      isWalletSupported === false && styles.walletPayButtonDisabled,
                      paymentLoading !== null && styles.continueButtonDisabled,
                    ]}
                    onPress={handleApplePay}
                    disabled={paymentLoading !== null || isWalletSupported === false}
                    accessibilityRole="button"
                    accessibilityLabel={
                      Platform.OS === "ios"
                        ? "Pay with Apple Pay"
                        : "Pay with Google Pay"
                    }
                  >
                    {paymentLoading === "wallet" ? (
                      <ActivityIndicator color="#fff" />
                    ) : Platform.OS === "ios" && applePaySvg ? (
                      <SvgXml xml={applePaySvg} width={56} height={23} />
                    ) : Platform.OS === "ios" ? (
                      <View style={styles.walletMarkLoadingSlot} />
                    ) : (
                      <MaterialIcons
                        name="account-balance-wallet"
                        size={32}
                        color="#fff"
                      />
                    )}
                  </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity
                  onPress={() => setSaveCard(!saveCard)}
                  style={styles.saveCardOption}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      saveCard && styles.checkboxChecked,
                    ]}
                  >
                    {saveCard && (
                      <AntDesign name="check" size={14} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.saveCardText}>
                    Save card for future donations
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Confetti */}
              {confettiTrigger && (
                <ConfettiCannon
                  count={100}
                  origin={{ x: SCREEN_WIDTH / 2, y: 0 }}
                  fadeOut
                  explosionSpeed={350}
                  fallSpeed={3000}
                  onAnimationEnd={() => setConfettiTrigger(false)}
                />
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ProfileCompleteModal
        visible={showModal}
        onClose={async () => {
          setShowModal(false);
          // Mark that user just completed signup - trigger tutorial
          try {
            await AsyncStorage.removeItem("@thrive_walkthrough_completed");
            await AsyncStorage.removeItem("@thrive_walkthrough_current_step");
            await AsyncStorage.removeItem("signupFlowPending");
            const completedEmail = (user?.email || "").toLowerCase();
            if (completedEmail) {
              await AsyncStorage.setItem(
                `onboardingCompleted:${completedEmail}`,
                "true",
              );
            }
            console.log(
              "📚 Signup completed - tutorial will show on home screen",
            );
          } catch (error) {
            console.error("Error resetting tutorial:", error);
          }
          router.replace('/(tabs)/home');
        }}
      />

      {/* Monthly Donation Info Modal */}
      <Modal
        visible={showMonthlyDonationInfo}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMonthlyDonationInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMonthlyDonationInfo(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Monthly Donation</Text>
            <Text style={styles.modalText}>
              This is the amount you choose to give each month — 100% goes straight to your cause, creating real impact where it matters most.
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowMonthlyDonationInfo(false)}
            >
              <Text style={styles.modalCloseButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Platform Fee Info Modal */}
      <Modal
        visible={showServiceFeeInfo}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowServiceFeeInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowServiceFeeInfo(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Platform Fee</Text>
            <Text style={styles.modalText}>
              Your $3 monthly platform fee helps power THRIVE — supporting the technology, operations, and growth needed to expand impact across more communities.
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowServiceFeeInfo(false)}
            >
              <Text style={styles.modalCloseButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Processing Fees Info Modal */}
      <Modal
        visible={showProcessingFeesInfo}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowProcessingFeesInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowProcessingFeesInfo(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Credit Card Fees</Text>
            <Text style={styles.modalText}>
              Payment processors charge a small fee (3.5%) to securely handle your donation. By turning this on, you help ensure 100% of your gift goes directly to your cause.
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowProcessingFeesInfo(false)}
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
  gradientAbsoluteBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.35,
    zIndex: 0,
    overflow: "hidden",
  },
  gradientBg: {
    width: SCREEN_WIDTH,
    height: "100%",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  piggySpeechColumn: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 36,
    marginBottom: 6,
    zIndex: 1,
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
    borderRadius: 24,
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
    textAlign: "center",
    lineHeight: 22,
  },
  speechBubbleHeading: {
    color: "#324E58",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
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
  backButton: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    padding: 8,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mainCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    width: "90%",
    alignSelf: "center",
    marginBottom: 30,
  },
  summarySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#324E58",
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    minHeight: 24,
  },
  summaryLabel: {
    fontSize: 15,
    color: "#6d6e72",
    fontWeight: "400",
  },
  summaryAmount: {
    fontSize: 15,
    color: "#2C3E50",
    fontWeight: "600",
  },
  creditCardFeeAmount: {
    marginLeft: 16,
    flexShrink: 0,
  },
  disabledAmount: {
    color: "#9ca3af",
  },
  coveredLabel: {
    color: "#9ca3af",
  },
  coveredNote: {
    fontSize: 11,
    color: "#b0b3b8",
    fontWeight: "400",
  },
  coveredAmount: {
    color: "#9ca3af",
    textDecorationLine: "line-through",
  },
  labelWithInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  labelWithToggle: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "space-between",
  },
  feePercentage: {
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: "400",
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
  toggleButton: {
    padding: 4,
  },
  feeToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  totalSection: {
    marginTop: 8,
    paddingTop: 16,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#324E58",
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2C3E50",
  },
  summarySupportCallout: {
    marginTop: 14,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F4F7F9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6EBEF",
  },
  summarySupportCalloutText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5A6B78",
    textAlign: "center",
    fontWeight: "400",
  },
  paymentSection: {
    marginTop: 12,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  paymentMethodsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  paymentMethodHalf: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
  },
  walletPayButton: {
    backgroundColor: "#000",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  walletPayButtonDisabled: {
    opacity: 0.45,
  },
  walletMarkLoadingSlot: {
    width: 56,
    height: 23,
  },
  cardInputsSection: {
    marginTop: 16,
  },
  cardInputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cardInputHalf: {
    width: "48%",
  },
  saveCardOption: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: "#DB8633",
    borderColor: "#DB8633",
  },
  saveCardText: {
    fontSize: 14,
    color: "#6d6e72",
    fontWeight: "400",
  },
  skipButton: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 10,
  },
  speechBubble: {
    backgroundColor: "#F5F5FA",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E1E1E5",
    marginRight: 10,
    flex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: "relative",
  },
  speechBubbleTail: {
    position: "absolute",
    left: -8,
    top: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderBottomWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#F5F5FA",
    borderTopColor: "transparent",
  },
  speechText: {
    color: "#324E58",
    fontSize: 16,
    lineHeight: 22,
  },
  piggy: {
    width: 70,
    height: 70,
    resizeMode: "contain",
  },
  stripeLogo: {
    width: 150,
    height: 60,
    marginVertical: 10,
  },
  input: {
    width: "100%",
    height: 52,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#324E58",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  saveCardContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  footer: {
    backgroundColor: "#fff",
    paddingVertical: 20,
    borderTopWidth: 1,
    borderColor: "#e1e1e5",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  continueButton: {
    backgroundColor: "#DB8633",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueButtonTextInRow: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  amountBubbleCard: {
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
    alignItems: "center",
  },
  amountBubbleHeading: {
    color: "#324E58",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  amountBubbleAmount: {
    color: "#2C3E50",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
  },
  amountBubbleTotal: {
    color: "#6d6e72",
    fontSize: 14,
    textAlign: "center",
  },
  feeCoverageSection: {
    width: "100%",
    marginBottom: 20,
    alignItems: "center",
  },
  feeCoverageButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#f5f5fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e1e1e5",
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
  },
  feeCoverageCheckbox: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  feeCoverageTextContainer: {
    flex: 1,
  },
  feeCoverageMainText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C3E50",
    marginBottom: 4,
  },
  feeCoverageSubText: {
    fontSize: 14,
    color: "#6d6e72",
  },
  feeCoverageGratitude: {
    marginTop: 15,
    marginBottom: 20,
  },
  feeCoverageGratitudeText: {
    color: "#2C3E50",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E1E1E5",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: "#DB8633",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
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
