import { getStripeClient } from "../lib/stripe.ts";
import { formatCharityResponse } from "../lib/charities.ts";
import { getAppAuthHeader, getJwtPayload } from "../lib/jwt-app.ts";

// Map ProPublica NTEE category codes to the high-level categories we use on
// the donor app. NTEE codes are letter+digit (e.g. "H31Z" = pediatric medical
// research). We only match on the first letter for a coarse grouping; the
// admin tweaks the category later during verification if needed.
function nteeToCategory(nteeCode: string | null | undefined): string | null {
  if (!nteeCode || typeof nteeCode !== "string") return null;
  const major = nteeCode.charAt(0).toUpperCase();
  switch (major) {
    case "A": return "Arts & Culture";
    case "B": return "Education";
    case "C": case "D": return "Animal Welfare";
    case "E": case "F": case "G": case "H": return "Disease Research";
    case "I": return "Anti-Human Trafficking";
    case "J": case "K": case "L": return "Low Income Families";
    case "M": return "Disaster Relief";
    case "N": return "Disabilities";
    case "O": return "Education";
    case "P": return "Low Income Families";
    case "Q": return "Community";
    case "R": case "S": case "T": case "U": return "Community";
    case "V": case "W": return "Community";
    case "X": return "Community";
    case "Y": return "Veterans";
    case "Z": return "Community";
    default: return null;
  }
}

