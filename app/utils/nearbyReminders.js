// Remind a donor to use their discount while they are still standing in the
// shop.
//
// The whole feature exists for one failure: somebody walks into a partner
// business, pays, and only later remembers the app. Discovery is not the
// problem, recall at the till is.
//
// ---------------------------------------------------------------------------
// How it works, and why it is shaped like this
//
// iOS region monitoring is the only thing that can wake a closed app when
// somebody arrives somewhere. It is cheap (cell and wifi, not continuous GPS)
// but it comes with three hard limits that shape everything below.
//
// 1. THERE IS NO DWELL EVENT ON iOS. Android has one; iOS reports Enter and
//    Exit and nothing else. So "five minutes after arriving" is built by
//    scheduling a local notification five minutes out on Enter and cancelling
//    it on Exit. Somebody walking past a shop leaves well inside five minutes
//    and never hears a thing; somebody who stays gets it. The scheduling
//    survives the app being closed, which is the point.
//
// 2. TWENTY REGIONS PER APP, TOTAL. Not per task, per app. Five clusters
//    today, so there is room, but the nearest-twenty trim below is what stops
//    this breaking silently at vendor 21.
//
// 3. ABOUT A HUNDRED METRES IS THE FLOOR. Partner businesses are closer
//    together than that: THRIVE Coworking, Valor Coffee and Wave Wellness all
//    sit at 44 Milton Ave, with Ceviche 16m away. One circle covers all of
//    them, so a region is a PLACE, not a business, and the notification says
//    which business only when it honestly can.
//
// ---------------------------------------------------------------------------
// What is deliberately not here
//
// No coordinates are ever sent anywhere. iOS hands the task "you entered
// circle 3" and nothing else: there is no track, no history, and nothing
// leaves the phone. The permission sheet says exactly that, and it has to stay
// true.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

/** Registered with TaskManager at module scope; see the bottom of this file. */
export const NEARBY_TASK = 'thrive-nearby-discounts';

const ENABLED_KEY = '@thrive_nearby_enabled';
const CLUSTERS_KEY = '@thrive_nearby_clusters';
const PENDING_KEY = '@thrive_nearby_pending';
const LAST_SENT_KEY = '@thrive_nearby_last_sent';
const MEMBERSHIP_KEY = '@thrive_nearby_membership';
const LOG_KEY = '@thrive_nearby_log';
const ASK_COUNT_KEY = '@thrive_nearby_asks';

/**
 * How many times we will ever raise the sheet unasked.
 *
 * Two. Once after a redemption, once more the next time. iOS gives one real
 * prompt, so the sheet is the only thing we can repeat, and a third attempt
 * at somebody who has twice said no is nagging. After that it lives in
 * Settings, where they can find it if they change their mind.
 */
const MAX_OFFERS = 2;

/**
 * How long somebody stays before we say anything.
 *
 * Five rather than ten. The vendor mix splits: at Valor, Warm Waves or Kale Me
 * Crazy you have paid inside five minutes, so ten arrives after the card is
 * swiped. At Central City Tavern or Fogon and Lions you pay at the end, so ten
 * is if anything early. Five is the compromise, and the log below is what will
 * tell us whether it is the right one, rather than another guess.
 */
export const DWELL_SECONDS = 5 * 60;

/**
 * Two businesses closer than this share one circle. Matched to the geofence
 * radius on purpose: clustering tighter than the circle we can actually draw
 * would invent a precision iOS cannot deliver.
 */
const CLUSTER_RADIUS_M = 120;
const GEOFENCE_RADIUS_M = 120;

/** iOS caps monitored regions per app, not per task. */
const MAX_REGIONS = 20;

/** Nothing between 9pm and 8am. Nobody wants this on the way home. */
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 8;

/** Even a perfectly timed reminder stops being welcome at some point. */
const MAX_PER_WEEK = 3;

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

