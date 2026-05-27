import { verify as verifyJWT } from "https://deno.land/x/djwt@v2.9/mod.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";
import { capitalizeName } from "../lib/strings.ts";

export async function handleInvitationRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // Get user ID from JWT token (optional - allows unauthenticated requests for beneficiary requests)
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
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign", "verify"],
        );

        const payload = await verifyJWT(token, secretKey);
        userId = payload.id as number;
      } catch (_error) {
        // Invalid token - continue without userId (for unauthenticated requests)
      }
    }
  }

  // For vendor invitations, require authentication
  if (method === "POST" && route === "/invitations/vendor" && !userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  // For GET /invitations, require authentication (users viewing their own invitations)
  if (method === "GET" && route === "/invitations" && !userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  // For GET /invitations/:id/status, require authentication
  const statusRouteMatch = route.match(/^\/invitations\/(\d+)\/status$/);
  if (method === "GET" && statusRouteMatch && !userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  // Beneficiary invitations allow unauthenticated requests (for signup flow and home page)

  // POST /invitations/vendor
  if (method === "POST" && route === "/invitations/vendor") {
    try {
      const body = await req.json();
      const {
        contact_name: bodyContactName,
        company_name,
        email: bodyEmail,
        phone,
        website,
        message,
      } = body;

      // Auto-populate contact info from authenticated user if not supplied
      let contact_name = bodyContactName;
      let email = bodyEmail;
      if (userId && (!contact_name || !email)) {
        const { data: userData } = await supabase
          .from("users")
          .select("first_name, last_name, email")
          .eq("id", userId)
          .single();
        if (userData) {
          contact_name =
            contact_name ||
            `${userData.first_name || ""} ${userData.last_name || ""}`.trim();
          email = email || userData.email;
        }
      }

      if (!contact_name || !email) {
        return new Response(
          JSON.stringify({ error: "contact_name and email are required" }),
          { headers: { "Content-Type": "application/json" }, status: 400 },
        );
      }

      const { data: invitation, error } = await supabase
        .from("invitations")
        .insert([
          {
            user_id: userId,
            type: "vendor",
            contact_name,
            company_name,
            email,
            phone,
            website,
            message,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creating invitation:", error);
        return new Response(
          JSON.stringify({ error: "Failed to create invitation" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitation,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating vendor invitation:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // POST /invitations/beneficiary
  // Allow unauthenticated requests (for signup flow and home page)
  if (method === "POST" && route === "/invitations/beneficiary") {
    try {
      const body = await req.json();
      const {
        contact_name: bodyContactName,
        company_name,
        email: bodyEmail,
        phone,
        website,
        message,
      } = body;

      // Auto-populate contact info from authenticated user if not supplied
      let contact_name = bodyContactName;
      let email = bodyEmail;
      if (userId && (!contact_name || !email)) {
        const { data: userData } = await supabase
          .from("users")
          .select("first_name, last_name, email")
          .eq("id", userId)
          .single();
        if (userData) {
          contact_name =
            contact_name ||
            `${userData.first_name || ""} ${userData.last_name || ""}`.trim();
          email = email || userData.email;
        }
      }

      if (!contact_name || !email) {
        return new Response(
          JSON.stringify({ error: "contact_name and email are required" }),
          { headers: { "Content-Type": "application/json" }, status: 400 },
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({ error: "Invalid email format" }), {
          headers: { "Content-Type": "application/json" },
          status: 400,
        });
      }

      // userId is optional - if not authenticated, set to null
      // This allows requests from signup flow and home page
      const { data: invitation, error } = await supabase
        .from("invitations")
        .insert([
          {
            user_id: userId, // null if not authenticated, user_id if authenticated
            type: "beneficiary",
            contact_name: capitalizeName(contact_name),
            company_name: company_name ? capitalizeName(company_name) : null,
            email: email.toLowerCase().trim(),
            phone: phone || null,
            website: website || null,
            message: message || null,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creating invitation:", error);
        return new Response(
          JSON.stringify({ error: "Failed to create invitation" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitation,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating beneficiary invitation:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /invitations
  if (method === "GET" && route === "/invitations") {
    try {
      const url = new URL(req.url);
      const type = url.searchParams.get("type");
      const status = url.searchParams.get("status");

      let query = supabase
        .from("invitations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (type) {
        query = query.eq("type", type);
      }
      if (status) {
        query = query.eq("status", status);
      }

      const { data: invitations, error } = await query;

      if (error) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch invitations" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitations: invitations || [],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching invitations:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch invitations" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /invitations/:id/status
  const statusMatch = route.match(/^\/invitations\/(\d+)\/status$/);
  if (method === "GET" && statusMatch) {
    try {
      const invitationId = parseInt(statusMatch[1]);

      const { data: invitation, error } = await supabase
        .from("invitations")
        .select("id, status, created_at, updated_at")
        .eq("id", invitationId)
        .eq("user_id", userId)
        .single();

      if (error || !invitation) {
        return new Response(JSON.stringify({ error: "Invitation not found" }), {
          headers: { "Content-Type": "application/json" },
          status: 404,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitation: {
            id: invitation.id,
            status: invitation.status,
            created_at: invitation.created_at,
            updated_at: invitation.updated_at,
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching invitation status:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch invitation status" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({ error: "Invitation route not found" }), {
    headers: { "Content-Type": "application/json" },
    status: 404,
  });
}
