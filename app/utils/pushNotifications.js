// Push notifications setup for the THRIVE donor app. Handles the three
// pieces Apple requires: permission request, token registration with our
// backend, and the foreground-display + tap handlers.
//
// Send flow (server -> phone):
//   1. Backend POSTs to Expo Push API with the user's stored expo_push_token
//   2. iOS shows the system notification (banner / lock screen)
//   3. User taps -> we read `data.url` and route to the appropriate screen
//      via expo-router

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";
import API from "../lib/api";

// Foreground behavior — when a notification arrives while the app is open,
// show the banner + play sound (the default behavior is silent).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Ensures the user has granted notification permission and returns their
 * Expo push token, registering it with our backend. Safe to call multiple
 * times — token registration is idempotent and quick.
 *
 * @returns {Promise<string | null>} the token, or null on failure / denial
 */
export async function registerForPushNotificationsAsync() {
  // Simulator can't receive remote push — bail early to avoid noisy logs.
  if (!Device.isDevice) {
    return null;
  }

  if (Platform.OS === "android") {
    // Android requires a channel for notifications to display reliably.
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#DB8633",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    // User declined — respect their choice silently (no re-asking).
    return null;
  }

  let token = null;
  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = tokenResponse?.data || null;
  } catch (e) {
    console.warn("getExpoPushTokenAsync failed:", e?.message || e);
    return null;
  }

  if (!token) return null;

  // Send to backend — fire-and-forget, log on failure but don't break login.
  try {
    await API.registerPushToken(token);
  } catch (e) {
    console.warn("registerPushToken failed:", e?.message || e);
  }
  return token;
}

/**
 * Clears the stored push token on the server (used at sign-out so the
 * server stops trying to send notifications to a logged-out device).
 */
export async function clearPushTokenOnServer() {
  try {
    await API.registerPushToken(null);
  } catch (e) {
    // Logout should never block on this.
    console.warn("clearPushTokenOnServer failed:", e?.message || e);
  }
}