function metresBetween(a, b) {
  const R = 6371000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function vendorPoint(vendor) {
  const lat = Number(vendor?.address?.latitude ?? vendor?.latitude);
  const lng = Number(vendor?.address?.longitude ?? vendor?.longitude);
  // 0/0 is the Gulf of Guinea, not Georgia. The backend writes it for "unset".
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

/**
 * Group vendors into the circles we can actually monitor.
 *
 * Single-link clustering: everything within CLUSTER_RADIUS_M of anything else
 * in the group joins it. Crude, and correct for this, because the question is
 * only "can one circle cover these", not "where are the natural groups".
 *
 * A vendor with no usable coordinates is dropped rather than placed at 0,0.
 * They simply never trigger a reminder, which is the honest outcome and the
 * reason the backend now geocodes on every write path.
 */
export function clusterVendors(vendors) {
  const points = [];
  for (const vendor of vendors || []) {
    const point = vendorPoint(vendor);
    if (!point) continue;
    points.push({
      id: String(vendor.id),
      name: vendor.name || 'this business',
      ...point,
    });
  }

  const parent = points.map((_, i) => i);
  const find = (x) => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (metresBetween(points[i], points[j]) <= CLUSTER_RADIUS_M) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
  }

  const groups = new Map();
  points.forEach((point, i) => {
    const key = find(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  });

  return [...groups.values()].map((members) => {
    const latitude =
      members.reduce((sum, m) => sum + m.latitude, 0) / members.length;
    const longitude =
      members.reduce((sum, m) => sum + m.longitude, 0) / members.length;
    return {
      // Stable across restarts: the same set of vendors always yields the same
      // id, so re-registering does not orphan a pending notification.
      identifier: `thrive-${members
        .map((m) => m.id)
        .sort()
        .join('-')}`,
      latitude,
      longitude,
      vendors: members.map((m) => ({ id: m.id, name: m.name })),
    };
  });
}

// ---------------------------------------------------------------------------
// Small persistence helpers. All of these are read by the background task, so
// none of them may depend on React, context, or the network.
// ---------------------------------------------------------------------------

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`nearby: could not read ${key}:`, error?.message || error);
    return fallback;
  }
}

async function writeJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`nearby: could not write ${key}:`, error?.message || error);
  }
}

export async function isNearbyEnabled() {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
}

/**
 * Cache whether the donor can actually redeem anything.
 *
 * Checked by the background task, which cannot call the API: the token may be
 * long expired, and a closed app woken for a region event has no time to find
 * out. The app refreshes this whenever the subscription gate resolves.
 *
 * A lapsed donor gets nothing at all. Telling somebody about discounts they
 * are locked out of, while they stand in the shop, is worse than silence.
 */
export async function setMembershipActive(active) {
  try {
    await AsyncStorage.setItem(MEMBERSHIP_KEY, active ? '1' : '0');
  } catch (error) {
    console.warn('nearby: could not cache membership:', error?.message || error);
  }
}

/**
 * Is it worth raising the sheet right now?
 *
 * False once the feature is on, once iOS has stopped allowing the prompt
 * (where the sheet would lead to a dialog that never appears), and once we
 * have asked twice.
 */
export async function shouldOfferNearby() {
  try {
    const status = await getNearbyStatus();
    if (status.enabled || status.backgroundGranted) return false;
    if (!status.canAskBackground) return false;
    const asks = parseInt((await AsyncStorage.getItem(ASK_COUNT_KEY)) || '0', 10);
    return asks < MAX_OFFERS;
  } catch (error) {
    console.warn('nearby: offer check failed:', error?.message || error);
    return false;
  }
}

/**
 * Counted when the sheet is shown, not when it is answered. Somebody who
 * swipes it away has still been asked, and counting only answers would let
 * the same donor be asked forever.
 */
