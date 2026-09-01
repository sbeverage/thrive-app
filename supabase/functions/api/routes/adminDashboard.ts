// GET /admin/dashboard/stats — the figures behind the admin homepage cards.
//
// The dashboard has always called this endpoint and it has never existed:
// adminRouter had no /admin/dashboard branch, so every request returned
// "Admin route not found". Dashboard.tsx swallows the failure
// (`.catch(() => ({ success: false, data: null }))`) and falls back to a stats
// object where the money fields are 0, which the cards render as "--". That is
// why some cards were populated and others blank: totalDonors, totalVendors,
// totalBeneficiaries, activeDonors and pendingApprovals are computed locally
// from the list endpoints, while totalDonations, totalRevenue,
// totalOneTimeGift and activeDiscounts come only from here.
//
// Field names match what Dashboard.tsx already reads, so no admin panel
// release is needed.

import { corsHeaders } from "../lib/cors.ts";
import { isTeamMember } from "../lib/membership.ts";

// THRIVE's own per-donation service fee, mirroring SERVICE_FEE in
// app/(tabs)/menu/editDonationAmount.js. Not stored per transaction, so the
// donation portion is derived: gross − service fee − the actual Stripe fee.
// If this figure ever changes in the app, change it here too.
const SERVICE_FEE_USD = 3.0;

