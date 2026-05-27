import { corsHeaders } from "../lib/cors.ts";
import { bcryptHash } from "../lib/password.ts";
import { capitalizeName } from "../lib/strings.ts";

export type AdminInvitationsDeps = {
  sendInvitationEmail: (args: {
    to: string;
    name: string;
    verificationToken: string;
    donorId: number;
  }) => Promise<void>;
};

export async function handleAdminInvitations(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: AdminInvitationsDeps,
) {
  const { sendInvitationEmail } = deps;
  // GET /admin/invitations - List all invitations with filters
  if (method === "GET" && route === "/admin/invitations") {
    try {
      const url = new URL(req.url);
      const type = url.searchParams.get("type"); // 'vendor' or 'beneficiary'
      const status = url.searchParams.get("status"); // 'pending', 'approved', 'rejected', 'contacted'
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const search = url.searchParams.get("search"); // Search by contact_name, company_name, email

      // Build query with user information
      let query = supabase
        .from("invitations")
        .select(
          `
          *,
          users:user_id (
            id,
            email,
            first_name,
            last_name
          )
        `,
          {count: "exact"},
        )
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      // Apply filters
      if (type) {
        query = query.eq("type", type);
      }
      if (status) {
        query = query.eq("status", status);
      }
      if (search) {
        query = query.or(
          `contact_name.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%`,
        );
      }

      const {data: invitations, error, count} = await query;

      if (error) {
        console.error("Error fetching invitations:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch invitations"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          invitations: invitations || [],
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
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
    } catch (error) {
      console.error("Error fetching invitations:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch invitations"}),
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

  // PUT /admin/invitations/:id/status - Update invitation status
  const statusUpdateMatch = route.match(
    /^\/admin\/invitations\/(\d+)\/status$/,
  );
  if (method === "PUT" && statusUpdateMatch) {
    try {
      const invitationId = parseInt(statusUpdateMatch[1]);
      const body = await req.json();
      const {status, notes} = body;

      if (
        !status ||
        !["pending", "approved", "rejected", "contacted"].includes(status)
      ) {
        return new Response(
          JSON.stringify({
            error:
              "Invalid status. Must be: pending, approved, rejected, or contacted",
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Update invitation status
      const updateData: any = {status};
      if (notes) {
        // Store notes in message field or add a notes column if needed
        // For now, we'll append to message
        const {data: existing} = await supabase
          .from("invitations")
          .select("message")
          .eq("id", invitationId)
          .single();

        if (existing) {
          const existingMessage = existing.message || "";
          updateData.message =
            existingMessage +
            (existingMessage ? "\n\n" : "") +
            `[Admin Notes: ${notes}]`;
        }
      }

      const {data: invitation, error} = await supabase
        .from("invitations")
        .update(updateData)
        .eq("id", invitationId)
        .select()
        .single();

      if (error || !invitation) {
        console.error("Error updating invitation:", error);
        return new Response(
          JSON.stringify({error: "Failed to update invitation"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
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
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error updating invitation status:", error);
      return new Response(
        JSON.stringify({error: "Failed to update invitation status"}),
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

  // POST /admin/invitations/:id/invite - Create user account and send invitation email
  const inviteMatch = route.match(/^\/admin\/invitations\/(\d+)\/invite$/);
  if (method === "POST" && inviteMatch) {
    try {
      const invitationId = parseInt(inviteMatch[1]);

      // Get invitation
      const {data: invitation, error: inviteError} = await supabase
        .from("invitations")
        .select("*")
        .eq("id", invitationId)
        .single();

      if (inviteError || !invitation) {
        return new Response(JSON.stringify({error: "Invitation not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      // Check if user already exists
      const {data: existingUser} = await supabase
        .from("users")
        .select("id, email, role")
        .eq("email", invitation.email)
        .limit(1);

      if (existingUser && existingUser.length > 0) {
        return new Response(
          JSON.stringify({
            error: `User with email ${invitation.email} already exists`,
            existingUserId: existingUser[0].id,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Generate verification token
      const tokenArray = new Uint8Array(32);
      crypto.getRandomValues(tokenArray);
      const verificationToken = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      // Create temporary password hash
      const tempPasswordHash = await bcryptHash(
        "temp_invited_" + verificationToken + "_" + Date.now(),
      );

      // Determine role based on invitation type
      const role =
        invitation.type === "beneficiary" ? "charityAdmin" : "vendorAdmin";

      // Parse contact_name into first_name and last_name
      let first_name = "";
      let last_name = "";
      if (invitation.contact_name) {
        const nameParts = invitation.contact_name.trim().split(/\s+/);
        if (nameParts.length > 0) {
          first_name = capitalizeName(nameParts[0]);
          last_name = capitalizeName(nameParts.slice(1).join(" ")) || "";
        }
      }

      // Create user account
      const {data: newUser, error: userError} = await supabase
        .from("users")
        .insert([
          {
            email: invitation.email.toLowerCase().trim(),
            first_name: first_name || null,
            last_name: last_name || null,
            phone: invitation.phone || null,
            role: role,
            account_status: "active",
            verification_token: verificationToken,
            is_verified: false,
            password_hash: tempPasswordHash,
          },
        ])
        .select()
        .single();

      if (userError) {
        console.error("Error creating user:", userError);
        return new Response(
          JSON.stringify({error: "Failed to create user account"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      // Update invitation status to 'approved'
      await supabase
        .from("invitations")
        .update({status: "approved"})
        .eq("id", invitationId);

      // Send invitation email
      const userName =
        invitation.contact_name || invitation.email.split("@")[0];
      sendInvitationEmail({
        to: invitation.email,
        name: userName,
        verificationToken: verificationToken,
        donorId: newUser.id,
      }).catch((emailError) => {
        console.error("❌ Error sending invitation email:", emailError);
        // Don't fail the request if email fails
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "User account created and invitation email sent",
          user: {
            id: newUser.id,
            email: newUser.email,
            name:
              `${newUser.first_name || ""} ${newUser.last_name || ""}`.trim() ||
              userName,
            role: newUser.role,
            status: "pending_verification",
          },
          invitation: {
            id: invitation.id,
            status: "approved",
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
      console.error("Error creating user from invitation:", error);
      return new Response(
        JSON.stringify({error: "Failed to create user account"}),
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

  return new Response(JSON.stringify({error: "Invitations route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}
