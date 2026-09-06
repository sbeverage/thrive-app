// file: app/index.js
//
// The landing screen. One screen, no swiping.
//
// This used to be a three slide horizontal carousel: GIVE, then SHOP, then
// SAVE, one word and one sentence per slide, each behind a swipe. But THRIVE
// only makes sense as all three at once, and a carousel is the one layout that
// guarantees nobody sees the whole thing. Someone who tapped Sign Up without
// swiping had read exactly one sentence, "Donate monthly to any charity you
// love", which describes a plain donation app and leaves the discounts to
// arrive later as a surprise. That is most of the confusion new users report.
//
// Now the exchange is stated once, in full, above the fold, and the animation
// shows the loop without asking anyone to tap or wait. It also drops three
// looping video downloads from first launch.
import React, { useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resumeSignupFlowPendingIfAny } from './utils/signupFlowResume';
import { StatusBar } from 'expo-status-bar';
import ThriveLoop from './components/ThriveLoop';

const SUPABASE_STORAGE_BASE =
  'https://mdqgndyhzlnwojtubouh.supabase.co/storage/v1/object/public/app-assets';

// Kept together and named so the wording is a one line change. Both rules from
// CLAUDE.md apply here: no long dashes, and warm rather than institutional.
// "Give" leads and "Get" follows on purpose. Lead with the discount and this
// reads like a coupon app that happens to donate, which is backwards.
const HEADLINE_LINE_1 = 'Give to a cause you love.';
const HEADLINE_LINE_2 = 'Get discounts where you already shop.';
const SUBLINE = '$15/month or more, 100% goes to your cause.';

export default function Index() {
  const router = useRouter();

  // Already signed in, or part way through signup: skip the pitch.
  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          const resumed = await resumeSignupFlowPendingIfAny(router, {
            gatePendingEmailAgainstStoredUserData: true,
          });
          if (resumed) return;

          console.log('📱 Auth token found, redirecting from index to home...');
          router.replace('/(tabs)/home');
        }
      } catch (error) {
        console.error('Error checking user status in index:', error);
      }
    };

    checkUserStatus();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {/* Decorative half circles */}
      <Image
        source={{ uri: `${SUPABASE_STORAGE_BASE}/assets/images/half-circle-left.png` }}
        style={styles.leftCircle}
      />
      <Image
        source={{ uri: `${SUPABASE_STORAGE_BASE}/assets/images/half-circle-right.png` }}
        style={styles.rightCircle}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.welcomeText}>Welcome to</Text>
        <Image
          source={{ uri: `${SUPABASE_STORAGE_BASE}/assets/logos/initiative-logo-no-web.png` }}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <Text style={styles.nonprofitText}>501 (c)(3) non profit organization</Text>

        {/* The whole exchange, before anything asks for a tap. */}
        <View style={styles.pitch}>
          <Text style={styles.headline}>{HEADLINE_LINE_1}</Text>
          <Text style={styles.headline}>{HEADLINE_LINE_2}</Text>
          <Text style={styles.subline}>{SUBLINE}</Text>
        </View>

        <ThriveLoop style={styles.loop} />

        <View style={styles.buttonsWrapper}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/signup')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineButton}
            onPress={() => router.push('/login')}
            accessibilityRole="button"
          >
            <Text style={styles.outlineText}>Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  welcomeText: {
    fontSize: 22,
    color: '#6d6e72',
    marginBottom: 5,
    marginTop: 24,
  },
  headerLogo: {
    width: 310,
    maxWidth: '100%',
    height: 30,
    marginBottom: 8,
  },
  nonprofitText: {
    fontSize: 12,
    color: '#6d6e72',
    marginBottom: 28,
    fontWeight: '400',
  },
  pitch: {
    alignItems: 'center',
    marginBottom: 8,
  },
  headline: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '700',
    color: '#2F4E58',
    textAlign: 'center',
  },
  subline: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6d6e72',
    textAlign: 'center',
    marginTop: 10,
  },
  loop: {
    marginTop: 4,
    marginBottom: 8,
  },
  buttonsWrapper: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'center',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#db8633',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 42,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#db8633',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlineText: {
    color: '#db8633',
    fontWeight: '600',
    fontSize: 16,
  },
  leftCircle: {
    position: 'absolute',
    top: 80,
    left: -30,
    width: 100,
    height: 100,
    resizeMode: 'contain',
  },
  rightCircle: {
    position: 'absolute',
    bottom: 140,
    right: -20,
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
});
