import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";

export async function handleUserPointsRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // Get user ID from JWT token
  const authHeader = getAppAuthHeader(req);
  let userId: number | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const jwtSecret = Deno.env.get("JWT_SECRET");

    if (jwtSecret) {
      try {
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );

        const payload = await verifyJWT(token, secretKey);
        userId = payload.id as number;
      } catch (error) {
        // Invalid token
      }
    }
  }

  if (!userId) {
    return new Response(JSON.stringify({error: "Unauthorized"}), {
      headers: {"Content-Type": "application/json"},
      status: 401,
    });
  }

  // GET /user/points
  if (method === "GET" && route === "/user/points") {
    try {
      const {data: user} = await supabase
        .from("users")
        .select("points")
        .eq("id", userId)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          points: user?.points || 0,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      return new Response(JSON.stringify({error: "Failed to fetch points"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // POST /user/points/add
  if (method === "POST" && route === "/user/points/add") {
    try {
      const body = await req.json();
      const {
        points,
        type = "earned",
        description,
        reference_id,
        reference_type,
      } = body;

      if (!points || points <= 0) {
        return new Response(
          JSON.stringify({error: "points must be a positive number"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Create points transaction
      const {error: txError} = await supabase
        .from("points_transactions")
        .insert([
          {
            user_id: userId,
            points: parseInt(points),
            type,
            description,
            reference_id,
            reference_type,
          },
        ]);

      if (txError) {
        console.error("Error creating points transaction:", txError);
        return new Response(JSON.stringify({error: "Failed to add points"}), {
          headers: {"Content-Type": "application/json"},
          status: 500,
        });
      }

      // Update user's points balance
      const {data: user} = await supabase
        .from("users")
        .select("points")
        .eq("id", userId)
        .single();

      const newBalance = (user?.points || 0) + parseInt(points);

      await supabase
        .from("users")
        .update({points: newBalance})
        .eq("id", userId);

      return new Response(
        JSON.stringify({
          success: true,
          points: newBalance,
          added: parseInt(points),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error adding points:", error);
      return new Response(JSON.stringify({error: "Failed to add points"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // GET /user/points/history
  if (method === "GET" && route === "/user/points/history") {
    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const type = url.searchParams.get("type");

      let query = supabase
        .from("points_transactions")
        .select("*", {count: "exact"})
        .eq("user_id", userId)
        .order("created_at", {ascending: false})
        .range((page - 1) * limit, page * limit - 1);

      if (type) {
        query = query.eq("type", type);
      }

      const {data: transactions, error, count} = await query;

      if (error) {
        return new Response(
          JSON.stringify({error: "Failed to fetch points history"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          transactions: transactions || [],
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching points history:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch points history"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Points route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}

// Invitation route handler
