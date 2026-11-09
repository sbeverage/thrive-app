/**
 * Face ID / Touch ID sign-in.
 *
 * There is no refresh-token endpoint on the backend, and the JWT the Edge
 * Function issues expires in 30 days with no way to renew it. So "sign in with
 * Face ID" cannot mean "restore the saved session": past day 30, and after any
 * 401 wipe, there is nothing left to restore. It has to mean a real sign-in.
 *
 * So the password goes into the iOS keychain behind biometrics, and Face ID
 * unlocking it runs the ordinary POST /api/auth/login. Every branch already in
 * the login screen (profile setup, signup resume, onboarding) therefore applies
 * to a Face ID sign-in for free, because it IS the normal login path.
 *
 * Note this stores nothing the keychain will not already be holding: iOS offers
 * to save the same password itself now that the fields carry AutoFill hints
 * (4cbdc88). The gain here is one tap instead of three, and a prompt that says
 * THRIVE rather than a generic QuickType suggestion.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/** The password. Protected: reading it is what raises the Face ID sheet. */
const PASSWORD_KEY = 'biometricLoginPassword';
/**
 * The email, in plain AsyncStorage on purpose. The login screen has to decide
 * whether to draw the Face ID button *before* prompting, and reading the
 * protected item is the thing that prompts. Checking a marker instead keeps the
 * sheet from appearing unasked every time the screen mounts. It is not a new
 * exposure: the same address is already stored under `lastLoginMethod`.
 */
const EMAIL_KEY = 'biometricLoginEmail';
/** Set when she says "Not now", so the offer is made once and not nagged. */
const DECLINED_KEY = 'biometricLoginDeclined';

const SECURE_OPTIONS = {
  requireAuthentication: true,
  // Cannot exist on a device with no passcode and never travels to a new device
  // or into a backup. If she removes her passcode the item is destroyed, the
  // button stops being drawn and the password field takes over: that is the
  // intended failure mode, not a bug to work around.
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  authenticationPrompt: 'Sign in to THRIVE',
};

function labelForTypes(types = []) {
  const face = types.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  );
  const print = types.includes(
    LocalAuthentication.AuthenticationType.FINGERPRINT,
  );
  if (Platform.OS === 'ios') {
    if (face) return 'Face ID';
    if (print) return 'Touch ID';
    return 'Face ID';
  }
  if (face) return 'face unlock';
  if (print) return 'your fingerprint';
  return 'biometrics';
}

/**
 * What this device can actually do, as { available, label }. `label` is always
 * a real word so copy can interpolate it without checking `available` first.
 */
export async function getBiometricCapability() {
  const fallback = { available: false, label: 'Face ID' };
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return fallback;
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    // The one that decides whether the keychain will accept an item with
    // requireAuthentication at all. Without it a save throws at the worst
    // possible moment, straight after a successful sign-in.
    const canStore = SecureStore.canUseBiometricAuthentication();
    return {
      available: Boolean(hasHardware && isEnrolled && canStore),
      label: labelForTypes(types),
    };
  } catch (error) {
    console.warn('Biometric check failed:', error?.message);
    return fallback;
  }
}

/** The address a saved Face ID sign-in belongs to, or null. Never prompts. */
export async function getSavedBiometricEmail() {
  try {
    return await AsyncStorage.getItem(EMAIL_KEY);
  } catch (_) {
    return null;
  }
}

export async function clearBiometricLogin() {
  try {
    await SecureStore.deleteItemAsync(PASSWORD_KEY, SECURE_OPTIONS);
  } catch (_) {
    // Already gone, or the keychain refused. Either way the marker below is
    // what the UI reads, so dropping it is enough to retire the button.
  }
  try {
    await AsyncStorage.removeItem(EMAIL_KEY);
  } catch (_) {}
}

export async function saveBiometricLogin(email, password) {
  if (!email || !password) return false;
  try {
    // On iOS the keychain prompts when *updating* a protected item but not when
    // creating one. Deleting first means turning this on, and re-saving after a
    // password change, both stay silent instead of raising a second sheet
    // moments after the one that just succeeded.
    await SecureStore.deleteItemAsync(PASSWORD_KEY, SECURE_OPTIONS);
    await SecureStore.setItemAsync(PASSWORD_KEY, password, SECURE_OPTIONS);
    await AsyncStorage.setItem(EMAIL_KEY, email);
    await AsyncStorage.removeItem(DECLINED_KEY);
    return true;
  } catch (error) {
    console.warn('Could not save the biometric sign-in:', error?.message);
    // Half-written is worse than absent: a marker with no password behind it
    // draws a button that can never work.
    await clearBiometricLogin();
    return false;
  }
}

/**
 * Raise the biometric sheet and hand back the saved credential.
 *
 * Returns one of:
 *   { status: 'ok', email, password }
 *   { status: 'none' }      nothing saved, or the keychain says the item is
 *                           unusable. getItemAsync resolves null both when the
 *                           entry is missing and when iOS invalidated it, which
 *                           it does whenever the enrolled face or fingerprint
 *                           set changes. Caller should clear and ask for the
 *                           password once.
 *   { status: 'cancelled' } the sheet was dismissed, or the read threw. The
 *                           credential is deliberately left alone: a failed
 *                           scan must not cost her the saved sign-in.
 */
export async function readBiometricLogin() {
  const email = await getSavedBiometricEmail();
  if (!email) return { status: 'none' };
  try {
    const password = await SecureStore.getItemAsync(PASSWORD_KEY, SECURE_OPTIONS);
    if (!password) return { status: 'none' };
    return { status: 'ok', email, password };
  } catch (error) {
    return { status: 'cancelled' };
  }
}

export async function isBiometricLoginDeclined() {
  try {
    return (await AsyncStorage.getItem(DECLINED_KEY)) === 'true';
  } catch (_) {
    return false;
  }
}

export async function setBiometricLoginDeclined(declined = true) {
  try {
    if (declined) await AsyncStorage.setItem(DECLINED_KEY, 'true');
    else await AsyncStorage.removeItem(DECLINED_KEY);
  } catch (_) {}
}
