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
