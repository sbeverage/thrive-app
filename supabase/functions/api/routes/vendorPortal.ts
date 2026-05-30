// Vendor Portal — authenticated, vendor-scoped endpoints.
//
// All routes here require the caller to be signed in (custom-JWT). The caller's
// vendor row is looked up by `vendors.auth_user_id = jwt.id`, and every
// downstream query (discounts, stats) is scoped to that vendor — so vendors
// can only ever see/edit their own data.
//
// Routes:
//   POST   /vendor/signup                          create vendor row for current user
//   GET    /vendor/me                              read current vendor profile
//   PUT    /vendor/me                              update current vendor profile
//   POST   /vendor/me/resubmit                     stamp submitted_at → status=pending
//   GET    /vendor/me/discounts                    list discounts for current vendor
//   POST   /vendor/me/discounts                    create discount
//   PUT    /vendor/me/discounts/:id                update discount
//   DELETE /vendor/me/discounts/:id                delete discount
//   POST   /vendor/me/discounts/:id/rotate-code    rotate the discount code (history)
//   GET    /vendor/me/stats                        aggregated stats dashboard

import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { corsHeaders } from "../lib/cors.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";
import { sendVendorEmail } from "../lib/email.ts";

type JSONResponse = Response;

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function json(body: unknown, status = 200): JSONResponse {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

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

async function loadVendorForUser(supabase: any, userId: number) {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ============================================================================
// POST /vendor/signup
// Creates the vendor row owned by the current user. Idempotent — if a row
// already exists for this user, returns it unchanged (so re-running the
// signup wizard is safe).
// ============================================================================

async function handleVendorSignup(req: Request, supabase: any, userId: number): Promise<JSONResponse> {
  const existing = await loadVendorForUser(supabase, userId);
  if (existing) {
    // Already has a row — let the client update it via PUT /vendor/me.
    return json({ vendor: existing }, 200);
  }

  const body = await req.json().catch(() => ({}));
  const insertPayload = {
    name: body.name || "",
    category: body.category ?? null,
    description: body.description ?? null,
    logo_url: body.logo_url ?? null,
    website: body.website ?? null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    social_links: body.social_links ?? null,
    address: body.address ?? null,
    hours: body.hours ?? null,
    auth_user_id: userId,
    created_by_user_id: userId,
    signup_status: "pending",
  };

  const { data: vendor, error } = await supabase
    .from("vendors")
    .insert(insertPayload)
    .select("*")
    .single();
  if (error) {
    console.error("vendor/signup insert error:", error);
    return json({ error: error.message || "Could not create vendor" }, 500);
  }
  return json({ vendor }, 201);
}

// ============================================================================
// GET / PUT /vendor/me
// ============================================================================

async function handleVendorMeGet(supabase: any, userId: number): Promise<JSONResponse> {
  const vendor = await loadVendorForUser(supabase, userId);
  if (!vendor) return json({ error: "Vendor profile not found" }, 404);
  return json({ vendor });
}

async function handleVendorMePut(req: Request, supabase: any, userId: number): Promise<JSONResponse> {
  const existing = await loadVendorForUser(supabase, userId);
  if (!existing) return json({ error: "Vendor profile not found" }, 404);

  const body = await req.json().catch(() => ({}));
  // Whitelist — never let a vendor flip their own status or audit columns.
  const updates: Record<string, unknown> = {};
  const editable = [
    "name", "category", "description", "logo_url", "website", "phone", "email",
    "social_links", "address", "hours",
  ];
  for (const key of editable) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) return json({ vendor: existing });

  // Editing a rejected profile flips it back to pending implicitly — the
  // explicit resubmit endpoint stamps submitted_at to surface it to admins.
  if (existing.signup_status === "rejected") {
    updates["signup_status"] = "pending";
    updates["rejection_reason"] = null;
  }

  const { data: vendor, error } = await supabase
    .from("vendors")
    .update(updates)
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error) {
    console.error("vendor/me update error:", error);
    return json({ error: error.message || "Could not update vendor" }, 500);
  }
  return json({ vendor });
}

