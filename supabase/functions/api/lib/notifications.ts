// Donor notifications — record first, deliver second.
//
// Before this, a push WAS the notification. Nothing was written down, so a
// donor with no registered token, or who denied notifications, or who swiped
// the banner away, had no way to learn the event ever happened. Worse, the
// only signal a caller got back was a boolean that conflated "Expo took it"
// with "the donor has a token at all" — which is how a payment-failure notice
// got reported as sent when it never left the building.
//
// So every donor-facing notification goes through here. The row lands in
// user_notifications whether or not the push succeeds, and what happened to
// the push is recorded on the row rather than inferred.

import { sendPushWithTicket, sendPushBatch, type PushMessage } from "./push.ts";

/**
 * Notification categories the donor can switch off, and the types each one
 * covers. The old settings screen offered friendJoined / newOrg / badge1 /
 * upcomingEvent — none of which the backend has ever sent. These are the
 * types that actually exist.
 */
export const NOTIFICATION_CATEGORIES = {
  payment: ["payment_failed", "payment_paused"],
  donation: ["donation_success"],
  discounts: ["favorite_new_discount", "favorite_expiring_discount"],
  causes: ["charity_approved", "charity_rejected", "charity_reassigned"],
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

/** Default-on: a donor who has never opened the settings screen gets everything. */
export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationCategory, boolean> = {
  payment: true,
  donation: true,
  discounts: true,
  causes: true,
};

export function categoryForType(type: string): NotificationCategory | null {
  for (const [cat, types] of Object.entries(NOTIFICATION_CATEGORIES)) {
    if ((types as readonly string[]).includes(type)) {
      return cat as NotificationCategory;
    }
  }
  return null;
}

/**
 * Read a donor's switches out of users.preferences.
 *
 * Stored in the existing preferences JSONB rather than new columns — that is
 * where every other donor-level setting already lives.
 */
export function prefsFromUserRow(user: any): Record<NotificationCategory, boolean> {
  const stored = user?.preferences?.notificationPrefs;
  if (!stored || typeof stored !== "object") {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of Object.keys(out) as NotificationCategory[]) {
    if (typeof stored[key] === "boolean") out[key] = stored[key];
  }
  return out;
}

export type NotificationInput = {
  type: string;
  title: string;
  body: string;
  /** Push data payload. `path` is what the app deep-links to on tap. */
  data?: Record<string, unknown>;
  /**
   * Idempotency key, scoped per user. Supply one wherever the caller can fire
   * twice for the same real-world event — a redelivered Stripe webhook, a
   * vendor re-saving a discount. Omit for genuinely one-off notices.
   */
  dedupeKey?: string;
  /**
   * Skip the preference check. For notices a donor cannot opt out of because
   * they require action — a final payment failure that pauses their giving.
   */
  ignorePrefs?: boolean;
};

export type NotifyResult = {
  recorded: boolean;
  /** True only when Expo accepted the message for a real token. */
  pushSent: boolean;
  /** Why the push did not go out — no token, muted category, Expo error. */
  reason?: string;
  notificationId?: number;
  duplicate?: boolean;
};

/**
 * Record a notification for one donor and try to push it.
 *
 * The row is written even when the push cannot be sent, because the feed is
 * the durable copy. Returns what actually happened rather than throwing: no
 * caller of this should be able to fail a webhook or a save because a
 * notification did not land.
 */
export async function notifyUser(
  supabase: any,
  userId: number,
  input: NotificationInput,
): Promise<NotifyResult> {
  if (!userId) return { recorded: false, pushSent: false, reason: "no user id" };

  const { data: user } = await supabase
    .from("users")
    .select("expo_push_token, preferences")
    .eq("id", userId)
    .maybeSingle();

  const category = categoryForType(input.type);
  const prefs = prefsFromUserRow(user);
  const muted = !input.ignorePrefs && category !== null && prefs[category] === false;

  const row: Record<string, unknown> = {
    user_id: userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data || {},
  };
  if (input.dedupeKey) row.dedupe_key = input.dedupeKey;

  let notificationId: number | undefined;
  try {
    const { data: inserted, error } = await supabase
      .from("user_notifications")
      .insert([row])
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation on user_notifications_dedupe_uidx. The event
      // has already been recorded, so this is a redelivery, not a failure —
      // and the push must NOT go out a second time.
      if (error.code === "23505") {
        console.log(
          `🔁 Notification ${input.type} for user ${userId} already recorded (dedupe_key=${input.dedupeKey}) — skipping.`,
        );
        return {
          recorded: true,
          pushSent: false,
          duplicate: true,
          reason: "already recorded",
        };
      }
      console.warn("⚠️ Could not record notification:", error.message || error);
    } else {
      notificationId = inserted?.id;
    }
  } catch (e: any) {
    console.warn("⚠️ Notification insert threw:", e?.message || e);
  }

  const recorded = notificationId !== undefined;

  if (muted) {
    return {
      recorded,
      pushSent: false,
      notificationId,
      reason: `donor muted ${category} notifications`,
    };
  }

  const token = user?.expo_push_token;
  if (!token) {
    // Not an error. The feed row above is precisely so this case is no longer
    // silent — the donor sees it next time they open the app.
    await markPush(supabase, notificationId, false, "no push token registered");
    return {
      recorded,
      pushSent: false,
      notificationId,
      reason: "no push token registered",
    };
  }

  const ticket = await sendPushWithTicket({
    to: token,
    title: input.title,
    body: input.body,
    data: input.data || {},
  });

  const reason = ticket.accepted
    ? undefined
    : ticket.error || ticket.message || `expo status ${ticket.status ?? "unknown"}`;

  await markPush(supabase, notificationId, ticket.accepted, reason);

  if (!ticket.accepted) {
    console.warn(
      `⚠️ Push for ${input.type} to user ${userId} not delivered: ${reason}`,
    );
  }

  return { recorded, pushSent: ticket.accepted, notificationId, reason };
}

