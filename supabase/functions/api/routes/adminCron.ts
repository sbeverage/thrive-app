// Cron-triggered admin tasks. Endpoints are protected by the admin secret
// (so they can be invoked by Supabase pg_cron, GitHub Actions, Vercel Cron,
// etc.) and do their work synchronously enough to fit inside the function
// execution window.

import { corsHeaders } from "../lib/cors.ts";
import { sendVendorEmail } from "../lib/email.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: jsonHeaders });

const ROTATION_THRESHOLD_DAYS = 30;

// POST /admin/cron/vendor-rotation-reminder
// Walks every approved vendor with at least one active discount whose code
// has not been rotated (or created) within the last 30 days, and sends the
// owner a reminder email.
async function handleRotationReminder(supabase: any): Promise<Response> {
  const cutoff = new Date(Date.now() - ROTATION_THRESHOLD_DAYS * 86_400_000).toISOString();

  // Approved vendors with an auth user attached (we need their email).
  const { data: vendors, error: vendorErr } = await supabase
    .from("vendors")
    .select("id, name, auth_user_id")
    .eq("signup_status", "approved")
    .not("auth_user_id", "is", null);
  if (vendorErr) return json({ error: vendorErr.message }, 500);
  if (!vendors || vendors.length === 0) return json({ sent: 0, reminders: [] });

  const vendorIds = vendors.map((v: any) => v.id);

  // Active discounts created before the cutoff — candidates for rotation.
  const { data: discounts, error: discountErr } = await supabase
    .from("discounts")
    .select("id, vendor_id, created_at, updated_at")
    .in("vendor_id", vendorIds)
    .neq("is_active", false);
  if (discountErr) return json({ error: discountErr.message }, 500);

  // Latest rotation per discount, if any.
  const discountIds = (discounts || []).map((d: any) => d.id);
  const lastRotationByDiscount = new Map<number, string>();
  if (discountIds.length > 0) {
    const { data: rotations } = await supabase
      .from("discount_code_history")
      .select("discount_id, rotated_at")
      .in("discount_id", discountIds)
      .order("rotated_at", { ascending: false });
    for (const r of rotations || []) {
      if (!lastRotationByDiscount.has(r.discount_id)) {
        lastRotationByDiscount.set(r.discount_id, r.rotated_at);
      }
    }
  }

  // Vendors that have at least one discount whose last touch is older than cutoff.
  const staleVendorIds = new Set<number>();
  for (const d of discounts || []) {
    const lastTouch = lastRotationByDiscount.get(d.id) || d.created_at;
    if (lastTouch && lastTouch < cutoff) staleVendorIds.add(d.vendor_id);
  }
  if (staleVendorIds.size === 0) return json({ sent: 0, reminders: [] });

  const targetVendors = vendors.filter((v: any) => staleVendorIds.has(v.id));
  const ownerIds = targetVendors.map((v: any) => v.auth_user_id);
  const { data: owners } = await supabase
    .from("users")
    .select("id, email, first_name, last_name")
    .in("id", ownerIds);
  const ownerById = new Map<number, any>();
  for (const u of owners || []) ownerById.set(u.id, u);

  const reminders: string[] = [];
  for (const vendor of targetVendors) {
    const owner = ownerById.get(vendor.auth_user_id);
    if (!owner?.email) continue;
    await sendVendorEmail({
      to: owner.email,
      name: [owner.first_name, owner.last_name].filter(Boolean).join(" "),
      businessName: vendor.name,
      kind: "rotation_reminder",
    });
    reminders.push(owner.email);
  }

  return json({ sent: reminders.length, reminders });
}

export async function handleAdminCron(
  _req: Request,
  supabase: any,
  route: string,
  method: string,
): Promise<Response> {
  if (method === "POST" && route === "/admin/cron/vendor-rotation-reminder") {
    return handleRotationReminder(supabase);
  }
  return json({ error: "Cron route not found" }, 404);
}
