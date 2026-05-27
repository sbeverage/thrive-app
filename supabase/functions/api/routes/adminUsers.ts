import { corsHeaders } from "../lib/cors.ts";

export async function handleAdminUsers(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/users/referrals - Get all donors with referral data
  if (method === "GET" && route === "/admin/users/referrals") {
    try {
      const url = new URL(req.url);
      const search = url.searchParams.get("search") || "";

      // Get all users with role 'donor' who have referrals
      let usersQuery = supabase
        .from("users")
        .select(
          `
          id,
          email,
          first_name,
          last_name,
          avatar_url,
          created_at
        `,
        )
        .eq("role", "donor");

      if (search) {
        usersQuery = usersQuery.or(
          `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
        );
      }

      const {data: users, error: usersError} = await usersQuery;

      if (usersError) {
        console.error("❌ Error fetching users:", usersError);
        return new Response(JSON.stringify({error: "Failed to fetch users"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        });
      }

      // For each user, get their referral stats
      const donorsWithReferrals = await Promise.all(
        (users || []).map(async (user: any) => {
          // Get all referrals for this user
          const {data: referrals, error: referralsError} = await supabase
            .from("referrals")
            .select("id, status, referral_token, created_at, first_payment_at")
            .eq("referrer_id", user.id);

          if (referralsError) {
            console.error(
              `❌ Error fetching referrals for user ${user.id}:`,
              referralsError,
            );
          }

          const allReferrals = referrals || [];
          const successfulReferrals = allReferrals.filter(
            (r: any) => r.status === "paid",
          );
          const totalReferrals = allReferrals.length;
          const conversionRate =
            totalReferrals > 0
              ? Math.round((successfulReferrals.length / totalReferrals) * 100)
              : 0;

          // Get milestones
          const {data: milestones, error: milestonesError} = await supabase
            .from("user_milestones")
            .select(
              "milestone_type, milestone_count, credit_amount, badge_name, unlocked_at",
            )
            .eq("user_id", user.id)
            .order("milestone_count", {ascending: true});

          if (milestonesError) {
            console.error(
              `❌ Error fetching milestones for user ${user.id}:`,
              milestonesError,
            );
          }

          // Get credits
          const {data: credits, error: creditsError} = await supabase
            .from("user_credits")
            .select("id, amount, status, expires_at, created_at")
            .eq("user_id", user.id);

          if (creditsError) {
            console.error(
              `❌ Error fetching credits for user ${user.id}:`,
              creditsError,
            );
          }

          const allCredits = credits || [];
          const activeCredits = allCredits
            .filter(
              (c: any) =>
                c.status === "active" && new Date(c.expires_at) > new Date(),
            )
            .reduce(
              (sum: number, c: any) => sum + parseFloat(c.amount || 0),
              0,
            );
          const totalEarned = allCredits.reduce(
            (sum: number, c: any) => sum + parseFloat(c.amount || 0),
            0,
          );
          const expired = allCredits
            .filter(
              (c: any) =>
                c.status === "expired" || new Date(c.expires_at) <= new Date(),
            )
            .reduce(
              (sum: number, c: any) => sum + parseFloat(c.amount || 0),
              0,
            );

          const fullName =
            `${user.first_name || ""} ${user.last_name || ""}`.trim();
          const name = fullName || user.email.split("@")[0];
          const avatar =
            user.avatar_url ||
            name[0]?.toUpperCase() ||
            user.email[0]?.toUpperCase() ||
            "?";

          return {
            id: user.id,
            name,
            email: user.email,
            avatar,
            totalReferrals,
            successfulReferrals: successfulReferrals.length,
            conversionRate,
            milestones: (milestones || []).length,
            activeCredits: parseFloat(activeCredits.toFixed(2)),
            referrals: allReferrals.map((r: any) => ({
              id: r.id,
              status: r.status,
              code: r.referral_token || `ref-${r.id}`,
              createdAt: r.created_at,
              firstPaymentAt: r.first_payment_at,
            })),
            milestonesList: (milestones || []).map((m: any) => ({
              type: m.milestone_type,
              count: m.milestone_count,
              creditAmount: parseFloat(m.credit_amount || 0),
              badgeName: m.badge_name,
              unlockedAt: m.unlocked_at,
            })),
            credits: {
              active: parseFloat(activeCredits.toFixed(2)),
              totalEarned: parseFloat(totalEarned.toFixed(2)),
              expired: parseFloat(expired.toFixed(2)),
            },
          };
        }),
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: donorsWithReferrals,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Admin get users referrals error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch users with referrals",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        },
      );
    }
  }

  // GET /admin/users/:userId/referrals - Get user referral details
  const userReferralsMatch = route.match(/^\/admin\/users\/(\d+)\/referrals$/);
  if (method === "GET" && userReferralsMatch) {
    try {
      const userId = parseInt(userReferralsMatch[1], 10);

      // Get user
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("id, email, first_name, last_name, avatar_url")
        .eq("id", userId)
        .single();

      if (userError || !user) {
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      // Get referrals
      const {data: referrals, error: referralsError} = await supabase
        .from("referrals")
        .select(
          `
          id,
          referred_user_id,
          status,
          referral_token,
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
        .order("created_at", {ascending: false});

      if (referralsError) {
        console.error("❌ Error fetching referrals:", referralsError);
        return new Response(
          JSON.stringify({error: "Failed to fetch referrals"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      // Get milestones
      const {data: milestones, error: milestonesError} = await supabase
        .from("user_milestones")
        .select(
          "milestone_type, milestone_count, credit_amount, badge_name, reward_description, unlocked_at",
        )
        .eq("user_id", userId)
        .order("milestone_count", {ascending: true});

      if (milestonesError) {
        console.error("❌ Error fetching milestones:", milestonesError);
      }

      // Get credits
      const {data: credits, error: creditsError} = await supabase
        .from("user_credits")
        .select(
          "id, amount, source, status, expires_at, applied_at, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", {ascending: false});

      if (creditsError) {
        console.error("❌ Error fetching credits:", creditsError);
      }

      const allReferrals = referrals || [];
      const successfulReferrals = allReferrals.filter(
        (r: any) => r.status === "paid",
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name:
                `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
                user.email.split("@")[0],
              avatar:
                user.avatar_url ||
                user.first_name?.[0]?.toUpperCase() ||
                user.email[0]?.toUpperCase() ||
                "?",
            },
            referrals: allReferrals.map((r: any) => {
              const referredUser = r.referred_user || {};
              return {
                id: r.id,
                referredUserId: r.referred_user_id,
                referredUserName:
                  referredUser.first_name && referredUser.last_name
                    ? `${referredUser.first_name} ${referredUser.last_name}`
                    : referredUser.email?.split("@")[0] || "Unknown",
                referredUserEmail: referredUser.email || "N/A",
                status: r.status,
                code: r.referral_token || `ref-${r.id}`,
                monthlyDonationAmount: r.monthly_donation_amount
                  ? parseFloat(r.monthly_donation_amount)
                  : null,
                firstPaymentAt: r.first_payment_at,
                lastPaymentAt: r.last_payment_at,
                createdAt: r.created_at,
              };
            }),
            milestones: (milestones || []).map((m: any) => ({
              type: m.milestone_type,
              count: m.milestone_count,
              creditAmount: parseFloat(m.credit_amount || 0),
              badgeName: m.badge_name,
              rewardDescription: m.reward_description,
              unlockedAt: m.unlocked_at,
            })),
            credits: (credits || []).map((c: any) => ({
              id: c.id,
              amount: parseFloat(c.amount || 0),
              source: c.source,
              status: c.status,
              expiresAt: c.expires_at,
              appliedAt: c.applied_at,
              createdAt: c.created_at,
            })),
            stats: {
              totalReferrals: allReferrals.length,
              successfulReferrals: successfulReferrals.length,
              conversionRate:
                allReferrals.length > 0
                  ? Math.round(
                      (successfulReferrals.length / allReferrals.length) * 100,
                    )
                  : 0,
            },
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Admin get user referrals error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch user referrals",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        },
      );
    }
  }

  // POST /admin/users/:userId/credits - Grant credit to user
  const grantCreditMatch = route.match(/^\/admin\/users\/(\d+)\/credits$/);
  if (method === "POST" && grantCreditMatch) {
    try {
      const userId = parseInt(grantCreditMatch[1], 10);
      const body = await req.json();
      const {amount, description, expirationDays = 90} = body;

      if (!amount || amount <= 0) {
        return new Response(
          JSON.stringify({error: "Amount must be a positive number"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Verify user exists
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("id, email")
        .eq("id", userId)
        .single();

      if (userError || !user) {
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (expirationDays || 90));

      // Create credit
      const {data: credit, error: creditError} = await supabase
        .from("user_credits")
        .insert([
          {
            user_id: userId,
            amount: parseFloat(amount),
            source: "manual_grant",
            status: "active",
            expires_at: expiresAt.toISOString(),
          },
        ])
        .select()
        .single();

      if (creditError) {
        console.error("❌ Error creating credit:", creditError);
        return new Response(JSON.stringify({error: "Failed to grant credit"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: credit.id,
            userId: credit.user_id,
            amount: parseFloat(credit.amount),
            expiresAt: credit.expires_at,
            description: description || "Manually granted credit",
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 201,
        },
      );
    } catch (error: any) {
      console.error("❌ Admin grant credit error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to grant credit"}),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Users route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}
