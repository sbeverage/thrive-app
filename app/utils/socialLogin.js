/**
 * Social Login Utilities
 * Handles Apple, Google, and Facebook authentication
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform, Alert } from 'react-native';

/**
 * Apple Sign In
 * Only works on iOS devices (iOS 13+)
 */
export const signInWithApple = async () => {
  if (Platform.OS !== 'ios') {
    Alert.alert('Not Available', 'Apple Sign In is only available on iOS devices.');
    return null;
  }

  try {
    // Check if Apple Authentication is available
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Not Available', 'Apple Sign In is not available on this device.');
      return null;
    }

    // Request Apple ID credential
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential) {
      return null;
    }

    // Return user info
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
      // User canceled, don't show error
      return null;
    }
    console.error('Apple Sign In error:', error);
    Alert.alert('Error', 'Apple Sign In failed. Please try again.');
    return null;
  }
};

/**
 * Google Sign In using OAuth
 */
export const signInWithGoogle = async () => {
  try {
    // Generate a random state for security
    const state = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      Math.random().toString()
    );

    // Create OAuth request
    const request = new AuthSession.AuthRequest({
      clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.Code,
      redirectUri: AuthSession.makeRedirectUri({
        scheme: 'thriveapp',
        path: 'oauth/google',
      }),
      state,
      usePKCE: true,
    });

    // Get discovery document
    const discovery = {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
    };

    // Start authentication
    const result = await request.promptAsync(discovery);

    if (result.type === 'success') {
      // Exchange code for token
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
          code: result.params.code,
          redirectUri: AuthSession.makeRedirectUri({
            scheme: 'thriveapp',
            path: 'oauth/google',
          }),
          extraParams: {},
        },
        discovery
      );

      // Get user info from Google
      const userInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenResponse.accessToken}`
      );
      const userInfo = await userInfoResponse.json();

      return {
        provider: 'google',
        id: userInfo.id,
        email: userInfo.email,
        firstName: userInfo.given_name || null,
        lastName: userInfo.family_name || null,
        picture: userInfo.picture || null,
        accessToken: tokenResponse.accessToken,
        idToken: tokenResponse.idToken,
      };
    } else if (result.type === 'cancel') {
      return null;
    } else {
      throw new Error(result.error?.message || 'Google Sign In failed');
    }
  } catch (error) {
    console.error('Google Sign In error:', error);
    Alert.alert('Error', 'Google Sign In failed. Please try again.');
    return null;
  }
};

/**
 * Facebook Sign In using OAuth
 */
export const signInWithFacebook = async () => {
  try {
    // Generate a random state for security
    const state = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      Math.random().toString()
    );

    // Create OAuth request
    const request = new AuthSession.AuthRequest({
      clientId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || '',
      scopes: ['public_profile', 'email'],
      responseType: AuthSession.ResponseType.Token,
      redirectUri: AuthSession.makeRedirectUri({
        scheme: 'thriveapp',
        path: 'oauth/facebook',
      }),
      state,
    });

    // Facebook OAuth endpoints
    const discovery = {
      authorizationEndpoint: 'https://www.facebook.com/v18.0/dialog/oauth',
      tokenEndpoint: 'https://graph.facebook.com/v18.0/oauth/access_token',
    };

    // Start authentication
    const result = await request.promptAsync(discovery);

    if (result.type === 'success' && result.params.access_token) {
      // Get user info from Facebook
      const userInfoResponse = await fetch(
        `https://graph.facebook.com/v18.0/me?fields=id,name,email,first_name,last_name,picture&access_token=${result.params.access_token}`
      );
      const userInfo = await userInfoResponse.json();

      return {
        provider: 'facebook',
        id: userInfo.id,
        email: userInfo.email || null,
        firstName: userInfo.first_name || null,
        lastName: userInfo.last_name || null,
        name: userInfo.name || null,
        picture: userInfo.picture?.data?.url || null,
        accessToken: result.params.access_token,
      };
    } else if (result.type === 'cancel') {
      return null;
    } else {
      throw new Error(result.error?.message || 'Facebook Sign In failed');
    }
  } catch (error) {
    console.error('Facebook Sign In error:', error);
    Alert.alert('Error', 'Facebook Sign In failed. Please try again.');
    return null;
  }
};