/** Days for a period string like "30-days", "30d", "90-days". Null = all time. */
function periodDays(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === "all" || s === "all-time" || s === "alltime") return null;
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function handleAdminDashboard(
  req: Request,
  supabase: any,
  route: string,
  method: string,
): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  if (method === "GET" && route.startsWith("/admin/dashboard/stats")) {
    try {
      const url = new URL(req.url);
      const days = periodDays(url.searchParams.get("period"));
      const since = days
        ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // ── Donors ─────────────────────────────────────────────────────────
      // Team accounts are internal and comped, so they are excluded here for
      // the same reason they are excluded from analytics.
      const { data: donorRows } = await supabase
        .from("users")
        .select("id, created_at, invite_type, coworking")
        .eq("role", "donor");
      const donors = (donorRows || []).filter((d: any) => !isTeamMember(d));
      // "Total Donors" counts every donor account regardless of subscription
      // state — active, inactive, paused, cancelled, never subscribed. It is
      // deliberately NOT period-filtered: a total that shrinks when you pick
      // "1 Month" is a signup count, not a total.
      const totalDonors = donors.length;
      const donorsInPeriod = since
        ? donors.filter((d: any) => d.created_at && d.created_at >= since)
        : donors;
      const newDonorsInPeriod = donorsInPeriod.length;

      // "Active" means a live monthly donation, matching the discounts gate.
      const { data: subs } = await supabase
        .from("monthly_donations")
        .select("user_id, status");
      const activeUserIds = new Set(
        (subs || [])
          .filter((s: any) =>
            ["active", "trialing"].includes(String(s.status || "").toLowerCase()),
          )
          .map((s: any) => s.user_id),
      );
      const teamIds = new Set(
        (donorRows || []).filter((d: any) => isTeamMember(d)).map((d: any) => d.id),
      );
      const activeDonors = [...activeUserIds].filter((id) => !teamIds.has(id)).length;

      // ── Vendors / beneficiaries ────────────────────────────────────────
      const { count: totalVendors } = await supabase
        .from("vendors")
        .select("id", { count: "exact", head: true });
      const { count: totalBeneficiaries } = await supabase
        .from("charities")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      // ── Money ──────────────────────────────────────────────────────────
      // Monthly donations come from transactions written by the Stripe webhook.
      // Worth knowing: those records were absent until 2026-09-01 (see
      // migration 20260901000000) — before the backfill this figure would have
      // read ~$0 even with this endpoint in place.
      let monthlyQuery = supabase
        .from("transactions")
        .select("amount, processing_fee, created_at")
        .eq("type", "monthly_donation")
        .eq("status", "completed");
      if (since) monthlyQuery = monthlyQuery.gte("created_at", since);
      const { data: monthlyTxns } = await monthlyQuery;

      // Gross = what the donor's card was charged.
      const monthlyGross = (monthlyTxns || []).reduce(
        (a: number, t: any) => a + Number(t.amount || 0),
        0,
      );
      // Donation = the pledge itself, e.g. $15 of an $18.72 charge. Stripe's
      // real fee comes from transactions.processing_fee (populated from the
      // charge's balance transaction); where it is missing only the service fee
      // is deducted, so such a row reads slightly high.
      const monthlyDonationOnly = (monthlyTxns || []).reduce((a: number, t: any) => {
        const gross = Number(t.amount || 0);
        const fee = t.processing_fee == null ? 0 : Number(t.processing_fee);
        return a + Math.max(0, gross - SERVICE_FEE_USD - fee);
      }, 0);

      let giftQuery = supabase
        .from("one_time_gifts")
        .select("amount, net_amount, processing_fee, created_at, status")
        .eq("status", "succeeded");
      if (since) giftQuery = giftQuery.gte("created_at", since);
      const { data: gifts } = await giftQuery;
      // one_time_gifts already separates the two: `amount` is what the donor
      // chose to give, `net_amount` what the charity receives after fees.
      const giftGross = (gifts || []).reduce(
        (a: number, g: any) =>
          a + Number(g.amount || 0) + Number(g.processing_fee || 0),
        0,
      );
      const giftDonationOnly = (gifts || []).reduce(
        (a: number, g: any) => a + Number(g.amount || 0),
        0,
      );

      const round2 = (n: number) => Math.round(n * 100) / 100;

      const { count: activeDiscounts } = await supabase
        .from("discounts")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      // Everything waiting on an accept/reject decision — vendor portal
      // submissions as well as donor-suggested charities. Previously charities
      // only, which undercounted the queue.
      const { count: pendingCharities } = await supabase
        .from("charities")
        .select("id", { count: "exact", head: true })
        .eq("is_pending_verification", true);
      // Match the approvals queue exactly (adminApprovals.ts), or the card
      // disagrees with the page it sends you to. Two kinds of vendor wait on a
      // decision:
      //   • a portal signup — signup_status pending AND submitted_at set. The
      //     submitted_at check matters: an admin-created vendor can sit at
      //     signup_status "pending" without ever having applied, and it is not
      //     in the queue.
      //   • a reactivation request — inactive with reactivation_requested_at.
      // No submitted_at requirement: the approvals queue now lists unsubmitted
      // registrations too (flagged incomplete), and this card must agree with
      // the page it links to.
      const { count: pendingVendorSignups } = await supabase
        .from("vendors")
        .select("id", { count: "exact", head: true })
        .eq("signup_status", "pending");
      const { count: pendingVendorReactivations } = await supabase
        .from("vendors")
        .select("id", { count: "exact", head: true })
        .eq("is_active", false)
        .not("reactivation_requested_at", "is", null);
      const pendingVendors =
        (pendingVendorSignups ?? 0) + (pendingVendorReactivations ?? 0);
      const pendingApprovals = (pendingCharities ?? 0) + pendingVendors;

      return json({
        success: true,
        data: {
          totalDonors,
          newDonorsInPeriod,
          activeDonors,
          inactiveDonors: Math.max(0, totalDonors - activeDonors),
          totalVendors: totalVendors ?? 0,
          totalBeneficiaries: totalBeneficiaries ?? 0,
          // Donations = what donors are actually giving (the $15/mo pledge),
          // net of the service fee and Stripe's cut.
          totalDonations: round2(monthlyDonationOnly + giftDonationOnly),
          // Revenue = everything collected, fees included.
          totalRevenue: round2(monthlyGross + giftGross),
          totalMonthlyDonations: round2(monthlyDonationOnly),
          totalOneTimeGift: round2(giftDonationOnly),
          // The gap between the two, broken out.
          totalServiceFees: round2(
            (monthlyTxns || []).length * SERVICE_FEE_USD,
          ),
          totalProcessingFees: round2(
            (monthlyTxns || []).reduce(
              (a: number, t: any) => a + Number(t.processing_fee || 0),
              0,
            ) +
              (gifts || []).reduce(
                (a: number, g: any) => a + Number(g.processing_fee || 0),
                0,
              ),
          ),
          pendingVendors,
          pendingVendorSignups: pendingVendorSignups ?? 0,
          pendingVendorReactivations: pendingVendorReactivations ?? 0,
          pendingBeneficiaries: pendingCharities ?? 0,
          activeDiscounts: activeDiscounts ?? 0,
          pendingApprovals: pendingApprovals ?? 0,
          // Not modelled in this schema; the card falls back to 0.
          totalTenants: 0,
          period: days ? `${days}-days` : "all",
        },
      });
    } catch (e: any) {
      console.error("❌ /admin/dashboard/stats failed:", e?.message || e);
      return json({ error: e?.message || "Failed to load dashboard stats" }, 500);
    }
  }

  // GET /admin/dashboard/charts/donations?period=30d
  //
  // Weekly donation series for the dashboard chart. The chart previously had no
  // data source at all — this route did not exist, so average and trend read
  // "--" — and the "chart" itself was a static CSS bar pinned at top: 50% with
  // hardcoded $0-$1000 axis labels, drawing the same flat line whatever the
  // numbers were.
  //
  // Values use the same definition as the Total Donation card: the donation
  // itself, not the gross charge.
  if (method === "GET" && route.startsWith("/admin/dashboard/charts/donations")) {
    try {
      const url = new URL(req.url);
      const days = periodDays(url.searchParams.get("period")) ?? 30;
      const bucketDays = 7;
      const buckets = Math.max(1, Math.ceil(days / bucketDays));
      const now = Date.now();
      const windowStart = now - days * 86400000;
      // Same length again, immediately before, for the trend comparison.
      const prevStart = windowStart - days * 86400000;

      const { data: txns } = await supabase
        .from("transactions")
        .select("amount, processing_fee, created_at")
        .eq("type", "monthly_donation")
        .eq("status", "completed")
        .gte("created_at", new Date(prevStart).toISOString());

      const { data: gifts } = await supabase
        .from("one_time_gifts")
        .select("amount, created_at, status")
        .eq("status", "succeeded")
        .gte("created_at", new Date(prevStart).toISOString());

      const donationOf = (t: any) => {
        const gross = Number(t.amount || 0);
        const fee = t.processing_fee == null ? 0 : Number(t.processing_fee);
        return Math.max(0, gross - SERVICE_FEE_USD - fee);
      };

      const events: { at: number; value: number }[] = [
        ...(txns || []).map((t: any) => ({
          at: new Date(t.created_at).getTime(),
          value: donationOf(t),
        })),
        ...(gifts || []).map((g: any) => ({
          at: new Date(g.created_at).getTime(),
          value: Number(g.amount || 0),
        })),
      ].filter((e) => Number.isFinite(e.at));

      const series: { label: string; value: number; start: string }[] = [];
      for (let i = 0; i < buckets; i++) {
        // Oldest bucket first, so the chart reads left to right.
        const from = windowStart + i * bucketDays * 86400000;
        const to = i === buckets - 1 ? now : from + bucketDays * 86400000;
        const value = events
          .filter((e) => e.at >= from && e.at < to)
          .reduce((a, e) => a + e.value, 0);
        series.push({
          label: buckets <= 6 ? `Week ${i + 1}` : `W${i + 1}`,
          value: Math.round(value * 100) / 100,
          start: new Date(from).toISOString().split("T")[0],
        });
      }

      const total = series.reduce((a, b) => a + b.value, 0);
      const previousTotal = events
        .filter((e) => e.at >= prevStart && e.at < windowStart)
        .reduce((a, e) => a + e.value, 0);
      // No prior activity means there is no percentage to state — null rather
      // than a fabricated 0% or an infinite jump.
      const trend =
        previousTotal > 0
          ? Math.round(((total - previousTotal) / previousTotal) * 1000) / 10
          : null;

      return json({
        success: true,
        data: {
          series,
          total: Math.round(total * 100) / 100,
          average: Math.round((total / buckets) * 100) / 100,
          weeklyAverage: Math.round((total / buckets) * 100) / 100,
          previousTotal: Math.round(previousTotal * 100) / 100,
          trend,
          growthPercentage: trend,
          period: `${days}-days`,
          bucketCount: buckets,
        },
      });
    } catch (e: any) {
      console.error("❌ /admin/dashboard/charts/donations failed:", e?.message || e);
      return json({ error: e?.message || "Failed to load chart data" }, 500);
    }
  }

  return json({ error: "Admin dashboard route not found" }, 404);
}
