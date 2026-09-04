/**
 * Notification settings.
 *
 * This screen used to hold eight switches over local useState — friendJoined,
 * newOrg, badge1, upcomingEvent and so on. None of them persisted anywhere,
 * and none of them corresponded to a notification the backend has ever sent.
 * A donor could switch everything off and still get every push.
 *
 * These four categories are the ones that exist. They map to
 * NOTIFICATION_CATEGORIES in supabase/functions/api/lib/notifications.ts,
 * which is what the send path actually checks, and they persist to
 * users.preferences.notificationPrefs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import API from '../../lib/api';

const CATEGORIES = [
  {
    key: 'donation',
    label: 'Donation receipts',
    hint: "When your monthly gift reaches the cause you've chosen.",
  },
  {
    key: 'discounts',
    label: 'Discounts you follow',
    hint: "New offers, and warnings before one expires, from places you've favourited.",
  },
  {
    key: 'causes',
    label: 'Your cause',
    hint: 'Updates about the charity you support — approvals and changes.',
  },
  {
    key: 'payment',
    label: 'Payment problems',
    hint: "If a donation doesn't go through and needs your attention.",
  },
];

// Mirrors DEFAULT_NOTIFICATION_PREFS server-side: a donor who has never
// touched this screen receives everything.
const DEFAULTS = { payment: true, donation: true, discounts: true, causes: true };

export default function NotificationSettings() {
  const router = useRouter();

  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await API.getNotificationPreferences();
      if (!cancelled) {
        // A null response means the request failed, not that everything is
        // off — fall back to the defaults rather than showing the donor a
        // screen that claims their notifications are disabled.
        if (prefs) setSettings({ ...DEFAULTS, ...prefs });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (key) => {
      const next = !settings[key];
      // Optimistic, then reconcile: a switch that waits for the network
      // before moving feels broken.
      setSettings((prev) => ({ ...prev, [key]: next }));
      setSaving(true);
      const saved = await API.setNotificationPreferences({ [key]: next });
      setSaving(false);
      if (saved) {
        setSettings((prev) => ({ ...prev, ...saved }));
      } else {
        // Put it back — nothing was stored, so leaving the switch flipped
        // would tell the donor something untrue.
        setSettings((prev) => ({ ...prev, [key]: !next }));
      }
    },
    [settings],
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Image
            source={require('../../../assets/icons/arrow-left.png')}
            style={{ width: 24, height: 24, tintColor: '#324E58' }}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={styles.headerSpacer}>
          {saving && <ActivityIndicator size="small" color="#DB8633" />}
        </View>
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color="#DB8633" />
        </View>
      ) : (
        <>
          {CATEGORIES.map(({ key, label, hint }) => (
            <View key={key} style={styles.settingRow}>
              <View style={styles.labelWrap}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.hint}>{hint}</Text>
              </View>
              <Switch
                trackColor={{ false: '#ccc', true: '#DB8633' }}
                thumbColor="#fff"
                onValueChange={() => toggle(key)}
                value={settings[key] !== false}
              />
            </View>
          ))}

          <Text style={styles.footnote}>
            Switching a category off stops the push. Everything still appears in
            your notification list, so nothing gets lost.
          </Text>
          <Text style={styles.footnote}>
            One exception: if we can't process your card after several tries and
            your giving is paused, we'll always let you know — there's nothing
            you can act on if you never hear about it.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 5,
  },
  backButton: {
    width: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6d6e72',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 32,
    alignItems: 'flex-end',
  },
  centre: {
    paddingTop: 60,
    alignItems: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
  },
  labelWrap: {
    flex: 1,
    paddingRight: 14,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
  },
  hint: {
    fontSize: 13,
    color: '#8a9ba1',
    marginTop: 4,
    lineHeight: 18,
  },
  footnote: {
    fontSize: 12,
    color: '#9aa7ac',
    lineHeight: 18,
    marginTop: 18,
  },
});
