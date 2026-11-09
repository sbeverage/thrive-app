import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const LAST_LOGIN_KEY = 'lastLoginMethod';
const REMEMBER_ME_KEY = 'loginRememberMe';
const ONBOARDING_DONE_KEY_PREFIX = 'onboardingCompleted:';
import { AntDesign, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import API from './lib/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from './context/UserContext';
import { useBeneficiary } from './context/BeneficiaryContext';
import { signInWithApple, signInWithGoogle } from './utils/socialLogin';
import { IMAGE_ASSETS } from './utils/assetConstants';
import { resumeSignupFlowPendingIfAny } from './utils/signupFlowResume';
import {
  getBiometricCapability,
  getSavedBiometricEmail,
  readBiometricLogin,
  saveBiometricLogin,
  clearBiometricLogin,
  isBiometricLoginDeclined,
  setBiometricLoginDeclined,
} from './utils/biometricLogin';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const { updateUserProfile, syncVerificationFromLogin, loadUserData } =
    useUser();
  const { reloadBeneficiary } = useBeneficiary();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [lastLogin, setLastLogin] = useState(null);
  const [rememberMe, setRememberMe] = useState(true);
  // { label, email } when this phone can sign her in biometrically and a
  // credential is saved for it. null hides the button entirely, so a device
  // with no Face ID enrolled sees exactly the screen it saw before.
  const [biometric, setBiometric] = useState(null);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');

  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_ME_KEY).then((v) => {
      if (v === "false") setRememberMe(false);
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(LAST_LOGIN_KEY).then((raw) => {
      try {
        if (raw) {
          const data = JSON.parse(raw);
          setLastLogin(data);
          if (data.method === "email" && data.email) {
            setEmail(data.email);
          }
        }
      } catch (_) {}
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ available, label }, savedEmail] = await Promise.all([
        getBiometricCapability(),
        getSavedBiometricEmail(),
      ]);
      if (cancelled) return;
      setBiometricLabel(label);
      // Both halves have to hold: the hardware can be there with nothing saved
      // (first run), and something can be saved on a phone where she has since
      // turned Face ID off.
      setBiometric(available && savedEmail ? { label, email: savedEmail } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveLastLogin = (method, emailValue) => {
    const data =
      method === "email" ? { method, email: emailValue } : { method };
    AsyncStorage.setItem(LAST_LOGIN_KEY, JSON.stringify(data));
    setLastLogin(data);
  };

  const getOnboardingDoneForEmail = async (emailValue) => {
    if (!emailValue) return false;
    const flag = await AsyncStorage.getItem(
      `${ONBOARDING_DONE_KEY_PREFIX}${emailValue.toLowerCase()}`,
    );
    return flag === "true";
  };

  /**
   * Ask once, after a sign-in that actually worked, whether to keep the
   * password behind Face ID. Wrapped in a promise so the answer lands before
   * the navigation below moves the screen out from under the alert.
   */
  const offerBiometricLogin = (emailValue, passwordValue, label) =>
    new Promise((resolve) => {
      Alert.alert(
        `Use ${label} next time?`,
        `We can keep your password in this phone's secure storage so ${label} signs you in. You can turn it off any time from My Profile.`,
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: async () => {
              await setBiometricLoginDeclined();
              resolve(false);
            },
          },
          {
            text: `Use ${label}`,
            onPress: async () => {
              const saved = await saveBiometricLogin(emailValue, passwordValue);
              if (saved) setBiometric({ label, email: emailValue });
              resolve(saved);
            },
          },
        ],
        { cancelable: false },
      );
    });

  /**
   * The single login path. Face ID gets no shortcut: it unlocks the saved
   * password and arrives here, so profile setup, signup resume and onboarding
   * all branch identically whichever way she signed in.
   */
  const performLogin = async (
    emailTrim,
    passwordValue,
    { viaBiometrics = false } = {},
  ) => {
    try {
      setIsLoggingIn(true);
      await AsyncStorage.setItem(
        REMEMBER_ME_KEY,
        rememberMe ? "true" : "false",
      );
      const response = await API.login({
        email: emailTrim,
        password: passwordValue,
      });

      console.log("🔐 Login response:", response);
      console.log("🔐 Login response.user:", response.user);
      console.log(
        "🔐 Login response.user.needsProfileSetup:",
        response.user.needsProfileSetup,
      );
      console.log(
        "🔐 Login response.user.needsOnboarding:",
        response.user.needsOnboarding,
      );
      console.log("🔐 Login response.user.email:", response.user.email);
      console.log(
        "🔐 Login response.user.isVerified:",
        response.user.isVerified,
      );
      console.log(
        "🔐 Login response.user.isLoggedIn:",
        response.user.isLoggedIn,
      );
      console.log("🔐 Login response.user.isLoading:", response.user.isLoading);
      console.log("🔐 Login response.user.firstName:", response.user.coworking);

      // Persist authenticated session in user context
      updateUserProfile({ email: emailTrim, isLoggedIn: true });

      // Sync verification status from login response
      await syncVerificationFromLogin(response);

      // Reload full user data from backend
      await loadUserData();

      // Reload beneficiary from storage (fallback signal for completed onboarding)
      const savedBeneficiary = await reloadBeneficiary();
      const hasLocalBeneficiary = Boolean(
        savedBeneficiary?.id || savedBeneficiary?.name,
      );
      const onboardingDoneLocally = await getOnboardingDoneForEmail(
        response.user?.email || emailTrim,
      );

      if (rememberMe) {
        saveLastLogin("email", emailTrim);
      } else {
        await AsyncStorage.removeItem(LAST_LOGIN_KEY);
        setLastLogin(null);
      }

      // Offer Face ID only after the password has been proven against the
      // backend, so a typo never gets saved as the stored credential. Skipped
      // when this login *came from* Face ID, and when she has already said no.
      if (!viaBiometrics) {
        // Read the label here rather than off state: the mount probe is async
        // and a fast sign-in can beat it, which would put "Face ID" in front of
        // someone whose phone only has a fingerprint reader.
        const { available, label } = await getBiometricCapability();
        const alreadySaved = await getSavedBiometricEmail();
        const sameAccount =
          (alreadySaved || '').toLowerCase() === emailTrim.toLowerCase();
        if (available && !sameAccount && !(await isBiometricLoginDeclined())) {
          await offerBiometricLogin(emailTrim, passwordValue, label);
        } else if (available && sameAccount) {
          // Same account, freshly confirmed password. Re-save silently so a
          // reset password, or a keychain item iOS invalidated when the face
          // profile changed, repairs itself without her being asked anything.
          await saveBiometricLogin(emailTrim, passwordValue);
        }
      }

      // Check if user needs to complete onboarding
      if (response.user?.needsProfileSetup) {
        console.log("📱 User needs profile setup, redirecting...");
        router.push({
          pathname: "/signupProfile",
          params: { email: response.user.email || emailTrim },
        });
        return;
      }

      const loginEmail = (
        response.user?.email ||
        emailTrim ||
        ""
      ).trim();
      if (
        loginEmail &&
        (await resumeSignupFlowPendingIfAny(router, {
          loggedInEmail: loginEmail,
        }))
      ) {
        return;
      }

      if (response.user?.needsOnboarding && !onboardingDoneLocally) {
        // Resume signup flow at the right step based on how far they got
        if (hasLocalBeneficiary) {
          // Comped accounts have no amount to pick: a coworking member's gift
          // comes with their membership and a team account is never billed.
          // Resuming them at donationAmount asked a question neither should
          // ever see.
          const membership = String(
            response.user?.inviteType || response.user?.invite_type || '',
          ).toLowerCase();
          if (membership === 'team') {
            router.replace({
              pathname: '/signupFlow/teamAccountReady',
              params: { flow: 'team' },
            });
          } else if (membership === 'coworking' || response.user?.coworking === true) {
            router.replace({
              pathname: '/signupFlow/coworkingDonationPrompt',
              params: {
                sponsorAmount: String(response.user?.sponsorAmount ?? '15'),
              },
            });
          } else {
            console.log('📱 Resuming signup flow at donationAmount (charity already selected)');
            router.replace('/signupFlow/donationAmount');
          }
        } else {
          // Start from the beginning of the signup flow
          console.log('📱 Starting signup flow from explainerDonate');
          router.replace('/signupFlow/explainerDonate');
        }
      } else {
        // Navigate to home on successful login
        router.replace("/home");
      }
    } catch (error) {
      console.error("❌ Login error:", error);
      const status = error.response?.status ?? (error.originalStatus);
      const code = error.response?.data?.code;
      const isNotFound = status === 404 || code === "USER_NOT_FOUND" ||
        (error.message || '').toLowerCase().includes("no account found");

      // A saved password that the backend now rejects means it was changed
      // somewhere else, most likely through a reset link. Drop it rather than
      // leave a button that raises Face ID and then fails every single time.
      if (viaBiometrics && (status === 401 || status === 400 || isNotFound)) {
        await clearBiometricLogin();
        setBiometric(null);
        Alert.alert(
          `${biometricLabel} is turned off`,
          'Your password has changed since this phone saved it. Sign in with your new password and we will offer to set it up again.',
        );
        return;
      }

      if (isNotFound) {
        Alert.alert(
          "No Account Found",
          "We couldn't find an account with that email. Would you like to sign up?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Sign Up", onPress: () => router.push("/signup") },
          ],
        );
      } else {
        Alert.alert("Login Error", error.message || "Login failed. Please check your credentials.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    const emailTrim = email.trim();
    if (!emailTrim || !password) {
      Alert.alert("Missing Info", "Please enter both email and password.");
      return;
    }
    await performLogin(emailTrim, password);
  };

  const handleBiometricLogin = async () => {
    if (isLoggingIn) return;
    const result = await readBiometricLogin();

    if (result.status === 'cancelled') {
      // Sheet dismissed or the scan did not take. Say nothing and leave the
      // saved credential alone; the password field is right there.
      return;
    }

    if (result.status === 'none') {
      // iOS invalidates a protected keychain item whenever the enrolled face or
      // fingerprint set changes, so this is a normal thing to hit, not a fault.
      await clearBiometricLogin();
      setBiometric(null);
      Alert.alert(
        `${biometricLabel} needs setting up again`,
        `Your ${biometricLabel} changed on this phone, so the saved sign-in no longer opens. Sign in with your password once and we will offer to set it up again.`,
      );
      return;
    }

    setEmail(result.email);
    await performLogin(result.email, result.password, { viaBiometrics: true });
  };

  const handleSocialLogin = async (socialData) => {
    if (!socialData) {
      return; // User canceled
    }

    try {
      setIsSocialLoading(true);

      // Call social login API with loginOnly=true so backend rejects unknown users
      const response = await API.socialLogin({
        ...socialData,
        loginOnly: true,
      });

      // isNewUser should never be true here since loginOnly rejects them at the backend,
      // but guard defensively in case of an unexpected response.
      if (response.isNewUser) {
        Alert.alert(
          "Account Not Found",
          "No account found for this social login. Please sign up first.",
          [{ text: "OK" }],
        );
        return;
      }

      // Existing user - update context including verification status
      if (response.user) {
        updateUserProfile({
          email: response.user.email || socialData.email,
          isLoggedIn: true,
          isVerified: response.user.isVerified ?? false,
        });
      }

      // Sync verification status
      await syncVerificationFromLogin(response);

      // If existing user never completed profile setup, send them there.
      // Exception: Sign in with Apple users must NOT be asked for name/email
      // post-authentication (App Store guideline 4 / SiwA HIG). Apple supplies
      // those fields via Authentication Services on first signin; afterwards
      // the user owns the choice. They can edit their name from Profile.
      const apple = socialData.provider === 'apple';
      if (response.user?.needsProfileSetup && !apple) {
        router.push({
          pathname: "/signupProfile",
          params: { email: response.user.email || socialData.email },
        });
        return;
      }

      // Reload full user data from backend
      await loadUserData();

      // Reload beneficiary from storage (fallback signal for completed onboarding)
      const savedBeneficiary = await reloadBeneficiary();
      const hasLocalBeneficiary = Boolean(
        savedBeneficiary?.id || savedBeneficiary?.name,
      );
      const onboardingDoneLocally = await getOnboardingDoneForEmail(
        response.user?.email || socialData.email,
      );

      saveLastLogin(socialData.provider);

      const socialEmail = (
        response.user?.email ||
        socialData?.email ||
        ""
      ).trim();
      if (
        socialEmail &&
        (await resumeSignupFlowPendingIfAny(router, {
          loggedInEmail: socialEmail,
        }))
      ) {
        return;
      }

      // Check if user needs to complete onboarding
      if (response.user?.needsOnboarding && !onboardingDoneLocally) {
        // Resume signup flow at the right step based on how far they got
        if (hasLocalBeneficiary) {
          // Comped accounts have no amount to pick: a coworking member's gift
          // comes with their membership and a team account is never billed.
          // Resuming them at donationAmount asked a question neither should
          // ever see.
          const membership = String(
            response.user?.inviteType || response.user?.invite_type || '',
          ).toLowerCase();
          if (membership === 'team') {
            router.replace({
              pathname: '/signupFlow/teamAccountReady',
              params: { flow: 'team' },
            });
          } else if (membership === 'coworking' || response.user?.coworking === true) {
            router.replace({
              pathname: '/signupFlow/coworkingDonationPrompt',
              params: {
                sponsorAmount: String(response.user?.sponsorAmount ?? '15'),
              },
            });
          } else {
            console.log('📱 Resuming signup flow at donationAmount (charity already selected)');
            router.replace('/signupFlow/donationAmount');
          }
        } else {
          // Start from the beginning of the signup flow
          console.log('📱 Starting signup flow from explainerDonate');
          router.replace('/signupFlow/explainerDonate');
        }
      } else {
        // Navigate to home on successful login
        router.replace("/home");
      }
    } catch (error) {
      console.error("❌ Social login error:", error);
      Alert.alert(
        "Login Failed",
        error.message || "Social login failed. Please try again.",
      );
    } finally {
      setIsSocialLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    if (isSocialLoading) return;
    setIsSocialLoading(true);
    try {
      const result = await signInWithApple();
      if (result) {
        await handleSocialLogin(result);
      }
    } catch (error) {
      console.error('❌ Apple login error:', error);
      Alert.alert('Login Failed', error.message || 'Apple login failed. Please try again.');
    } finally {
      setIsSocialLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isSocialLoading) return;
    setIsSocialLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result) {
        await handleSocialLogin(result);
      }
    } catch (error) {
      console.error('❌ Google login error:', error);
      Alert.alert('Login Failed', error.message || 'Google login failed. Please try again.');
    } finally {
      setIsSocialLoading(false);
    }
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
            alignItems: "center",
            justifyContent: "flex-start",
            paddingBottom: 28,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backArrow}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
          >
            <Image
              source={require("../assets/icons/arrow-left.png")}
              style={{ width: 24, height: 24, tintColor: "#324E58" }}
            />
          </TouchableOpacity>
          <View style={styles.piggyLogoColumn}>
            <Image
              source={require("../assets/images/piggy-with-flowers.png")}
              style={styles.logo}
            />
            <Image
              source={{ uri: IMAGE_ASSETS.INITIATIVE_LOGO_NO_WEB_WHITE }}
              style={styles.brand}
              resizeMode="contain"
            />
            <Text style={styles.welcomeMessage}>Welcome Back!</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel} accessibilityRole="text">
                  Email Address <Text style={styles.requiredMark}>*</Text>
                </Text>
                {lastLogin?.method === "email" && (
                  <Text style={styles.previouslyUsedBadge}>
                    Previously used
                  </Text>
                )}
              </View>
              <TextInput
                placeholder="Enter your email"
                style={styles.input}
                placeholderTextColor="#6d6e72"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                accessibilityLabel="Email address"
                // Tells iOS this pair is a sign-in, which is what puts the
                // saved password on the QuickType bar behind Face ID. Without
                // it the keyboard never offers one and the password has to be
                // typed every time, whatever "Remember me" is set to.
                textContentType="username"
                autoComplete="username"
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel} accessibilityRole="text">
                Password <Text style={styles.requiredMark}>*</Text>
              </Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  placeholder="Enter your password"
                  style={styles.passwordInput}
                  placeholderTextColor="#6d6e72"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  accessibilityLabel="Password"
                  textContentType="password"
                  autoComplete="password"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  <Feather
                    name={showPassword ? "eye" : "eye-off"}
                    size={20}
                    color="#6d6e72"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.rememberRow}>
              <Text style={styles.rememberLabel}>Remember me</Text>
              <Switch
                value={rememberMe}
                onValueChange={setRememberMe}
                trackColor={{
                  false: "#d1d5db",
                  true: "rgba(219, 134, 51, 0.45)",
                }}
                thumbColor={rememberMe ? "#DB8633" : "#f4f4f5"}
                ios_backgroundColor="#d1d5db"
                accessibilityLabel="Remember me on this device"
              />
            </View>

            {/* Forgot Password Link */}
            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => router.push("/forgotPassword")}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Face ID / Touch ID, only once a credential is actually saved */}
            {biometric && (
              <TouchableOpacity
                style={[
                  styles.biometricButton,
                  isLoggingIn && { opacity: 0.6 },
                ]}
                onPress={handleBiometricLogin}
                disabled={isLoggingIn}
                accessibilityRole="button"
                accessibilityLabel={`Sign in as ${biometric.email} with ${biometric.label}`}
              >
                <MaterialCommunityIcons
                  name={
                    biometric.label === 'Touch ID' ||
                    biometric.label === 'your fingerprint'
                      ? 'fingerprint'
                      : 'face-recognition'
                  }
                  size={22}
                  color="#DB8633"
                />
                <Text style={styles.biometricButtonText}>
                  Sign in with {biometric.label}
                </Text>
              </TouchableOpacity>
            )}

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, isLoggingIn && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={isLoggingIn}
            >
              <Text style={styles.loginButtonText}>
                {isLoggingIn ? "Please wait…" : "Login"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.orText}>Or login with</Text>
            <View style={styles.socialIconsContainer}>
              <View style={styles.socialIconWrapper}>
                <TouchableOpacity
                  style={[
                    styles.socialIconButton,
                    isSocialLoading && styles.socialIconButtonDisabled,
                  ]}
                  onPress={handleGoogleLogin}
                  disabled={isSocialLoading}
                >
                  <Image
                    source={require("../assets/images/Google-icon.png")}
                    style={styles.socialIcon}
                  />
                </TouchableOpacity>
                {lastLogin?.method === "google" && (
                  <Text style={styles.previouslyUsedBadgeSmall}>
                    Previously used
                  </Text>
                )}
              </View>
              {Platform.OS === "ios" && (
                <View style={styles.socialIconWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.socialIconButton,
                      isSocialLoading && styles.socialIconButtonDisabled,
                    ]}
                    onPress={handleAppleLogin}
                    disabled={isSocialLoading}
                  >
                    <Image
                      source={require("../assets/images/Apple-icon.png")}
                      style={styles.socialIcon}
                    />
                  </TouchableOpacity>
                  {lastLogin?.method === "apple" && (
                    <Text style={styles.previouslyUsedBadgeSmall}>
                      Previously used
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Link to Signup */}
            <TouchableOpacity onPress={() => router.push("/signup")}>
              <Text style={styles.signupLink}>I don't have an account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Loading Overlay for Social Login */}
      {isSocialLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#db8633" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </View>
      )}
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
  gradientBg: {
    width: SCREEN_WIDTH,
    height: "100%",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  piggyLogoColumn: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
    marginBottom: 4,
    zIndex: 1,
  },
  logo: {
    width: 110,
    height: 128,
    resizeMode: "contain",
    marginBottom: -10,
  },
  brand: {
    width: 188,
    height: 59,
    marginBottom: 6,
  },
  welcomeMessage: {
    fontSize: 22,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.96)",
    marginTop: 8,
    textAlign: "center",
    letterSpacing: 0.6,
    textShadowColor: "rgba(44, 62, 80, 0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: "90%",
    maxWidth: 340,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
    alignItems: "center",
    zIndex: 2,
  },
  fieldGroup: {
    width: "100%",
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e293b",
    alignSelf: "flex-start",
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  requiredMark: {
    color: "#DC2626",
    fontWeight: "700",
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 10,
    paddingVertical: 2,
  },
  rememberLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#324E58",
    flex: 1,
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  previouslyUsedBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#DB8633",
    backgroundColor: "rgba(219, 134, 51, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  backArrow: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 20,
    padding: 6,
    marginBottom: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    height: 48,
    backgroundColor: "#f5f5fa",
    borderRadius: 8,
    width: "100%",
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#e1e1e5",
    fontSize: 16,
    color: "#324E58",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e1e5",
    height: 48,
  },
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 15,
    fontSize: 16,
    color: "#324E58",
  },
  eyeButton: {
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 12,
  },
  forgotText: {
    color: "#6d6e72",
    fontSize: 14,
    fontWeight: "500",
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    // Matched to loginButton below so the two read as a pair rather than as
    // two unrelated controls stacked on top of each other.
    width: '100%',
    height: 48,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DB8633',
    // White ground, orange ink. The reverse would be orange on orange, which
    // CLAUDE.md rules out because it disappears.
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  biometricButtonText: {
    color: '#DB8633',
    fontSize: 16,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: "#db8633",
    borderRadius: 8,
    width: "100%",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  orText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6d6e72",
    marginBottom: 10,
  },
  socialIconsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    marginTop: 2,
    marginBottom: 12,
  },
  socialIconWrapper: {
    alignItems: "center",
    marginHorizontal: 8,
  },
  socialIconButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#e1e1e5",
    borderRadius: 8,
  },
  previouslyUsedBadgeSmall: {
    fontSize: 9,
    fontWeight: "600",
    color: "#DB8633",
    marginTop: 4,
  },
  socialIconButtonDisabled: {
    opacity: 0.5,
  },
  socialIcon: {
    width: 32,
    height: 32,
    resizeMode: "contain",
  },
  signupLink: {
    textDecorationLine: "underline",
    color: "#324e58",
    marginBottom: 4,
    fontSize: 16,
    fontWeight: "500",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  loadingCard: {
    backgroundColor: "#fff",
    padding: 30,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: "600",
    color: "#324E58",
  },
});
