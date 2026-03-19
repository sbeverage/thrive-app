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
const ensureGoogleConfigured = () => {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
    offlineAccess: true,
  });
  googleConfigured = true;
  console.log('📱 Google Sign-In configured with webClientId:', process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ? 'SET' : 'EMPTY');
  console.log('📱 Google Sign-In configured with iosClientId:', process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ? 'SET' : 'EMPTY');
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
  try {
    ensureGoogleConfigured();

    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    const response = await GoogleSignin.signIn();
    console.log('📱 Google signIn response type:', response.type);

    if (response.type === 'cancelled') {
      return null;
    }

    const { data } = response;
    console.log('📱 Google signIn data:', JSON.stringify(data, null, 2));

    if (!data?.idToken) {
      console.warn('⚠️ No idToken from Google, using serverAuthCode flow');
    }

    return {
      provider: 'google',
      id: data.user.id,
      email: data.user.email,
      firstName: data.user.givenName || null,
      lastName: data.user.familyName || null,
      picture: data.user.photo || null,
      idToken: data.idToken || null,
      accessToken: data.serverAuthCode || null,
    };
  } catch (error) {
    const cancelled =
      error.code === 'SIGN_IN_CANCELLED' ||
      error.code === '12501' ||
      error.code === 'SIGN_IN_REQUIRED';

    if (cancelled) {
      return null;
    }

    console.error('Google Sign In error:', error);
    console.error('Google Sign In error code:', error.code);
    console.error('Google Sign In error message:', error.message);
    Alert.alert('Error', `Google Sign In failed: ${error.message || 'Please try again.'}`);
    return null;
  }
};

/**
 * Facebook Sign In
 * Uses react-native-fbsdk-next (native SDK)
 */
export const signInWithFacebook = async () => {
  try {
    LoginManager.logOut();

    const result = await LoginManager.logInWithPermissions(
      ['public_profile', 'email'],
      'limited',
    );

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
  }
};
