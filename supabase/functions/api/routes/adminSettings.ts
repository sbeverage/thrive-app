import { corsHeaders } from "../lib/cors.ts";
import { bcryptHash, bcryptCompare } from "../lib/password.ts";
import { createAdminToken } from "../lib/adminAuth.ts";

/**
 * Failed-login lockout.
 *
 * Until now the admin API was gated by a shared secret, so the login endpoint
 * was unreachable without it and brute force was not a concern. The login
 * route is now public (it has to be — requiring the secret to log in is what
 * forced the secret into the browser), so the password is the only thing
 * standing in front of donor data and it needs a cost per guess.
 *
 * State lives on admin_team_members. Both helpers are best effort: if the
 * columns have not been added yet, they log once and carry on rather than
 * failing the login. The alternative is that a missing column locks every
 * admin out of the panel, which is a worse failure than a missing lockout.
 * The migration is
 * supabase/migrations/RUN_ME_admin_login_lockout_2026-11-13.sql.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

async function readLockout(
  supabase: any,
  memberId: number,
): Promise<{ lockedUntil: Date | null; attempts: number }> {
  try {
    const {data, error} = await supabase
      .from("admin_team_members")
      .select("failed_login_attempts, locked_until")
      .eq("id", memberId)
      .single();
    if (error || !data) return {lockedUntil: null, attempts: 0};
    const lu = data.locked_until ? new Date(data.locked_until) : null;
    return {
      lockedUntil: lu && !Number.isNaN(lu.getTime()) ? lu : null,
      attempts: Number(data.failed_login_attempts) || 0,
    };
  } catch (_err) {
    console.warn("admin login: lockout columns unavailable, lockout disabled");
    return {lockedUntil: null, attempts: 0};
  }
}

async function recordFailedAttempt(
  supabase: any,
  memberId: number,
  attempts: number,
): Promise<void> {
  const next = attempts + 1;
  const payload: Record<string, unknown> = {failed_login_attempts: next};
  if (next >= MAX_FAILED_ATTEMPTS) {
    payload.locked_until = new Date(
      Date.now() + LOCKOUT_MINUTES * 60 * 1000,
    ).toISOString();
  }
  try {
    await supabase.from("admin_team_members").update(payload).eq("id", memberId);
  } catch (_err) {
    console.warn("admin login: could not record a failed attempt");
  }
}

async function clearFailedAttempts(
  supabase: any,
  memberId: number,
): Promise<void> {
  try {
    await supabase
      .from("admin_team_members")
      .update({failed_login_attempts: 0, locked_until: null})
      .eq("id", memberId);
  } catch (_err) {
    /* best effort */
  }
}

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

  // DELETE /admin/settings/team/:id
  //
  // This route did not exist. The panel has called
  // DELETE /admin/settings/team/:id since it shipped, so every attempt to
  // remove a team member fell through to the 404 handler, which reports a
  // missing REACT_APP_API_BASE_URL and sent everyone looking for a config
  // problem that was not there.
  //
  // Team members live entirely in admin_team_members with their own
  // password_hash. There is no linked users row and no Supabase auth user, so
  // removing one really is a single row delete.
  const teamDeleteMatch = route.match(/^\/admin\/settings\/team\/(\d+)$/);
  if (method === "DELETE" && teamDeleteMatch) {
    try {
      const memberId = parseInt(teamDeleteMatch[1], 10);

      const {data: member, error: readError} = await supabase
        .from("admin_team_members")
        .select("id, name, email, role")
        .eq("id", memberId)
        .maybeSingle();

      if (readError) {
        return new Response(
          JSON.stringify({success: false, error: readError.message}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // A real 404 for a real missing row, rather than the route-level 404
      // that made this look like a configuration fault.
      if (!member) {
        return new Response(
          JSON.stringify({success: false, error: "Team member not found"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      // Never delete the last Super Admin. Nothing else grants access to this
      // panel, so removing the only one locks everybody out of the tool they
      // would need to undo it.
      if (String(member.role || "").trim().toLowerCase() === "super admin") {
        const {count} = await supabase
          .from("admin_team_members")
          .select("id", {count: "exact", head: true})
          .ilike("role", "super admin");

        if ((count ?? 0) <= 1) {
          return new Response(
            JSON.stringify({
              success: false,
              error:
                "This is the only Super Admin. Give someone else Super Admin first, or nobody will be able to sign in to the admin panel.",
            }),
            {
              headers: {...corsHeaders, "Content-Type": "application/json"},
              status: 409,
            },
          );
        }
      }

      const {error: deleteError} = await supabase
        .from("admin_team_members")
        .delete()
        .eq("id", memberId);

      if (deleteError) {
        return new Response(
          JSON.stringify({success: false, error: deleteError.message}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log(
        `\u{1F5D1}\uFE0F Removed admin team member ${memberId} (${member.email})`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {id: memberId, email: member.email, name: member.name},
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
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

      // Locked out from earlier failures? Checked after the account is known
      // to exist and be active, so the response for a locked account is not a
      // way to discover which emails are real.
      const lockout = await readLockout(supabase, member.id);
      if (lockout.lockedUntil && lockout.lockedUntil.getTime() > Date.now()) {
        const minutes = Math.max(
          1,
          Math.ceil((lockout.lockedUntil.getTime() - Date.now()) / 60000),
        );
        return new Response(
          JSON.stringify({
            success: false,
            error:
              `Too many sign-in attempts. Try again in ${minutes} minute` +
              `${minutes === 1 ? "" : "s"}, or reset your password.`,
            code: "locked_out",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 429,
          },
        );
      }

      if (
        !member.password_hash ||
        !(await bcryptCompare(password, member.password_hash))
      ) {
        await recordFailedAttempt(supabase, member.id, lockout.attempts);
        return new Response(
          JSON.stringify({
            success: false,
            error: "That email and password do not match. Give it another try?",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // must_reset_password is deliberately NOT cleared here. It used to be,
      // which meant a temporary password emailed to a new admin became their
      // permanent password the moment they first used it, and the reset they
      // were supposed to be forced through never happened. The flag is now
      // returned to the panel, and only POST /admin/settings/team/reset-password
      // clears it, which is the endpoint that actually changes the password.
      await supabase
        .from("admin_team_members")
        .update({
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", member.id);

      await clearFailedAttempts(supabase, member.id);

      // The token every later admin request authenticates with. Without it the
      // panel has nothing to send but the shared secret, which is the whole
      // problem this replaces, so a failure to mint one has to fail the login
      // rather than quietly fall back.
      const issued = await createAdminToken(member);
      if (!issued) {
        console.error("admin login: JWT_SECRET missing, cannot issue a token");
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Sign-in is not available right now because the server is missing " +
              "its signing key. Nothing is wrong with your password.",
            code: "token_unavailable",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 503,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: member.id,
            name: member.name,
            email: member.email,
            role: member.role,
            // The admin panel gates Team Management on this. It was reading
            // response.data.is_super_admin, which this endpoint never sent, so
            // it stored "false" for everyone and the "Add Team Member" button
            // rendered for nobody — the feature was unreachable.
            // Derived from role rather than stored separately, so there is one
            // source of truth. Compared case-insensitively because the column
            // holds display text ("Super Admin").
            is_super_admin:
              String(member.role || "").trim().toLowerCase() === "super admin",
            // The panel sends this as `Authorization: Bearer <token>` on every
            // later request, in place of the shared secret.
            token: issued.token,
            expires_at: issued.expiresAt,
            // True while this account is still on the password it was emailed.
            must_reset_password: member.must_reset_password === true,
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
