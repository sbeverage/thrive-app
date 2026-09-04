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

    // Assert each local favourite directly. This used to diff against the
    // server list and send a toggle for anything missing, which was unsafe in
    // both directions: the toggle could flip a favourite off, and a donor's own
    // tap racing this sync cancelled it out. Setting the state explicitly is
    // idempotent, so re-running it costs nothing and can never undo a tap.
    for (const id of local) {
      await API.setVendorFavorite(id, true);
    }
    if (local.size) {
      console.log(`✅ Asserted ${local.size} local favorite(s) on the server`);
    }
    return local.size;
  } catch (e) {
    // Never block login on this.
    console.warn("syncFavoritesToServer failed:", e?.message || e);
    return 0;
  }
}
