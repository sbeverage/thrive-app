import { corsHeaders } from "../lib/cors.ts";

export async function handleAdminNotifications(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  const url = new URL(req.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "20", 10),
    100,
  );
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";

  if (method === "GET" && route === "/admin/notifications") {
    try {
      let query = supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      if (unreadOnly) {
        query = query.is("read_at", null);
      }

      const {data, error} = await query;

      if (error) {
        console.error("❌ Error fetching notifications:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch notifications",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const {count: unreadCount, error: unreadError} = await supabase
        .from("admin_notifications")
        .select("id", {count: "exact", head: true})
        .is("read_at", null);

      if (unreadError) {
        console.warn("⚠️ Failed to count unread notifications:", unreadError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: data || [],
          unreadCount: unreadCount ?? 0,
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Notifications GET error:", error);
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

  if (method === "POST" && route === "/admin/notifications") {
    try {
      const payload = await req.json();
      const title = payload?.title?.toString().trim();
      const message = payload?.message?.toString().trim() || null;
      const level = ["info", "success", "warning", "error"].includes(
        payload?.level,
      )
        ? payload.level
        : "info";

      if (!title) {
        return new Response(
          JSON.stringify({success: false, error: "Title is required"}),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const insertPayload = {
        title,
        message,
        level,
        entity_type: payload?.entity_type || null,
        entity_id: payload?.entity_id ? String(payload.entity_id) : null,
        metadata: payload?.metadata || {},
      };

      const {data, error} = await supabase
        .from("admin_notifications")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        console.error("❌ Error creating notification:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to create notification",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Send email to admin team members for notifications shown in the bell
      try {
        const {data: members} = await supabase
          .from("admin_team_members")
          .select("id, name, email")
          .eq("status", "Active");
        if (members && members.length > 0) {
          for (const member of members) {
            if (member.email) {
              await sendNotificationEmail({
                to: member.email,
                name: member.name || member.email.split("@")[0],
                title,
                message,
                level,
              });
            }
          }
        }
      } catch (emailErr) {
        console.warn(
          "⚠️ Failed to send notification emails (non-fatal):",
          emailErr,
        );
      }

      return new Response(JSON.stringify({success: true, data}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 201,
      });
    } catch (error: any) {
      console.error("❌ Notifications POST error:", error);
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

  if (method === "POST" && route === "/admin/notifications/read") {
    try {
      const payload = await req.json();
      const markAll = payload?.all === true;
      const ids: string[] = Array.isArray(payload?.ids)
        ? payload.ids.map((id: any) => String(id))
        : [];

      let updateQuery = supabase
        .from("admin_notifications")
        .update({read_at: new Date().toISOString()});

      if (markAll) {
        updateQuery = updateQuery.is("read_at", null);
      } else if (ids.length > 0) {
        updateQuery = updateQuery.in("id", ids);
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: "No notification ids provided",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      const {error} = await updateQuery;

      if (error) {
        console.error("❌ Error updating notifications:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to mark notifications as read",
          }),
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
      console.error("❌ Notifications read error:", error);
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

  return new Response(
    JSON.stringify({error: "Notifications route not found"}),
    {
      headers: {...corsHeaders, "Content-Type": "application/json"},
      status: 404,
    },
  );
}
