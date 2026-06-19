import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";

// Public discounts routes handler (for mobile app)
export async function handleDiscountRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  console.log(`🔍 handleDiscountRoute: ${method} ${route}`);

  // GET /discounts (public - for mobile app)
  if (method === "GET" && route === "/discounts") {
    try {
      const url = new URL(req.url);
      const { category, search } = Object.fromEntries(url.searchParams);

      // Build query — pull signup_status so we can filter to approved-only
      // vendors after the join. Supabase's foreign-key joins don't accept a
      // .eq() on the embedded resource, so we filter in memory below.
      let query = supabase
        .from("discounts")
        .select(
          `
          *,
          vendor:vendors!vendor_id (
            id,
            name,
            category,
            description,
            website,
            phone,
            social_links,
            logo_url,
            address,
            hours,
            signup_status
          )
        `,
        )
        .neq("is_active", false);

      // Filter by active and not expired
      const today = new Date().toISOString().split("T")[0];
      query = query.or(`end_date.is.null,end_date.gte.${today}`);

      // Filter by category
      if (category && category !== "All") {
        query = query.eq("category", category);
      }

      // Search functionality
      if (search) {
        query = query.or(
          `title.ilike.%${search}%,description.ilike.%${search}%`,
        );
      }

      // Order by created_at DESC
      query = query.order("created_at", { ascending: false });

      const { data: rawDiscounts, error } = await query;

      if (error) {
        console.error("Error fetching discounts:", error);
        return new Response(
          JSON.stringify({ error: "Failed to fetch discounts" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      // Hide discounts whose owning vendor isn't approved yet — keeps the
      // donor app in sync with /vendors which is also approved-only.
      const discounts = (rawDiscounts || []).filter(
        (d: any) => d.vendor && d.vendor.signup_status === "approved",
      );

      // Try to get user ID from JWT token (optional - discounts are public)
      let userId: number | null = null;
      const authHeader = getAppAuthHeader(req);
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.substring(7);
          const jwtSecret = Deno.env.get("JWT_SECRET");

          if (jwtSecret) {
            const secretKey = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(jwtSecret),
              { name: "HMAC", hash: "SHA-256" },
              false,
              ["sign", "verify"],
            );
            const decoded: any = await verifyJWT(token, secretKey);
            userId = decoded.id || decoded.userId || null;
          }
        } catch (_authError) {
          // Not authenticated - that's okay, discounts are public
          console.log(
            "⚠️ Could not authenticate user for discount list (non-critical)",
          );
        }
      }

      // Get start of current month for usage calculations
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // If user is authenticated, get their redemption counts for all discounts
      const userRedemptions: Record<number, number> = {};
      if (userId) {
        try {
          const { data: redemptions, error: redemptionsError } = await supabase
            .from("redemptions")
            .select("discount_id")
            .eq("user_id", userId)
            .gte("redeemed_at", startOfMonth.toISOString());

          if (!redemptionsError && redemptions) {
            // Count redemptions per discount
            redemptions.forEach((redemption: any) => {
              const discountId = redemption.discount_id;
              userRedemptions[discountId] =
                (userRedemptions[discountId] || 0) + 1;
            });
          }
        } catch (redemptionError) {
          console.warn(
            "⚠️ Could not fetch user redemptions (non-critical):",
            redemptionError,
          );
        }
      }

      // Format discounts for API response
      const formattedDiscounts = (discounts || []).map((discount: any) => {
        const usageLimit = discount.usage_limit || "unlimited";
        let remainingUses: number | string | null = null;
        let availableCount: number | string | null = null;

        // Calculate remaining uses if user is authenticated
        if (userId && usageLimit !== "unlimited" && usageLimit !== null) {
          const limit = parseInt(usageLimit);
          if (!isNaN(limit) && limit > 0) {
            const used = userRedemptions[discount.id] || 0;
            remainingUses = Math.max(0, limit - used);
            availableCount = remainingUses;
          } else {
            remainingUses = "unlimited";
            availableCount = "unlimited";
          }
        } else if (usageLimit === "unlimited" || usageLimit === null) {
          remainingUses = "unlimited";
          availableCount = "unlimited";
        }

        const formatted: any = {
          id: discount.id,
          vendorId: discount.vendor_id,
          title: discount.title,
          description: discount.description,
          discountCode: discount.discount_code,
          discountType: discount.discount_type,
          discountValue: discount.discount_value,
          maxDiscount: discount.max_discount,
          usageLimit: usageLimit,
          category: discount.category,
          tags: discount.tags || [],
          imageUrl: discount.image_url,
          startDate: discount.start_date,
          endDate: discount.end_date,
          isActive: discount.is_active,
          terms: discount.terms,
          availability: discount.availability || null,
          createdAt: discount.created_at,
          updatedAt: discount.updated_at,
          vendor: discount.vendor || null,
        };

        // Add remaining uses if calculated (only if user is authenticated)
        if (remainingUses !== null) {
          formatted.remainingUses = remainingUses;
          formatted.availableCount = availableCount;
          if (typeof remainingUses === "number") {
            formatted.usageLimitDisplay = `${remainingUses} remaining`;
            formatted.hasRemainingUses = true;
            formatted.remainingUsesCount = remainingUses;
          } else {
            formatted.usageLimitDisplay = "unlimited";
            formatted.hasRemainingUses = false;
          }
        } else {
          formatted.usageLimitDisplay = usageLimit || "unlimited";
          formatted.hasRemainingUses = false;
        }

        return formatted;
      });

      return new Response(JSON.stringify({ discounts: formattedDiscounts }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching discounts:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch discounts" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /discounts/:id (public - for mobile app)
  // If authenticated, also calculates remaining uses for the user
  const discountIdMatch = route.match(/^\/discounts\/(\d+)$/);
  if (method === "GET" && discountIdMatch) {
    try {
      const discountId = discountIdMatch[1];

      const { data: discount, error } = await supabase
        .from("discounts")
        .select(
          `
          *,
          vendor:vendors!vendor_id (
            id,
            name,
            category,
            description,
            website,
            phone,
            social_links,
            logo_url,
            address,
            hours
          )
        `,
        )
        .eq("id", discountId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(JSON.stringify({ error: "Discount not found" }), {
            headers: { "Content-Type": "application/json" },
            status: 404,
          });
        }
        console.error("Error fetching discount:", error);
        return new Response(
          JSON.stringify({ error: "Failed to fetch discount" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      // Calculate remaining uses if user is authenticated
      let remainingUses: number | string | null = null;
      let availableCount: number | string | null = null;

      // Try to get user ID from JWT token (optional - discount is public)
      const authHeader = getAppAuthHeader(req);
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.substring(7);
          const jwtSecret = Deno.env.get("JWT_SECRET");

          if (jwtSecret) {
            const secretKey = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(jwtSecret),
              { name: "HMAC", hash: "SHA-256" },
              false,
              ["sign", "verify"],
            );
            const decoded: any = await verifyJWT(token, secretKey);
            const userId = decoded.id || decoded.userId;

            if (userId) {
              // Calculate remaining uses for this user
              const usageLimit = discount.usage_limit;
              console.log(
                `📊 Calculating remaining uses for discount ${discountId}, user ${userId}, usageLimit: ${usageLimit}`,
              );

              if (
                usageLimit &&
                usageLimit !== "unlimited" &&
                usageLimit !== null
              ) {
                const limit = parseInt(usageLimit);
                if (!isNaN(limit) && limit > 0) {
                  // Get start of current month
                  const now = new Date();
                  const startOfMonth = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    1,
                  );

                  // Count redemptions for this user and discount in the current month
                  const { count, error: countError } = await supabase
                    .from("redemptions")
                    .select("*", { count: "exact", head: true })
                    .eq("user_id", userId)
                    .eq("discount_id", parseInt(discountId))
                    .gte("redeemed_at", startOfMonth.toISOString());

                  if (!countError && count !== null) {
                    const used = count || 0;
                    remainingUses = Math.max(0, limit - used);
                    availableCount = remainingUses;
                    console.log(
                      `✅ Calculated remaining uses: ${remainingUses} (limit: ${limit}, used: ${used})`,
                    );
                  } else {
                    // If we can't count, assume all uses available
                    remainingUses = limit;
                    availableCount = limit;
                    console.log(
                      `⚠️ Could not count redemptions, assuming all uses available: ${limit}`,
                    );
                  }
                } else {
                  remainingUses = "unlimited";
                  availableCount = "unlimited";
                  console.log(`ℹ️ Invalid limit format, treating as unlimited`);
                }
              } else {
                remainingUses = "unlimited";
                availableCount = "unlimited";
                console.log(`ℹ️ Usage limit is unlimited or null`);
              }
            } else {
              console.log(
                "⚠️ No userId found, cannot calculate remaining uses",
              );
            }
          }
        } catch (_authError) {
          // Not authenticated or token invalid - that's okay, discount is public
          console.log(
            "⚠️ Could not authenticate user for discount details (non-critical)",
          );
        }
      }

      // Format discount for API response
      const formattedDiscount: any = {
        id: discount.id,
        vendorId: discount.vendor_id,
        title: discount.title,
        description: discount.description,
        discountCode: discount.discount_code,
        discountType: discount.discount_type,
        discountValue: discount.discount_value,
        maxDiscount: discount.max_discount,
        usageLimit: discount.usage_limit || "unlimited",
        category: discount.category,
        tags: discount.tags || [],
        imageUrl: discount.image_url,
        startDate: discount.start_date,
        endDate: discount.end_date,
        isActive: discount.is_active,
        terms: discount.terms,
        createdAt: discount.created_at,
        updatedAt: discount.updated_at,
        vendor: discount.vendor || null,
      };

      // Add remaining uses if calculated (only if user is authenticated)
      if (remainingUses !== null) {
        formattedDiscount.remainingUses = remainingUses;
        formattedDiscount.availableCount = availableCount;
        if (typeof remainingUses === "number") {
          formattedDiscount.usageLimitDisplay = `${remainingUses} remaining`;
          formattedDiscount.hasRemainingUses = true;
          formattedDiscount.remainingUsesCount = remainingUses;
        } else {
          formattedDiscount.usageLimitDisplay = "unlimited";
          formattedDiscount.hasRemainingUses = false;
        }
      } else {
        formattedDiscount.usageLimitDisplay =
          discount.usage_limit || "unlimited";
        formattedDiscount.hasRemainingUses = false;
      }

      return new Response(JSON.stringify(formattedDiscount), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching discount:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch discount" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }
  }

  // POST /discounts/:id/redeem (requires authentication)
  const redeemMatch = route.match(/^\/discounts\/([^\/]+)\/redeem\/?$/);
  if (method === "POST" && redeemMatch) {
    try {
      console.log(
        `🔍 Redeem route matched: ${route}, discountId: ${redeemMatch[1]}`,
      );

      // Extract discount ID from URL
      const discountId = redeemMatch[1];
      if (!discountId) {
        return new Response(
          JSON.stringify({ error: "Discount ID is required" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // 1. Verify JWT token (required for this endpoint)
      const authHeader = getAppAuthHeader(req);
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("❌ Missing or invalid Authorization header");
        return new Response(
          JSON.stringify({ error: "Unauthorized - Missing or invalid token" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 401,
          },
        );
      }

      const token = authHeader.replace("Bearer ", "");

      const jwtSecret = Deno.env.get("JWT_SECRET");

      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return new Response(
          JSON.stringify({ error: "Server configuration error" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      let decoded: any;
      try {
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign", "verify"],
        );
        decoded = await verifyJWT(token, secretKey);
      } catch (jwtError) {
        console.error("JWT verification error:", jwtError);
        return new Response(
          JSON.stringify({ error: "Unauthorized - Invalid token" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 401,
          },
        );
      }

      const userId = decoded.id || decoded.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Invalid token: user ID not found" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 401,
          },
        );
      }

      // 2. Parse request body (optional fields)
      let requestBody: any = {};
      try {
        const bodyText = await req.text();
        if (bodyText) {
          requestBody = JSON.parse(bodyText);
        }
      } catch (_e) {
        console.log("⚠️ No body or invalid JSON, using empty object");
      }

      const { totalBill, totalSavings } = requestBody;

      // 3. Find the discount in the database
      const { data: discount, error: discountError } = await supabase
        .from("discounts")
        .select(
          `
          *,
          vendors (
            id,
            name,
            logo_url
          )
        `,
        )
        .eq("id", discountId)
        .single();

      if (discountError || !discount) {
        if (discountError?.code === "PGRST116") {
          return new Response(JSON.stringify({ error: "Discount not found" }), {
            headers: { "Content-Type": "application/json" },
            status: 404,
          });
        }
        console.error("Error fetching discount:", discountError);
        return new Response(JSON.stringify({ error: "Discount not found" }), {
          headers: { "Content-Type": "application/json" },
          status: 404,
        });
      }

      // 4. Validate discount is active and not expired
      if (!discount.is_active) {
        return new Response(JSON.stringify({ error: "Discount is not active" }), {
          headers: { "Content-Type": "application/json" },
          status: 400,
        });
      }

      // Check if discount has expired
      if (discount.end_date) {
        const endDate = new Date(discount.end_date);
        const now = new Date();
        if (endDate < now) {
          return new Response(JSON.stringify({ error: "Discount has expired" }), {
            headers: { "Content-Type": "application/json" },
            status: 400,
          });
        }
      }

      // 5. Check usage limits
      if (discount.usage_limit && discount.usage_limit !== "unlimited") {
        const limit = parseInt(discount.usage_limit);

        if (!isNaN(limit) && limit > 0) {
          // Get start of current month
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          // Count redemptions for this user and discount in the current month
          const { count, error: countError } = await supabase
            .from("redemptions")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("discount_id", discountId)
            .gte("redeemed_at", startOfMonth.toISOString());

          if (countError) {
            console.error("Error checking usage limit:", countError);
          } else if (count && count >= limit) {
            return new Response(
              JSON.stringify({
                error:
                  `Monthly usage limit reached. You can redeem this discount ${limit} time(s) per month.`,
              }),
              {
                headers: { "Content-Type": "application/json" },
                status: 400,
              },
            );
          }
        }
      }

      // 6. Create redemption record
      const redemptionData: any = {
        discount_id: parseInt(discountId),
        user_id: userId,
        vendor_id: discount.vendor_id || null,
        redemption_code:
          discount.discount_code || `REDEEM-${discountId}-${Date.now()}`,
        redeemed_at: new Date().toISOString(),
      };

      // Add optional fields if provided
      if (totalBill !== undefined && totalBill !== null) {
        redemptionData.total_bill = parseFloat(totalBill);
      }
      if (totalSavings !== undefined && totalSavings !== null) {
        redemptionData.total_savings = parseFloat(totalSavings);
      }

      const { error: redemptionError } = await supabase
        .from("redemptions")
        .insert([redemptionData])
        .select()
        .single();

      if (redemptionError) {
        console.error("Error creating redemption record:", redemptionError);
      }

      // 7. Calculate remaining uses after redemption
      let remainingUses: number | string | null = null;
      let availableCount: number | string | null = null;

      const usageLimit = discount.usage_limit;
      console.log(
        `📊 Calculating remaining uses after redemption for discount ${discountId}, user ${userId}, usageLimit: ${usageLimit}`,
      );

      if (usageLimit && usageLimit !== "unlimited" && usageLimit !== null) {
        const limit = parseInt(usageLimit);
        if (!isNaN(limit) && limit > 0) {
          // Get start of current month
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          // Count redemptions for this user and discount in the current month (including the one we just created)
          const { count, error: countError } = await supabase
            .from("redemptions")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("discount_id", parseInt(discountId))
            .gte("redeemed_at", startOfMonth.toISOString());

          if (!countError && count !== null) {
            const used = count || 0;
            remainingUses = Math.max(0, limit - used);
            availableCount = remainingUses;
            console.log(
              `✅ Calculated remaining uses after redemption: ${remainingUses} (limit: ${limit}, used: ${used})`,
            );
          } else {
            // If we can't count, calculate based on limit
            remainingUses = Math.max(0, limit - 1); // Assume we just used one
            availableCount = remainingUses;
            console.log(
              `⚠️ Could not count redemptions, assuming remaining: ${remainingUses} (limit: ${limit} - 1)`,
            );
          }
        } else {
          remainingUses = "unlimited";
          availableCount = "unlimited";
          console.log("ℹ️ Invalid limit format, treating as unlimited");
        }
      } else {
        remainingUses = "unlimited";
        availableCount = "unlimited";
        console.log("ℹ️ Usage limit is unlimited or null");
      }

      // 8. Return success response with updated discount info
      const responseData: any = {
        success: true,
        discountCode: discount.discount_code || "N/A",
        message: "Discount redeemed successfully",
        savings: totalSavings || null,
        usageLimit: usageLimit || "unlimited",
      };

      // Add remaining uses if calculated
      if (remainingUses !== null) {
        responseData.remainingUses = remainingUses;
        responseData.availableCount = availableCount;
        if (typeof remainingUses === "number") {
          responseData.usageLimitDisplay = `${remainingUses} remaining`;
          responseData.remainingUsesCount = remainingUses;
          responseData.hasRemainingUses = true;
        } else {
          responseData.usageLimitDisplay = "unlimited";
          responseData.hasRemainingUses = false;
        }
      } else {
        responseData.usageLimitDisplay = usageLimit || "unlimited";
        responseData.hasRemainingUses = false;
      }

      // Also include full discount info for the "Discount Redeemed" page
      responseData.discount = {
        id: discount.id,
        title: discount.title,
        description: discount.description,
        discountCode: discount.discount_code,
        discountType: discount.discount_type,
        discountValue: discount.discount_value,
        usageLimit: usageLimit || "unlimited",
        remainingUses: remainingUses,
        availableCount: availableCount,
        usageLimitDisplay: responseData.usageLimitDisplay,
        remainingUsesCount:
          typeof remainingUses === "number" ? remainingUses : null,
        hasRemainingUses: responseData.hasRemainingUses,
      };

      return new Response(JSON.stringify(responseData), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error: any) {
      console.error("Error redeeming discount:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Internal server error" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // No route matched - return 404
  console.log(`❌ Discount route not matched: ${method} ${route}`);
  return new Response(JSON.stringify({ error: "Discount route not found" }), {
    headers: { "Content-Type": "application/json" },
    status: 404,
  });
}
