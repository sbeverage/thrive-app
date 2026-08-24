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
import { sendVendorEmail } from "../lib/email.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: jsonHeaders });

// Shape the admin Pending Approvals UI already consumes (see ti-admin-panel
// PendingApprovals.tsx loadApprovals). Returned via PaginatedResponse envelope.
//
// `submission_kind` distinguishes first-time signup approvals from returning
// vendors asking to be reactivated after the admin turned them off. UI
// renders them in separate sections but the same approve/deny buttons.
function formatVendor(v: any, contactName: string, submissionKind: "signup" | "reactivation") {
  const addr = v.address || {};
  const location = [addr.city, addr.state].filter(Boolean).join(", ");
  return {
    id: v.id,
    type: "vendor",
    submission_kind: submissionKind,
    name: v.name,
    contact_person: contactName || v.name,
    email: v.email,
    phone: v.phone,
    location: location || null,
    created_at: v.created_at,
    submitted_at: submissionKind === "reactivation"
      ? v.reactivation_requested_at
      : v.submitted_at,
    signup_status: v.signup_status,
    rejection_reason: v.rejection_reason,
    description: v.description,
    category: v.category,
    website: v.website,
    logo_url: v.logo_url,
    documents_submitted: "N/A", // self-serve flow doesn't collect docs yet
    verification_status: v.signup_status === "approved" ? "verified" : "pending",
    is_active: v.is_active !== false,
    is_enabled: v.signup_status === "approved",
    // Reactivation-specific — safe to send always; UI only reads them when
    // submission_kind === "reactivation".
    deactivated_at: v.deactivated_at || null,
    deactivation_reason: v.deactivation_reason || null,
    reactivation_requested_at: v.reactivation_requested_at || null,
    reactivation_message: v.reactivation_message || null,
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

    // Two parallel queries when we want "pending": first-time signups AND
    // returning vendors asking to reactivate. Approved / rejected / all
    // remain single-shape queries because they're historical views, not
    // action queues.
    let signupQuery = supabase
      .from("vendors")
      .select("*")
      .order("submitted_at", { ascending: false, nullsFirst: false });
    if (status === "pending") {
      signupQuery = signupQuery
        .eq("signup_status", "pending")
        .not("submitted_at", "is", null);
    } else if (status === "approved" || status === "rejected") {
      signupQuery = signupQuery.eq("signup_status", status);
    }
    // status="all" → no extra filter
    signupQuery = signupQuery.range((page - 1) * limit, page * limit - 1);

    const { data: signupVendors, error: signupErr } = await signupQuery;
    if (signupErr) return json({ error: signupErr.message }, 500);

    let reactivationVendors: any[] = [];
    if (status === "pending" || status === "all") {
      const { data: r, error: rErr } = await supabase
        .from("vendors")
        .select("*")
        .eq("is_active", false)
        .not("reactivation_requested_at", "is", null)
        .order("reactivation_requested_at", { ascending: false });
      if (rErr) return json({ error: rErr.message }, 500);
      reactivationVendors = r || [];
    }

    // Pull contact names from users in one shot across BOTH sets.
    const combined = [...(signupVendors || []), ...reactivationVendors];
    const userIds = combined.map((v: any) => v.auth_user_id).filter(Boolean);
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

    const nameFor = (v: any) => v.auth_user_id ? nameByUser.get(v.auth_user_id) || "" : "";

    const signupRows = (signupVendors || []).map((v: any) => formatVendor(v, nameFor(v), "signup"));
    const reactivationRows = reactivationVendors.map((v: any) => formatVendor(v, nameFor(v), "reactivation"));

    // Reactivations first — they're rarer and time-sensitive since the
    // vendor is already off the donor app while waiting.
    const data = [...reactivationRows, ...signupRows];

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

    // Peek at the vendor first — a reactivation approval needs different
    // state changes (flip is_active back on, clear the deactivation block)
    // than a first-time signup approval.
    const { data: current, error: peekErr } = await supabase
      .from("vendors")
      .select("id, is_active, reactivation_requested_at")
      .eq("id", id)
      .single();
    if (peekErr || !current) {
      return json({ success: false, error: peekErr?.message || "Vendor not found" }, peekErr ? 500 : 404);
    }
    const isReactivation = current.is_active === false && current.reactivation_requested_at !== null;

    const updatePayload: Record<string, unknown> = isReactivation
      ? {
          is_active: true,
          deactivated_at: null,
          deactivation_reason: null,
          reactivation_requested_at: null,
          reactivation_message: null,
        }
      : {
          signup_status: "approved",
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        };

    const { data: vendor, error } = await supabase
      .from("vendors")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return json({ success: false, error: error.message }, 500);

    // Notify the vendor (fire-and-forget — never let email failure block admin).
    if (vendor?.auth_user_id) {
      const { data: ownerUser } = await supabase
        .from("users")
        .select("email, first_name, last_name")
        .eq("id", vendor.auth_user_id)
        .maybeSingle();
      if (ownerUser?.email) {
        await sendVendorEmail({
          to: ownerUser.email,
          name: [ownerUser.first_name, ownerUser.last_name].filter(Boolean).join(" "),
          businessName: vendor.name,
          kind: isReactivation ? "reactivated" : "approved",
        }).catch((e) => console.error("approve email failed:", e));
      }
    }

    return json({ success: true, data: vendor, submission_kind: isReactivation ? "reactivation" : "signup" });
  }

  // POST /admin/approvals/:id/reject
  const rejectMatch = route.match(/^\/admin\/approvals\/(\d+)\/reject$/);
  if (method === "POST" && rejectMatch) {
    const id = parseInt(rejectMatch[1], 10);
    const body = await req.json().catch(() => ({}));
    const reason = (body.reason || body.rejection_reason || "Rejected by admin")
      .toString()
      .trim();

    const { data: current, error: peekErr } = await supabase
      .from("vendors")
      .select("id, is_active, reactivation_requested_at")
      .eq("id", id)
      .single();
    if (peekErr || !current) {
      return json({ success: false, error: peekErr?.message || "Vendor not found" }, peekErr ? 500 : 404);
    }
    const isReactivation = current.is_active === false && current.reactivation_requested_at !== null;

    const updatePayload: Record<string, unknown> = isReactivation
      ? {
          // Deny a reactivation request — vendor stays inactive, the
          // deactivation_reason gets overwritten with the fresh reason so
          // the vendor's banner surfaces the latest admin decision. They
          // can request reactivation again later.
          reactivation_requested_at: null,
          reactivation_message: null,
          deactivation_reason: reason,
        }
      : {
          signup_status: "rejected",
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
        };

    const { data: vendor, error } = await supabase
      .from("vendors")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return json({ success: false, error: error.message }, 500);

    if (vendor?.auth_user_id) {
      const { data: ownerUser } = await supabase
        .from("users")
        .select("email, first_name, last_name")
        .eq("id", vendor.auth_user_id)
        .maybeSingle();
      if (ownerUser?.email) {
        await sendVendorEmail({
          to: ownerUser.email,
          name: [ownerUser.first_name, ownerUser.last_name].filter(Boolean).join(" "),
          businessName: vendor.name,
          kind: isReactivation ? "reactivation_denied" : "rejected",
          reason,
        }).catch((e) => console.error("reject email failed:", e));
      }
    }

    return json({ success: true, data: vendor, submission_kind: isReactivation ? "reactivation" : "signup" });
  }

  return json({ error: "Admin approvals route not found" }, 404);
}
