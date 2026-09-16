import { corsHeaders } from "../lib/cors.ts";
import { isTeamMember, membershipOf } from "../lib/membership.ts";

export type AdminAnalyticsDeps = {
  sendReferralReminderEmail: (args: {
    to: string;
    name: string;
    referrerName?: string;
  }) => Promise<void>;
};

export async function handleAdminAnalytics(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: AdminAnalyticsDeps,
) {
  const { sendReferralReminderEmail } = deps;

  // GET /admin/analytics/donor-cohort?type=new|lost&period=weekly|monthly|quarterly|yearly
  //
  // The donors behind the New Donors and Lost Donors cards, so clicking a card
  // can show who they actually are.
  //
  // The predicates below are deliberately identical to the ones donor-overview
  // counts with, because a list that disagrees with the number on the card is
  // worse than no list — it makes both look wrong and there is no way to tell
  // which. Kept in this file, next to that handler, so they are edited
  // together; the response returns `count` alongside the rows so a drift shows
  // up immediately rather than silently.
  //
  //   new  — the donor's FIRST donation falls in the window. First donation is
  //          the earliest of monthly_donations.last_payment_date and a
  //          completed one_time_gifts.created_at.
  //   lost — a monthly_donations row moved to cancelled / past_due / unpaid and
  //          its updated_at falls in the window.
  //
  // Team members are excluded, matching donor-overview: they are never billed
  // so they can be neither gained nor lost.
  if (method === "GET" && route.startsWith("/admin/analytics/donor-cohort")) {
    try {
      const url = new URL(req.url);
      const type = (url.searchParams.get("type") || "new").toLowerCase();
      const period = (url.searchParams.get("period") || "monthly").toLowerCase();
      if (!["new", "lost"].includes(type)) {
        return new Response(JSON.stringify({ error: "type must be new or lost" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }

      const DAYS: Record<string, number> = {
        weekly: 7, monthly: 30, quarterly: 90, yearly: 365,
      };
      const days = DAYS[period];
      if (!days) {
        return new Response(
          JSON.stringify({ error: "period must be weekly, monthly, quarterly or yearly" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }
      const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: donorRows } = await supabase
        .from("users")
        .select("id, email, first_name, last_name, created_at, invite_type, coworking")
        .eq("role", "donor");
      const allDonors = donorRows || [];
      const donors = allDonors.filter((d: any) => !isTeamMember(d));
      // Lookup spans every donor, team included, so team rows resolve and can
      // be labelled. Counting still uses `donors`.
      const byId = new Map<number, any>(allDonors.map((d: any) => [d.id, d]));
      const donorIds = allDonors.map((d: any) => d.id);

      const rows: any[] = [];

      if (type === "new") {
        const [{ data: monthly }, { data: oneTime }] = await Promise.all([
          supabase
            .from("monthly_donations")
            .select("user_id, last_payment_date, amount")
            .in("user_id", donorIds.length ? donorIds : [0])
            .not("last_payment_date", "is", null),
          supabase
            .from("one_time_gifts")
            .select("user_id, created_at, amount")
            .in("user_id", donorIds.length ? donorIds : [0])
            .eq("status", "completed"),
        ]);

        // Earliest donation per donor, exactly as donor-overview computes it.
        const first = new Map<number, string>();
        for (const r of monthly || []) {
          const ts = `${r.last_payment_date}T00:00:00Z`;
          const cur = first.get(r.user_id);
          if (!cur || ts < cur) first.set(r.user_id, ts);
        }
        for (const r of oneTime || []) {
          if (!r.created_at) continue;
          const cur = first.get(r.user_id);
          if (!cur || r.created_at < cur) first.set(r.user_id, r.created_at);
        }
        // Same rule as donor-overview: a coworking member has no donation row,
        // so their signup date stands in as their first gift. Without this they
        // were invisible in this list however new they were.
        for (const d of allDonors) {
          const m = membershipOf(d);
          if (m !== "coworking" && m !== "team") continue;
          if (!d.created_at) continue;
          const cur = first.get(d.id);
          if (!cur || d.created_at < cur) first.set(d.id, d.created_at);
        }

        for (const [userId, ts] of first) {
          if (ts < sinceIso) continue;
          const u = byId.get(userId);
          if (!u) continue; // excluded donor (team) or non-donor role
          rows.push({
            user_id: userId,
            name: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
            email: u.email,
            first_donation_at: ts,
            joined_at: u.created_at,
            // "coworking" | "standard" — drives the tag in the admin table so
            // it is obvious at a glance which side of the $3 each donor is on.
            membership: membershipOf(u),
          });
        }
        rows.sort((a, b) => String(b.first_donation_at).localeCompare(String(a.first_donation_at)));
      } else {
        const { data: lostRows } = await supabase
          .from("monthly_donations")
          .select("user_id, status, updated_at, amount")
          .in("status", ["cancelled", "past_due", "unpaid"])
          .gte("updated_at", sinceIso);

        // One row per donor, keeping the most recent change — a donor with two
        // lapsed rows is one lost donor, which is how the card counts them.
        const seen = new Map<number, any>();
        for (const r of lostRows || []) {
          if (!r.updated_at) continue;
          const u = byId.get(r.user_id);
          if (!u) continue;
          const prev = seen.get(r.user_id);
          if (!prev || r.updated_at > prev.lost_at) {
            seen.set(r.user_id, {
              user_id: r.user_id,
              name: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
              email: u.email,
              status: r.status,
              lost_at: r.updated_at,
              amount: r.amount,
              membership: membershipOf(u),
            });
          }
        }
        rows.push(...seen.values());
        rows.sort((a, b) => String(b.lost_at).localeCompare(String(a.lost_at)));
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            type,
            period,
            since: sinceIso,
            count: rows.length,
            // Team accounts are listed but never counted as donors, so the
            // table can hold more rows than the card's number. Both are
            // returned rather than leaving the UI to guess.
            countExcludingTeam: rows.filter(
              (r: any) => r.membership !== "team",
            ).length,
            teamCount: rows.filter((r: any) => r.membership === "team").length,
            donors: rows,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (err: any) {
      console.error("donor-cohort error:", err);
      return new Response(JSON.stringify({ error: err?.message || "donor-cohort failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }
  }

  // GET /admin/analytics/donor-overview
  // Powers the Dashboard's Donor Overview section. Returns:
  //   - totalActive / totalInactive snapshot
  //   - current: weekly / monthly / quarterly { new, lost, net } counts + growth rates
  //   - previous: same shape, for the period immediately before each window (for vs-prev deltas)
  //   - weeklySeries: last 12 calendar weeks of { weekStart, new, lost, net } for sparklines
  // Definitions:
  //   Active donor  = role 'donor' AND has active/trialing monthly subscription
  //                   OR has donated (one-time or monthly) in last 90 days.
  //   New in window = donor whose earliest donation timestamp falls inside the window.
  //   Lost in window = monthly_donations row whose status flipped to cancelled/past_due/unpaid
  //                    inside the window (approximated via updated_at).
  if (method === "GET" && route === "/admin/analytics/donor-overview") {
    try {
      const now = new Date();
      const ms = (days: number) => days * 24 * 60 * 60 * 1000;
      const isoDaysAgo = (days: number) =>
        new Date(now.getTime() - ms(days)).toISOString();

      // Windows for current period (most recent N days) and the previous
      // period immediately before that (the prior N days).
      const cur = {
        weekly: isoDaysAgo(7),
        monthly: isoDaysAgo(30),
        quarterly: isoDaysAgo(90),
        yearly: isoDaysAgo(365),
      };
      const prev = {
        weeklyStart: isoDaysAgo(14),
        weeklyEnd: cur.weekly,
        monthlyStart: isoDaysAgo(60),
        monthlyEnd: cur.monthly,
        quarterlyStart: isoDaysAgo(180),
        quarterlyEnd: cur.quarterly,
        yearlyStart: isoDaysAgo(730),
        yearlyEnd: cur.yearly,
      };
      const ninetyDaysAgo = cur.quarterly;

      // All donor users — we'll classify each as active/inactive below.
      // Team accounts are internal and comped, so they are dropped before any
      // counting. Filtered in JS rather than with .neq("invite_type","team"):
      // invite_type is null on every pre-existing donor, and in SQL
      // NULL != 'team' is NULL, not true — a .neq would have silently excluded
      // every real donor instead of just the team.
      const { data: allDonorRows, error: donorsError } = await supabase
        .from("users")
        .select("id, created_at, invite_type, coworking")
        .eq("role", "donor");
      const donors = (allDonorRows || []).filter((d: any) => !isTeamMember(d));

      if (donorsError) {
        console.error("donor-overview: users query failed", donorsError);
        return new Response(
          JSON.stringify({ error: "Failed to load donors" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      const donorIds: number[] = (donors || []).map((d: any) => d.id);

      // Active monthly subscriptions (status in active/trialing) per user.
      const { data: activeSubs } = await supabase
        .from("monthly_donations")
        .select("user_id")
        .in("user_id", donorIds.length ? donorIds : [0])
        .in("status", ["active", "trialing"]);
      const activeSubUserIds = new Set<number>(
        (activeSubs || []).map((r: any) => r.user_id),
      );

      // Anyone with a donation (monthly payment or one-time gift) in last 90d.
      const { data: recentMonthlyPayments } = await supabase
        .from("monthly_donations")
        .select("user_id, last_payment_date")
        .in("user_id", donorIds.length ? donorIds : [0])
        .gte("last_payment_date", ninetyDaysAgo.split("T")[0]);
      const { data: recentOneTime } = await supabase
        .from("one_time_gifts")
        .select("user_id, created_at")
        .in("user_id", donorIds.length ? donorIds : [0])
        .eq("status", "completed")
        .gte("created_at", ninetyDaysAgo);

      const recentlyDonatedUserIds = new Set<number>([
        ...(recentMonthlyPayments || []).map((r: any) => r.user_id),
        ...(recentOneTime || []).map((r: any) => r.user_id),
      ]);
      // A coworking member never gets a monthly_donations row: their seat is
      // billed by the coworking space, outside Stripe. Active was defined as
      // "has a live subscription or has paid recently", both of which read that
      // table, so every coworking member was being counted as INACTIVE while
      // their space was paying for them every month. They are giving donors and
      // they count as active.
      const coworkingUserIds = new Set<number>(
        (donors || [])
          .filter((d: any) => membershipOf(d) === "coworking")
          .map((d: any) => d.id),
      );

      const activeUserIds = new Set<number>([
        ...activeSubUserIds,
        ...recentlyDonatedUserIds,
        ...coworkingUserIds,
      ]);

      const totalActive = activeUserIds.size;
      const totalInactive = (donors || []).length - totalActive;

      // Membership split of the donor base. The $3 platform fee arrives by two
      // different routes, so knowing the size of each group is what makes the
      // fee total checkable by hand: general donors pay it inside their Stripe
      // charge, coworking members pay it inside their $18 membership.
      const coworkingTotal = coworkingUserIds.size;
      const generalTotal = (donors || []).length - coworkingTotal;
      const membership = {
        coworking: coworkingTotal,
        general: generalTotal,
        // General donors with a live subscription or a payment in the last 90
        // days. There is deliberately no coworkingActive counterpart: we get no
        // feed from the coworking spaces, so we cannot know when a seat lapses.
        // Every coworking member is treated as active, which makes such a field
        // equal to `coworking` by construction — a number that looks measured
        // but never varies is worse than no number.
        generalActive: totalActive - coworkingTotal,
      };

      // First donation timestamp per donor, used to identify "new in window".
      const { data: allMonthlyPayments } = await supabase
        .from("monthly_donations")
        .select("user_id, last_payment_date")
        .in("user_id", donorIds.length ? donorIds : [0])
        .not("last_payment_date", "is", null);
      const { data: allOneTime } = await supabase
        .from("one_time_gifts")
        .select("user_id, created_at")
        .in("user_id", donorIds.length ? donorIds : [0])
        .eq("status", "completed");

      const firstDonationByUser = new Map<number, string>();
      for (const row of allMonthlyPayments || []) {
        const ts = `${row.last_payment_date}T00:00:00Z`;
        const cur = firstDonationByUser.get(row.user_id);
        if (!cur || ts < cur) firstDonationByUser.set(row.user_id, ts);
      }
      for (const row of allOneTime || []) {
        const ts = row.created_at;
        if (!ts) continue;
        const cur = firstDonationByUser.get(row.user_id);
        if (!cur || ts < cur) firstDonationByUser.set(row.user_id, ts);
      }
      // A coworking member's giving starts the moment they finish signup, but
      // it leaves no donation row for either query above to find, so they could
      // never appear as a new donor no matter how recently they joined. Their
      // signup date IS their first gift date. Applied here and in donor-cohort
      // with the same rule, so the drill-through count still equals the card.
      for (const d of donors || []) {
        if (membershipOf(d) !== "coworking") continue;
        if (!d.created_at) continue;
        const cur = firstDonationByUser.get(d.id);
        if (!cur || d.created_at < cur) {
          firstDonationByUser.set(d.id, d.created_at);
        }
      }

      // Count "new" donors whose first donation falls in [sinceIso, untilIso).
      // If untilIso is undefined, the window has no upper bound (i.e., "since X to now").
      const countNewBetween = (sinceIso: string, untilIso?: string) => {
        let n = 0;
        for (const ts of firstDonationByUser.values()) {
          if (ts >= sinceIso && (!untilIso || ts < untilIso)) n += 1;
        }
        return n;
      };

      // Lost = monthly_donations rows flipped to cancelled/past_due/unpaid within
      // the window. Pull rows from up to 180 days ago to cover the prev-quarter window.
      const { data: lostRows } = await supabase
        .from("monthly_donations")
        .select("user_id, status, updated_at")
        .in("status", ["cancelled", "past_due", "unpaid"])
        .gte("updated_at", prev.quarterlyStart);

      const countLostBetween = (sinceIso: string, untilIso?: string) => {
        const lostUsers = new Set<number>();
        for (const row of lostRows || []) {
          if (
            row.updated_at &&
            row.updated_at >= sinceIso &&
            (!untilIso || row.updated_at < untilIso)
          ) {
            lostUsers.add(row.user_id);
          }
        }
        return lostUsers.size;
      };

      // Current windows (from N days ago to now).
      const newWeekly = countNewBetween(cur.weekly);
      const newMonthly = countNewBetween(cur.monthly);
      const newQuarterly = countNewBetween(cur.quarterly);
      const newYearly = countNewBetween(cur.yearly);
      const lostWeekly = countLostBetween(cur.weekly);
      const lostMonthly = countLostBetween(cur.monthly);
      const lostQuarterly = countLostBetween(cur.quarterly);
      const lostYearly = countLostBetween(cur.yearly);

      // Previous windows (the period immediately before each current window).
      const prevNewWeekly = countNewBetween(prev.weeklyStart, prev.weeklyEnd);
      const prevNewMonthly = countNewBetween(prev.monthlyStart, prev.monthlyEnd);
      const prevNewQuarterly = countNewBetween(
        prev.quarterlyStart,
        prev.quarterlyEnd,
      );
      const prevNewYearly = countNewBetween(prev.yearlyStart, prev.yearlyEnd);
      const prevLostWeekly = countLostBetween(prev.weeklyStart, prev.weeklyEnd);
      const prevLostMonthly = countLostBetween(
        prev.monthlyStart,
        prev.monthlyEnd,
      );
      const prevLostQuarterly = countLostBetween(
        prev.quarterlyStart,
        prev.quarterlyEnd,
      );
      const prevLostYearly = countLostBetween(
        prev.yearlyStart,
        prev.yearlyEnd,
      );

      // Platform fee revenue = count of paid monthly donations in the window × $3.
      // Uses monthly_donations.last_payment_date as the canonical source — matches
      // what the Reporting page reads, so the two pages reconcile exactly.
      // (transactions table can lag for legacy invoices where the webhook didn't
      // log a row; monthly_donations is always stamped via subscribe/sync/backfill.)
      //
      // Caveat: monthly_donations only stores the MOST RECENT payment per sub, so
      // for windows longer than a month this under-counts repeat payments. For
      // current scale (everyone within their first or second invoice) this is exact.
      const SERVICE_FEE = 3.0;
      const yearlyDateStart = prev.yearlyStart.split("T")[0];
      const { data: paidMonthly } = await supabase
        .from("monthly_donations")
        .select("user_id, last_payment_date")
        .not("last_payment_date", "is", null)
        .gte("last_payment_date", yearlyDateStart);
      const countPaidBetween = (sinceIso: string, untilIso?: string) => {
        const sinceDate = sinceIso.split("T")[0];
        const untilDate = untilIso ? untilIso.split("T")[0] : undefined;
        let n = 0;
        for (const r of paidMonthly || []) {
          const lpd = r.last_payment_date as string;
          if (!lpd) continue;
          if (lpd >= sinceDate && (!untilDate || lpd < untilDate)) n += 1;
        }
        return n;
      };
      const platformWeekly = countPaidBetween(cur.weekly);
      const platformMonthly = countPaidBetween(cur.monthly);
      const platformQuarterly = countPaidBetween(cur.quarterly);
      const platformYearly = countPaidBetween(cur.yearly);
      const prevPlatformWeekly = countPaidBetween(
        prev.weeklyStart,
        prev.weeklyEnd,
      );
      const prevPlatformMonthly = countPaidBetween(
        prev.monthlyStart,
        prev.monthlyEnd,
      );
      const prevPlatformQuarterly = countPaidBetween(
        prev.quarterlyStart,
        prev.quarterlyEnd,
      );
      const prevPlatformYearly = countPaidBetween(
        prev.yearlyStart,
        prev.yearlyEnd,
      );

      // 12-week sparkline series. Buckets are aligned to Monday-start weeks.
      const weeklySeries: Array<{
        weekStart: string;
        new: number;
        lost: number;
        net: number;
      }> = [];
      const dayMs = 24 * 60 * 60 * 1000;
      // Find the Monday of the current week.
      const currentMonday = new Date(now);
      const dayOfWeek = currentMonday.getUTCDay();
      const daysToMonday = (dayOfWeek + 6) % 7;
      currentMonday.setUTCDate(currentMonday.getUTCDate() - daysToMonday);
      currentMonday.setUTCHours(0, 0, 0, 0);
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(currentMonday.getTime() - i * 7 * dayMs);
        const weekEnd = new Date(weekStart.getTime() + 7 * dayMs);
        const startIso = weekStart.toISOString();
        const endIso = weekEnd.toISOString();
        const n = countNewBetween(startIso, endIso);
        const l = countLostBetween(startIso, endIso);
        weeklySeries.push({
          weekStart: startIso.split("T")[0],
          new: n,
          lost: l,
          net: n - l,
        });
      }

      // Period rate = |change| / starting_total_before_change × 100.
      // For new donors:  newC      / (totalActive - newC)
      // For lost donors: lostC     / (totalActive + lostC)   [starting was higher by lostC]
      // For net change:  netC      / (totalActive - netC)
      const rateForDelta = (
        magnitude: number,
        signedDelta: number,
      ): number | null => {
        const starting = totalActive - signedDelta;
        if (starting <= 0 || magnitude === 0) return magnitude === 0 ? 0 : null;
        return Math.round((magnitude / starting) * 1000) / 10; // one decimal
      };

      const buildBlock = (
        newC: number,
        lostC: number,
        platformCount: number,
      ) => {
        const net = newC - lostC;
        return {
          new: { count: newC, growthRate: rateForDelta(newC, newC) },
          lost: { count: lostC, lossRate: rateForDelta(lostC, -lostC) },
          net: { count: net, growthRate: rateForDelta(Math.abs(net), net) },
          platformFee: {
            count: platformCount,
            total: Math.round(platformCount * SERVICE_FEE * 100) / 100,
          },
        };
      };

      // Simple counts for the previous-period block (frontend computes delta).
      const buildPrevBlock = (
        newC: number,
        lostC: number,
        platformCount: number,
      ) => ({
        new: { count: newC },
        lost: { count: lostC },
        net: { count: newC - lostC },
        platformFee: {
          count: platformCount,
          total: Math.round(platformCount * SERVICE_FEE * 100) / 100,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            totalActive,
            totalInactive,
            // How the donor base splits, and where the $3 comes from for each
            // half. Deliberately NOT folded into platformFee.total: that figure
            // counts paid Stripe invoices in the selected window, and coworking
            // money never passes through Stripe, so adding the two would mix a
            // windowed count with a monthly run-rate. Kept separate so each
            // number still means one thing.
            membership,
            platformFeeCoworking: {
              // Per month, not per selected window. A coworking seat is billed
              // $18 by the space ($15 donation + the $3 fee) on its own cycle,
              // which we do not see, so a window count would be invented.
              count: coworkingTotal,
              monthlyTotal: Math.round(coworkingTotal * SERVICE_FEE * 100) / 100,
            },
            current: {
              weekly: buildBlock(newWeekly, lostWeekly, platformWeekly),
              monthly: buildBlock(newMonthly, lostMonthly, platformMonthly),
              quarterly: buildBlock(
                newQuarterly,
                lostQuarterly,
                platformQuarterly,
              ),
              yearly: buildBlock(newYearly, lostYearly, platformYearly),
            },
            previous: {
              weekly: buildPrevBlock(
                prevNewWeekly,
                prevLostWeekly,
                prevPlatformWeekly,
              ),
              monthly: buildPrevBlock(
                prevNewMonthly,
                prevLostMonthly,
                prevPlatformMonthly,
              ),
              quarterly: buildPrevBlock(
                prevNewQuarterly,
                prevLostQuarterly,
                prevPlatformQuarterly,
              ),
              yearly: buildPrevBlock(
                prevNewYearly,
                prevLostYearly,
                prevPlatformYearly,
              ),
            },
            weeklySeries,
            // Backwards-compat: also expose at the top level so older clients
            // (still reading data.weekly/monthly/quarterly) don't break.
            weekly: buildBlock(newWeekly, lostWeekly, platformWeekly),
            monthly: buildBlock(newMonthly, lostMonthly, platformMonthly),
            quarterly: buildBlock(
              newQuarterly,
              lostQuarterly,
              platformQuarterly,
            ),
            yearly: buildBlock(newYearly, lostYearly, platformYearly),
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (err: any) {
      console.error("donor-overview error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "donor-overview failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /admin/analytics/donor-charts
  // Returns the four supporting Donor Overview charts:
  //   - donorCountSeries: last 12 calendar months of { month, new, lost, net }
  //   - donorSources:     bucketed counts by acquisition channel
  //   - donorsByLocation: top cities by donor count
  //   - growthByLocation: top cities by % growth (last 90d vs prior 90d)
  if (method === "GET" && route === "/admin/analytics/donor-charts") {
    try {
      // ---- Donors snapshot (used by multiple charts) ----
      const { data: allDonorRows, error: donorsError } = await supabase
        .from("users")
        .select(
          "id, email, created_at, city, state, invite_type, coworking",
        )
        .eq("role", "donor");
      // Internal team accounts stay out of every donor chart.
      const donors = (allDonorRows || []).filter((d: any) => !isTeamMember(d));
      if (donorsError) {
        console.error("donor-charts: users query failed", donorsError);
        return new Response(
          JSON.stringify({ error: "Failed to load donors" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }
      const donorIds: number[] = (donors || []).map((d: any) => d.id);
      const idsForQuery = donorIds.length ? donorIds : [0];

      // ---- First-donation timestamp per donor ----
      const { data: monthlyPayments } = await supabase
        .from("monthly_donations")
        .select("user_id, last_payment_date")
        .in("user_id", idsForQuery)
        .not("last_payment_date", "is", null);
      const { data: oneTime } = await supabase
        .from("one_time_gifts")
        .select("user_id, created_at")
        .in("user_id", idsForQuery)
        .eq("status", "completed");
      const firstDonationByUser = new Map<number, string>();
      for (const row of monthlyPayments || []) {
        const ts = `${row.last_payment_date}T00:00:00Z`;
        const cur = firstDonationByUser.get(row.user_id);
        if (!cur || ts < cur) firstDonationByUser.set(row.user_id, ts);
      }
      for (const row of oneTime || []) {
        if (!row.created_at) continue;
        const cur = firstDonationByUser.get(row.user_id);
        if (!cur || row.created_at < cur)
          firstDonationByUser.set(row.user_id, row.created_at);
      }

      // ---- Lost (cancelled/past_due/unpaid) sub-rows for last ~14 months ----
      const fourteenMonthsAgo = new Date();
      fourteenMonthsAgo.setMonth(fourteenMonthsAgo.getMonth() - 14);
      const { data: lostRows } = await supabase
        .from("monthly_donations")
        .select("user_id, status, updated_at")
        .in("status", ["cancelled", "past_due", "unpaid"])
        .gte("updated_at", fourteenMonthsAgo.toISOString());

      // ---- 1. donorCountSeries (last 12 calendar months) ----
      // Bucket by YYYY-MM. Iterate firstDonationByUser and lostRows.
      const now = new Date();
      const months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push(ym);
      }
      const monthIndex: Record<string, number> = Object.fromEntries(
        months.map((m, i) => [m, i]),
      );
      const newByMonth = new Array(months.length).fill(0);
      const lostByMonth = new Array(months.length).fill(0);
      for (const ts of firstDonationByUser.values()) {
        const ym = ts.slice(0, 7);
        if (monthIndex[ym] !== undefined) newByMonth[monthIndex[ym]] += 1;
      }
      const lostUserMonth = new Set<string>(); // dedupe per user+month
      for (const row of lostRows || []) {
        if (!row.updated_at) continue;
        const ym = row.updated_at.slice(0, 7);
        if (monthIndex[ym] === undefined) continue;
        const key = `${row.user_id}|${ym}`;
        if (lostUserMonth.has(key)) continue;
        lostUserMonth.add(key);
        lostByMonth[monthIndex[ym]] += 1;
      }
      const donorCountSeries = months.map((m, i) => ({
        month: m,
        new: newByMonth[i],
        lost: lostByMonth[i],
        net: newByMonth[i] - lostByMonth[i],
      }));

      // ---- 2. donorSources (Admin Invited / Referred / Direct) ----
      // Pull all referral records to know who came in via another donor.
      const { data: referrals } = await supabase
        .from("referrals")
        .select("referred_user_id");
      const referredUserIds = new Set<number>(
        (referrals || [])
          .map((r: any) => r.referred_user_id)
          .filter((id: any) => id != null),
      );
      // An admin invitation is a row in `invitations`, which is keyed by the
      // email address it was sent to.
      //
      // This deliberately does not read invite_type. That column records
      // *membership* — "coworking", "team", "standard" — and auth.ts writes
      // "standard" on ordinary signups as well, so treating it as an
      // invitation source labelled most of the donor base "Admin Invited"
      // no matter how they actually arrived. Membership and acquisition are
      // two different questions and this chart answers the second one.
      //
      // Any invitation row counts, including ones never accepted: the donor
      // did sign up, and the invitation is the reason their address was known.
      const { data: invites } = await supabase
        .from("invitations")
        .select("email");
      const invitedEmails = new Set<string>(
        (invites || [])
          .map((r: any) => String(r.email ?? "").trim().toLowerCase())
          .filter((e: string) => e !== ""),
      );

      let adminInvited = 0;
      let referredCount = 0;
      let directCount = 0;
      for (const d of donors || []) {
        const email = String(d.email ?? "").trim().toLowerCase();
        // Invitation wins over referral when both exist: the invitation is the
        // earlier and more deliberate act. Kept as if/else so the three
        // buckets always sum to the donor total.
        if (email !== "" && invitedEmails.has(email)) {
          adminInvited += 1;
        } else if (referredUserIds.has(d.id)) {
          referredCount += 1;
        } else {
          directCount += 1;
        }
      }
      const donorSources = [
        { label: "Admin Invited", count: adminInvited },
        { label: "Referred", count: referredCount },
        { label: "Direct", count: directCount },
      ];

      // ---- 3. donorsByLocation (top 10 cities by donor count) ----
      const cityCounts: Record<string, number> = {};
      for (const d of donors || []) {
        const city = (d.city || "").trim();
        const state = (d.state || "").trim();
        if (!city) continue;
        const label = state ? `${city}, ${state}` : city;
        cityCounts[label] = (cityCounts[label] || 0) + 1;
      }
      const donorsByLocation = Object.entries(cityCounts)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // ---- 4. growthByLocation (% growth: last 90d vs prior 90d, top 10) ----
      const ms = (days: number) => days * 24 * 60 * 60 * 1000;
      const ninetyAgo = new Date(now.getTime() - ms(90)).toISOString();
      const oneEightyAgo = new Date(now.getTime() - ms(180)).toISOString();
      const cityRecent: Record<string, number> = {};
      const cityPrior: Record<string, number> = {};
      for (const d of donors || []) {
        const city = (d.city || "").trim();
        const state = (d.state || "").trim();
        if (!city) continue;
        const label = state ? `${city}, ${state}` : city;
        if (!d.created_at) continue;
        if (d.created_at >= ninetyAgo) {
          cityRecent[label] = (cityRecent[label] || 0) + 1;
        } else if (d.created_at >= oneEightyAgo) {
          cityPrior[label] = (cityPrior[label] || 0) + 1;
        }
      }
      const cities = new Set([
        ...Object.keys(cityRecent),
        ...Object.keys(cityPrior),
      ]);
      const growthByLocation = Array.from(cities)
        .map((city) => {
          const recent = cityRecent[city] || 0;
          const prior = cityPrior[city] || 0;
          const growthRate =
            prior === 0
              ? recent > 0
                ? 100
                : 0
              : Math.round(((recent - prior) / prior) * 1000) / 10;
          return { city, recent, prior, growthRate };
        })
        .sort((a, b) => b.growthRate - a.growthRate)
        .slice(0, 10);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            donorCountSeries,
            donorSources,
            donorsByLocation,
            growthByLocation,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (err: any) {
      console.error("donor-charts error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "donor-charts failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /admin/analytics/donation-overview
  // Powers the Dashboard's Donation & Beneficiary Overview section: KPI cards
  // (Monthly Donations / Total Donations / Total Beneficiaries) plus four charts
  // (Donation Trends line, Most Selected Beneficiary, Donations by Location,
  // Most Total Donations by Beneficiary).
  if (method === "GET" && route === "/admin/analytics/donation-overview") {
    try {
      const now = new Date();

      // --- Active beneficiaries snapshot ---
      const { data: charities } = await supabase
        .from("charities")
        .select("id, name, is_active");
      const charityNameById: Record<number, string> = {};
      let totalBeneficiaries = 0;
      for (const c of charities || []) {
        if (c.is_active) totalBeneficiaries += 1;
        charityNameById[c.id] = c.name;
      }

      // The Dashboard surfaces "donation" numbers (the amount the donor chose),
      // not the gross they paid. Monthly subscriptions store the GROSS in
      // monthly_donations.last_payment_amount (donation + $3 service fee + any
      // cc cover the donor opted into). One-time gifts already store the
      // donation amount directly.
      //
      // Reverse-engineer the donor's chosen amount from the gross by matching
      // it against the three formulas the app has shipped:
      //   (a) no fee cover:    gross = donation + 3
      //   (b) legacy 3.5%:     gross = (donation + 3) * 1.035
      //   (c) new gross-up:    gross = ceil((donation + 3 + 0.30) / 0.978)
      // Same heuristic used by app/(tabs)/menu/transactionDetails.js so admin
      // and donor receipts agree on the donation amount.
      const SERVICE_FEE = 3.0;
      const STRIPE_FEE_PERCENT = 0.022;
      const STRIPE_FIXED_FEE = 0.30;
      const LEGACY_CC_RATE = 0.035;
      const inferMonthlyDonation = (gross: number): number => {
        const g = Math.round(gross * 100) / 100;
        if (g <= 0) return 0;
        // (a): donation = gross - 3, if it's a whole-dollar amount.
        const aDonation = Math.round((g - SERVICE_FEE) * 100) / 100;
        if (
          aDonation > 0 &&
          Math.abs(aDonation - Math.round(aDonation)) < 0.005
        ) {
          return Math.round(aDonation);
        }
        // (b): legacy 3.5% cover.
        const bRounded = Math.round(g / (1 + LEGACY_CC_RATE) - SERVICE_FEE);
        const bExpected =
          Math.round(
            (bRounded + SERVICE_FEE) * (1 + LEGACY_CC_RATE) * 100,
          ) / 100;
        if (bRounded > 0 && Math.abs(g - bExpected) < 0.05) return bRounded;
        // (c): new gross-up.
        const cRounded = Math.round(
          g * (1 - STRIPE_FEE_PERCENT) - SERVICE_FEE - STRIPE_FIXED_FEE,
        );
        const cExpected =
          Math.ceil(
            ((cRounded + SERVICE_FEE + STRIPE_FIXED_FEE) /
              (1 - STRIPE_FEE_PERCENT)) *
              100,
          ) / 100;
        if (cRounded > 0 && Math.abs(g - cExpected) < 0.05) return cRounded;
        // Fallback: assume gross = donation + service fee only.
        return Math.max(0, Math.round(g - SERVICE_FEE));
      };
      const donationAmount = (txnType: string, amount: number) =>
        txnType === "monthly_donation"
          ? inferMonthlyDonation(amount)
          : amount;

      // --- Active monthly subs for the Monthly Donations card ---
      const { data: activeSubs } = await supabase
        .from("monthly_donations")
        .select("amount, last_payment_amount, status")
        .in("status", ["active", "trialing"]);
      let monthlyRecurringTotal = 0;
      const activeSubCount = (activeSubs || []).length;
      for (const s of activeSubs || []) {
        const gross = parseFloat(
          (s.last_payment_amount ?? s.amount ?? 0).toString(),
        );
        if (Number.isNaN(gross)) continue;
        // Reverse-engineer the donor's chosen amount from the gross so this
        // card reflects "what was donated" rather than "what was charged".
        monthlyRecurringTotal += inferMonthlyDonation(gross);
      }
      const monthlyRecurringAvg =
        activeSubCount > 0 ? monthlyRecurringTotal / activeSubCount : 0;

      // --- Lifetime totals from transactions (the canonical source) ---
      // type='monthly_donation' for each invoice paid; 'one_time_gift' for each gift.
      const { data: txns } = await supabase
        .from("transactions")
        .select("user_id, type, amount, beneficiary_id, created_at, status")
        .eq("status", "completed");
      let lifetimeRecurring = 0;
      let lifetimeOneTime = 0;
      for (const t of txns || []) {
        const amt = parseFloat((t.amount ?? 0).toString());
        if (Number.isNaN(amt)) continue;
        const donation = donationAmount(t.type, amt);
        if (t.type === "monthly_donation") lifetimeRecurring += donation;
        else if (t.type === "one_time_gift") lifetimeOneTime += donation;
      }
      const lifetimeTotal = lifetimeRecurring + lifetimeOneTime;
      const pct = (n: number) =>
        lifetimeTotal > 0
          ? Math.round((n / lifetimeTotal) * 1000) / 10
          : 0;

      // --- Donation Trends (last 12 calendar months) ---
      const months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push(ym);
      }
      const monthIdx: Record<string, number> = Object.fromEntries(
        months.map((m, i) => [m, i]),
      );
      const recurringByMonth = new Array(12).fill(0);
      const oneTimeByMonth = new Array(12).fill(0);
      for (const t of txns || []) {
        if (!t.created_at) continue;
        const ym = t.created_at.slice(0, 7);
        const idx = monthIdx[ym];
        if (idx === undefined) continue;
        const amt = parseFloat((t.amount ?? 0).toString());
        if (Number.isNaN(amt)) continue;
        const donation = donationAmount(t.type, amt);
        if (t.type === "monthly_donation") recurringByMonth[idx] += donation;
        else if (t.type === "one_time_gift") oneTimeByMonth[idx] += donation;
      }
      const donationTrends = months.map((m, i) => ({
        month: m,
        recurring: Math.round(recurringByMonth[i] * 100) / 100,
        oneTime: Math.round(oneTimeByMonth[i] * 100) / 100,
        total:
          Math.round((recurringByMonth[i] + oneTimeByMonth[i]) * 100) / 100,
      }));

      // --- Most Selected Beneficiary (counts of users.preferences.preferredCharity) ---
      // This is the chart the exclusion matters most for: a team member picks
      // a cause purely to exercise the app, and counting it would overstate
      // real donor demand for that charity.
      const { data: donorsForSelectRaw } = await supabase
        .from("users")
        .select("id, preferences, city, state, invite_type, coworking")
        .eq("role", "donor");
      const donorsForSelect = (donorsForSelectRaw || []).filter(
        (d: any) => !isTeamMember(d),
      );
      const selectionCount: Record<number, number> = {};
      for (const d of donorsForSelect || []) {
        const prefId =
          d.preferences?.preferredCharity ?? d.preferences?.beneficiary ?? null;
        const idNum = prefId ? parseInt(prefId, 10) : NaN;
        if (Number.isNaN(idNum)) continue;
        selectionCount[idNum] = (selectionCount[idNum] || 0) + 1;
      }
      const mostSelectedBeneficiaries = Object.entries(selectionCount)
        .map(([id, count]) => ({
          beneficiaryId: Number(id),
          name: charityNameById[Number(id)] || `Beneficiary ${id}`,
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // --- Donations by Location (sum of donor donations grouped by city) ---
      const userCity: Record<number, string> = {};
      for (const d of donorsForSelect || []) {
        const city = (d.city || "").trim();
        const state = (d.state || "").trim();
        if (!city) continue;
        userCity[d.id] = state ? `${city}, ${state}` : city;
      }
      const cityTotals: Record<string, number> = {};
      for (const t of txns || []) {
        const label = userCity[t.user_id];
        if (!label) continue;
        const amt = parseFloat((t.amount ?? 0).toString());
        if (Number.isNaN(amt)) continue;
        cityTotals[label] =
          (cityTotals[label] || 0) + donationAmount(t.type, amt);
      }
      const donationsByLocation = Object.entries(cityTotals)
        .map(([city, total]) => ({
          city,
          total: Math.round(total * 100) / 100,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      // --- Top Beneficiaries by Donation $ Received ---
      const beneficiaryTotals: Record<number, number> = {};
      for (const t of txns || []) {
        if (!t.beneficiary_id) continue;
        const amt = parseFloat((t.amount ?? 0).toString());
        if (Number.isNaN(amt)) continue;
        beneficiaryTotals[t.beneficiary_id] =
          (beneficiaryTotals[t.beneficiary_id] || 0) +
          donationAmount(t.type, amt);
      }
      const topBeneficiariesByDonations = Object.entries(beneficiaryTotals)
        .map(([id, total]) => ({
          beneficiaryId: Number(id),
          name: charityNameById[Number(id)] || `Beneficiary ${id}`,
          total: Math.round(total * 100) / 100,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            totalBeneficiaries,
            monthlyRecurring: {
              total: Math.round(monthlyRecurringTotal * 100) / 100,
              avg: Math.round(monthlyRecurringAvg * 100) / 100,
              activeSubCount,
            },
            donations: {
              lifetimeTotal: Math.round(lifetimeTotal * 100) / 100,
              recurring: {
                total: Math.round(lifetimeRecurring * 100) / 100,
                pct: pct(lifetimeRecurring),
              },
              oneTime: {
                total: Math.round(lifetimeOneTime * 100) / 100,
                pct: pct(lifetimeOneTime),
              },
            },
            donationTrends,
            mostSelectedBeneficiaries,
            donationsByLocation,
            topBeneficiariesByDonations,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (err: any) {
      console.error("donation-overview error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "donation-overview failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /admin/analytics/savings-overview
  // Powers the Dashboard's Savings & Vendor Overview section: KPI cards
  // (Monthly Savings / Total Savings / Total Vendors) plus four charts
  // (Savings Trends line, top vendors by $ saved, savings by location,
  // top vendors by redemption count).
  if (method === "GET" && route === "/admin/analytics/savings-overview") {
    try {
      const now = new Date();

      // Active vendors snapshot + id→name lookup.
      const { data: vendors } = await supabase
        .from("vendors")
        .select("id, name, is_active");
      const vendorNameById: Record<number, string> = {};
      let totalVendors = 0;
      for (const v of vendors || []) {
        if (v.is_active) totalVendors += 1;
        vendorNameById[v.id] = v.name;
      }

      // Donor city map for the by-location aggregation.
      const { data: donorsForCity } = await supabase
        .from("users")
        .select("id, city, state")
        .eq("role", "donor");
      const userCity: Record<number, string> = {};
      for (const d of donorsForCity || []) {
        const city = (d.city || "").trim();
        const state = (d.state || "").trim();
        if (!city) continue;
        userCity[d.id] = state ? `${city}, ${state}` : city;
      }

      // Pull every redemption — small enough to aggregate in JS.
      const { data: redemptions } = await supabase
        .from("redemptions")
        .select(
          "id, user_id, vendor_id, redeemed_at, total_bill, total_savings",
        );

      // Current month boundary (last 30 days, rolling).
      const ms = (days: number) => days * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = new Date(now.getTime() - ms(30)).toISOString();

      // --- Monthly + Total savings ---
      let monthlyCount = 0;
      let monthlyTotal = 0;
      let monthlyDonors = new Set<number>();
      let allCount = 0;
      let allTotal = 0;
      for (const r of redemptions || []) {
        allCount += 1;
        const saved = parseFloat((r.total_savings ?? 0).toString());
        if (!Number.isNaN(saved)) allTotal += saved;
        if (r.redeemed_at && r.redeemed_at >= thirtyDaysAgo) {
          monthlyCount += 1;
          if (!Number.isNaN(saved)) monthlyTotal += saved;
          if (r.user_id != null) monthlyDonors.add(r.user_id);
        }
      }
      const monthlyAvgPerDonor =
        monthlyDonors.size > 0 ? monthlyTotal / monthlyDonors.size : 0;

      // --- Savings Trends (last 12 calendar months) ---
      const months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push(ym);
      }
      const monthIdx: Record<string, number> = Object.fromEntries(
        months.map((m, i) => [m, i]),
      );
      const savingsByMonth = new Array(12).fill(0);
      const countByMonth = new Array(12).fill(0);
      for (const r of redemptions || []) {
        if (!r.redeemed_at) continue;
        const ym = r.redeemed_at.slice(0, 7);
        const idx = monthIdx[ym];
        if (idx === undefined) continue;
        const saved = parseFloat((r.total_savings ?? 0).toString());
        if (!Number.isNaN(saved)) savingsByMonth[idx] += saved;
        countByMonth[idx] += 1;
      }
      const savingsTrends = months.map((m, i) => ({
        month: m,
        total: Math.round(savingsByMonth[i] * 100) / 100,
        count: countByMonth[i],
      }));

      // --- Top vendors by $ saved ---
      const dollarsByVendor: Record<number, number> = {};
      const countsByVendor: Record<number, number> = {};
      const cityTotals: Record<string, number> = {};
      for (const r of redemptions || []) {
        const saved = parseFloat((r.total_savings ?? 0).toString());
        if (r.vendor_id != null) {
          if (!Number.isNaN(saved)) {
            dollarsByVendor[r.vendor_id] =
              (dollarsByVendor[r.vendor_id] || 0) + saved;
          }
          countsByVendor[r.vendor_id] =
            (countsByVendor[r.vendor_id] || 0) + 1;
        }
        const cityLabel = r.user_id != null ? userCity[r.user_id] : undefined;
        if (cityLabel && !Number.isNaN(saved)) {
          cityTotals[cityLabel] = (cityTotals[cityLabel] || 0) + saved;
        }
      }
      const topVendorsByDollars = Object.entries(dollarsByVendor)
        .map(([id, total]) => ({
          vendorId: Number(id),
          name: vendorNameById[Number(id)] || `Vendor ${id}`,
          total: Math.round(total * 100) / 100,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const topVendorsByCount = Object.entries(countsByVendor)
        .map(([id, count]) => ({
          vendorId: Number(id),
          name: vendorNameById[Number(id)] || `Vendor ${id}`,
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const savingsByLocation = Object.entries(cityTotals)
        .map(([city, total]) => ({
          city,
          total: Math.round(total * 100) / 100,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            totalVendors,
            monthlySavings: {
              count: monthlyCount,
              total: Math.round(monthlyTotal * 100) / 100,
              avgPerDonor: Math.round(monthlyAvgPerDonor * 100) / 100,
              uniqueDonors: monthlyDonors.size,
            },
            totalSavings: {
              count: allCount,
              total: Math.round(allTotal * 100) / 100,
            },
            savingsTrends,
            topVendorsByDollars,
            savingsByLocation,
            topVendorsByCount,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (err: any) {
      console.error("savings-overview error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "savings-overview failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /admin/analytics/leaderboard/:type
  const leaderboardMatch = route.match(
    /^\/admin\/analytics\/leaderboard\/(\w+)$/,
  );
  if (method === "GET" && leaderboardMatch) {
    const type = leaderboardMatch[1]; // 'donors', 'beneficiaries', 'vendors'
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "30d";

    // Calculate date range from period
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;
      case "1y":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case "all":
        startDate = new Date(0);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    if (type === "donors") {
      // Get top donors based on donations
      const {data: donations, error: donationsError} = await supabase
        .from("donations")
        .select("donor_id, amount")
        .eq("status", "active")
        .gte("created_at", startDate.toISOString());

      if (donationsError) {
        console.error("Error fetching donations:", donationsError);
        return new Response(
          JSON.stringify({error: "Failed to fetch leaderboard data"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Aggregate donations by donor
      const donorTotals: Record<
        number,
        {totalAmount: number; donationCount: number}
      > = {};
      donations?.forEach((donation: any) => {
        if (!donorTotals[donation.donor_id]) {
          donorTotals[donation.donor_id] = {totalAmount: 0, donationCount: 0};
        }
        donorTotals[donation.donor_id].totalAmount += parseFloat(
          donation.amount || 0,
        );
        donorTotals[donation.donor_id].donationCount += 1;
      });

      // Get donor details
      const donorIds = Object.keys(donorTotals).map((id) => parseInt(id));

      if (donorIds.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [],
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      }

      const {data: users, error: usersError} = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, phone, city, state, profile_picture_url",
        )
        .in("id", donorIds)
        .eq("role", "donor");

      if (usersError) {
        console.error("Error fetching users:", usersError);
        return new Response(
          JSON.stringify({error: "Failed to fetch leaderboard data"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Combine data and calculate points
      const leaderboard =
        users?.map((user: any) => {
          const totals = donorTotals[user.id];
          return {
            rank: 0,
            name:
              `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
              user.email.split("@")[0],
            email: user.email,
            contact: user.phone || "N/A",
            cityState: `${user.city || "N/A"}, ${user.state || "N/A"}`,
            points: Math.round(totals.totalAmount),
            avatar:
              user.first_name?.[0]?.toUpperCase() ||
              user.email[0].toUpperCase(),
            totalDonations: totals.totalAmount,
            donationCount: totals.donationCount,
          };
        }) || [];

      // Sort by points (descending) and assign ranks
      leaderboard.sort((a, b) => b.points - a.points);
      leaderboard.forEach((item, index) => {
        item.rank = index + 1;
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: leaderboard,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    }

    // For other types, return empty array for now
    return new Response(
      JSON.stringify({
        success: true,
        data: [],
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // GET /admin/analytics/referrals
  if (method === "GET" && route === "/admin/analytics/referrals") {
    try {
      const {data: referrals, error} = await supabase
        .from("referrals")
        .select("id, referrer_id, status, referral_source, created_at");

      if (error) {
        console.error("Error fetching referrals:", error);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              totalReferrals: 0,
              activeReferrers: 0,
              conversionRate: 0,
              topReferrers: [],
              referralSources: [],
            },
            warning: "Referral analytics unavailable",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      }

      const referralList = referrals || [];
      const totalReferrals = referralList.length;
      const paidReferrals = referralList.filter(
        (r: any) => r.status === "paid",
      ).length;
      const conversionRate =
        totalReferrals > 0
          ? Math.round((paidReferrals / totalReferrals) * 100)
          : 0;

      const referrerCounts: Record<string, number> = {};
      const sourceCounts: Record<string, number> = {};
      referralList.forEach((ref: any) => {
        if (ref.referrer_id) {
          const key = String(ref.referrer_id);
          referrerCounts[key] = (referrerCounts[key] || 0) + 1;
        }
        const source = ref.referral_source || "Unknown";
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      });

      const referrerIds = Object.keys(referrerCounts)
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));
      const {data: referrers} = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", referrerIds);

      const topReferrers = Object.entries(referrerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => {
          const user = referrers?.find((u: any) => String(u.id) === id);
          const name = user
            ? `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
              user.email
            : `User ${id}`;
          return {id: parseInt(id, 10), name, count};
        });

      const referralSources = Object.entries(sourceCounts).map(
        ([name, count]) => ({name, count}),
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            totalReferrals,
            activeReferrers: Object.keys(referrerCounts).length,
            conversionRate,
            topReferrers,
            referralSources,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("Error building referral analytics:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch referral analytics",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/analytics/referrals/invitations/resend - Resend reminder emails for pending referral invitations
  if (
    method === "POST" &&
    route === "/admin/analytics/referrals/invitations/resend"
  ) {
    try {
      const body = await req.json().catch(() => ({}));
      const invitationIds = Array.isArray(body?.invitationIds)
        ? body.invitationIds
        : [];

      if (invitationIds.length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "No invitation IDs provided"}),
          {
            status: 400,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // Fetch referrals by ID - only those with status 'pending'
      const {data: referrals, error: refError} = await supabase
        .from("referrals")
        .select("id, referrer_id, referred_user_id, status")
        .in("id", invitationIds)
        .eq("status", "pending");

      if (refError || !referrals || referrals.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {resent: 0, message: "No pending referrals found to resend"},
          }),
          {
            status: 200,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      const referredUserIds = referrals
        .map((r: any) => r.referred_user_id)
        .filter(Boolean);
      if (referredUserIds.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              resent: 0,
              message: "No referred users found for these referrals",
            },
          }),
          {
            status: 200,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      // Get referred users and referrers for email content
      const {data: referredUsers, error: usersError} = await supabase
        .from("users")
        .select("id, email, first_name, last_name")
        .in("id", referredUserIds);

      if (usersError || !referredUsers?.length) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch referred users",
          }),
          {
            status: 500,
            headers: {...corsHeaders, "Content-Type": "application/json"},
          },
        );
      }

      const referrerIds = [
        ...new Set(referrals.map((r: any) => r.referrer_id).filter(Boolean)),
      ];
      const {data: referrers} = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", referrerIds);

      const referrerById = (referrers || []).reduce((acc: any, r: any) => {
        acc[r.id] =
          `${r.first_name || ""} ${r.last_name || ""}`.trim() || "A friend";
        return acc;
      }, {});

      let sentCount = 0;
      const errors: string[] = [];

      for (const ref of referrals) {
        if (!ref.referred_user_id) continue;
        const user = referredUsers.find(
          (u: any) => u.id === ref.referred_user_id,
        );
        if (!user?.email) continue;

        const name =
          `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
          user.email.split("@")[0];
        const referrerName = referrerById[ref.referrer_id];

        try {
          await sendReferralReminderEmail({to: user.email, name, referrerName});
          sentCount++;
        } catch (emailErr: any) {
          console.error(
            `Failed to send referral reminder to ${user.email}:`,
            emailErr,
          );
          errors.push(`${user.email}: ${emailErr?.message || "Unknown error"}`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            resent: sentCount,
            total: referrals.length,
            message: `Resent ${sentCount} of ${referrals.length} referral reminder(s)`,
            ...(errors.length > 0 && {errors}),
          },
        }),
        {
          status: 200,
          headers: {...corsHeaders, "Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Error resending referral invitations:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message || "Failed to resend referral invitations",
        }),
        {
          status: 500,
          headers: {...corsHeaders, "Content-Type": "application/json"},
        },
      );
    }
  }

  // GET /admin/analytics/geographic
  if (method === "GET" && route === "/admin/analytics/geographic") {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "30d";

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "15d":
        startDate.setDate(now.getDate() - 15);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;
      case "180d":
        startDate.setDate(now.getDate() - 180);
        break;
      case "365d":
        startDate.setDate(now.getDate() - 365);
        break;
      case "1y":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case "all":
        startDate = new Date(0);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // ---- Donors: snapshot from users table (not just signups in period) ----
    // Donor/vendor/beneficiary counts are CURRENT totals; the period filter
    // only narrows the donation $ totals below.
    const {data: donorUsers, error: usersError} = await supabase
      .from("users")
      .select("id, city, state, country")
      .eq("role", "donor");
    if (usersError) {
      console.error(
        "Error fetching users for geographic analytics:",
        usersError,
      );
      return new Response(
        JSON.stringify({error: "Failed to fetch geographic data"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    // ---- Vendors + Beneficiaries live in their own tables, not users ----
    // (the previous version counted users.role='vendorAdmin' / 'charityAdmin',
    //  which never matches any rows and is why those columns showed 0).
    const {data: vendorRows} = await supabase
      .from("vendors")
      .select("address, is_active")
      .eq("is_active", true);
    const {data: charityRows} = await supabase
      .from("charities")
      .select("address, is_active")
      .eq("is_active", true);

    // ---- Donations: sum from monthly_donations + one_time_gifts, joined to
    // donor city via user_id. Uses the same source as Reporting + Dashboard
    // so the dollar figures reconcile across pages. (transactions table can
    // lag for legacy invoices; monthly_donations is always stamped.)
    const startDateOnly = startDate.toISOString().split("T")[0];
    const startIso = startDate.toISOString();
    const {data: monthlyRecent} = await supabase
      .from("monthly_donations")
      .select("user_id, last_payment_date, last_payment_amount")
      .not("last_payment_date", "is", null)
      .gte("last_payment_date", startDateOnly);
    const {data: oneTimeRecent} = await supabase
      .from("one_time_gifts")
      .select("user_id, created_at, amount, net_amount")
      .eq("status", "completed")
      .gte("created_at", startIso);
    // Shape into a unified list { user_id, type, amount } for the aggregation
    // loop below — matches the old `txns` interface so the rest of the code
    // doesn't need to change.
    const txns: Array<{ user_id: number; type: string; amount: number }> = [];
    for (const r of monthlyRecent || []) {
      const amt = parseFloat((r.last_payment_amount ?? 0).toString());
      if (Number.isNaN(amt)) continue;
      txns.push({
        user_id: r.user_id,
        type: "monthly_donation",
        amount: amt,
      });
    }
    for (const r of oneTimeRecent || []) {
      const amt = parseFloat((r.amount ?? r.net_amount ?? 0).toString());
      if (Number.isNaN(amt)) continue;
      txns.push({
        user_id: r.user_id,
        type: "one_time_gift",
        amount: amt,
      });
    }
    // Same fee-aware donation amount used by donation-overview.
    const SERVICE_FEE = 3.0;
    const STRIPE_FEE_PERCENT = 0.022;
    const STRIPE_FIXED_FEE = 0.30;
    const LEGACY_CC_RATE = 0.035;
    const inferDonation = (gross: number): number => {
      const g = Math.round(gross * 100) / 100;
      if (g <= 0) return 0;
      const a = Math.round((g - SERVICE_FEE) * 100) / 100;
      if (a > 0 && Math.abs(a - Math.round(a)) < 0.005) return Math.round(a);
      const bR = Math.round(g / (1 + LEGACY_CC_RATE) - SERVICE_FEE);
      const bE =
        Math.round((bR + SERVICE_FEE) * (1 + LEGACY_CC_RATE) * 100) / 100;
      if (bR > 0 && Math.abs(g - bE) < 0.05) return bR;
      const cR = Math.round(
        g * (1 - STRIPE_FEE_PERCENT) - SERVICE_FEE - STRIPE_FIXED_FEE,
      );
      const cE =
        Math.ceil(
          ((cR + SERVICE_FEE + STRIPE_FIXED_FEE) / (1 - STRIPE_FEE_PERCENT)) *
            100,
        ) / 100;
      if (cR > 0 && Math.abs(g - cE) < 0.05) return cR;
      return Math.max(0, Math.round(g - SERVICE_FEE));
    };
    const userLocation: Record<
      number,
      { city: string; state: string; country: string }
    > = {};
    for (const u of donorUsers || []) {
      userLocation[u.id] = {
        city: u.city || "Unknown",
        state: u.state || "Unknown",
        country: u.country || "Unknown",
      };
    }

    // ---- Aggregate everything by country / state / city ----
    const countryStats: Record<string, any> = {};
    const stateStats: Record<string, any> = {};
    const cityStats: Record<string, any> = {};

    const ensureBuckets = (country: string, state: string, city: string) => {
      if (!countryStats[country]) {
        countryStats[country] = {
          donors: 0,
          vendors: 0,
          beneficiaries: 0,
          totalDonations: 0,
        };
      }
      if (!stateStats[state]) {
        stateStats[state] = {
          donors: 0,
          vendors: 0,
          beneficiaries: 0,
          totalDonations: 0,
        };
      }
      const cityKey = `${city}, ${state}`;
      if (!cityStats[cityKey]) {
        cityStats[cityKey] = {
          city,
          state,
          donors: 0,
          vendors: 0,
          beneficiaries: 0,
          totalDonations: 0,
        };
      }
      return cityKey;
    };

    for (const u of donorUsers || []) {
      const country = u.country || "Unknown";
      const state = u.state || "Unknown";
      const city = u.city || "Unknown";
      const cityKey = ensureBuckets(country, state, city);
      countryStats[country].donors += 1;
      stateStats[state].donors += 1;
      cityStats[cityKey].donors += 1;
    }
    for (const v of vendorRows || []) {
      const addr = v.address || {};
      const country = addr.country || "Unknown";
      const state = addr.state || "Unknown";
      const city = addr.city || "Unknown";
      if (city === "Unknown" && state === "Unknown") continue;
      const cityKey = ensureBuckets(country, state, city);
      countryStats[country].vendors += 1;
      stateStats[state].vendors += 1;
      cityStats[cityKey].vendors += 1;
    }
    for (const c of charityRows || []) {
      const addr = c.address || {};
      const country = addr.country || "Unknown";
      const state = addr.state || "Unknown";
      const city = addr.city || "Unknown";
      if (city === "Unknown" && state === "Unknown") continue;
      const cityKey = ensureBuckets(country, state, city);
      countryStats[country].beneficiaries += 1;
      stateStats[state].beneficiaries += 1;
      cityStats[cityKey].beneficiaries += 1;
    }
    for (const t of txns || []) {
      const loc = userLocation[t.user_id];
      if (!loc) continue;
      const amt = parseFloat((t.amount ?? 0).toString());
      if (Number.isNaN(amt)) continue;
      const donation =
        t.type === "monthly_donation" ? inferDonation(amt) : amt;
      const cityKey = ensureBuckets(loc.country, loc.state, loc.city);
      countryStats[loc.country].totalDonations += donation;
      stateStats[loc.state].totalDonations += donation;
      cityStats[cityKey].totalDonations += donation;
    }

    const fmt = (n: number) =>
      n >= 1_000_000
        ? `$${(n / 1_000_000).toFixed(1)}M`
        : n >= 10_000
          ? `$${(n / 1_000).toFixed(1)}K`
          : `$${Math.round(n).toLocaleString()}`;

    // Format top countries
    const topCountries = Object.entries(countryStats)
      .map(([name, stats]: any) => ({
        name,
        donors: stats.donors,
        vendors: stats.vendors,
        beneficiaries: stats.beneficiaries,
        totalDonations: fmt(stats.totalDonations),
      }))
      .sort(
        (a, b) =>
          b.donors +
          b.vendors +
          b.beneficiaries -
          (a.donors + a.vendors + a.beneficiaries),
      )
      .slice(0, 10);

    // Format top states
    const topStates = Object.entries(stateStats)
      .map(([name, stats]: any) => ({
        name,
        donors: stats.donors,
        vendors: stats.vendors,
        beneficiaries: stats.beneficiaries,
        totalDonations: fmt(stats.totalDonations),
      }))
      .sort(
        (a, b) =>
          b.donors +
          b.vendors +
          b.beneficiaries -
          (a.donors + a.vendors + a.beneficiaries),
      )
      .slice(0, 10);

    // Format top cities
    const topCities = Object.values(cityStats)
      .map((stats: any) => ({
        city: stats.city,
        state: stats.state,
        donors: stats.donors,
        vendors: stats.vendors,
        beneficiaries: stats.beneficiaries,
        donations: fmt(stats.totalDonations),
      }))
      .sort(
        (a, b) =>
          b.donors +
          b.vendors +
          b.beneficiaries -
          (a.donors + a.vendors + a.beneficiaries),
      )
      .slice(0, 20);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          totalCountries: Object.keys(countryStats).length,
          totalStates: Object.keys(stateStats).length,
          totalCities: Object.keys(cityStats).length,
          topCountries,
          topStates,
          topCities,
        },
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  return new Response(JSON.stringify({error: "Analytics route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}
