// Admin Pending Approvals — Vendor Portal submissions waiting for review.
//
// The admin Pending Approvals UI (Invitations + Approvals) already calls these
// endpoints; this module fills in the backend.
//
// Routes:
//   GET   /admin/approvals?page=X&limit=Y&type=vendor   list pending submissions
//   POST  /admin/approvals/:id/approve                  approve a submission
//   POST  /admin/approvals/:id/reject                   reject with reason
//
// Currently scoped to vendors. Beneficiary approvals follow the same shape
// if/when a self-serve beneficiary signup is added.

import { corsHeaders } from "../lib/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: jsonHeaders });

// Shape the admin Pending Approvals UI already consumes (see ti-admin-panel
// PendingApprovals.tsx loadApprovals). Returned via PaginatedResponse envelope.
function formatVendor(v: any, contactName: string) {
  const addr = v.address || {};
  const location = [addr.city, addr.state].filter(Boolean).join(", ");
  return {
    id: v.id,
    type: "vendor",
    name: v.name,
    contact_person: contactName || v.name,
    email: v.email,
    phone: v.phone,
    location: location || null,
    created_at: v.created_at,
    submitted_at: v.submitted_at,
    signup_status: v.signup_status,
    rejection_reason: v.rejection_reason,
    description: v.description,
    category: v.category,
    website: v.website,
    logo_url: v.logo_url,
    documents_submitted: "N/A", // self-serve flow doesn't collect docs yet
    verification_status: v.signup_status === "approved" ? "verified" : "pending",
    is_active: v.signup_status === "approved",
    is_enabled: v.signup_status === "approved",
  };
}

export async function handleAdminApprovals(
  req: Request,
  supabase: any,
  route: string,
  method: string,
): Promise<Response> {
  // GET /admin/approvals
  if (method === "GET" && route === "/admin/approvals") {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const status = url.searchParams.get("status") || "pending";

    let query = supabase
      .from("vendors")
      .select("*")
      .order("submitted_at", { ascending: false, nullsFirst: false });

    if (status === "pending") {
      query = query
        .eq("signup_status", "pending")
        .not("submitted_at", "is", null);
    } else if (status === "approved" || status === "rejected") {
      query = query.eq("signup_status", status);
    }
    // status="all" → no extra filter

    const { data: vendors, error } = await query
      .range((page - 1) * limit, page * limit - 1);
    if (error) return json({ error: error.message }, 500);

    // Pull contact names from users in one shot.
    const userIds = (vendors || [])
      .map((v: any) => v.auth_user_id)
      .filter(Boolean);
    let nameByUser = new Map<number, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", userIds);
      for (const u of users || []) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email;
        nameByUser.set(u.id, name);
      }
    }

    const data = (vendors || []).map((v: any) =>
      formatVendor(v, v.auth_user_id ? nameByUser.get(v.auth_user_id) || "" : "")
    );

    return json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: data.length,
        pages: Math.max(1, Math.ceil(data.length / limit)),
      },
    });
  }

  // POST /admin/approvals/:id/approve
  const approveMatch = route.match(/^\/admin\/approvals\/(\d+)\/approve$/);
  if (method === "POST" && approveMatch) {
    const id = parseInt(approveMatch[1], 10);
    const { data: vendor, error } = await supabase
      .from("vendors")
      .update({
        signup_status: "approved",
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return json({ success: false, error: error.message }, 500);
    return json({ success: true, data: vendor });
  }

  // POST /admin/approvals/:id/reject
  const rejectMatch = route.match(/^\/admin\/approvals\/(\d+)\/reject$/);
  if (method === "POST" && rejectMatch) {
    const id = parseInt(rejectMatch[1], 10);
    const body = await req.json().catch(() => ({}));
    const reason = (body.reason || body.rejection_reason || "Rejected by admin")
      .toString()
      .trim();

    const { data: vendor, error } = await supabase
      .from("vendors")
      .update({
        signup_status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return json({ success: false, error: error.message }, 500);
    return json({ success: true, data: vendor });
  }

  return json({ error: "Admin approvals route not found" }, 404);
}