// ============================================================================
// POST /vendor/me/resubmit
// Stamps submitted_at and sets status to pending. Used both for first-time
// submission and for re-submission after a rejection edit.
// ============================================================================

async function handleVendorResubmit(supabase: any, userId: number): Promise<JSONResponse> {
  const existing = await loadVendorForUser(supabase, userId);
  if (!existing) return json({ error: "Vendor profile not found" }, 404);
  if (existing.signup_status === "approved") {
    return json({ error: "Already approved — no need to resubmit" }, 400);
  }
  const { data: vendor, error } = await supabase
    .from("vendors")
    .update({
      signup_status: "pending",
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error) {
    console.error("vendor/resubmit error:", error);
    return json({ error: error.message || "Could not submit" }, 500);
  }

  // Confirmation email — fire-and-forget so a failing email never blocks submit.
  const { data: owner } = await supabase
    .from("users")
    .select("email, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  if (owner?.email) {
    sendVendorEmail({
      to: owner.email,
      name: [owner.first_name, owner.last_name].filter(Boolean).join(" "),
      businessName: vendor.name,
      kind: "submitted",
    }).catch((e) => console.error("submitted email failed:", e));
  }

  return json({ vendor });
}

// ============================================================================
// Discounts: list / create / update / delete / rotate-code
// ============================================================================

async function handleDiscountList(supabase: any, vendorId: number): Promise<JSONResponse> {
  const { data: discounts, error } = await supabase
    .from("discounts")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);
  return json({ discounts: discounts ?? [] });
}

async function handleDiscountCreate(req: Request, supabase: any, vendorId: number): Promise<JSONResponse> {
  const body = await req.json().catch(() => ({}));
  const allowed: Record<string, unknown> = {
    vendor_id: vendorId,
    title: body.title,
    description: body.description ?? null,
    discount_code: body.discount_code ?? null,
    discount_type: body.discount_type ?? "percentage",
    discount_value: body.discount_value ?? null,
    discount_percentage: body.discount_percentage ?? null,
    discount_amount: body.discount_amount ?? null,
    max_discount: body.max_discount ?? null,
    category: body.category ?? null,
    tags: body.tags ?? null,
    image_url: body.image_url ?? null,
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    terms: body.terms ?? null,
    is_active: body.is_active ?? true,
    usage_limit: body.usage_limit ?? "unlimited",
  };
  if (!allowed.title) return json({ error: "title is required" }, 400);

  const { data: discount, error } = await supabase
    .from("discounts")
    .insert(allowed)
    .select("*")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ discount }, 201);
}

async function handleDiscountUpdate(
  req: Request, supabase: any, vendorId: number, discountId: number,
): Promise<JSONResponse> {
  // Verify ownership first — otherwise a vendor could update someone else's
  // discount by guessing IDs.
  const { data: existing, error: lookupError } = await supabase
    .from("discounts")
    .select("id, vendor_id")
    .eq("id", discountId)
    .maybeSingle();
  if (lookupError) return json({ error: lookupError.message }, 500);
  if (!existing) return json({ error: "Discount not found" }, 404);
  if (existing.vendor_id !== vendorId) return json({ error: "Not your discount" }, 403);

  const body = await req.json().catch(() => ({}));
  const editable = [
    "title", "description", "discount_code", "discount_type", "discount_value",
    "discount_percentage", "discount_amount", "max_discount", "category",
    "tags", "image_url", "start_date", "end_date", "terms", "is_active",
    "usage_limit",
  ];
  const updates: Record<string, unknown> = {};
  for (const k of editable) if (k in body) updates[k] = body[k];

  const { data: discount, error } = await supabase
    .from("discounts")
    .update(updates)
    .eq("id", discountId)
    .select("*")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ discount });
}

