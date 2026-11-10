// Following a vendor, in one place.
//
// A favourite lives in two stores and both matter:
//
//   AsyncStorage  instant, survives being signed out, and is what every
//                 screen reads to decide whether the heart is filled.
//   vendor_favorites on the server, which is what the "your vendor added a
//                 discount" fanout and the expiring-discount reminder
//                 actually read. A favourite that never reaches here is
//                 invisible to every notification THRIVE sends.
//
// Writing only the local half is the bug that left `vendor_favorites` empty
// platform-wide once already; see favoritesSync.js, which exists to replay
// the orphans still sitting on donors' phones.
//
// The local write is deliberately not conditional on the server write. A
// donor on a bad connection should still see the heart they just tapped, and
// favoritesSync replays it at the next login.

import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../lib/api';

export const FAVORITES_KEY = '@thrive_favorites';

/** Every locally-known favourite, as a Set of string ids. */
export async function getLocalFavoriteIds() {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    return new Set((raw ? JSON.parse(raw) : []).map(String));
  } catch (error) {
    console.warn('Could not read favourites:', error?.message || error);
    return new Set();
  }
}

export async function isVendorFavorited(vendorId) {
  if (vendorId == null) return false;
  const ids = await getLocalFavoriteIds();
  return ids.has(String(vendorId));
}

/**
 * Follow or unfollow a vendor, in both stores.
 *
 * Safe to call when the vendor is already in the requested state: the server
 * route is PUT insert-if-absent / DELETE, not a toggle, so a repeat is a
 * no-op rather than a silent reversal. Never call the legacy POST toggle for
 * this.
 *
 * @returns {Promise<boolean>} the state now held locally
 */
export async function setVendorFavorited(vendorId, favorited) {
  if (vendorId == null) return false;
  const id = String(vendorId);

  try {
    const ids = await getLocalFavoriteIds();
    if (favorited) ids.add(id);
    else ids.delete(id);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
  } catch (error) {
    console.warn('Could not save favourite locally:', error?.message || error);
  }

  try {
    await API.setVendorFavorite(id, favorited);
  } catch (error) {
    // Left for favoritesSync to replay at the next login.
    console.warn('Favourite not synced to server:', error?.message || error);
  }

  return favorited;
}
