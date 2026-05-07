import { getStripeClient } from "../lib/stripe.ts";

export type FormatCharityResponseFn = (charity: any) => any;

export async function handleCharityRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  formatCharityResponse: FormatCharityResponseFn,
) {
  // GET /charities (public)
  if (method === "GET" && route === "/charities") {
    try {
      // Get query parameters for filtering
      const url = new URL(req.url);
      const category = url.searchParams.get("category");
      const isActive = url.searchParams.get("isActive");

      let query = supabase.from("charities").select("*");

      // Filter by category if provided
      if (category && category !== "All") {
        query = query.eq("category", category);
      }

      // Only show active charities (is_active = true); exclude soft-deleted ones (is_active = false)
      if (isActive === "false") {
        query = query.eq("is_active", false);
      } else {
        query = query.eq("is_active", true);
      }

      const {data: charities, error} = await query.order("name", {
        ascending: true,
      });

      console.log(`📊 GET /charities active count: ${charities?.length ?? 0}`);

      if (error) {
        console.error("Error fetching charities:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch charities"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log(
        `📊 GET /charities - Found ${charities?.length || 0} active, verified charities`,
      );

      // Use formatCharityResponse for consistency (includes all fields including impact metrics)
      const formattedCharities = (charities || []).map((charity: any) =>
        formatCharityResponse(charity),
      );

      return new Response(JSON.stringify({charities: formattedCharities}), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching charities:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch charities"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /charities/:id (public)
  const charityIdMatch = route.match(/^\/charities\/(\d+)$/);
  if (method === "GET" && charityIdMatch) {
    try {
      const charityId = charityIdMatch[1];

      const {data: charity, error} = await supabase
        .from("charities")
        .select("*")
        .eq("id", charityId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(JSON.stringify({error: "Charity not found"}), {
            headers: {"Content-Type": "application/json"},
            status: 404,
          });
        }
        console.error("Error fetching charity:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch charity"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Use formatCharityResponse for consistency (includes all fields including impact metrics, stories, etc.)
      const formattedCharity = formatCharityResponse(charity);

      return new Response(JSON.stringify(formattedCharity), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching charity:", error);
      return new Response(JSON.stringify({error: "Failed to fetch charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // POST /charities (requires auth - will be handled by middleware)
  if (method === "POST" && route === "/charities") {
    try {
      const body = await req.json();
      const {
        name,
        category,
        type,
        description,
        about,
        website,
        email,
        phone,
        social,
        location,
        latitude,
        longitude,
        ein,
        imageUrl,
        logoUrl,
        likes,
        mutual,
        isActive,
        address,
      } = body;

      if (!name) {
        return new Response(
          JSON.stringify({error: "Charity name is required"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const charityData: any = {
        name,
        category: category || null,
        type: type || null,
        description: description || null,
        about: about || description || null,
        website: website || null,
        email: email || null,
        phone: phone || null,
        social: social || null,
        location: location || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        ein: ein || null,
        image_url: imageUrl || logoUrl || null,
        logo_url: logoUrl || imageUrl || null,
        likes: likes ? parseInt(likes) : 0,
        mutual: mutual ? parseInt(mutual) : 0,
        is_active: isActive !== false,
        address: address || null,
      };

      const {data: newCharity, error: insertError} = await supabase
        .from("charities")
        .insert([charityData])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating charity:", insertError);
        return new Response(JSON.stringify({error: insertError.message}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      return new Response(JSON.stringify(newCharity), {
        headers: {"Content-Type": "application/json"},
        status: 201,
      });
    } catch (error) {
      console.error("Error creating charity:", error);
      return new Response(JSON.stringify({error: "Failed to create charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // DELETE /charities/:id (requires auth)
  const deleteCharityMatch = route.match(/^\/charities\/(\d+)$/);
  if (method === "DELETE" && deleteCharityMatch) {
    try {
      const charityId = deleteCharityMatch[1];

      const {error} = await supabase
        .from("charities")
        .delete()
        .eq("id", charityId);

      if (error) {
        console.error("Error deleting charity:", error);
        return new Response(JSON.stringify({error: error.message}), {
          headers: {"Content-Type": "application/json"},
          status: 500,
        });
      }

      return new Response(
        JSON.stringify({message: "Charity deleted successfully"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error deleting charity:", error);
      return new Response(JSON.stringify({error: "Failed to delete charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // GET /charities/:id/one-time-gifts/stats
  const statsMatch = route.match(/^\/charities\/(\d+)\/one-time-gifts\/stats$/);
  if (method === "GET" && statsMatch) {
    try {
      const charityId = parseInt(statsMatch[1]);

      if (!charityId) {
        return new Response(JSON.stringify({error: "Invalid charity ID"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Get charity/beneficiary info (try beneficiaries first, fallback to charities)
      let charity: any = null;
      let charityError: any = null;

      const beneficiariesResult = await supabase
        .from("beneficiaries")
        .select("id, name")
        .eq("id", charityId)
        .single();

      if (!beneficiariesResult.error && beneficiariesResult.data) {
        charity = beneficiariesResult.data;
      } else {
        const charitiesResult = await supabase
          .from("charities")
          .select("id, name")
          .eq("id", charityId)
          .single();
        charity = charitiesResult.data;
        charityError = charitiesResult.error;
      }

      if (charityError || !charity) {
        return new Response(JSON.stringify({error: "Charity not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Get all successful gifts for this beneficiary
      const {data: gifts, error: giftsError} = await supabase
        .from("one_time_gifts")
        .select("amount, net_amount, created_at, is_anonymous")
        .eq("beneficiary_id", charityId)
        .eq("status", "succeeded")
        .order("created_at", {ascending: false});

      if (giftsError) {
        console.error("❌ Error fetching gift stats:", giftsError);
        return new Response(
          JSON.stringify({error: "Failed to fetch gift stats"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisYear = new Date(now.getFullYear(), 0, 1);

      const totalReceived =
        gifts?.reduce((sum, g) => sum + parseFloat(g.net_amount || 0), 0) || 0;
      const totalCount = gifts?.length || 0;
      const averageGift = totalCount > 0 ? totalReceived / totalCount : 0;
      const thisMonthGifts =
        gifts?.filter((g) => new Date(g.created_at) >= thisMonth) || [];
      const thisYearGifts =
        gifts?.filter((g) => new Date(g.created_at) >= thisYear) || [];
      const thisMonthTotal = thisMonthGifts.reduce(
        (sum, g) => sum + parseFloat(g.net_amount || 0),
        0,
      );
      const thisYearTotal = thisYearGifts.reduce(
        (sum, g) => sum + parseFloat(g.net_amount || 0),
        0,
      );
      const largestGift =
        gifts?.length > 0
          ? Math.max(...gifts.map((g) => parseFloat(g.amount || 0)))
          : 0;

      // Get recent gifts (last 10)
      const recentGifts = (gifts || []).slice(0, 10).map((gift: any) => ({
        amount: parseFloat(gift.amount),
        date: new Date(gift.created_at).toISOString().split("T")[0],
        is_anonymous: gift.is_anonymous,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          beneficiary_id: charityId,
          beneficiary_name: charity.name,
          stats: {
            total_received: totalReceived.toFixed(2),
            total_count: totalCount,
            average_gift: averageGift.toFixed(2),
            this_month: thisMonthTotal.toFixed(2),
            this_year: thisYearTotal.toFixed(2),
            largest_gift: largestGift.toFixed(2),
            recent_gifts: recentGifts,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Beneficiary Stats Error:", error);
      return new Response(
        JSON.stringify({error: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Charity route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

/**
 * Undo cancel-at-period-end: POST Stripe cancel_at_period_end=false and sync monthly_donations.status.
 * Also supports rows with no Stripe id but status cancelling (local-only).
 */
async function resumeMonthlySubscriptionCore(
  supabase: any,
  userId: number,
  rawIdentifier: string,
): Promise<Response> {
  const jsonHeaders: Record<string, string> = {"Content-Type": "application/json"};

  const raw = decodeURIComponent(String(rawIdentifier ?? "").trim());
  if (!raw) {
    return new Response(
      JSON.stringify({error: "Subscription id is required"}),
      {headers: jsonHeaders, status: 400},
    );
  }

  let subQuery = supabase
    .from("monthly_donations")
    .select("*")
    .eq("user_id", userId);

  if (/^\d+$/.test(raw)) {
    subQuery = subQuery.eq("id", parseInt(raw, 10));
  } else {
    subQuery = subQuery.eq("stripe_subscription_id", raw);
  }

  const {data: subscription, error: fetchError} = await subQuery.maybeSingle();

  if (fetchError || !subscription) {
    return new Response(JSON.stringify({error: "Subscription not found"}), {
      headers: jsonHeaders,
      status: 404,
    });
  }

  const rowId = subscription.id;
  const rowStatus = String(subscription.status || "").toLowerCase();

  if (!subscription.stripe_subscription_id) {
    if (rowStatus === "cancelling" || rowStatus === "canceling") {
      await supabase
        .from("monthly_donations")
        .update({status: "active"})
        .eq("id", rowId);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription will continue renewing.",
        }),
        {headers: jsonHeaders, status: 200},
      );
    }
    return new Response(
      JSON.stringify({
        error: "This subscription is not scheduled for cancellation.",
      }),
      {headers: jsonHeaders, status: 400},
    );
  }

  const stripe = getStripeClient();
  const stripeSubUrl = `${stripe.baseUrl}/subscriptions/${subscription.stripe_subscription_id}`;

  const resumeBody = new URLSearchParams();
  resumeBody.set("cancel_at_period_end", "false");
  const stripeRes = await fetch(stripeSubUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: resumeBody.toString(),
  });

  if (!stripeRes.ok) {
    const errText = await stripeRes.text().catch(() => "");
    const lowerErr = String(errText || "").toLowerCase();
    console.error(
      "Stripe subscription resume (cancel_at_period_end=false) failed:",
      stripeRes.status,
      errText,
    );
    // If Stripe says this subscription is already canceled/missing, undo is no longer possible.
    if (
      (stripeRes.status === 404 &&
        (lowerErr.includes("no such subscription") ||
          lowerErr.includes("resource_missing"))) ||
      (stripeRes.status === 400 &&
        (lowerErr.includes("already canceled") ||
          lowerErr.includes("cannot update a canceled subscription") ||
          lowerErr.includes("status of canceled")))
    ) {
      await supabase
        .from("monthly_donations")
        .update({status: "cancelled"})
        .eq("id", rowId);
      return new Response(
        JSON.stringify({
          error:
            "This subscription has already been canceled by the payment provider and can no longer be resumed.",
        }),
        {
          headers: jsonHeaders,
          status: 409,
        },
      );
    }

    // Some Stripe failures still leave sub active. Verify state before failing hard.
    try {
      const verifyRes = await fetch(stripeSubUrl, {
        method: "GET",
        headers: {Authorization: `Bearer ${stripe.secretKey}`},
      });
      if (verifyRes.ok) {
        const verifyJson = (await verifyRes.json().catch(() => null)) as {
          status?: string;
          cancel_at_period_end?: boolean;
        } | null;
        const verifyStatus = String(verifyJson?.status || "").toLowerCase();
        const stillActiveish =
          ["active", "trialing", "past_due", "incomplete", "unpaid", "pending"].includes(
            verifyStatus,
          ) && !Boolean(verifyJson?.cancel_at_period_end);
        if (stillActiveish) {
          await supabase
            .from("monthly_donations")
            .update({status: verifyStatus === "pending" ? "pending" : "active"})
            .eq("id", rowId);
          return new Response(
            JSON.stringify({
              success: true,
              message: "Subscription will continue renewing.",
            }),
            {headers: jsonHeaders, status: 200},
          );
        }
      }
    } catch (verifyErr) {
      console.error("Stripe resume verify step failed:", verifyErr);
    }

    const conciseProviderError =
      String(errText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240) || null;
    return new Response(
      JSON.stringify({
        error: conciseProviderError
          ? `Unable to update subscription with payment provider: ${conciseProviderError}`
          : "Unable to update subscription with payment provider; try again or contact support.",
      }),
      {
        headers: jsonHeaders,
        status: 502,
      },
    );
  }

  const subJson = (await stripeRes.json().catch(() => null)) as {
    status?: string;
  } | null;
  const stripeSt = String(subJson?.status || "").toLowerCase();
  if (stripeSt === "canceled" || stripeSt === "incomplete_expired") {
    await supabase.from("monthly_donations").update({status: "cancelled"}).eq("id", rowId);
    return new Response(
      JSON.stringify({
        error:
          "This subscription has already been canceled by the payment provider and can no longer be resumed.",
      }),
      {headers: jsonHeaders, status: 409},
    );
  }
  const allowedDb = new Set([
    "active",
    "trialing",
    "pending",
    "past_due",
    "incomplete",
    "unpaid",
  ]);
  const nextStatus = allowedDb.has(stripeSt) ? stripeSt : "active";

  await supabase.from("monthly_donations").update({status: nextStatus}).eq("id", rowId);

  return new Response(
    JSON.stringify({
      success: true,
      message: "Subscription will continue renewing.",
    }),
    {headers: jsonHeaders, status: 200},
  );
}

// Donations routes handler