async function handleDiscountDelete(
  supabase: any, vendorId: number, discountId: number,
): Promise<JSONResponse> {
  const { data: existing } = await supabase
    .from("discounts")
    .select("id, vendor_id")
    .eq("id", discountId)
    .maybeSingle();
  if (!existing) return json({ error: "Discount not found" }, 404);
  if (existing.vendor_id !== vendorId) return json({ error: "Not your discount" }, 403);

  const { error } = await supabase.from("discounts").delete().eq("id", discountId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

async function handleDiscountRotateCode(
  req: Request, supabase: any, userId: number, vendorId: number, discountId: number,
): Promise<JSONResponse> {
  const body = await req.json().catch(() => ({}));
  const newCode = (body.code || "").toString().trim().toUpperCase();
  if (newCode.length < 3 || newCode.length > 20) {
    return json({ error: "Code must be 3-20 characters" }, 400);
  }

  const { data: existing, error: lookupError } = await supabase
    .from("discounts")
    .select("id, vendor_id, discount_code")
    .eq("id", discountId)
    .maybeSingle();
  if (lookupError) return json({ error: lookupError.message }, 500);
  if (!existing) return json({ error: "Discount not found" }, 404);
  if (existing.vendor_id !== vendorId) return json({ error: "Not your discount" }, 403);

  // Record the rotation BEFORE flipping the code so we never lose history.
  await supabase.from("discount_code_history").insert({
    discount_id: discountId,
    old_code: existing.discount_code,
    new_code: newCode,
    rotated_by_user_id: userId,
  });

  const { data: discount, error } = await supabase
    .from("discounts")
    .update({ discount_code: newCode })
    .eq("id", discountId)
    .select("*")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ discount });
}

// ============================================================================
// GET /vendor/me/stats
// Pull aggregates across redemptions, vendor_views, vendor_favorites.
// ============================================================================

async function handleVendorStats(supabase: any, vendorId: number): Promise<JSONResponse> {
  // Vendor's discounts (id + title + value for savings math)
  const { data: discounts } = await supabase
    .from("discounts")
    .select("id, title, discount_type, discount_value, discount_percentage, discount_amount")
    .eq("vendor_id", vendorId);

  const discountIds = (discounts || []).map((d: any) => d.id);

  // Redemptions for this vendor's discounts (joined to discounts for the title)
  let redemptions: any[] = [];
  if (discountIds.length > 0) {
    const { data: r } = await supabase
      .from("redemptions")
      .select("id, discount_id, user_id, redeemed_at")
      .in("discount_id", discountIds);
    redemptions = r || [];
  }

  // Per-discount counts for "top discounts"
  const perDiscount = new Map<number, number>();
  for (const r of redemptions) {
    perDiscount.set(r.discount_id, (perDiscount.get(r.discount_id) || 0) + 1);
  }
  const topDiscounts = (discounts || [])
    .map((d: any) => ({ id: d.id, title: d.title, redemptions: perDiscount.get(d.id) || 0 }))
    .sort((a: any, b: any) => b.redemptions - a.redemptions)
    .slice(0, 5);

  // Rough estimated savings: percentage discounts assume $20 avg ticket,
  // fixed discounts use the dollar amount directly. We'll refine once bills
  // are captured in redemptions.
  let estimatedSavings = 0;
  for (const d of discounts || []) {
    const n = perDiscount.get(d.id) || 0;
    if (d.discount_type === "percentage") {
      const pct = Number(d.discount_percentage ?? d.discount_value ?? 0);
      estimatedSavings += n * (pct / 100) * 20;
    } else if (d.discount_type === "fixed") {
      estimatedSavings += n * Number(d.discount_amount ?? d.discount_value ?? 0);
    }
  }

  // Views: total + last 30 days
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: viewsTotal } = await supabase
    .from("vendor_views")
    .select("*", { count: "exact", head: true })
    .eq("vendor_id", vendorId);
  const { count: views30 } = await supabase
    .from("vendor_views")
    .select("*", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .gte("viewed_at", since30);

  // Favorites
  const { count: favorites } = await supabase
    .from("vendor_favorites")
    .select("*", { count: "exact", head: true })
    .eq("vendor_id", vendorId);

  // Geographic — donor city/state from users joined via redemptions
  const userIds = Array.from(new Set(redemptions.map((r) => r.user_id).filter(Boolean)));
  let geoBuckets: Record<string, { city: string; state: string; redemptions: number }> = {};
  if (userIds.length > 0) {
    const { data: donors } = await supabase
      .from("users")
      .select("id, city, state")
      .in("id", userIds);
    const cityByUser = new Map<number, { city: string; state: string }>();
    for (const d of donors || []) {
      cityByUser.set(d.id, { city: d.city || "", state: d.state || "" });
    }
    for (const r of redemptions) {
      const c = cityByUser.get(r.user_id) || { city: "", state: "" };
      if (!c.city && !c.state) continue;
      const key = `${c.city}::${c.state}`;
      if (!geoBuckets[key]) geoBuckets[key] = { city: c.city, state: c.state, redemptions: 0 };
      geoBuckets[key].redemptions++;
    }
  }
  const geographic = Object.values(geoBuckets)
    .sort((a, b) => b.redemptions - a.redemptions)
    .slice(0, 10);

  return json({
    stats: {
      redemptions: { count: redemptions.length, estimated_savings: Math.round(estimatedSavings * 100) / 100 },
      views: { total: viewsTotal || 0, last_30_days: views30 || 0 },
      favorites: favorites || 0,
      top_discounts: topDiscounts,
      geographic,
    },
  });
}

