/**
 * Developer jump menu. Development builds only.
 *
 * Walking the signup flow normally means creating an account, waiting for an
 * email, and verifying it, which is slow when the thing you want to look at
 * is five screens later. This jumps straight to any screen in the flow.
 *
 * It is NOT an auth bypass and it does not touch a single guard. No fake
 * session is created, no token is written, nothing in app/lib/api.js or the
 * 401 handling is altered. It is only router.push calls to screens that
 * already exist.
 *
 * The consequence of that, and it is the honest trade: screens which read
 * public data work perfectly, and screens which need a signed-in donor will
 * not. Each button below says which it is.
 *
 * Gated twice over. The entry point on the landing screen only renders when
 * __DEV__ is true, and this screen refuses to render anything useful when
 * __DEV__ is false, so a deep link into a release build finds nothing.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';

const DESTINATIONS = [
  {
    label: 'Choose a cause (the new picker)',
    hint: 'Help me choose, the piggy animation, three cards, shake the piggy',
    path: '/signupFlow/chooseCause',
    works: 'full',
  },
  {
    label: 'Choose a cause, as a team account',
    hint: 'Same screen, comped path. Should never reach a card form',
    path: '/signupFlow/chooseCause',
    params: { flow: 'team' },
    works: 'full',
  },
  {
    label: 'Browse all causes',
    hint: 'The 52 item list, with the new search and card descriptions',
    path: '/signupFlow/beneficiarySignupCause',
    works: 'full',
  },
  {
    label: 'Explainer',
    hint: 'How your donation makes a difference',
    path: '/signupFlow/explainerDonate',
    works: 'full',
  },
  {
    label: 'Discounts teaser',
    hint: 'Real local discounts. Needs location permission to sort by distance',
    path: '/signupFlow/discountTeaser',
    works: 'mostly',
  },
  {
    label: 'Donation amount',
    hint: 'The slider. Reads your profile, so amounts fall back to defaults',
    path: '/signupFlow/donationAmount',
    works: 'partial',
  },
  {
    label: 'Team account ready',
    hint: 'The end of the comped flow',
    path: '/signupFlow/teamAccountReady',
    params: { flow: 'team' },
    works: 'partial',
  },
];

const BADGE = {
  full: { text: 'works signed out', bg: '#E7F2EE', fg: '#2C6B58' },
  mostly: { text: 'mostly works', bg: '#FBF1E5', fg: '#B96C1F' },
  partial: { text: 'needs a login', bg: '#FAEBE7', fg: '#A8402B' },
};

export default function DevMenu() {
  const router = useRouter();

  if (!__DEV__) {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedText}>Not available.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Jump into the flow</Text>
      <Text style={styles.sub}>
        Development builds only. Skips signup and email verification by going
        straight to a screen. Nothing signs you in, so anything needing a donor
        account is marked below.
      </Text>

      {DESTINATIONS.map((d, i) => {
        const badge = BADGE[d.works];
        return (
          <TouchableOpacity
            key={`${d.path}-${i}`}
            style={styles.row}
            onPress={() => router.push({ pathname: d.path, params: d.params || {} })}
            accessibilityRole="button"
          >
            <View style={styles.rowHead}>
              <Text style={styles.rowLabel}>{d.label}</Text>
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.text}</Text>
              </View>
            </View>
            <Text style={styles.rowHint}>{d.hint}</Text>
            <Text style={styles.rowPath}>{d.path}</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity onPress={() => router.replace('/')} accessibilityRole="button">
        <Text style={styles.back}>Back to the start</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 48 },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  blockedText: { color: '#8a9ba1', fontSize: 15 },

  title: { fontSize: 24, fontWeight: '700', color: '#2F4E58' },
  sub: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6d6e72',
    marginTop: 8,
    marginBottom: 22,
  },

  row: {
    borderWidth: 1,
    borderColor: '#E1EAEC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowLabel: { flex: 1, fontSize: 15.5, fontWeight: '700', color: '#2F4E58', lineHeight: 20 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  rowHint: { fontSize: 13, lineHeight: 18, color: '#6d6e72', marginTop: 5 },
  rowPath: { fontSize: 11, color: '#a8b7bd', marginTop: 6, fontVariant: ['tabular-nums'] },

  back: {
    textAlign: 'center',
    color: '#DB8633',
    fontWeight: '600',
    fontSize: 15,
    paddingVertical: 14,
    marginTop: 6,
  },
});