async function markPush(
  supabase: any,
  notificationId: number | undefined,
  sent: boolean,
  error?: string,
): Promise<void> {
  if (notificationId === undefined) return;
  try {
    await supabase
      .from("user_notifications")
      .update({ push_sent: sent, push_error: error ?? null })
      .eq("id", notificationId);
  } catch (e: any) {
    console.warn("⚠️ Could not stamp push result:", e?.message || e);
  }
}

/**
 * Fan out one notification to many donors.
 *
 * Each donor gets their own row, so the feed works per person, and the pushes
 * go out batched. The previous fanout selected tokens only and threw the
 * user_id away, which meant there was no way to write a per-donor record at
 * all — that is the reason this exists rather than a loop over notifyUser
 * (which would be one insert and one HTTP round trip per favoriter).
 */
export async function notifyUsers(
  supabase: any,
  userIds: number[],
  input: NotificationInput,
): Promise<{ recorded: number; pushed: number; skipped: number }> {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (ids.length === 0) return { recorded: 0, pushed: 0, skipped: 0 };

  const { data: users } = await supabase
    .from("users")
    .select("id, expo_push_token, preferences")
    .in("id", ids);

  const category = categoryForType(input.type);
  const eligible = (users || []).filter((u: any) => {
    if (input.ignorePrefs || category === null) return true;
    return prefsFromUserRow(u)[category] !== false;
  });

  if (eligible.length === 0) {
    return { recorded: 0, pushed: 0, skipped: ids.length };
  }

  const rows = eligible.map((u: any) => {
    const row: Record<string, unknown> = {
      user_id: u.id,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data || {},
      // Tokens are stamped below; assume not sent until Expo says otherwise.
      push_sent: false,
    };
    // Per-user key so one donor's duplicate can't block another's insert.
    if (input.dedupeKey) row.dedupe_key = input.dedupeKey;
    return row;
  });

  // onConflict + ignoreDuplicates so a re-fired fanout inserts only the
  // donors who don't already have this notification, instead of the whole
  // batch failing on the first collision. The returned rows tell us which
  // donors were actually fresh — and those are the only ones to push to,
  // since anyone already holding this notification has already been told.
  let inserted: Array<{ id: number; user_id: number }> = [];
  try {
    const table = supabase.from("user_notifications");
    const { data, error } = input.dedupeKey
      ? await table
          .upsert(rows, {
            onConflict: "user_id,dedupe_key",
            ignoreDuplicates: true,
          })
          .select("id, user_id")
      : await table.insert(rows).select("id, user_id");

    if (error) {
      console.warn("⚠️ Could not record fanout notifications:", error.message || error);
    } else {
      inserted = data || [];
    }
  } catch (e: any) {
    console.warn("⚠️ Fanout insert threw:", e?.message || e);
  }

  const insertedIds = inserted.map((r) => r.id);
  const freshUserIds = new Set(inserted.map((r) => r.user_id));
  const pushTargets = eligible.filter((u: any) => freshUserIds.has(u.id));

  const tokens = pushTargets
    .map((u: any) => u.expo_push_token)
    .filter((t: any) => typeof t === "string" && t.length > 0);

  if (tokens.length === 0) {
    return {
      recorded: insertedIds.length,
      pushed: 0,
      skipped: ids.length - insertedIds.length,
    };
  }

  // Expo accepts up to 100 recipients per POST.
  const CHUNK = 90;
  const batches: PushMessage[] = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    batches.push({
      to: tokens.slice(i, i + CHUNK),
      title: input.title,
      body: input.body,
      data: input.data || {},
    });
  }
  await sendPushBatch(batches);

  // sendPushBatch reports nothing per-message, so this records "handed to
  // Expo" rather than "accepted". Single-recipient notifyUser is the path
  // that captures a real per-message verdict.
  if (insertedIds.length > 0) {
    try {
      await supabase
        .from("user_notifications")
        .update({ push_sent: true })
        .in("id", insertedIds);
    } catch (e: any) {
      console.warn("⚠️ Could not stamp fanout push results:", e?.message || e);
    }
  }

  return {
    recorded: insertedIds.length,
    pushed: tokens.length,
    skipped: ids.length - insertedIds.length,
  };
}

/**
 * Every donor who favorited a vendor. Kept here rather than in push.ts
 * because the notification centre needs the ids, not just the tokens.
 */
export async function favoriterUserIds(
  supabase: any,
  vendorId: number,
): Promise<number[]> {
  if (!vendorId) return [];
  const { data: favs } = await supabase
    .from("vendor_favorites")
    .select("user_id")
    .eq("vendor_id", vendorId);
  return Array.from(
    new Set((favs || []).map((f: any) => f.user_id).filter(Boolean)),
  ) as number[];
}
