import { corsHeaders } from "../lib/cors.ts";
import { bcryptHash } from "../lib/password.ts";

// Generates a readable temp password admins can hand to a vendor. Avoids
// ambiguous characters (0/O, 1/l/I) so support tickets aren't "I think
// that was a zero?". 10 chars from a 60-char alphabet = ~58 bits of entropy.
function generateTempPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export async function handleAdminVendors(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/vendors/highlights
  // Returns four founder-eye KPIs for the Vendors page top strip:
  //   - active:              total active vendors + how many have a live discount
  //   - withoutActiveDiscount: count of active vendors with no current discount offer
  //   - topBySavings:        { name, totalSavings } vendor driving the most \$ saved
  //   - topByRedemptions:    { name, count } vendor with the most discount redemptions
  if (method === "GET" && route === "/admin/vendors/highlights") {
    try {
      // ---- All vendors snapshot ----
      const { data: vendors } = await supabase
        .from("vendors")
        .select("id, name, is_active");
      const vendorNameById: Record<number, string> = {};
      let activeCount = 0;
      for (const v of vendors || []) {
        vendorNameById[v.id] = v.name;
        if (v.is_active) activeCount += 1;
      }
      const activeVendorIds = new Set<number>(
        (vendors || []).filter((v: any) => v.is_active).map((v: any) => v.id),
      );

      // ---- Discounts: figure out which active vendors have a live discount ----
      const today = new Date().toISOString().split("T")[0];
      const { data: discounts } = await supabase
        .from("discounts")
        .select("vendor_id, is_active, end_date");
      const vendorsWithLiveDiscount = new Set<number>();
      for (const d of discounts || []) {
        if (!d.vendor_id) continue;
        if (!d.is_active) continue;
        if (d.end_date && d.end_date < today) continue;
        vendorsWithLiveDiscount.add(d.vendor_id);
      }
      let withoutActiveDiscount = 0;
      for (const vid of activeVendorIds) {
        if (!vendorsWithLiveDiscount.has(vid)) withoutActiveDiscount += 1;
      }
      // Intersection: active vendors that also have a live discount (vs. dormant).
      let withLiveDiscount = 0;
      for (const vid of vendorsWithLiveDiscount) {
        if (activeVendorIds.has(vid)) withLiveDiscount += 1;
      }

      // ---- Redemptions: top vendor by \$ saved + by count ----
      const { data: redemptions } = await supabase
        .from("redemptions")
        .select("vendor_id, total_savings");
      const savingsByVendor: Record<number, number> = {};
      const countsByVendor: Record<number, number> = {};
      for (const r of redemptions || []) {
        if (!r.vendor_id) continue;
        countsByVendor[r.vendor_id] = (countsByVendor[r.vendor_id] || 0) + 1;
        const saved = parseFloat((r.total_savings ?? 0).toString());
        if (!Number.isNaN(saved)) {
          savingsByVendor[r.vendor_id] =
            (savingsByVendor[r.vendor_id] || 0) + saved;
        }
      }
      let topSavingsId: number | null = null;
      let topSavings = 0;
      for (const [id, total] of Object.entries(savingsByVendor)) {
        if ((total as number) > topSavings) {
          topSavings = total as number;
          topSavingsId = Number(id);
        }
      }
      let topCountId: number | null = null;
      let topCount = 0;
      for (const [id, count] of Object.entries(countsByVendor)) {
        if ((count as number) > topCount) {
          topCount = count as number;
          topCountId = Number(id);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            active: {
              count: activeCount,
              withLiveDiscount,
            },
            withoutActiveDiscount,
            topBySavings:
              topSavingsId !== null
                ? {
                    vendorId: topSavingsId,
                    name:
                      vendorNameById[topSavingsId] || `Vendor ${topSavingsId}`,
                    totalSavings: Math.round(topSavings * 100) / 100,
                  }
                : null,
            topByRedemptions:
              topCountId !== null
                ? {
                    vendorId: topCountId,
                    name: vendorNameById[topCountId] || `Vendor ${topCountId}`,
                    count: topCount,
                  }
                : null,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (err: any) {
      console.error("vendors/highlights error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "highlights failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /admin/vendors
  if (method === "GET" && route === "/admin/vendors") {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;
    const search = url.searchParams.get("search");
    const category = url.searchParams.get("category");

    // Build query
    let query = supabase.from("vendors").select("*", {count: "exact"});

    // Search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Category filter
    if (category) {
      query = query.eq("category", category);
    }

    // Order and pagination
    query = query
      .order("created_at", {ascending: false})
      .range(offset, offset + limit - 1);

    const {data: vendors, error, count} = await query;

    if (error) {
      console.error("❌ Admin get vendors error:", error);
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    // For self-signup vendors, fetch the signup email + name from the users
    // table so the admin list shows the real account email (not the public
    // contact email the vendor entered separately on the wizard's contact step).
    const authUserIds = (vendors || [])
      .map((v: any) => v.auth_user_id)
      .filter(Boolean);
    let userById = new Map<number, any>();
    if (authUserIds.length > 0) {
      const {data: users} = await supabase
        .from("users")
        .select("id, email, first_name, last_name")
        .in("id", authUserIds);
      for (const u of users || []) userById.set(u.id, u);
    }

    const enrichedVendors = (vendors || []).map((v: any) => {
      const u = v.auth_user_id ? userById.get(v.auth_user_id) : null;
      return {
        ...v,
        account_email: u?.email || null,
        account_owner_name: u
          ? [u.first_name, u.last_name].filter(Boolean).join(" ") || null
          : null,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: enrichedVendors,
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit),
        },
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/vendors/:id/logo (file upload)
  const vendorLogoMatch = route.match(/^\/admin\/vendors\/(\d+)\/logo$/);
  if (method === "POST" && vendorLogoMatch) {
    const vendorId = vendorLogoMatch[1];

    // Verify vendor exists
    const {data: vendor, error: vendorError} = await supabase
      .from("vendors")
      .select("*")
      .eq("id", vendorId)
      .single();

    if (vendorError || !vendor) {
      return new Response(JSON.stringify({error: "Vendor not found"}), {
        headers: {"Content-Type": "application/json"},
        status: 404,
      });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("logo") as File;

    if (!file) {
      return new Response(JSON.stringify({error: "No file uploaded"}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = file.name.split(".").pop();
    const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `vendor-${vendorId}/${fileName}`;

    // Upload to Supabase Storage
    const {data: uploadData, error: uploadError} = await supabase.storage
      .from("vendor-logos")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("❌ Error uploading logo:", uploadError);
      return new Response(JSON.stringify({error: "Failed to upload logo"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    // Get public URL
    const {
      data: {publicUrl},
    } = supabase.storage.from("vendor-logos").getPublicUrl(filePath);

    // Update vendor with new logo URL
    const {error: updateError} = await supabase
      .from("vendors")
      .update({
        logo_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vendorId);

    if (updateError) {
      console.error("❌ Error updating vendor logo:", updateError);

      // Try to delete uploaded file if database update fails
      try {
        await supabase.storage.from("vendor-logos").remove([filePath]);
      } catch (deleteError) {
        console.error("Error deleting uploaded file:", deleteError);
      }

      return new Response(
        JSON.stringify({error: "Failed to update vendor logo"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        logoUrl: publicUrl,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/vendors
  if (method === "POST" && route === "/admin/vendors") {
    const body = await req.json();
    const {
      name,
      category,
      description,
      website,
      phone,
      socialLinks,
      address,
      hours,
      logoUrl,
      logo_url,
    } = body;

    if (!name) {
      return new Response(JSON.stringify({error: "Vendor name is required"}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    // Handle logo URL - accept both camelCase and snake_case
    const logoUrlValue = logoUrl || logo_url;
    if (logoUrlValue !== undefined) {
      console.log(
        `📸 Logo URL received in POST /admin/vendors: ${logoUrlValue}`,
      );
    }

    const {data: newVendor, error: insertError} = await supabase
      .from("vendors")
      .insert([
        {
          name,
          category: category || null,
          description: description || null,
          website: website || null,
          phone: phone || null,
          social_links: socialLinks || null,
          address: address || null,
          hours: hours || null,
          logo_url: logoUrlValue || null,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("❌ Admin create vendor error:", insertError);
      return new Response(JSON.stringify({error: insertError.message}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    return new Response(JSON.stringify({success: true, data: newVendor}), {
      headers: {"Content-Type": "application/json"},
      status: 201,
    });
  }

  // GET /admin/vendors/:id
  const vendorIdMatch = route.match(/^\/admin\/vendors\/(\d+)$/);
  if (method === "GET" && vendorIdMatch) {
    const vendorId = vendorIdMatch[1];

    const {data: vendor, error} = await supabase
      .from("vendors")
      .select("*")
      .eq("id", vendorId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(JSON.stringify({error: "Vendor not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    return new Response(JSON.stringify({success: true, data: vendor}), {
      headers: {"Content-Type": "application/json"},
      status: 200,
    });
  }

  // PUT /admin/vendors/:id
  const putVendorMatch = route.match(/^\/admin\/vendors\/(\d+)$/);
  if (method === "PUT" && putVendorMatch) {
    const vendorId = putVendorMatch[1];
    const body = await req.json();

    const {
      name,
      category,
      description,
      website,
      phone,
      socialLinks,
      address,
      hours,
      logoUrl,
      logo_url,
      status,
      is_enabled,
      // Primary contact + login email live on the linked users row, not the
      // vendors table. The admin UI sends these alongside vendor fields, and
      // we route them to users.* below.
      email,
      firstName,
      first_name,
      lastName,
      last_name,
      contactName,
      contact_name,
    } = body;

    // Handle logo URL - accept both camelCase and snake_case
    const logoUrlValue = logoUrl || logo_url;
    if (logoUrlValue !== undefined) {
      console.log(
        `📸 Logo URL received in PUT /admin/vendors/${vendorId}: ${logoUrlValue}`,
      );
    } else {
      console.log(
        `⚠️ No logoUrl or logo_url provided in PUT /admin/vendors/${vendorId}`,
      );
    }

    // Build update object - only include fields that were explicitly provided (partial update support)
    const updateObj: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updateObj.name = name;
    if (category !== undefined) updateObj.category = category || null;
    if (description !== undefined) updateObj.description = description || null;
    if (website !== undefined) updateObj.website = website || null;
    if (phone !== undefined) updateObj.phone = phone || null;
    if (socialLinks !== undefined) updateObj.social_links = socialLinks || null;
    if (address !== undefined) updateObj.address = address || null;
    if (hours !== undefined) updateObj.hours = hours || null;
    if (logoUrlValue !== undefined) updateObj.logo_url = logoUrlValue || null;
    // Active/inactive toggle - vendors table uses is_active (not status)
    if (status !== undefined) {
      updateObj.is_active = status === "active";
    }
    // is_enabled for enable/disable toggle (if vendors table has this column)
    if (is_enabled !== undefined) {
      updateObj.is_enabled = !!is_enabled;
    }

    const {data: updatedVendor, error} = await supabase
      .from("vendors")
      .update(updateObj)
      .eq("id", vendorId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(JSON.stringify({error: "Vendor not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 400,
      });
    }

    // Apply primary-contact + login-email updates to the linked user row.
    // These fields don't live on the vendors table, so for vendors without
    // a portal account yet we surface a warning instead of dropping silently.
    const userUpdates: Record<string, any> = {};
    if (email !== undefined && typeof email === "string" && email.trim()) {
      userUpdates.email = email.trim().toLowerCase();
    }
    const resolvedFirst = firstName ?? first_name;
    const resolvedLast = lastName ?? last_name;
    const resolvedContact = contactName ?? contact_name;
    if (resolvedFirst !== undefined) userUpdates.first_name = resolvedFirst || null;
    if (resolvedLast !== undefined) userUpdates.last_name = resolvedLast || null;
    // If only a single "contactName" came in (no separate first/last), split
    // it on the first whitespace. Don't overwrite anything we already set
    // above from explicit firstName/lastName fields.
    if (
      resolvedContact !== undefined &&
      userUpdates.first_name === undefined &&
      userUpdates.last_name === undefined
    ) {
      const trimmed = String(resolvedContact || "").trim();
      if (trimmed) {
        const parts = trimmed.split(/\s+/);
        userUpdates.first_name = parts.shift() || null;
        userUpdates.last_name = parts.length ? parts.join(" ") : null;
      } else {
        userUpdates.first_name = null;
        userUpdates.last_name = null;
      }
    }

    let userWarning: string | null = null;
    if (Object.keys(userUpdates).length > 0) {
      if (!updatedVendor.auth_user_id) {
        userWarning =
          "Contact name and email weren't saved — this vendor doesn't have a portal account yet. Create one via POST /admin/vendors/:id/create-account first.";
      } else {
        // Don't let an email update collide with another existing user.
        if (userUpdates.email) {
          const {data: collision} = await supabase
            .from("users")
            .select("id")
            .ilike("email", userUpdates.email)
            .neq("id", updatedVendor.auth_user_id)
            .limit(1);
          if (collision && collision.length > 0) {
            userWarning = `Email ${userUpdates.email} is already in use by another user — the vendor's email was NOT changed.`;
            delete userUpdates.email;
          }
        }
        if (Object.keys(userUpdates).length > 0) {
          const {error: userUpdateErr} = await supabase
            .from("users")
            .update(userUpdates)
            .eq("id", updatedVendor.auth_user_id);
          if (userUpdateErr) {
            console.error("vendor PUT — linked user update error:", userUpdateErr);
            userWarning =
              "Vendor saved, but the contact info on the linked account couldn't be updated.";
          }
        }
      }
    }

    return new Response(
      JSON.stringify({success: true, data: updatedVendor, warning: userWarning}),
      {headers: {"Content-Type": "application/json"}, status: 200},
    );
  }

  // DELETE /admin/vendors/:id — fully wipes the vendor:
  //   • storage files under vendor-logos/vendor-<id>/
  //   • the linked auth user (if this was a self-signup vendor)
  //   • the vendors row (FK cascade handles discounts → redemptions /
  //     discount_code_history, plus vendor_views and vendor_favorites)
  const deleteVendorMatch = route.match(/^\/admin\/vendors\/(\d+)$/);
  if (method === "DELETE" && deleteVendorMatch) {
    const vendorId = deleteVendorMatch[1];

    // Snapshot the vendor row so we can find its auth user before deleting.
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id, auth_user_id")
      .eq("id", vendorId)
      .maybeSingle();

    // 1. Storage cleanup — list every file in the vendor's folder then remove.
    try {
      const { data: files } = await supabase.storage
        .from("vendor-logos")
        .list(`vendor-${vendorId}`);
      if (files && files.length > 0) {
        const paths = files.map((f: any) => `vendor-${vendorId}/${f.name}`);
        const { error: removeError } = await supabase.storage
          .from("vendor-logos")
          .remove(paths);
        if (removeError) {
          console.warn("vendor logo storage cleanup error:", removeError);
        }
      }
    } catch (e) {
      console.warn("vendor storage list/remove error:", e);
    }

    // 2. Delete the vendors row — cascades to discounts (→ redemptions +
    //    discount_code_history), vendor_views, vendor_favorites.
    const { error } = await supabase.from("vendors").delete().eq("id", vendorId);
    if (error) {
      console.error("❌ Admin delete vendor error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    // 3. Remove the linked auth user. Other FK columns referencing users.id
    //    use ON DELETE SET NULL, so this is safe and the user can no longer
    //    log in to the portal. Only applies to self-signup vendors.
    if (vendor?.auth_user_id) {
      const { error: userError } = await supabase
        .from("users")
        .delete()
        .eq("id", vendor.auth_user_id);
      if (userError) {
        console.warn("vendor linked user delete error (non-fatal):", userError);
      }
    }

    return new Response(
      JSON.stringify({ message: "Vendor and all associated data deleted" }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  }

  // POST /admin/vendors/:id/create-account
  // For vendors created by an admin (no auth_user_id yet), provisions a
  // vendorAdmin user, links it to the vendor row, returns the email + a
  // single-use temp password. The admin shares it with the vendor out-of-band;
  // the vendor changes it via the portal's Profile screen on first login.
  const createAccountMatch = route.match(/^\/admin\/vendors\/(\d+)\/create-account$/);
  if (method === "POST" && createAccountMatch) {
    try {
      const vendorId = parseInt(createAccountMatch[1], 10);
      const body = await req.json().catch(() => ({}));
      const rawEmail = String(body.email || "").trim().toLowerCase();
      const firstName = String(body.firstName || body.first_name || "").trim();
      const lastName = String(body.lastName || body.last_name || "").trim();

      if (!rawEmail || !rawEmail.includes("@")) {
        return new Response(
          JSON.stringify({error: "A valid email is required to create the account"}),
          {headers: {"Content-Type": "application/json"}, status: 400},
        );
      }

      // 1. Vendor must exist and not already be linked to a user.
      const {data: vendor, error: vendorErr} = await supabase
        .from("vendors")
        .select("id, name, auth_user_id")
        .eq("id", vendorId)
        .single();
      if (vendorErr || !vendor) {
        return new Response(JSON.stringify({error: "Vendor not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }
      if (vendor.auth_user_id) {
        return new Response(
          JSON.stringify({
            error: "Vendor already has a portal account",
            existingUserId: vendor.auth_user_id,
          }),
          {headers: {"Content-Type": "application/json"}, status: 409},
        );
      }

      // 2. Email must not already be in use by another user (case-insensitive).
      const {data: existingByEmail} = await supabase
        .from("users")
        .select("id, email, role")
        .ilike("email", rawEmail)
        .limit(1);
      if (existingByEmail && existingByEmail.length > 0) {
        return new Response(
          JSON.stringify({
            error: `A user already exists at ${rawEmail}. Link the vendor to that user instead, or use a different email.`,
            existingUserId: existingByEmail[0].id,
          }),
          {headers: {"Content-Type": "application/json"}, status: 409},
        );
      }

      // 3. Provision the user with a fresh temp password.
      const tempPassword = generateTempPassword();
      const passwordHash = await bcryptHash(tempPassword);
      const {data: newUser, error: userInsertErr} = await supabase
        .from("users")
        .insert({
          email: rawEmail,
          password_hash: passwordHash,
          role: "vendorAdmin",
          first_name: firstName || null,
          last_name: lastName || null,
          is_verified: true, // admin-vouched accounts skip email verification
          account_status: "active",
        })
        .select("id, email, role, first_name, last_name")
        .single();
      if (userInsertErr || !newUser) {
        console.error("create-account user insert error:", userInsertErr);
        return new Response(
          JSON.stringify({error: userInsertErr?.message || "Failed to create user"}),
          {headers: {"Content-Type": "application/json"}, status: 500},
        );
      }

      // 4. Link vendor → user.
      const {error: linkErr} = await supabase
        .from("vendors")
        .update({auth_user_id: newUser.id})
        .eq("id", vendorId);
      if (linkErr) {
        console.error("create-account vendor link error:", linkErr);
        // Best-effort rollback so we don't leave an orphan user.
        await supabase.from("users").delete().eq("id", newUser.id);
        return new Response(
          JSON.stringify({error: "Failed to link account to vendor"}),
          {headers: {"Content-Type": "application/json"}, status: 500},
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Portal account created. Share the temp password with the vendor — they can change it from Profile after signing in.",
          vendor: {id: vendor.id, name: vendor.name},
          user: newUser,
          tempPassword,
        }),
        {headers: {"Content-Type": "application/json"}, status: 201},
      );
    } catch (error: any) {
      console.error("create-account error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Server error"}),
        {headers: {"Content-Type": "application/json"}, status: 500},
      );
    }
  }

  return new Response(JSON.stringify({error: "Vendor route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}
