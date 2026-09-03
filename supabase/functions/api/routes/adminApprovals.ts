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
// Vendors, plus donor-suggested charities:
//   GET   /admin/approvals?type=charity                 list pending charities
//   POST  /admin/approvals/charity/:id/approve          approve + complete profile
//   POST  /admin/approvals/charity/:id/reject           reject with reason
//
// Charity routes carry `charity` in the path rather than reusing
// /admin/approvals/:id — vendor and charity ids come from different tables and
// would collide.

import { corsHeaders } from "../lib/cors.ts";
import { sendVendorEmail } from "../lib/email.ts";
import { sendPushToUser } from "../lib/push.ts";
import { sendNotificationEmail } from "../lib/email.ts";
import { charityProfileGaps } from "../lib/charities.ts";

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
    // "incomplete" = registered but never submitted for review, so there is
    // nothing to judge yet — chase them rather than approve them. Reactivation
    // requests are always a real submission.
    submission_state:
      submissionKind === "reactivation" || v.submitted_at
        ? "submitted"
        : "incomplete",
    is_incomplete: submissionKind !== "reactivation" && !v.submitted_at,
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

// Same shape the Pending Approvals UI already renders for vendors, so the
// table can show both without a second code path.
function formatCharity(c: any, suggestedByName: string) {
  return {
    id: c.id,
    // "beneficiary" — the admin panel's Beneficiaries tab filters on this
    // exact value, so the existing UI mapping works untouched.
    type: "beneficiary",
    submission_kind: "suggestion",
    name: c.name,
    contact_person: suggestedByName || null,
    email: c.email || null,
    phone: c.phone || null,
    location: c.location || null,
    created_at: c.created_at,
    submitted_at: c.suggested_at || c.created_at,
    // Everything an admin needs to judge the org before approving.
    ein: c.ein || null,
    website: c.website || null,
    category: c.category || null,
    description: c.description || null,
    suggested_by_user_id: c.suggested_by_user_id || null,
    suggested_by_name: suggestedByName || null,
    // Derived for display. The column is a boolean, so `|| "pending"`
    // reported every rejected charity as still pending.
    verification_status: c.is_pending_verification
      ? "pending"
      : c.verification_status === false
        ? "rejected"
        : "approved",
    verification_rejected_reason: c.verification_rejected_reason || null,
  };
}

