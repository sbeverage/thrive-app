// The prompt a donor sees on entering the app when something needs them.
//
// Push and email both depend on something outside our control — a recent build
// with a registered token, or someone reading their inbox. This is the channel
// that always lands, because the app asks on launch and shows whatever comes
// back. It is the only reliable way to reach a donor whose cause was rejected
// and whose giving is sitting held while they wait to be asked to choose again.
//
// The alert list, its wording, and its ordering all come from the server
// (GET /api/auth/alerts). This component only decides *whether* to show one and
// remembers dismissals — so copy can change without a release, which matters on
// a project where OTA updates do not work.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import API from '../app/lib/api';

const DISMISS_KEY = '@thrive_alert_dismissed';

/**
 * How long a dismissal lasts.
 *
 * These conditions do not resolve themselves — a rejected cause stays rejected
 * until the donor picks another. Dismissing has to mean "not right now" rather
 * than "never", or a donor taps it away once and their giving sits held
 * indefinitely. A day is long enough not to nag and short enough to matter.
 */
const DISMISS_HOURS = 24;

export default function AccountAlertModal({ enabled }) {
  const router = useRouter();
  const [alert, setAlert] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadDismissals = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DISMISS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const alerts = await API.getAccountAlerts();
      if (cancelled || !alerts.length) return;

      const dismissed = await loadDismissals();
      const cutoff = Date.now() - DISMISS_HOURS * 60 * 60 * 1000;
      // Server order is priority order — take the first one still due.
      const next = alerts.find((a) => {
        const at = dismissed[a.id];
        return !at || at < cutoff;
      });
      if (!cancelled && next) setAlert(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, loadDismissals]);

  const remember = useCallback(
    async (id) => {
      try {
        const dismissed = await loadDismissals();
        dismissed[id] = Date.now();
        await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
      } catch {
        // A failed write only means we ask again sooner. Never block the tap.
      }
    },
    [loadDismissals],
  );

  const onDismiss = useCallback(async () => {
    if (!alert) return;
    setAlert(null);
    await remember(alert.id);
  }, [alert, remember]);

  const onAct = useCallback(async () => {
    if (!alert || busy) return;
    setBusy(true);
    const target = alert.ctaPath;
    // Remembered before navigating: acting on it is at least as strong a
    // signal as dismissing, and re-prompting on the way back would be rude.
    await remember(alert.id);
    setAlert(null);
    setBusy(false);
    if (target) {
      try {
        router.push(target);
      } catch {
        // A bad path must never crash the app on launch.
      }
    }
  }, [alert, busy, remember, router]);

  if (!alert) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{alert.title}</Text>
          <Text style={styles.message}>{alert.message}</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onAct}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{alert.ctaLabel || 'Fix this'}</Text>
            )}
          </TouchableOpacity>

          {alert.dismissible !== false && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onDismiss}>
              <Text style={styles.secondaryText}>Not now</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    padding: 26,
    borderRadius: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#324E58',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 22,
  },
  primaryButton: {
    backgroundColor: '#DB8633',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#9AABB8',
    fontSize: 14,
    fontWeight: '600',
  },
});
