// Replay locally-saved vendor favourites to the server.
//
// Favourites live in two places: AsyncStorage (instant, works signed-out) and
// vendor_favorites on the server (what the "your saved vendor added a
// discount" fanout actually reads). The signup-flow teaser used to write only
// the local copy, so donors who picked favourites during signup had none on
// the server and could never be notified.
//
// Running this at login closes the gap for phones that already hold that
// orphaned local state — without it those favourites stay invisible forever.

import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../lib/api";

const FAVORITES_KEY = "@thrive_favorites";

/**
 * Push any locally-saved favourite the server doesn't know about.
 *
 * Only ever adds. The toggle endpoint flips state, so sending an id the server
 * already has would silently UN-favourite it — hence the difference below
 * rather than a blind replay.
 *
 * @returns {Promise<number>} how many favourites were newly synced
 */
export async function syncFavoritesToServer() {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    const local = new Set((raw ? JSON.parse(raw) : []).map(String));
    if (local.size === 0) return 0;

    const remote = await API.getMyFavoriteVendors();
    // Signed-out donors get { vendors: [] } — indistinguishable from "none
    // saved". Retrying next login is harmless; guessing here is not.
    const known = new Set(
      (remote?.vendors || []).map((v) => String(v.id ?? v.vendor_id)),
    );

    const missing = [...local].filter((id) => !known.has(id));
    for (const id of missing) {
      await API.toggleVendorFavorite(id);
    }
    if (missing.length) {
      console.log(`✅ Synced ${missing.length} local favorite(s) to server`);
    }
    return missing.length;
  } catch (e) {
    // Never block login on this.
    console.warn("syncFavoritesToServer failed:", e?.message || e);
    return 0;
  }
}