// Profile fields an admin may fill in while approving. camelCase accepted too
// so the panel can post either shape.
const CHARITY_PROFILE_FIELDS: Record<string, string> = {
  name: "name",
  category: "category",
  type: "type",
  description: "description",
  about: "about",
  whyThisMatters: "why_this_matters",
  why_this_matters: "why_this_matters",
  successStory: "success_story",
  success_story: "success_story",
  storyAuthor: "story_author",
  story_author: "story_author",
  impactStatement1: "impact_statement_1",
  impact_statement_1: "impact_statement_1",
  impactStatement2: "impact_statement_2",
  impact_statement_2: "impact_statement_2",
  familiesHelped: "families_helped",
  families_helped: "families_helped",
  communitiesServed: "communities_served",
  communities_served: "communities_served",
  livesImpacted: "lives_impacted",
  lives_impacted: "lives_impacted",
  programsActive: "programs_active",
  programs_active: "programs_active",
  directToProgramsPercentage: "direct_to_programs_percentage",
  direct_to_programs_percentage: "direct_to_programs_percentage",
  imageUrl: "image_url",
  image_url: "image_url",
  logoUrl: "logo_url",
  logo_url: "logo_url",
  location: "location",
  website: "website",
  phone: "phone",
  email: "email",
  contactName: "contact_name",
  contact_name: "contact_name",
  ein: "ein",
};

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

    // type=charity → donor-suggested charities awaiting verification. The
    // default stays vendor-only so the existing UI call is unaffected.
    const typeParam = url.searchParams.get("type");
    if (typeParam === "charity" || typeParam === "beneficiary") {
      let q = supabase
        .from("charities")
        .select("*")
        .order("suggested_at", { ascending: false, nullsFirst: false });

      if (status === "pending") {
        q = q.eq("is_pending_verification", true);
      } else if (status === "approved") {
        // Null counts as approved: the 51 charities that predate this flow
        // were never explicitly verified but are live.
        q = q
          .eq("is_pending_verification", false)
          .or("verification_status.is.null,verification_status.eq.true");
      } else if (status === "rejected") {
        // A freshly suggested charity also has verification_status false, so
        // the pending flag is what separates rejected from not-yet-judged.
        q = q.eq("verification_status", false).eq("is_pending_verification", false);
      }
      q = q.range((page - 1) * limit, page * limit - 1);

      const { data: charities, error: chErr } = await q;
      if (chErr) return json({ error: chErr.message }, 500);

      // Who suggested each one — useful context when judging a submission.
      const suggesterIds = (charities || [])
        .map((c: any) => c.suggested_by_user_id)
        .filter(Boolean);
      const nameBySuggester = new Map<number, string>();
      if (suggesterIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, first_name, last_name, email")
          .in("id", suggesterIds);
        for (const u of users || []) {
          nameBySuggester.set(
            u.id,
            [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email,
          );
        }
      }

      const data = (charities || []).map((c: any) =>
        formatCharity(c, c.suggested_by_user_id ? nameBySuggester.get(c.suggested_by_user_id) || "" : ""),
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

    // Two parallel queries when we want "pending": first-time signups AND
    // returning vendors asking to reactivate. Approved / rejected / all
    // remain single-shape queries because they're historical views, not
    // action queues.
    let signupQuery = supabase
      .from("vendors")
      .select("*")
      .order("submitted_at", { ascending: false, nullsFirst: false });
    if (status === "pending") {
      // Unsubmitted registrations belong here too. Portal signup creates the
      // vendor with signup_status "pending" and no submitted_at; stamping
      // submitted_at is a separate step (/vendor/me/resubmit). Requiring it
      // meant a vendor who created an account and stopped was invisible
      // everywhere — not in this queue, not in the app, with nothing telling
      // anyone they existed. Applebee's Grill + Bar sat that way for three
      // weeks. They now appear, flagged incomplete, so they can be chased.
      signupQuery = signupQuery.eq("signup_status", "pending");
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

  // POST /admin/approvals/charity/:id/approve
  //
  // Clears the pending flag, applies whatever profile detail the admin filled
  // in, and releases any giving that was held while the charity was
  // unverified. The hold is set on the app side when a donor picks a
  // registry charity, so approval is what actually lets that money move.
  const charityApprove = route.match(/^\/admin\/approvals\/charity\/(\d+)\/approve$/);
  if (method === "POST" && charityApprove) {
    const charityId = parseInt(charityApprove[1], 10);

    const { data: charity, error: findErr } = await supabase
      .from("charities")
      .select("*")
      .eq("id", charityId)
      .maybeSingle();
    if (findErr) return json({ error: findErr.message }, 500);
    if (!charity) return json({ error: "Charity not found" }, 404);

    let body: any = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch {
      // Approving with no profile edits is valid.
    }

    // Only known columns, so a stray key from the panel can't fail the write.
    const profile: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(CHARITY_PROFILE_FIELDS)) {
      if (body[key] !== undefined) profile[column] = body[key];
    }

    // Merge the admin's edits over the stored row so completeness is judged
    // on what the record will actually look like after this write.
    const gaps = charityProfileGaps({ ...charity, ...profile });
    const complete = gaps.length === 0;

    // awaiting_profile_completion arrives with migration 20260831000000. If
    // that has not been applied yet, the write below fails with a
    // column-not-found error and the whole approval 500s — which is exactly
    // the failure this endpoint just had. Retry without the column instead:
    // the charity still gets approved, it just publishes immediately as it
    // did before.
    const buildUpdate = (withFlag: boolean) => {
      const u: Record<string, unknown> = {
        ...profile,
        is_pending_verification: false,
        // Boolean column, not an enum — writing the string "approved" made
        // Postgres reject the whole update, which surfaced in the admin panel
        // as "Failed to approve item". lib/charities.ts reads it as
        // `verification_status !== false`, so true means verified.
        verification_status: true,
        verification_rejected_at: null,
        verification_rejected_reason: null,
        // Approval clears review and releases held giving, but the charity
        // stays hidden until the profile is presentable. A suggested charity
        // arrives with placeholder `about` copy, type "Pending" and no image;
        // publishing that put a visibly broken profile in front of donors.
        is_active: withFlag ? complete : true,
        updated_at: new Date().toISOString(),
      };
      if (withFlag) u.awaiting_profile_completion = !complete;
      return u;
    };

    let updErr: any = null;
    {
      const first = await supabase
        .from("charities")
        .update(buildUpdate(true))
        .eq("id", charityId);
      updErr = first.error;
      if (updErr && /awaiting_profile_completion/i.test(updErr.message || "")) {
        console.warn(
          "⚠️ awaiting_profile_completion column missing — apply migration " +
            "20260831000000. Approving without the hold-back for now.",
        );
        const retry = await supabase
          .from("charities")
          .update(buildUpdate(false))
          .eq("id", charityId);
        updErr = retry.error;
      }
    }
    if (updErr) return json({ error: updErr.message }, 500);

    // ── Release held giving for every donor who picked this charity ──
    // Mirrors POST /donations/monthly/redirect, but scoped to one charity and
    // run across all its waiting donors rather than one authenticated user.
    let releasedDonors = 0;
    let releasedTotal = 0;
    try {
      const { data: heldSubs } = await supabase
        .from("monthly_donations")
        .select("id, user_id")
        .eq("beneficiary_id", charityId)
        .eq("held_for_donor_choice", true);

      for (const sub of heldSubs || []) {
        const { data: heldTxns } = await supabase
          .from("transactions")
          .select("id, amount")
          .eq("user_id", sub.user_id)
          .eq("held_for_donor_choice", true)
          .is("released_at", null);

        const txnIds = (heldTxns || []).map((t: any) => t.id);
        const total = (heldTxns || []).reduce(
          (sum: number, t: any) => sum + parseFloat(t.amount || 0),
          0,
        );

        if (total > 0 && txnIds.length > 0) {
          await supabase.from("transactions").insert({
            user_id: sub.user_id,
            type: "held_release",
            amount: total,
            description: `Released held donations to ${charity.name}`,
            beneficiary_id: charityId,
            status: "completed",
            reference_type: "donation",
          });
          await supabase
            .from("transactions")
            .update({
              released_at: new Date().toISOString(),
              released_to_charity_id: charityId,
            })
            .in("id", txnIds);
          releasedTotal += total;
        }

        await supabase
          .from("monthly_donations")
          .update({ held_for_donor_choice: false })
          .eq("id", sub.id);
        releasedDonors += 1;
      }
    } catch (e: any) {
      // The charity IS approved at this point; a release failure must not
      // report the approval as failed. Surface it as a warning instead so an
      // admin knows to check rather than approving twice.
      console.error("⚠️ Charity approved but releasing held funds failed:", e?.message || e);
      return json({
        success: true,
        charity: { id: charityId, name: charity.name },
        warning:
          "Charity approved, but releasing held donations failed — please check held funds for this cause.",
      });
    }

    // Tell every donor who picked this cause that it cleared review. Awaited
    // rather than fire-and-forget: an Edge Function isolate can be torn down
    // the moment the response is returned, dropping un-awaited work.
    try {
      await notifyCharityDonors(supabase, charityId, {
        title: `${charity.name} is verified`,
        pushBody: "Your giving is on its way to them. Tap to see your cause.",
        emailBody:
          `Good news — ${charity.name} has cleared our verification checks, so your monthly giving is on its way to them.\n\nYou can see your cause any time in the THRIVE app.`,
        level: "success",
        type: "charity_approved",
      });
    } catch (e: any) {
      // Approval already succeeded; a failed notice must not undo or hide that.
      console.warn("charity approved but donor notice failed:", e?.message || e);
    }

    return json({
      success: true,
      charity: { id: charityId, name: charity.name },
      released_donor_count: releasedDonors,
      released_amount: Number(releasedTotal.toFixed(2)),
      // The panel opens the profile editor when this is false and lists what
      // is missing; saving the profile is what publishes the charity.
      isComplete: complete,
      missingFields: gaps,
    });
  }

/**
 * Tell every donor attached to a charity that its verification status changed.
 *
 * Two things this gets right that the previous inline version did not:
 *
 * 1. **Who counts as attached.** A donor's chosen cause lives in
 *    `users.preferences.preferredCharity` (see routes/auth.ts), which is not the
 *    same as having a `monthly_donations` row. Team and comped members pick a
 *    cause and are never billed, and a donor can select before their first
 *    payment settles — querying only monthly_donations silently skipped all of
 *    them, which is the worst case for a rejection: their app keeps showing a
 *    cause that no longer exists and nothing ever tells them.
 *
 * 2. **Email as well as push.** Push only reaches build 64 and later; earlier
 *    binaries cannot register a token at all. A push-only notice therefore
 *    reaches almost nobody today, and this is the one message a donor must not
 *    miss — their giving is sitting held while they wait to be asked.
 *
 * Awaited rather than fire-and-forget: an Edge Function isolate can be torn
 * down as soon as the response returns, dropping un-awaited work.
 *
 * The internal rejection reason is deliberately never passed in here — it is
 * for the admin record, not the donor.
 */
async function notifyCharityDonors(
  supabase: any,
  charityId: number,
  notice: { title: string; pushBody: string; emailBody: string; level: string; type: string },
): Promise<{ pushed: number; emailed: number; recipients: number }> {
  const ids = new Set<number>();

  const { data: donors } = await supabase
    .from("monthly_donations")
    .select("user_id")
    .eq("beneficiary_id", charityId);
  for (const d of donors || []) if (d?.user_id) ids.add(d.user_id);

  // preferences is JSONB and the id may be stored as a number or a string, so
  // this is compared in JS rather than trusting a ->> cast to match either.
  const { data: prefUsers } = await supabase
    .from("users")
    .select("id, preferences")
    .not("preferences", "is", null);
  for (const u of prefUsers || []) {
    const pick = u?.preferences?.preferredCharity ?? u?.preferences?.beneficiary;
    if (pick != null && String(pick) === String(charityId)) ids.add(u.id);
  }

  if (ids.size === 0) return { pushed: 0, emailed: 0, recipients: 0 };

  const { data: recipients } = await supabase
    .from("users")
    .select("id, email, first_name")
    .in("id", [...ids]);

  let pushed = 0;
  let emailed = 0;
  for (const u of recipients || []) {
    try {
      const ok = await sendPushToUser(supabase, u.id, {
        title: notice.title,
        body: notice.pushBody,
        data: { path: "/beneficiary", type: notice.type, charity_id: charityId },
      });
      if (ok) pushed += 1;
    } catch (e: any) {
      console.warn(`push to ${u.id} failed:`, e?.message || e);
    }

    if (!u.email) continue;
    try {
      await sendNotificationEmail({
        to: u.email,
        name: u.first_name || "there",
        title: notice.title,
        message: notice.emailBody,
        level: notice.level,
      });
      emailed += 1;
    } catch (e: any) {
      console.warn(`email to ${u.email} failed:`, e?.message || e);
    }
  }

  return { pushed, emailed, recipients: (recipients || []).length };
}

  // POST /admin/approvals/charity/:id/reject
  //
  // The donor keeps their held funds and is asked to pick another cause; the
  // charity stays in the table flagged rejected so the same EIN doesn't come
  // straight back through /charities/suggest as a fresh submission.
  const charityReject = route.match(/^\/admin\/approvals\/charity\/(\d+)\/reject$/);
  if (method === "POST" && charityReject) {
    const charityId = parseInt(charityReject[1], 10);

    let reason = "";
    try {
      const text = await req.text();
      if (text) reason = (JSON.parse(text).reason || "").toString().trim();
    } catch {
      // reason is optional
    }

    const { data: charity, error: findErr } = await supabase
      .from("charities")
      .select("id, name")
      .eq("id", charityId)
      .maybeSingle();
    if (findErr) return json({ error: findErr.message }, 500);
    if (!charity) return json({ error: "Charity not found" }, 404);

    const { error: updErr } = await supabase
      .from("charities")
      .update({
        is_pending_verification: false,
        verification_status: false,
        verification_rejected_at: new Date().toISOString(),
        verification_rejected_reason: reason || null,
        // Hidden from the donor app, but the row is kept for the audit trail
        // and for suggest-time dedupe.
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", charityId);
    if (updErr) return json({ error: updErr.message }, 500);

    // A rejected charity is not waiting on a profile — leaving the flag set
    // would let the PUT path publish it the moment anyone edited it. Written
    // separately and ignored on failure so a missing column (migration
    // 20260831000000 not yet applied) cannot fail the rejection.
    await supabase
      .from("charities")
      .update({ awaiting_profile_completion: false })
      .eq("id", charityId)
      .then(({ error }: any) => {
        if (error) console.warn("could not clear awaiting flag:", error.message);
      });

    // The donor's giving stays held and safe, but nothing else would tell
    // them to choose again — so say it plainly, and don't repeat the internal
    // rejection reason to them.
    let notified = { pushed: 0, emailed: 0, recipients: 0 };
    try {
      notified = await notifyCharityDonors(supabase, charityId, {
        title: `We couldn't verify ${charity.name}`,
        pushBody: "Your giving is safe and still set aside — tap to choose another cause.",
        emailBody:
          `We weren't able to verify ${charity.name}, so we can't send donations there.\n\nNothing has been lost — your giving is safe and still set aside. Open the THRIVE app and choose another cause, and it will go to them instead.\n\nThank you for your patience while we check that every cause on THRIVE is what it says it is.`,
        level: "warning",
        type: "charity_rejected",
      });
    } catch (e: any) {
      // Rejection already succeeded; a failed notice must not undo or hide it.
      console.warn("charity rejected but donor notice failed:", e?.message || e);
    }

    return json({
      success: true,
      charity: { id: charityId, name: charity.name },
      reason: reason || null,
      donors_notified: notified,
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
