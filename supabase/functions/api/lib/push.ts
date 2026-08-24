// Wrapper around Expo Push API. Used to send transactional notifications to
// donor-app users (donation receipts, payment failures, favorited-vendor
// activity). Soft-fails silently on token/network errors so a missing or
// expired token never blocks the originating request (webhook, etc.).
//
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  /** ExponentPushToken[xxx] string previously registered by the app. */
  to: string | string[];
  title: string;
  body: string;
  /**
   * Arbitrary metadata passed to the app on tap. We use { url } for deep
   * linking — e.g. "thrive://donation-summary" or a full https url.
   */
  data?: Record<string, unknown>;
  /** Optional sound override; default plays the standard sound. */
  sound?: "default" | null;
  /** Optional iOS badge count update. */
  badge?: number;
  /** Optional category for swipe actions (advanced; rarely needed). */
  categoryId?: string;
  /** Optional channel ID for Android (we keep "default" everywhere). */
  channelId?: string;
}

/** Best-effort send. Returns true on 2xx, false otherwise. */
export async function sendPush(message: PushMessage): Promise<boolean> {
  if (!message.to || (Array.isArray(message.to) && message.to.length === 0)) {
    return false;
  }
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...message,
        sound: message.sound === null ? null : (message.sound || "default"),
        channelId: message.channelId || "default",
      }),
    });
    if (!res.ok) {
      console.warn("Expo push non-2xx:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.warn("Expo push failed:", e);
    return false;
  }
}

/**
 * Send the same notification (different recipients) in one Expo Push API call.
 * Expo accepts up to 100 messages per request; we chunk above that.
 */
export async function sendPushBatch(messages: PushMessage[]): Promise<void> {
  if (!messages || messages.length === 0) return;
  const filtered = messages.filter((m) => m.to && (typeof m.to === "string" || m.to.length > 0));
  if (filtered.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const slice = filtered.slice(i, i + CHUNK).map((m) => ({
      ...m,
      sound: m.sound === null ? null : (m.sound || "default"),
      channelId: m.channelId || "default",
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(slice),
      });
      if (!res.ok) {
        console.warn("Expo push batch non-2xx:", res.status, await res.text());
      }
    } catch (e) {
      console.warn("Expo push batch failed:", e);
    }
  }
}

/**
 * Look up a user's stored push token and send them a notification. Returns
 * false silently if the user has no token on file (e.g. they declined the
 * permission prompt).
 */
export async function sendPushToUser(
  supabase: any,
  userId: number,
  message: Omit<PushMessage, "to">,
): Promise<boolean> {
  if (!userId) return false;
  const { data: user } = await supabase
    .from("users")
    .select("expo_push_token")
    .eq("id", userId)
    .maybeSingle();
  const token = user?.expo_push_token;
  if (!token) return false;
  return sendPush({ ...message, to: token });
}

/**
 * Fanout push notification to every donor who favorited this vendor. Used
 * when a vendor adds a new discount or has one expiring soon — the "why
 * did I favorite this" payoff moment for the donor.
 *
 * Silently drops donors without a push token on file. Callers should NOT
 * await this on the request path — fire-and-forget so a slow push doesn't
 * add latency to the vendor's Create Discount save.
 */
export async function sendPushToVendorFavoriters(
  supabase: any,
  vendorId: number,
  message: Omit<PushMessage, "to">,
): Promise<void> {
  if (!vendorId) return;
  const { data: favs } = await supabase
    .from("vendor_favorites")
    .select("user_id")
    .eq("vendor_id", vendorId);
  const userIds = Array.from(
    new Set((favs || []).map((f: any) => f.user_id).filter(Boolean)),
  );
  if (userIds.length === 0) return;

  const { data: users } = await supabase
    .from("users")
    .select("expo_push_token")
    .in("id", userIds);
  const tokens = (users || [])
    .map((u: any) => u.expo_push_token)
    .filter((t: any) => typeof t === "string" && t.length > 0);
  if (tokens.length === 0) return;

  // Expo's push API accepts up to 100 recipients per POST. Chunk to be
  // safe for vendors with a large favoriter base.
  const CHUNK = 90;
  const batches: PushMessage[] = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    batches.push({ ...message, to: tokens.slice(i, i + CHUNK) });
  }
  await sendPushBatch(batches);
}
