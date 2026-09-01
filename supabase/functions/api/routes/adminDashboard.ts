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
      const donorsInPeriod = since
        ? donors.filter((d: any) => d.created_at && d.created_at >= since)
        : donors;

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
        .select("amount, created_at")
        .eq("type", "monthly_donation")
        .eq("status", "completed");
      if (since) monthlyQuery = monthlyQuery.gte("created_at", since);
      const { data: monthlyTxns } = await monthlyQuery;
      const monthlyTotal = (monthlyTxns || []).reduce(
        (a: number, t: any) => a + Number(t.amount || 0),
        0,
      );

      let giftQuery = supabase
        .from("one_time_gifts")
        .select("amount, net_amount, created_at, status")
        .eq("status", "succeeded");
      if (since) giftQuery = giftQuery.gte("created_at", since);
      const { data: gifts } = await giftQuery;
      const giftTotal = (gifts || []).reduce(
        (a: number, g: any) => a + Number(g.amount || 0),
        0,
      );

      const round2 = (n: number) => Math.round(n * 100) / 100;

      const { count: activeDiscounts } = await supabase
        .from("discounts")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      const { count: pendingApprovals } = await supabase
        .from("charities")
        .select("id", { count: "exact", head: true })
        .eq("is_pending_verification", true);

      return json({
        success: true,
        data: {
          totalDonors: donorsInPeriod.length,
          activeDonors,
          inactiveDonors: Math.max(0, donorsInPeriod.length - activeDonors),
          totalVendors: totalVendors ?? 0,
          totalBeneficiaries: totalBeneficiaries ?? 0,
          // Everything actually collected: recurring donations plus one-time
          // gifts. totalRevenue is deliberately the same figure — THRIVE's own
          // revenue (its cut / processing spread) is not modelled anywhere, so
          // reporting a different number here would be inventing one.
          totalDonations: round2(monthlyTotal + giftTotal),
          totalRevenue: round2(monthlyTotal + giftTotal),
          totalMonthlyDonations: round2(monthlyTotal),
          totalOneTimeGift: round2(giftTotal),
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

  return json({ error: "Admin dashboard route not found" }, 404);
}
