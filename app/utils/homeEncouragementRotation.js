import AsyncStorage from '@react-native-async-storage/async-storage';
import { HOME_ENCOURAGEMENT_MESSAGES } from '../constants/homeEncouragementMessages';

const STORAGE_KEY = '@thrive_homeEncouragementIndex';

function normalizeIndex(raw) {
  if (raw == null || raw === '') return 0;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 0;
  const len = HOME_ENCOURAGEMENT_MESSAGES.length;
  return ((n % len) + len) % len;
}

/** Message for the current stored index (defaults to first line if unset). */
export async function getHomeEncouragementMessage() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const idx = normalizeIndex(raw);
  return HOME_ENCOURAGEMENT_MESSAGES[idx];
}

/**
 * Advance to the next affirmation (cyclic). Call when the Home tab gains focus
 * so the headline rotates each time the user opens Home.
 */
export async function advanceHomeEncouragement() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const prev = raw == null || raw === '' ? -1 : parseInt(raw, 10);
  const base = Number.isNaN(prev) ? -1 : prev;
  const len = HOME_ENCOURAGEMENT_MESSAGES.length;
  const next = (base + 1) % len;
  await AsyncStorage.setItem(STORAGE_KEY, String(next));
}