export async function recordNearbyOffer() {
  try {
    const asks = parseInt((await AsyncStorage.getItem(ASK_COUNT_KEY)) || '0', 10);
    await AsyncStorage.setItem(ASK_COUNT_KEY, String(asks + 1));
  } catch (error) {
    console.warn('nearby: could not record offer:', error?.message || error);
  }
}

// ---------------------------------------------------------------------------
// Permission and registration
// ---------------------------------------------------------------------------

/**
 * Does this donor already have everything the feature needs?
 *
 * Reports the pieces separately because they fail differently: a donor who
 * declined Always has to be sent to Settings, whereas one who simply has the
 * toggle off can be asked again here.
 */
export async function getNearbyStatus() {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await Location.getBackgroundPermissionsAsync();
    return {
      enabled: await isNearbyEnabled(),
      foregroundGranted: foreground.status === 'granted',
      backgroundGranted: background.status === 'granted',
      // iOS only lets you ask once. After that the answer is Settings.
      canAskBackground: background.canAskAgain !== false,
    };
  } catch (error) {
    console.warn('nearby: status check failed:', error?.message || error);
    return {
      enabled: false,
      foregroundGranted: false,
      backgroundGranted: false,
      canAskBackground: false,
    };
  }
}

/**
 * Ask for the permissions and turn the feature on.
 *
 * Foreground first, because iOS will not even show the Always prompt until
 * When In Use has been granted. Each step can be declined, and a decline is
 * reported rather than retried: asking twice is how you burn the one prompt
 * iOS allows.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function enableNearbyReminders(vendors) {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      return { ok: false, reason: 'foreground_denied' };
    }

    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== 'granted') {
      return { ok: false, reason: 'background_denied' };
    }

    const notifications = await Notifications.getPermissionsAsync();
    if (!notifications.granted) {
      const asked = await Notifications.requestPermissionsAsync();
      if (!asked.granted) return { ok: false, reason: 'notifications_denied' };
    }

    await AsyncStorage.setItem(ENABLED_KEY, '1');
    await syncGeofences(vendors);
    return { ok: true };
  } catch (error) {
    console.warn('nearby: enable failed:', error?.message || error);
    return { ok: false, reason: 'error' };
  }
}

export async function disableNearbyReminders() {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, '0');
    await stopGeofences();
    await cancelPendingNearbyReminders();
  } catch (error) {
    console.warn('nearby: disable failed:', error?.message || error);
  }
}

export async function stopGeofences() {
  try {
    if (await TaskManager.isTaskRegisteredAsync(NEARBY_TASK)) {
      await Location.stopGeofencingAsync(NEARBY_TASK);
    }
  } catch (error) {
    console.warn('nearby: could not stop geofencing:', error?.message || error);
  }
}

/**
 * Register the circles, newest vendor list wins.
 *
 * startGeofencingAsync replaces the whole set rather than adding to it, so
 * this is safe to call on every launch and after any vendor refresh.
 *
 * The cluster list is written to storage first and deliberately: the
 * background task gets an identifier and has to turn it back into business
 * names with no network and no React.
 */