export async function handleCharityRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
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

      // Exclude the THRIVE Initiative row from the regular cause list — it
      // appears in the dedicated "Support THRIVE" panel on the signup screen
      // instead of competing with third-party charities. Callers that need it
      // (e.g. admin reporting) can hit /charities/:id directly.
      const includeThrive = url.searchParams.get("includeThrive") === "true";
      if (!includeThrive) {
        query = query.or("is_thrive.is.null,is_thrive.eq.false");
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

  // GET /charities/search?q=... — server-side proxy to ProPublica's
  // Nonprofit Explorer. Returns only IRS-registered 501(c)(3)s with an EIN.
  // No API key required. We strip the response to just the fields the donor
  // app actually displays so we don't leak more than needed.
  if (method === "GET" && route === "/charities/search") {
    try {
      const url = new URL(req.url);
      const q = (url.searchParams.get("q") || "").trim();
      if (!q || q.length < 2) {
        return new Response(JSON.stringify({results: []}), {
          headers: {"Content-Type": "application/json"},
          status: 200,
        });
      }

      const proPublicaUrl =
        `https://projects.propublica.org/nonprofits/api/v2/search.json` +
        `?q=${encodeURIComponent(q)}&c_code%5Bid%5D=3`;

      const ppRes = await fetch(proPublicaUrl, {
        headers: {Accept: "application/json"},
      });
      if (!ppRes.ok) {
        console.error("❌ ProPublica search failed:", ppRes.status);
        return new Response(
          JSON.stringify({error: "Search is temporarily unavailable. Please try again."}),
          {headers: {"Content-Type": "application/json"}, status: 502},
        );
      }
      const ppData = await ppRes.json();
      const orgs = Array.isArray(ppData?.organizations) ? ppData.organizations : [];

      // Mark any results that are already in our DB so the client can show
      // "Already on THRIVE" instead of an "Add this charity" CTA.
      const eins = orgs
        .map((o: any) => String(o?.ein || "").replace(/[^0-9]/g, ""))
        .filter(Boolean);
      const eligibleEins = Array.from(new Set(eins));

      // EINs in our DB are stored with the canonical "XX-XXXXXXX" format.
      // ProPublica returns them as digits only. We compare by stripping
      // dashes on both sides.
      let existingByEin: Record<string, any> = {};
      if (eligibleEins.length > 0) {
        const formatted = eligibleEins.map((e) => {
          const padded = e.padStart(9, "0");
          return `${padded.slice(0, 2)}-${padded.slice(2)}`;
        });
        const {data: existing} = await supabase
          .from("charities")
          .select("id, ein, name, is_active, is_pending_verification")
          .in("ein", formatted);
        for (const c of existing || []) {
          existingByEin[String(c.ein || "").replace(/[^0-9]/g, "")] = c;
        }
      }

      const results = orgs.slice(0, 25).map((o: any) => {
        const einDigits = String(o?.ein || "").replace(/[^0-9]/g, "");
        const padded = einDigits.padStart(9, "0");
        const einFormatted = `${padded.slice(0, 2)}-${padded.slice(2)}`;
        const dbMatch = existingByEin[einDigits];
        return {
          ein: einFormatted,
          name: o.name || null,
          city: o.city || null,
          state: o.state || null,
          ntee_code: o.ntee_code || null,
          suggestedCategory: nteeToCategory(o.ntee_code),
          existingCharityId: dbMatch?.id || null,
          existingIsPending: !!dbMatch?.is_pending_verification,
        };
      });

      return new Response(
        JSON.stringify({results}),
        {headers: {"Content-Type": "application/json"}, status: 200},
      );
    } catch (error) {
      console.error("❌ /charities/search error:", error);
      return new Response(
        JSON.stringify({error: "Search failed. Please try again."}),
        {headers: {"Content-Type": "application/json"}, status: 500},
      );
    }
  }

  // POST /charities/suggest — donor selects an org from ProPublica that
  // doesn't exist in our DB yet. We create a pending row with the minimum
  // fields we know; admin fills in the rest during verification. Dedups by
  // EIN so two donors suggesting the same org reuse the existing pending row.
  // Body: { ein, name, city, state, ntee_code? }
  if (method === "POST" && route === "/charities/suggest") {
    try {
      const authHeader = getAppAuthHeader(req);
      const tokenPayload: any = await getJwtPayload(authHeader);
      const userId = tokenPayload?.id || tokenPayload?.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({error: "Authentication required"}),
          {headers: {"Content-Type": "application/json"}, status: 401},
        );
      }

      const body = await req.json().catch(() => ({}));
      const rawEin = String(body.ein || "").replace(/[^0-9]/g, "");
      const name = String(body.name || "").trim();
      const city = body.city ? String(body.city).trim() : null;
      const state = body.state ? String(body.state).trim().toUpperCase() : null;
      const ntee = body.ntee_code ? String(body.ntee_code).trim().toUpperCase() : null;

      if (rawEin.length !== 9 || !name) {
        return new Response(
          JSON.stringify({error: "A valid EIN and name are required."}),
          {headers: {"Content-Type": "application/json"}, status: 400},
        );
      }

      const einFormatted = `${rawEin.slice(0, 2)}-${rawEin.slice(2)}`;
      const category = nteeToCategory(ntee);

      // Dedup: if this EIN is already in the DB (live or pending), return it
      // without creating a duplicate. Donor gets to select it normally.
      const {data: existing} = await supabase
        .from("charities")
        .select("*")
        .eq("ein", einFormatted)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({success: true, charity: formatCharityResponse(existing)}),
          {headers: {"Content-Type": "application/json"}, status: 200},
        );
      }

      // Cheap per-user rate limit so a donor can't spam suggestions.
      // Cap at 10 pending suggestions in the last 24 hours per user.
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const {count: recentSuggestions} = await supabase
        .from("charities")
        .select("id", {count: "exact", head: true})
        .eq("suggested_by_user_id", userId)
        .gte("suggested_at", cutoff);
      if ((recentSuggestions || 0) >= 10) {
        return new Response(
          JSON.stringify({
            error:
              "You've suggested a lot of charities today — give our team a chance to catch up.",
          }),
          {headers: {"Content-Type": "application/json"}, status: 429},
        );
      }

      const insertPayload: Record<string, any> = {
        name,
        ein: einFormatted,
        category,
        type: "Pending",
        description: "Pending verification by the THRIVE team.",
        about: "This charity was suggested by a donor and is pending verification by the THRIVE team. Once approved, the full mission, impact, and contact details will appear here.",
        location: [city, state].filter(Boolean).join(", ") || null,
        is_active: false,
        verification_status: false,
        is_pending_verification: true,
        suggested_by_user_id: userId,
        suggestion_source: "propublica",
        suggestion_source_id: einFormatted,
        suggested_at: new Date().toISOString(),
      };

      const {data: created, error: insertErr} = await supabase
        .from("charities")
        .insert(insertPayload)
        .select("*")
        .single();
      if (insertErr || !created) {
        console.error("❌ /charities/suggest insert error:", insertErr);
        return new Response(
          JSON.stringify({error: "Could not save your suggestion. Please try again."}),
          {headers: {"Content-Type": "application/json"}, status: 500},
        );
      }

      return new Response(
        JSON.stringify({success: true, charity: formatCharityResponse(created)}),
        {headers: {"Content-Type": "application/json"}, status: 201},
      );
    } catch (error: any) {
      console.error("❌ /charities/suggest error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Server error"}),
        {headers: {"Content-Type": "application/json"}, status: 500},
      );
    }
  }

  return new Response(JSON.stringify({error: "Charity route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

