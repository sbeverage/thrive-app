import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";

type ReferralTier = {
  threshold: number;
  milestoneType: string;
  badgeName: string;
  title: string;
  description: string;
};

export async function handleReferralRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  reconcileReferralStatusesForReferrer: (
    supabaseClient: any,
    referrerId: number,
  ) => Promise<void>,
  referralTiers: readonly ReferralTier[],
) {
  // Get user ID from JWT token
  const authHeader = getAppAuthHeader(req);
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  const token = authHeader.substring(7);
  const jwtSecret = Deno.env.get("JWT_SECRET");

  if (!jwtSecret) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }

  let userId: number | null = null;
  try {
    const secretKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    const payload = await verifyJWT(token, secretKey);
    userId = payload.id as number;
  } catch (_error) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  // GET /referrals/info - Get referral information
  if (method === "GET" && route === "/referrals/info") {
    try {
      await reconcileReferralStatusesForReferrer(supabase, userId);

      // Get paid referrals count
      const { data: paidReferrals, error: paidError } = await supabase
        .from("referrals")
        .select(
          "id, referred_user_id, status, monthly_donation_amount, first_payment_at",
        )
        .eq("referrer_id", userId)
        .eq("status", "paid");

      if (paidError) {
        console.error("❌ Error fetching paid referrals:", paidError);
      }

      const paidCount = paidReferrals?.length || 0;

      // Get all referrals count
      const { data: allReferrals, error: allError } = await supabase
        .from("referrals")
        .select("id")
        .eq("referrer_id", userId);

      if (allError) {
        console.error("❌ Error fetching all referrals:", allError);
      }

      const totalCount = allReferrals?.length || 0;

      const milestoneTypes = referralTiers.map((t) => t.milestoneType);
      const { data: milestoneRows, error: milestonesError } = await supabase
        .from("user_milestones")
        .select(
          "milestone_type, milestone_count, badge_name, reward_description, unlocked_at",
        )
        .eq("user_id", userId)
        .in("milestone_type", milestoneTypes);

      if (milestonesError) {
        console.error("❌ Error fetching milestones:", milestonesError);
      }

      const byMilestoneType = new Map<string, { unlocked_at: string | null }>(
        (milestoneRows || []).map((r: any) => [
          r.milestone_type,
          { unlocked_at: r.unlocked_at },
        ]),
      );

      const tierPayload = referralTiers.map((t) => {
        const row = byMilestoneType.get(t.milestoneType);
        return {
          threshold: t.threshold,
          count: t.threshold,
          badgeName: t.badgeName,
          title: t.title,
          description: t.description,
          unlocked: !!row,
          earnedAt: row ? row.unlocked_at : null,
        };
      });

      const tiersUnlocked = tierPayload.filter((x) => x.unlocked).length;

      // Generate referral link
      const appBaseUrl =
        Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";
      const referralLink = `${appBaseUrl}/signup?ref=${userId}`;

      return new Response(
        JSON.stringify({
          referralLink,
          friendsCount: totalCount,
          paidFriendsCount: paidCount,
          totalEarned: "0",
          tiersTotal: referralTiers.length,
          tiersUnlocked,
          tiers: tierPayload,
          milestones: tierPayload,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Referral Info Error:", error);
      return new Response(
        JSON.stringify({ error: "Server error. Please try again later." }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /referrals/friends - Get list of referred friends
  if (method === "GET" && route === "/referrals/friends") {
    try {
      await reconcileReferralStatusesForReferrer(supabase, userId);

      // Get all referrals with user details
      const { data: referrals, error: referralsError } = await supabase
        .from("referrals")
        .select(
          `
          id,
          referred_user_id,
          status,
          monthly_donation_amount,
          first_payment_at,
          last_payment_at,
          created_at,
          referred_user:referred_user_id (
            id,
            email,
            first_name,
            last_name
          )
        `,
        )
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false });

      if (referralsError) {
        console.error("❌ Error fetching referrals:", referralsError);
        return new Response(
          JSON.stringify({ error: "Server error. Please try again later." }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      // Format friends list
      const friends = (referrals || []).map((ref: any) => {
        const user = ref.referred_user || {};
        return {
          id: user.id || ref.referred_user_id,
          name:
            user.first_name && user.last_name
              ? `${user.first_name} ${user.last_name}`
              : user.email?.split("@")[0] || "Unknown",
          email: user.email || "N/A",
          status: ref.status, // 'pending', 'signed_up', 'payment_setup', 'paid', 'cancelled'
          monthlyDonation: ref.monthly_donation_amount
            ? parseFloat(ref.monthly_donation_amount)
            : null,
          joinedAt: ref.created_at,
          firstPaymentAt: ref.first_payment_at,
        };
      });

      return new Response(JSON.stringify({ friends }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      console.error("❌ Referral Friends Error:", error);
      return new Response(
        JSON.stringify({ error: "Server error. Please try again later." }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // 404 for referral routes
  return new Response(JSON.stringify({ error: "Referral route not found" }), {
    headers: { "Content-Type": "application/json" },
    status: 404,
  });
}
