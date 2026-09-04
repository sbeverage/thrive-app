// Donor notification centre — the feed, the badge count, and the switches.
//
// Counterpart to routes/adminNotifications.ts, which serves the admin panel
// from admin_notifications. This one serves the app from user_notifications
// and is scoped to the caller's own JWT: a donor can only ever read or mutate
// their own rows.

import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";
import { corsHeaders } from "../lib/cors.ts";
import {
  DEFAULT_NOTIFICATION_PREFS,
  prefsFromUserRow,
  type NotificationCategory,
} from "../lib/notifications.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

export async function handleNotificationsRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // The auth gate in index.ts matches "/" and so lets everything through —
  // every handler verifies for itself. See lib/jwt-app.ts: the user JWT
  // arrives in Authorization, with the anon key in apikey for the gateway.
  const authHeader = getAppAuthHeader(req);
  let userId: number | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (jwtSecret) {
      try {
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign", "verify"],
        );
        const payload = await verifyJWT(token, secretKey);
        userId = payload.id as number;
      } catch {
        // Invalid or expired token — falls through to the 401 below.
      }
    }
  }

  if (!userId) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);

  // ---------------------------------------------------------------- feed
  if (method === "GET" && route === "/notifications") {
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 1),
      100,
    );
    const offset = Math.max(
      parseInt(url.searchParams.get("offset") || "0", 10) || 0,
      0,
    );
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";

    try {
      let query = supabase
        .from("user_notifications")
        .select("id, type, title, body, data, read_at, created_at, push_sent")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (unreadOnly) query = query.is("read_at", null);

      const { data, error } = await query;

      if (error) {
        // PGRST205 = table missing from the schema cache, i.e. the migration
        // has not been applied yet. Report it as an empty feed rather than a
        // failure, so the bell renders instead of the app erroring — and say
        // so plainly in the payload for whoever is debugging.
        if (error.code === "PGRST205") {
          console.warn(
            "⚠️ user_notifications missing — apply 20260904000000_user_notifications.sql",
          );
          return json({
            success: true,
            notifications: [],
            unreadCount: 0,
            warning: "notifications table not yet created",
          });
        }
        console.error("❌ Error fetching notifications:", error);
        return json({ success: false, error: "Failed to fetch notifications" }, 500);
      }

      const { count: unreadCount, error: countError } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);

      if (countError) {
        console.warn("⚠️ Failed to count unread:", countError.message || countError);
      }

      return json({
        success: true,
        notifications: data || [],
        unreadCount: unreadCount ?? 0,
      });
    } catch (error: any) {
      console.error("❌ Notifications GET error:", error);
      return json({ success: false, error: error?.message || "Server error" }, 500);
    }
  }

  // -------------------------------------------------------- unread badge
  // Split out from the feed so the app can poll a count on foreground
  // without pulling rows it isn't going to render.
  if (method === "GET" && route === "/notifications/unread-count") {
    try {
      const { count, error } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);

      if (error) {
        if (error.code === "PGRST205") return json({ success: true, unreadCount: 0 });
        console.error("❌ Unread count error:", error);
        return json({ success: false, error: "Failed to count" }, 500);
      }
      return json({ success: true, unreadCount: count ?? 0 });
    } catch (error: any) {
      return json({ success: false, error: error?.message || "Server error" }, 500);
    }
  }

  // ------------------------------------------------------------ mark read
  if (method === "POST" && route === "/notifications/read") {
    try {
      const body = await req.json().catch(() => ({}));
      const all = body?.all === true;
      const ids = Array.isArray(body?.ids)
        ? body.ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
        : [];

      if (!all && ids.length === 0) {
        return json({ success: false, error: "Provide ids[] or all:true" }, 400);
      }

      // Always constrained by user_id, so an id belonging to someone else
      // matches nothing rather than being marked read.
      let query = supabase
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);

      if (!all) query = query.in("id", ids);

      const { data, error } = await query.select("id");

      if (error) {
        if (error.code === "PGRST205") return json({ success: true, updated: 0 });
        console.error("❌ Mark-read error:", error);
        return json({ success: false, error: "Failed to mark read" }, 500);
      }

      const { count: unreadCount } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);

      return json({
        success: true,
        updated: (data || []).length,
        unreadCount: unreadCount ?? 0,
      });
    } catch (error: any) {
      console.error("❌ Mark-read threw:", error);
      return json({ success: false, error: error?.message || "Server error" }, 500);
    }
  }

  // ---------------------------------------------------------- preferences
  if (method === "GET" && route === "/notifications/preferences") {
    try {
      const { data: user, error } = await supabase
        .from("users")
        .select("preferences")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("❌ Preferences read error:", error);
        return json({ success: false, error: "Failed to load preferences" }, 500);
      }

      return json({ success: true, preferences: prefsFromUserRow(user) });
    } catch (error: any) {
      return json({ success: false, error: error?.message || "Server error" }, 500);
    }
  }

  if (
    (method === "PUT" || method === "POST") &&
    route === "/notifications/preferences"
  ) {
    try {
      const body = await req.json().catch(() => ({}));

      const { data: user, error: readError } = await supabase
        .from("users")
        .select("preferences")
        .eq("id", userId)
        .maybeSingle();

      if (readError) {
        console.error("❌ Preferences read-before-write error:", readError);
        return json({ success: false, error: "Failed to load preferences" }, 500);
      }

      // Merge, don't replace: preferences holds unrelated donor settings
      // (preferredCharity among them) and overwriting the object would drop
      // them.
      const current = prefsFromUserRow(user);
      const next = { ...current };
      let touched = 0;
      for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS) as NotificationCategory[]) {
        if (typeof body?.[key] === "boolean") {
          next[key] = body[key];
          touched += 1;
        }
      }

      if (touched === 0) {
        return json(
          {
            success: false,
            error: `Provide at least one of: ${Object.keys(DEFAULT_NOTIFICATION_PREFS).join(", ")}`,
          },
          400,
        );
      }

      const mergedPreferences = {
        ...(user?.preferences || {}),
        notificationPrefs: next,
      };

      const { error: writeError } = await supabase
        .from("users")
        .update({ preferences: mergedPreferences })
        .eq("id", userId);

      if (writeError) {
        console.error("❌ Preferences write error:", writeError);
        return json({ success: false, error: "Failed to save preferences" }, 500);
      }

      return json({ success: true, preferences: next });
    } catch (error: any) {
      console.error("❌ Preferences write threw:", error);
      return json({ success: false, error: error?.message || "Server error" }, 500);
    }
  }

  return json({ success: false, error: `No route for ${method} ${route}` }, 404);
}
