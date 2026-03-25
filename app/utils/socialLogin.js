/**
 * Social Login Utilities
 * Uses native SDKs for Apple, Google, and Facebook authentication.
 * No expo-auth-session (browser popup) - all native OS-level popups.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { LoginManager, AccessToken, Profile } from 'react-native-fbsdk-next';
import { Platform, Alert } from 'react-native';

let googleConfigured = false;
let googleSignInInProgress = false;
let facebookSignInInProgress = false;

const ensureGoogleConfigured = () => {
  if (googleConfigured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  if (!webClientId && Platform.OS === 'android') {
    console.warn('⚠️ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set — Google Sign-In will fail on Android.');
  }
  GoogleSignin.configure({
    webClientId,
    iosClientId,
    offlineAccess: true,
  });
  googleConfigured = true;
  console.log('📱 Google Sign-In configured with webClientId:', webClientId ? 'SET' : 'EMPTY');
  console.log('📱 Google Sign-In configured with iosClientId:', iosClientId ? 'SET' : 'EMPTY');
};

/**
 * Apple Sign In (iOS only, iOS 13+)
 * Uses expo-apple-authentication (native SDK)
 */
export const signInWithApple = async () => {
  if (Platform.OS !== 'ios') {
    Alert.alert('Not Available', 'Apple Sign In is only available on iOS devices.');
    return null;
  }

  try {
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Not Available', 'Apple Sign In is not available on this device.');
      return null;
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential) {
      return null;
    }

    return {
      provider: 'apple',
      id: credential.user,
      email: credential.email || null,
      firstName: credential.fullName?.givenName || null,
      lastName: credential.fullName?.familyName || null,
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
    };
  } catch (error) {
    if (error.code === 'ERR_CANCELED') {
      return null;
    }
    console.error('Apple Sign In error:', error);
    Alert.alert('Error', 'Apple Sign In failed. Please try again.');
    return null;
  }
};

/**
 * Google Sign In
 * Uses @react-native-google-signin/google-signin (native SDK)
 */
export const signInWithGoogle = async () => {
  if (googleSignInInProgress) {
    console.log('📱 Google Sign-In already in progress, ignoring duplicate request');
    return null;
  }

  try {
    googleSignInInProgress = true;
    ensureGoogleConfigured();

    if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID && Platform.OS === 'android') {
      Alert.alert(
        'Google Sign-In not configured',
        'Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env (Web client ID from Google Cloud Console) and rebuild the app.'
      );
      return null;
    }

    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    // Sign out first to ensure we get a fresh token (not a cached/expired one)
    try {
      await GoogleSignin.signOut();
    } catch (signOutError) {
      // Ignore sign out errors - user might not be signed in
      console.log('📱 Google signOut (pre-login cleanup):', signOutError.message || 'OK');
    }

    const response = await GoogleSignin.signIn();
    console.log('📱 Google signIn response:', JSON.stringify(response, null, 2));

    if (response.type === 'cancelled') {
      return null;
    }

    let user;
    let idToken = null;
    let serverAuthCode = null;

    if (response.type === 'success' && response.data) {
      const d = response.data;
      user = d.user;
      idToken = d.idToken || null;
      serverAuthCode = d.serverAuthCode || null;
    } else if (response.user) {
      user = response.user;
      idToken = response.idToken || null;
    }

    if (!user?.id) {
      console.error('📱 Google signIn: missing user in response');
      Alert.alert('Error', 'Could not read Google account. Please try again.');
      return null;
    }

    if (!idToken) {
      try {
        const tokens = await GoogleSignin.getTokens();
        idToken = tokens?.idToken || null;
        console.log('📱 Google getTokens idToken:', idToken ? 'present' : 'missing');
      } catch (tokErr) {
        console.warn('⚠️ Google getTokens failed:', tokErr);
      }
    }

    if (!idToken) {
      Alert.alert(
        'Google Sign-In',
        'Could not obtain a secure token from Google. Check Web Client ID in .env and rebuild.'
      );
      return null;
    }

    return {
      provider: 'google',
      id: user.id,
      email: user.email,
      firstName: user.givenName || null,
      lastName: user.familyName || null,
      picture: user.photo || null,
      idToken,
      accessToken: serverAuthCode || null,
    };
  } catch (error) {
    const cancelled =
      error.code === 'SIGN_IN_CANCELLED' ||
      error.code === '12501' ||
      error.code === 'SIGN_IN_REQUIRED' ||
      error.code === 'IN_PROGRESS';

    if (cancelled) {
      return null;
    }

    console.error('Google Sign In error:', error);
    console.error('Google Sign In error code:', error.code);
    console.error('Google Sign In error message:', error.message);
    Alert.alert('Error', `Google Sign In failed: ${error.message || 'Please try again.'}`);
    return null;
  } finally {
    googleSignInInProgress = false;
  }
};

/**
 * Facebook Sign In
 * Uses react-native-fbsdk-next (native SDK)
 */
export const signInWithFacebook = async () => {
  if (facebookSignInInProgress) {
    console.log('📱 Facebook Sign-In already in progress, ignoring duplicate request');
    return null;
  }

  try {
    facebookSignInInProgress = true;
    LoginManager.logOut();

    // 'limited' is iOS-only (Limited Login); Android must use classic permissions
    const result =
      Platform.OS === 'ios'
        ? await LoginManager.logInWithPermissions(['public_profile', 'email'], 'limited')
        : await LoginManager.logInWithPermissions(['public_profile', 'email']);

    if (result.isCancelled) {
      return null;
    }

    const tokenData = await AccessToken.getCurrentAccessToken();
    if (!tokenData) {
      throw new Error('No access token received from Facebook');
    }

    let firstName = null;
    let lastName = null;
    let name = null;
    let picture = null;
    let email = null;

    try {
      const currentProfile = await Profile.getCurrentProfile();
      if (currentProfile) {
        firstName = currentProfile.firstName || null;
        lastName = currentProfile.lastName || null;
        name = currentProfile.name || null;
        picture = currentProfile.imageURL || null;
        email = currentProfile.email || null;
      }
    } catch (profileError) {
      console.warn('Could not fetch Facebook profile, continuing with token only:', profileError);
    }

    if (!email || !firstName) {
      try {
        const userInfoResponse = await fetch(
          `https://graph.facebook.com/v18.0/me?fields=id,name,email,first_name,last_name,picture&access_token=${tokenData.accessToken}`
        );
        const userInfo = await userInfoResponse.json();
        email = email || userInfo.email || null;
        firstName = firstName || userInfo.first_name || null;
        lastName = lastName || userInfo.last_name || null;
        name = name || userInfo.name || null;
        picture = picture || userInfo.picture?.data?.url || null;
      } catch (fetchError) {
        console.warn('Could not fetch Facebook user info via Graph API:', fetchError);
      }
    }

    return {
      provider: 'facebook',
      id: tokenData.userID,
      email,
      firstName,
      lastName,
      name,
      picture,
      accessToken: tokenData.accessToken,
    };
  } catch (error) {
    console.error('Facebook Sign In error:', error);
    Alert.alert('Error', 'Facebook Sign In failed. Please try again.');
    return null;
  } finally {
    facebookSignInInProgress = false;
  }
};
