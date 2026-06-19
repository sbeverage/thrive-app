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
  // GET /vendors (public — approved-only)
  if (method === "GET" && route === "/vendors") {
    try {
      const { data: vendors, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("signup_status", "approved")
        .order("name", { ascending: true });

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
      .filter((v: any) => v && v.signup_status === "approved")
      .map(formatVendor);
    return json({ vendors });
  }

  // GET /vendors/:id (public — approved-only)
  const vendorIdMatch = route.match(/^\/vendors\/(\d+)$/);
  if (method === "GET" && vendorIdMatch) {
    try {
      const vendorId = vendorIdMatch[1];
      const { data: vendor, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", vendorId)
        .eq("signup_status", "approved")
        .single();

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
