import { corsHeaders } from "../lib/cors.ts";
import { bcryptHash, bcryptCompare } from "../lib/password.ts";

export type AdminSettingsDeps = {
  sendAdminTempPasswordEmail: (args: {
    to: string;
    name: string;
    tempPassword: string;
  }) => Promise<void>;
};

export async function handleAdminSettings(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: AdminSettingsDeps,
) {
  const { sendAdminTempPasswordEmail } = deps;
  // GET /admin/settings
  if (method === "GET" && route === "/admin/settings") {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          notifications: {
            email: true,
            push: true,
            sms: false,
          },
          apiRateLimiting: {
            enabled: true,
            requestsPerMinute: 60,
            requestsPerHour: 1000,
          },
          system: {
            maintenanceMode: false,
            allowRegistration: true,
          },
        },
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // PUT /admin/settings
  if (method === "PUT" && route === "/admin/settings") {
    const settingsData = await req.json();

    // For now, just acknowledge the update
    // You can store settings in a table later
    console.log("Settings update requested:", settingsData);

    return new Response(
      JSON.stringify({
        success: true,
        data: settingsData,
        message: "Settings updated successfully",
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // GET /admin/settings/team
  if (method === "GET" && route === "/admin/settings/team") {
    const {data: members, error} = await supabase
      .from("admin_team_members")
      .select(
        "id, name, email, role, status, created_at, updated_at, last_login_at",
      )
      .order("created_at", {ascending: false});

    if (error) {
      console.error("Error fetching team members:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch team members"}),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    const teamMembers = (members || []).map((member: any) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
      lastLogin: member.last_login_at || member.updated_at || member.created_at,
      avatar:
        member.name?.[0]?.toUpperCase() ||
        member.email?.[0]?.toUpperCase() ||
        "A",
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: teamMembers,
      }),
      {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/settings/team
  if (method === "POST" && route === "/admin/settings/team") {
    try {
      const payload = await req.json();
      const name = payload?.name?.toString().trim();
      const email = payload?.email?.toString().trim().toLowerCase();
      const role = payload?.role?.toString().trim() || "User";
      const status = payload?.status?.toString().trim() || "Active";

      if (!name || !email) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Name and email are required",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data: existingMember} = await supabase
        .from("admin_team_members")
        .select("id")
        .eq("email", email)
        .limit(1);

      if (existingMember && existingMember.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Team member with this email already exists",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 409,
          },
        );
      }

      const tempPassword = `TI${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`;
      const passwordHash = await bcryptHash(tempPassword);

      const {data, error} = await supabase
        .from("admin_team_members")
        .insert({
          name,
          email,
          role,
          status,
          password_hash: passwordHash,
          must_reset_password: true,
        })
        .select("id, name, email, role, status, created_at, updated_at")
        .single();

      if (error) {
        console.error("Error creating team member:", error);
        return new Response(
          JSON.stringify({success: false, error: "Failed to add team member"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      sendAdminTempPasswordEmail({
        to: email,
        name,
        tempPassword,
      }).catch((emailError) => {
        console.error(
          "❌ Error sending admin temp password email:",
          emailError,
        );
      });

      return new Response(JSON.stringify({success: true, data}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 201,
      });
    } catch (error: any) {
      console.error("Team member create error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // PUT /admin/settings/team/:id
  const teamUpdateMatch = route.match(/^\/admin\/settings\/team\/(\d+)$/);
  if (method === "PUT" && teamUpdateMatch) {
    try {
      const memberId = parseInt(teamUpdateMatch[1], 10);
      const payload = await req.json();
      const updateData: any = {};

      if (payload?.name) updateData.name = payload.name.toString().trim();
      if (payload?.email)
        updateData.email = payload.email.toString().trim().toLowerCase();
      if (payload?.role) updateData.role = payload.role.toString().trim();
      if (payload?.status) updateData.status = payload.status.toString().trim();
      updateData.updated_at = new Date().toISOString();

      if (Object.keys(updateData).length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "No fields to update"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data, error} = await supabase
        .from("admin_team_members")
        .update(updateData)
        .eq("id", memberId)
        .select("id, name, email, role, status, created_at, updated_at")
        .single();

      if (error) {
        console.error("Error updating team member:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to update team member",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({success: true, data}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("Team member update error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/settings/team/login
  if (method === "POST" && route === "/admin/settings/team/login") {
    try {
      const payload = await req.json();
      const email = payload?.email?.toString().trim().toLowerCase();
      const password = payload?.password?.toString() || "";

      if (!email || !password) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Email and password are required",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data: members, error} = await supabase
        .from("admin_team_members")
        .select(
          "id, name, email, role, status, password_hash, must_reset_password",
        )
        .eq("email", email)
        .limit(1);

      if (error || !members || members.length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid email or password"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const member = members[0];
      if (member.status?.toLowerCase() !== "active") {
        return new Response(
          JSON.stringify({success: false, error: "Account is inactive"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 403,
          },
        );
      }

      if (
        !member.password_hash ||
        !(await bcryptCompare(password, member.password_hash))
      ) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid email or password"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      await supabase
        .from("admin_team_members")
        .update({
          last_login_at: new Date().toISOString(),
          must_reset_password: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: member.id,
            name: member.name,
            email: member.email,
            role: member.role,
          },
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("Team member login error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/settings/team/reset-password
  if (method === "POST" && route === "/admin/settings/team/reset-password") {
    try {
      const payload = await req.json();
      const email = payload?.email?.toString().trim().toLowerCase();
      const providedTempPassword = payload?.tempPassword?.toString();

      if (!email) {
        return new Response(
          JSON.stringify({success: false, error: "Email is required"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data: members, error} = await supabase
        .from("admin_team_members")
        .select("id, name, email, status")
        .eq("email", email)
        .limit(1);

      if (error || !members || members.length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "Team member not found"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      const member = members[0];
      if (member.status?.toLowerCase() !== "active") {
        return new Response(
          JSON.stringify({success: false, error: "Account is inactive"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 403,
          },
        );
      }

      const tempPassword = providedTempPassword
        ? providedTempPassword
        : `TI${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`;
      const passwordHash = await bcryptHash(tempPassword);

      const {error: updateError} = await supabase
        .from("admin_team_members")
        .update({
          password_hash: passwordHash,
          must_reset_password: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);

      if (updateError) {
        console.error("Error resetting team member password:", updateError);
        return new Response(
          JSON.stringify({success: false, error: "Failed to reset password"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      sendAdminTempPasswordEmail({
        to: member.email,
        name: member.name || member.email.split("@")[0],
        tempPassword,
      }).catch((emailError) => {
        console.error(
          "❌ Error sending admin temp password email:",
          emailError,
        );
      });

      return new Response(JSON.stringify({success: true}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("Team member reset password error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/settings/team/change-password
  if (method === "POST" && route === "/admin/settings/team/change-password") {
    try {
      const payload = await req.json();
      const email = payload?.email?.toString().trim().toLowerCase();
      const currentPassword = payload?.currentPassword?.toString() || "";
      const newPassword = payload?.newPassword?.toString() || "";

      if (!email || !currentPassword || !newPassword) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Email, current password, and new password are required",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {data: members, error} = await supabase
        .from("admin_team_members")
        .select("id, email, status, password_hash")
        .eq("email", email)
        .limit(1);

      if (error || !members || members.length === 0) {
        return new Response(
          JSON.stringify({success: false, error: "Team member not found"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      const member = members[0];
      if (member.status?.toLowerCase() !== "active") {
        return new Response(
          JSON.stringify({success: false, error: "Account is inactive"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 403,
          },
        );
      }

      if (
        !member.password_hash ||
        !(await bcryptCompare(currentPassword, member.password_hash))
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Current password is incorrect",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const passwordHash = await bcryptHash(newPassword);
      const {error: updateError} = await supabase
        .from("admin_team_members")
        .update({
          password_hash: passwordHash,
          must_reset_password: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);

      if (updateError) {
        console.error("Error changing team member password:", updateError);
        return new Response(
          JSON.stringify({success: false, error: "Failed to change password"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({success: true}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("Team member change password error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Settings route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}
