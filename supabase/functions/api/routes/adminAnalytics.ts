import { corsHeaders } from "../lib/cors.ts";

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
      };
      const prev = {
        weeklyStart: isoDaysAgo(14),
        weeklyEnd: cur.weekly,
        monthlyStart: isoDaysAgo(60),
        monthlyEnd: cur.monthly,
        quarterlyStart: isoDaysAgo(180),
        quarterlyEnd: cur.quarterly,
      };
      const ninetyDaysAgo = cur.quarterly;

      // All donor users — we'll classify each as active/inactive below.
      const { data: donors, error: donorsError } = await supabase
        .from("users")
        .select("id, created_at")
        .eq("role", "donor");

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
      const activeUserIds = new Set<number>([
        ...activeSubUserIds,
        ...recentlyDonatedUserIds,
      ]);

      const totalActive = activeUserIds.size;
      const totalInactive = (donors || []).length - totalActive;

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
      const lostWeekly = countLostBetween(cur.weekly);
      const lostMonthly = countLostBetween(cur.monthly);
      const lostQuarterly = countLostBetween(cur.quarterly);

      // Previous windows (the period immediately before each current window).
      const prevNewWeekly = countNewBetween(prev.weeklyStart, prev.weeklyEnd);
      const prevNewMonthly = countNewBetween(prev.monthlyStart, prev.monthlyEnd);
      const prevNewQuarterly = countNewBetween(
        prev.quarterlyStart,
        prev.quarterlyEnd,
      );
      const prevLostWeekly = countLostBetween(prev.weeklyStart, prev.weeklyEnd);
      const prevLostMonthly = countLostBetween(
        prev.monthlyStart,
        prev.monthlyEnd,
      );
      const prevLostQuarterly = countLostBetween(
        prev.quarterlyStart,
        prev.quarterlyEnd,
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

      const buildBlock = (newC: number, lostC: number) => {
        const net = newC - lostC;
        return {
          new: { count: newC, growthRate: rateForDelta(newC, newC) },
          lost: { count: lostC, lossRate: rateForDelta(lostC, -lostC) },
          net: { count: net, growthRate: rateForDelta(Math.abs(net), net) },
        };
      };

      // Simple counts for the previous-period block (frontend computes delta).
      const buildPrevBlock = (newC: number, lostC: number) => ({
        new: { count: newC },
        lost: { count: lostC },
        net: { count: newC - lostC },
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            totalActive,
            totalInactive,
            current: {
              weekly: buildBlock(newWeekly, lostWeekly),
              monthly: buildBlock(newMonthly, lostMonthly),
              quarterly: buildBlock(newQuarterly, lostQuarterly),
            },
            previous: {
              weekly: buildPrevBlock(prevNewWeekly, prevLostWeekly),
              monthly: buildPrevBlock(prevNewMonthly, prevLostMonthly),
              quarterly: buildPrevBlock(prevNewQuarterly, prevLostQuarterly),
            },
            weeklySeries,
            // Backwards-compat: also expose at the top level so older clients
            // (still reading data.weekly/monthly/quarterly) don't break.
            weekly: buildBlock(newWeekly, lostWeekly),
            monthly: buildBlock(newMonthly, lostMonthly),
            quarterly: buildBlock(newQuarterly, lostQuarterly),
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

    // Get users by location
    const {data: users, error: usersError} = await supabase
      .from("users")
      .select("id, city, state, country, role, created_at")
      .gte("created_at", startDate.toISOString());

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

    // Get donations for the period
    const {data: donations} = await supabase
      .from("donations")
      .select("donor_id, amount, charity_id")
      .eq("status", "active")
      .gte("created_at", startDate.toISOString());

    // Aggregate by location
    const locationStats: Record<string, any> = {};
    const countryStats: Record<string, any> = {};
    const stateStats: Record<string, any> = {};
    const cityStats: Record<string, any> = {};

    users?.forEach((user: any) => {
      const country = user.country || "Unknown";
      if (!countryStats[country]) {
        countryStats[country] = {donors: 0, vendors: 0, beneficiaries: 0};
      }
      if (user.role === "donor") countryStats[country].donors++;
      if (user.role === "vendorAdmin") countryStats[country].vendors++;
      if (user.role === "charityAdmin") countryStats[country].beneficiaries++;

      const state = user.state || "Unknown";
      if (!stateStats[state]) {
        stateStats[state] = {donors: 0, vendors: 0, beneficiaries: 0};
      }
      if (user.role === "donor") stateStats[state].donors++;
      if (user.role === "vendorAdmin") stateStats[state].vendors++;
      if (user.role === "charityAdmin") stateStats[state].beneficiaries++;

      const city = user.city || "Unknown";
      const cityKey = `${city}, ${state}`;
      if (!cityStats[cityKey]) {
        cityStats[cityKey] = {
          city,
          state,
          donors: 0,
          vendors: 0,
          beneficiaries: 0,
        };
      }
      if (user.role === "donor") cityStats[cityKey].donors++;
      if (user.role === "vendorAdmin") cityStats[cityKey].vendors++;
      if (user.role === "charityAdmin") cityStats[cityKey].beneficiaries++;
    });

    // Calculate donation totals by location
    const donationByDonor: Record<number, number> = {};
    donations?.forEach((donation: any) => {
      if (!donationByDonor[donation.donor_id]) {
        donationByDonor[donation.donor_id] = 0;
      }
      donationByDonor[donation.donor_id] += parseFloat(donation.amount || 0);
    });

    // Get donor locations for donations
    const donorIds = Object.keys(donationByDonor).map((id) => parseInt(id));
    if (donorIds.length > 0) {
      const {data: donors} = await supabase
        .from("users")
        .select("id, city, state, country")
        .in("id", donorIds);

      if (donors) {
        donors.forEach((donor: any) => {
          const state = donor.state || "Unknown";
          if (!stateStats[state]) {
            stateStats[state] = {
              donors: 0,
              vendors: 0,
              beneficiaries: 0,
              totalDonations: 0,
            };
          }
          stateStats[state].totalDonations =
            (stateStats[state].totalDonations || 0) +
            (donationByDonor[donor.id] || 0);
        });
      }
    }

    // Format top countries
    const topCountries = Object.entries(countryStats)
      .map(([name, stats]) => ({
        name,
        ...stats,
        totalDonations: "$0",
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
      .map(([name, stats]) => ({
        name,
        ...stats,
        totalDonations: stats.totalDonations
          ? `$${stats.totalDonations.toFixed(2)}`
          : "$0",
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
        donations: "$0",
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