export async function syncGeofences(vendors) {
  if (!(await isNearbyEnabled())) return { registered: 0 };

  const { backgroundGranted } = await getNearbyStatus();
  if (!backgroundGranted) return { registered: 0 };

  const clusters = clusterVendors(vendors);
  if (clusters.length === 0) {
    await stopGeofences();
    return { registered: 0 };
  }

  // Over the cap, keep the ones nearest the donor. Past twenty vendors this
  // is the difference between the feature working and iOS silently ignoring
  // regions 21 and up.
  let chosen = clusters;
  if (clusters.length > MAX_REGIONS) {
    let here = null;
    try {
      here = await Location.getLastKnownPositionAsync();
    } catch {
      here = null;
    }
    const origin = here?.coords || clusters[0];
    chosen = [...clusters]
      .sort((a, b) => metresBetween(origin, a) - metresBetween(origin, b))
      .slice(0, MAX_REGIONS);
  }

  await writeJson(
    CLUSTERS_KEY,
    Object.fromEntries(chosen.map((c) => [c.identifier, c.vendors])),
  );

  try {
    await Location.startGeofencingAsync(
      NEARBY_TASK,
      chosen.map((c) => ({
        identifier: c.identifier,
        latitude: c.latitude,
        longitude: c.longitude,
        radius: GEOFENCE_RADIUS_M,
        notifyOnEnter: true,
        // Exit is not decoration: it is the only thing that cancels the
        // pending notification for somebody who was just walking past.
        notifyOnExit: true,
      })),
    );
    return { registered: chosen.length };
  } catch (error) {
    console.warn('nearby: could not start geofencing:', error?.message || error);
    return { registered: 0 };
  }
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function shouldSend(identifier, now = new Date()) {
  if ((await AsyncStorage.getItem(MEMBERSHIP_KEY)) !== '1') {
    return { send: false, why: 'no_membership' };
  }

  const hour = now.getHours();
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) {
    return { send: false, why: 'quiet_hours' };
  }

  const lastSent = await readJson(LAST_SENT_KEY, {});
  if (lastSent[identifier] === todayKey(now)) {
    return { send: false, why: 'already_today' };
  }

  const log = await readJson(LOG_KEY, []);
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recent = log.filter((entry) => entry.sentAt > weekAgo);
  if (recent.length >= MAX_PER_WEEK) {
    return { send: false, why: 'weekly_cap' };
  }

  return { send: true };
}

// ---------------------------------------------------------------------------
// The notification
// ---------------------------------------------------------------------------

/**
 * What to say, given who is inside this circle.
 *
 * One business in the circle, or one they follow among several, and we can
 * name it. Otherwise we name the place. Naming the wrong shop is worse than
 * naming none: it reads as the app not knowing where you are.
 */
export function nearbyMessage(vendorsHere, favoriteIds) {
  const followed = vendorsHere.filter((v) => favoriteIds.has(String(v.id)));
  const named =
    vendorsHere.length === 1
      ? vendorsHere[0]
      : followed.length === 1
        ? followed[0]
        : null;

  if (named) {
    return {
      title: `At ${named.name}?`,
      body: 'Show your discount before you pay.',
      path: `/discounts/${named.id}`,
    };
  }

  return {
    title: `${vendorsHere.length} discounts right where you are`,
    body: 'Tap to see what you can use nearby.',
    path: '/discounts',
  };
}

async function scheduleReminder(identifier) {
  const clusters = await readJson(CLUSTERS_KEY, {});
  const vendorsHere = clusters[identifier];
  if (!vendorsHere || vendorsHere.length === 0) return;

  const verdict = await shouldSend(identifier);
  if (!verdict.send) {
    console.log(`nearby: not sending for ${identifier} (${verdict.why})`);
    return;
  }

  let favoriteIds = new Set();
  try {
    const raw = await AsyncStorage.getItem('@thrive_favorites');
    favoriteIds = new Set((raw ? JSON.parse(raw) : []).map(String));
  } catch {
    favoriteIds = new Set();
  }

  const { title, body, path } = nearbyMessage(vendorsHere, favoriteIds);

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { path, type: 'nearby_discount', region: identifier },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: DWELL_SECONDS,
        repeats: false,
      },
    });

    const pending = await readJson(PENDING_KEY, {});
    pending[identifier] = notificationId;
    await writeJson(PENDING_KEY, pending);
  } catch (error) {
    console.warn('nearby: could not schedule:', error?.message || error);
  }
}

async function cancelReminder(identifier) {
  const pending = await readJson(PENDING_KEY, {});
  const notificationId = pending[identifier];
  if (!notificationId) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.warn('nearby: could not cancel:', error?.message || error);
  }
  delete pending[identifier];
  await writeJson(PENDING_KEY, pending);
}

