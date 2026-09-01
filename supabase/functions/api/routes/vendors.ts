// Public vendor routes consumed by the donor mobile app.
// Filters to approved vendors only — pending/rejected vendors never appear
// in the app even though they exist in the database.

import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { corsHeaders } from "../lib/cors.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: jsonHeaders });

async function getUserIdFromJwt(req: Request): Promise<number | null> {
  const header = getAppAuthHeader(req);
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.substring(7);
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const decoded: any = await verifyJWT(token, key);
    return decoded.id ?? decoded.userId ?? null;
  } catch {
    return null;
  }
}

function formatVendor(vendor: any) {
  return {
    id: vendor.id,
    name: vendor.name,
    category: vendor.category,
    description: vendor.description,
    website: vendor.website,
    phone: vendor.phone,
    socialLinks: vendor.social_links || {},
    logoUrl: vendor.logo_url,
    imageUrls: Array.isArray(vendor.image_urls) ? vendor.image_urls : [],
    address: vendor.address || null,
    hours: vendor.hours || null,
    createdAt: vendor.created_at,
    updatedAt: vendor.updated_at,
  };
}

export async function handleVendorRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /vendors (public — approved AND not deactivated)
  //
  // Deactivating a vendor stamps `deactivated_at` but leaves signup_status
  // alone (so it can be restored on reactivation without re-approval).
  // Excluding deactivated_at IS NOT NULL rows here makes the mobile app
  // treat those vendors as removed until they request reactivation.
  if (method === "GET" && route === "/vendors") {
    try {
      // `let` because the fallback below may reassign both.
      let { data: vendors, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("signup_status", "approved")
        .is("deactivated_at", null)
        .order("name", { ascending: true });

      // deactivated_at comes from a migration this project applies by hand, so
      // a deploy that lands ahead of the migration would 500 the whole donor
      // Discounts tab rather than degrade. Retry without the filter in that one
      // case: showing a deactivated vendor is far better than showing none.
      if (error && /deactivated_at/i.test(error.message || "")) {
        console.warn(
          "⚠️ vendors.deactivated_at missing — apply migration 20260728000000. " +
            "Serving without the deactivation filter.",
        );
        const retry = await supabase
          .from("vendors")
          .select("*")
          .eq("signup_status", "approved")
          .order("name", { ascending: true });
        if (!retry.error) {
          vendors = retry.data;
          error = null;
        }
      }

      if (error) {
        console.error("Error fetching vendors:", error);
        return json({ error: "Failed to fetch vendors" }, 500);
      }
      return json({ vendors: (vendors || []).map(formatVendor) });
    } catch (error) {
      console.error("Error fetching vendors:", error);
      return json({ error: "Failed to fetch vendors" }, 500);
    }
  }

  // POST /vendors/:id/view — track a profile view. Public; userId optional.
  const viewMatch = route.match(/^\/vendors\/(\d+)\/view$/);
  if (method === "POST" && viewMatch) {
    const vendorId = parseInt(viewMatch[1], 10);
    const userId = await getUserIdFromJwt(req);
    try {
      // Only stamp a view if the vendor is approved — keeps stats clean.
      const { data: vendor } = await supabase
        .from("vendors")
        .select("id, signup_status")
        .eq("id", vendorId)
        .maybeSingle();
      if (!vendor || vendor.signup_status !== "approved") {
        return json({ ok: true }); // silently ignore — don't leak vendor state
      }
      await supabase.from("vendor_views").insert({
        vendor_id: vendorId,
        viewer_user_id: userId,
      });
      return json({ ok: true });
    } catch (error) {
      console.error("vendor view tracking error:", error);
      return json({ ok: true }); // never let analytics break the UX
    }
  }

  // POST /vendors/:id/favorite — toggle favorite. Requires auth.
  const favMatch = route.match(/^\/vendors\/(\d+)\/favorite$/);
  if (method === "POST" && favMatch) {
    const vendorId = parseInt(favMatch[1], 10);
    const userId = await getUserIdFromJwt(req);
    if (!userId) return json({ error: "Authentication required" }, 401);

    const { data: existing } = await supabase
      .from("vendor_favorites")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await supabase.from("vendor_favorites").delete().eq("id", existing.id);
      return json({ favorited: false });
    }
    const { error } = await supabase
      .from("vendor_favorites")
      .insert({ vendor_id: vendorId, user_id: userId });
    if (error) {
      console.error("favorite insert error:", error);
      return json({ error: "Could not save favorite" }, 500);
    }
    return json({ favorited: true });
  }

  // GET /vendors/me/favorites — list favorites for the current donor.
  if (method === "GET" && route === "/vendors/me/favorites") {
    const userId = await getUserIdFromJwt(req);
    if (!userId) return json({ error: "Authentication required" }, 401);
    const { data, error } = await supabase
      .from("vendor_favorites")
      .select("vendor:vendors!vendor_id(*)")
      .eq("user_id", userId);
    if (error) return json({ error: error.message }, 500);
    const vendors = (data || [])
      .map((row: any) => row.vendor)
      .filter(
        (v: any) =>
          v && v.signup_status === "approved" && !v.deactivated_at,
      )
      .map(formatVendor);
    return json({ vendors });
  }

  // GET /vendors/:id (public — approved AND not deactivated)
  const vendorIdMatch = route.match(/^\/vendors\/(\d+)$/);
  if (method === "GET" && vendorIdMatch) {
    try {
      const vendorId = vendorIdMatch[1];
      let { data: vendor, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", vendorId)
        .eq("signup_status", "approved")
        .is("deactivated_at", null)
        .single();

      // Same guard as the list route: don't 500 the vendor detail screen just
      // because a deploy landed ahead of migration 20260728000000.
      if (error && /deactivated_at/i.test(error.message || "")) {
        console.warn(
          "⚠️ vendors.deactivated_at missing on detail route — apply migration 20260728000000.",
        );
        const retry = await supabase
          .from("vendors")
          .select("*")
          .eq("id", vendorId)
          .eq("signup_status", "approved")
          .single();
        if (!retry.error) {
          vendor = retry.data;
          error = null;
        }
      }

      if (error) {
        if (error.code === "PGRST116") return json({ error: "Vendor not found" }, 404);
        console.error("Error fetching vendor:", error);
        return json({ error: "Failed to fetch vendor" }, 500);
      }
      return json(formatVendor(vendor));
    } catch (error) {
      console.error("Error fetching vendor:", error);
      return json({ error: "Failed to fetch vendor" }, 500);
    }
  }

  return json({ error: "Vendor route not found" }, 404);
}