// ============================================================================
// Router entry point — called from index.ts for any /vendor/* route.
// ============================================================================

export async function handleVendorPortalRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
): Promise<JSONResponse> {
  const userId = await getUserIdFromJwt(req);
  if (!userId) return json({ error: "Authentication required" }, 401);

  // /vendor/signup
  if (method === "POST" && route === "/vendor/signup") {
    return handleVendorSignup(req, supabase, userId);
  }

  // /vendor/me family — load the vendor once, route methods below.
  const vendor = await loadVendorForUser(supabase, userId);

  if (route === "/vendor/me") {
    if (method === "GET") {
      if (!vendor) return json({ error: "Vendor profile not found" }, 404);
      return json({ vendor });
    }
    if (method === "PUT") return handleVendorMePut(req, supabase, userId);
  }

  if (method === "POST" && route === "/vendor/me/resubmit") {
    return handleVendorResubmit(supabase, userId);
  }

  if (!vendor) return json({ error: "Vendor profile not found" }, 404);

  if (route === "/vendor/me/discounts") {
    if (method === "GET") return handleDiscountList(supabase, vendor.id);
    if (method === "POST") return handleDiscountCreate(req, supabase, vendor.id);
  }

  const discountIdMatch = route.match(/^\/vendor\/me\/discounts\/(\d+)$/);
  if (discountIdMatch) {
    const did = parseInt(discountIdMatch[1], 10);
    if (method === "PUT") return handleDiscountUpdate(req, supabase, vendor.id, did);
    if (method === "DELETE") return handleDiscountDelete(supabase, vendor.id, did);
  }

  const rotateMatch = route.match(/^\/vendor\/me\/discounts\/(\d+)\/rotate-code$/);
  if (rotateMatch && method === "POST") {
    const did = parseInt(rotateMatch[1], 10);
    return handleDiscountRotateCode(req, supabase, userId, vendor.id, did);
  }

  if (method === "GET" && route === "/vendor/me/stats") {
    return handleVendorStats(supabase, vendor.id);
  }

  return json({ error: "Vendor portal route not found" }, 404);
}