/**
 * Drop every reminder that has not fired yet.
 *
 * Called when the feature is switched off, and after a redemption. That second
 * one matters more than it looks: somebody who walks in and redeems straight
 * away would otherwise be told, five minutes later, to use the discount they
 * are already holding. That single notification would do more damage to trust
 * in this feature than any amount of good timing earns back.
 */
export async function cancelPendingNearbyReminders() {
  const pending = await readJson(PENDING_KEY, {});
  for (const notificationId of Object.values(pending)) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      // Already fired or already gone. Nothing to undo.
    }
  }
  await writeJson(PENDING_KEY, {});
}

/**
 * Record that a reminder was sent, so the dwell timer can be judged rather
 * than argued about.
 *
 * Paired with recordNearbyRedemption below: a reminder followed by a
 * redemption inside an hour is the only evidence that five minutes is the
 * right number. Kept to the last 50 and holds no coordinates.
 */
async function logSent(identifier, vendorsHere) {
  const log = await readJson(LOG_KEY, []);
  log.push({
    region: identifier,
    vendorIds: vendorsHere.map((v) => v.id),
    sentAt: Date.now(),
    redeemedAt: null,
  });
  await writeJson(LOG_KEY, log.slice(-50));

  const lastSent = await readJson(LAST_SENT_KEY, {});
  lastSent[identifier] = todayKey();
  await writeJson(LAST_SENT_KEY, lastSent);
}

/**
 * Mark a redemption against a recent reminder, if there was one.
 *
 * An hour is generous on purpose. Somebody reminded at a restaurant may not
 * pay for another forty minutes, and counting that as a miss would argue for
 * shortening a timer that actually worked.
 */
export async function recordNearbyRedemption(vendorId) {
  try {
    const log = await readJson(LOG_KEY, []);
    const hourAgo = Date.now() - 60 * 60 * 1000;
    let changed = false;
    for (const entry of log) {
      if (
        !entry.redeemedAt &&
        entry.sentAt > hourAgo &&
        entry.vendorIds.includes(String(vendorId))
      ) {
        entry.redeemedAt = Date.now();
        changed = true;
        break;
      }
    }
    if (changed) await writeJson(LOG_KEY, log);
  } catch (error) {
    console.warn('nearby: could not record redemption:', error?.message || error);
  }
}

/** What the dwell timer is actually achieving. */
export async function getNearbyStats() {
  const log = await readJson(LOG_KEY, []);
  const sent = log.length;
  const followed = log.filter((entry) => entry.redeemedAt).length;
  return { sent, followed };
}

// ---------------------------------------------------------------------------
// The background task
//
// Defined at module scope, not inside a component. iOS relaunches the app into
// the background to deliver a region event, and the task has to already exist
// by the time the JS bundle finishes evaluating. app/_layout.js imports this
// file for that reason alone.
// ---------------------------------------------------------------------------

TaskManager.defineTask(NEARBY_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('nearby: geofencing task error:', error.message);
    return;
  }

  const eventType = data?.eventType;
  const identifier = data?.region?.identifier;
  if (!identifier) return;

  try {
    // Note the enum name. The expo-location docs call this
    // `GeofencingEventType`, but the symbol the package actually exports is
    // `LocationGeofencingEventType`. The documented name is undefined at
    // runtime, and reading `.Enter` off it throws in here, where nobody would
    // see it.
    if (eventType === Location.LocationGeofencingEventType.Enter) {
      await scheduleReminder(identifier);
      const clusters = await readJson(CLUSTERS_KEY, {});
      const vendorsHere = clusters[identifier];
      const pending = await readJson(PENDING_KEY, {});
      // Only logged if something was actually scheduled, so a suppressed
      // reminder does not count against the weekly cap.
      if (vendorsHere && pending[identifier]) {
        await logSent(identifier, vendorsHere);
      }
    } else if (eventType === Location.LocationGeofencingEventType.Exit) {
      await cancelReminder(identifier);
    }
  } catch (taskError) {
    console.warn('nearby: task failed:', taskError?.message || taskError);
  }
});
