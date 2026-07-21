import { corsHeaders } from "../lib/cors.ts";
import { bcryptHash } from "../lib/password.ts";
import { sendVendorEmail } from "../lib/email.ts";
import { normalizeHours } from "../lib/vendorHours.ts";

// Generates a readable temp password admins can hand to a vendor. Avoids
// ambiguous characters (0/O, 1/l/I) so support tickets aren't "I think
// that was a zero?". 10 chars from a 60-char alphabet = ~58 bits of entropy.
// Enriches a vendor row with fields the admin panel's VendorProfile form
// expects at the top level (email, firstName, lastName, contactName) plus
// the account_email + account_owner_name fields the list view already
// uses. All read/write endpoints in this file return this shape so the
// admin panel can rely on it on both save-response and refresh.
//
// contactName is sourced from vendors.contact_name (added in migration
// 20260718000002) which persists regardless of whether a portal account
// exists. Falls back to the linked users row's first/last when the vendor
// column is empty — mostly for old rows that predate the column.
async function enrichVendorForAdmin(supabase: any, vendor: any) {
  if (!vendor) return vendor;
  let user: any = null;
  if (vendor.auth_user_id) {
    const { data } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('id', vendor.auth_user_id)
      .maybeSingle();
    user = data;
  }
  const linkedFullName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || null
    : null;
  const contactName = vendor.contact_name || linkedFullName;
  // Split contactName into first/last so form fields that bind to the split
  // parts still get a value even if only the combined name is stored.
  let firstName: string | null = user?.first_name || null;
  let lastName: string | null = user?.last_name || null;
  if (!firstName && !lastName && contactName) {
    const parts = String(contactName).trim().split(/\s+/);
    firstName = parts.shift() || null;
    lastName = parts.length ? parts.join(' ') : null;
  }
  return {
    ...vendor,
    account_email: user?.email || null,
    account_owner_name: linkedFullName,
    email: user?.email || null,
    firstName,
    lastName,
    contactName,
  };
}

function generateTempPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// Shared: provisions a vendorAdmin user + links it to the vendor row, and
// sends the vendor an invite email with their username + temp password.
// Used by POST /admin/vendors, PUT /admin/vendors/:id (when the admin
// enters an email on a vendor that has no portal account yet), and
// POST /admin/vendors/:id/create-account.
// Returns { user, tempPassword } on success, or { error, status } on failure.
async function provisionVendorPortalAccount(
  supabase: any,
  vendorId: number,
  email: string,
  firstName: string,
  lastName: string,
  businessName?: string,
): Promise<
  | { user: any; tempPassword: string }
  | { error: string; status: number; existingUserId?: number }
> {
  const rawEmail = String(email || "").trim().toLowerCase();
  if (!rawEmail || !rawEmail.includes("@")) {
    return { error: "A valid email is required", status: 400 };
  }

  const { data: existingByEmail } = await supabase
    .from("users")
    .select("id, email, role")
    .ilike("email", rawEmail)
    .limit(1);
  if (existingByEmail && existingByEmail.length > 0) {
    return {
      error: `A user already exists at ${rawEmail}. Link the vendor to that user instead, or use a different email.`,
      status: 409,
      existingUserId: existingByEmail[0].id,
    };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcryptHash(tempPassword);
  const { data: newUser, error: userInsertErr } = await supabase
    .from("users")
    .insert({
      email: rawEmail,
      password_hash: passwordHash,
      role: "vendorAdmin",
      first_name: firstName || null,
      last_name: lastName || null,
      is_verified: true,
      account_status: "active",
    })
    .select("id, email, role, first_name, last_name")
    .single();
  if (userInsertErr || !newUser) {
    console.error("provisionVendorPortalAccount user insert error:", userInsertErr);
    return { error: userInsertErr?.message || "Failed to create user", status: 500 };
  }

  const { error: linkErr } = await supabase
    .from("vendors")
    .update({ auth_user_id: newUser.id })
    .eq("id", vendorId);
  if (linkErr) {
    console.error("provisionVendorPortalAccount vendor link error:", linkErr);
    await supabase.from("users").delete().eq("id", newUser.id);
    return { error: "Failed to link account to vendor", status: 500 };
  }

  // Fetch the vendor name for the email if the caller didn't pass it.
  let resolvedBusinessName = businessName || "";
  if (!resolvedBusinessName) {
    const { data: v } = await supabase
      .from("vendors")
      .select("name")
      .eq("id", vendorId)
      .maybeSingle();
    resolvedBusinessName = v?.name || "your business";
  }

  // Fire-and-forget — don't let an email failure roll back a good account.
  sendVendorEmail({
    to: rawEmail,
    name: [firstName, lastName].filter(Boolean).join(" "),
    businessName: resolvedBusinessName,
    kind: "portal_invite",
    loginEmail: rawEmail,
    tempPassword,
  }).catch((e) => console.error("portal_invite email failed:", e));

  return { user: newUser, tempPassword };
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

    // Shape matches enrichVendorForAdmin() — kept inline here because the
    // list already batch-fetched users in one query above, and we want to
    // avoid an N+1 for every vendor.
    const enrichedVendors = (vendors || []).map((v: any) => {
      const u = v.auth_user_id ? userById.get(v.auth_user_id) : null;
      const linkedFullName = u
        ? [u.first_name, u.last_name].filter(Boolean).join(" ") || null
        : null;
      const contactName = v.contact_name || linkedFullName;
      let firstName: string | null = u?.first_name || null;
      let lastName: string | null = u?.last_name || null;
      if (!firstName && !lastName && contactName) {
        const parts = String(contactName).trim().split(/\s+/);
        firstName = parts.shift() || null;
        lastName = parts.length ? parts.join(" ") : null;
      }
      return {
        ...v,
        account_email: u?.email || null,
        account_owner_name: linkedFullName,
        email: u?.email || null,
        firstName,
        lastName,
        contactName,
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

  // POST /admin/vendors/:id/images — append a photo to the vendor gallery.
  // Max 5 images per vendor (enforced both here and via a CHECK constraint).
  const vendorImagesUploadMatch = route.match(/^\/admin\/vendors\/(\d+)\/images$/);
  if (method === "POST" && vendorImagesUploadMatch) {
    const vendorId = vendorImagesUploadMatch[1];
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, image_urls")
      .eq("id", vendorId)
      .single();
    if (vendorError || !vendor) {
      return new Response(JSON.stringify({ error: "Vendor not found" }), {
        headers: { "Content-Type": "application/json" },
        status: 404,
      });
    }
    const existing: string[] = Array.isArray(vendor.image_urls) ? vendor.image_urls : [];
    if (existing.length >= 5) {
      return new Response(
        JSON.stringify({ error: "This vendor already has 5 images. Remove one before adding another." }),
        { headers: { "Content-Type": "application/json" }, status: 400 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("image") as File;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file uploaded" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const filePath = `vendor-${vendorId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vendor-images")
      .upload(filePath, buf, { contentType: file.type, upsert: false });
    if (uploadError) {
      console.error("❌ Error uploading vendor image:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload image" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("vendor-images").getPublicUrl(filePath);

    const nextArray = [...existing, publicUrl];
    const { error: updateError } = await supabase
      .from("vendors")
      .update({ image_urls: nextArray, updated_at: new Date().toISOString() })
      .eq("id", vendorId);
    if (updateError) {
      // Best-effort rollback of the storage upload so we don't leave orphans.
      await supabase.storage.from("vendor-images").remove([filePath]).catch(() => {});
      console.error("❌ Error updating vendor image_urls:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save image" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({ success: true, imageUrl: publicUrl, image_urls: nextArray }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  }

  // DELETE /admin/vendors/:id/images — remove a photo. Body: { url }.
  // Reorders / bulk-replaces go through PUT /admin/vendors/:id with an
  // image_urls array instead.
  if (method === "DELETE" && vendorImagesUploadMatch) {
    const vendorId = vendorImagesUploadMatch[1];
    const body = await req.json().catch(() => ({}));
    const url = String(body.url || "").trim();
    if (!url) {
      return new Response(JSON.stringify({ error: "Missing `url` in request body" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, image_urls")
      .eq("id", vendorId)
      .single();
    if (vendorError || !vendor) {
      return new Response(JSON.stringify({ error: "Vendor not found" }), {
        headers: { "Content-Type": "application/json" },
        status: 404,
      });
    }
    const existing: string[] = Array.isArray(vendor.image_urls) ? vendor.image_urls : [];
    const nextArray = existing.filter((u) => u !== url);
    if (nextArray.length === existing.length) {
      return new Response(
        JSON.stringify({ error: "That image isn't on this vendor" }),
        { headers: { "Content-Type": "application/json" }, status: 404 },
      );
    }
    const { error: updateError } = await supabase
      .from("vendors")
      .update({ image_urls: nextArray, updated_at: new Date().toISOString() })
      .eq("id", vendorId);
    if (updateError) {
      console.error("❌ Error updating vendor image_urls:", updateError);
      return new Response(JSON.stringify({ error: "Failed to remove image" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Best-effort storage cleanup — extract the object path from the URL.
    // Public Storage URLs look like:
    //   https://<project>.supabase.co/storage/v1/object/public/vendor-images/vendor-42/1234_abc.jpg
    // We slice off everything up to and including "/vendor-images/".
    const marker = "/vendor-images/";
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const path = url.slice(idx + marker.length);
      await supabase.storage.from("vendor-images").remove([path]).catch(() => {});
    }

    return new Response(
      JSON.stringify({ success: true, image_urls: nextArray }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
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
      email,
      firstName,
      first_name,
      lastName,
      last_name,
      contactName,
      contact_name,
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
          hours: hours ? normalizeHours(hours) : null,
          logo_url: logoUrlValue || null,
          // Admin-created vendors are pre-vetted — skip the pending queue so
          // they appear on the donor app immediately (self-serve signups still
          // stamp submitted_at via /vendor/me/resubmit and get reviewed).
          signup_status: "approved",
          approved_at: new Date().toISOString(),
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

    // If the admin included an email at creation time, provision the vendor's
    // portal account now — otherwise the field would be silently dropped
    // (vendors.email column no longer exists; email lives on the linked users
    // row via vendors.auth_user_id). Returns a temp password the admin shares
    // with the vendor out-of-band.
    let portalAccount: any = null;
    let portalWarning: string | null = null;
    if (email !== undefined && String(email || "").trim()) {
      let resolvedFirst = String(firstName ?? first_name ?? "").trim();
      let resolvedLast = String(lastName ?? last_name ?? "").trim();
      const resolvedContact = String(contactName ?? contact_name ?? "").trim();
      if (!resolvedFirst && !resolvedLast && resolvedContact) {
        const parts = resolvedContact.split(/\s+/);
        resolvedFirst = parts.shift() || "";
        resolvedLast = parts.join(" ");
      }
      const provisioned = await provisionVendorPortalAccount(
        supabase,
        newVendor.id,
        String(email),
        resolvedFirst,
        resolvedLast,
        newVendor.name,
      );
      if ("user" in provisioned) {
        portalAccount = { user: provisioned.user, tempPassword: provisioned.tempPassword };
      } else {
        portalWarning = provisioned.error;
      }
    }

    // If we auto-provisioned during create, the vendor now has auth_user_id
    // set — refetch so the enriched shape includes the linked users row.
    const newVendorForResponse = portalAccount
      ? (await supabase.from("vendors").select("*").eq("id", newVendor.id).single()).data || newVendor
      : newVendor;
    return new Response(
      JSON.stringify({
        success: true,
        data: await enrichVendorForAdmin(supabase, newVendorForResponse),
        portalAccount,
        warning: portalWarning,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 201,
      },
    );
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

    return new Response(
      JSON.stringify({success: true, data: await enrichVendorForAdmin(supabase, vendor)}),
      { headers: {"Content-Type": "application/json"}, status: 200 },
    );
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
      image_urls,
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
    if (hours !== undefined) updateObj.hours = hours ? normalizeHours(hours) : null;
    if (image_urls !== undefined) {
      if (!Array.isArray(image_urls)) {
        return new Response(
          JSON.stringify({ error: "image_urls must be an array of URLs" }),
          { headers: { "Content-Type": "application/json" }, status: 400 },
        );
      }
      if (image_urls.length > 5) {
        return new Response(
          JSON.stringify({ error: "A vendor can have at most 5 gallery images" }),
          { headers: { "Content-Type": "application/json" }, status: 400 },
        );
      }
      updateObj.image_urls = image_urls;
    }

    // Contact name — persisted directly on the vendors row so it survives
    // regardless of whether a portal account exists. Kept in sync with
    // users.first_name/last_name below when the vendor IS linked to a user.
    const resolvedContactUp = contactName ?? contact_name;
    const resolvedFirstUp = firstName ?? first_name;
    const resolvedLastUp = lastName ?? last_name;
    let vendorContactName: string | undefined;
    if (resolvedContactUp !== undefined) {
      vendorContactName = String(resolvedContactUp || "").trim();
    } else if (resolvedFirstUp !== undefined || resolvedLastUp !== undefined) {
      vendorContactName = [
        String(resolvedFirstUp ?? "").trim(),
        String(resolvedLastUp ?? "").trim(),
      ].filter(Boolean).join(" ");
    }
    if (vendorContactName !== undefined) {
      updateObj.contact_name = vendorContactName || null;
    }
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
    let portalAccount: any = null;
    if (Object.keys(userUpdates).length > 0) {
      if (!updatedVendor.auth_user_id) {
        // No linked users row yet — auto-provision one when we have an email,
        // so the admin's save actually persists instead of silently dropping.
        if (userUpdates.email) {
          const provisioned = await provisionVendorPortalAccount(
            supabase,
            updatedVendor.id,
            userUpdates.email,
            String(userUpdates.first_name || ""),
            String(userUpdates.last_name || ""),
            updatedVendor.name,
          );
          if ("user" in provisioned) {
            portalAccount = { user: provisioned.user, tempPassword: provisioned.tempPassword };
            updatedVendor.auth_user_id = provisioned.user.id;
          } else {
            userWarning = provisioned.error;
          }
        } else {
          userWarning =
            "Contact name wasn't saved — this vendor doesn't have a portal account yet. Add an email so the portal account can be created.";
        }
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
      JSON.stringify({
        success: true,
        data: await enrichVendorForAdmin(supabase, updatedVendor),
        warning: userWarning,
        portalAccount,
      }),
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

    // 1. Storage cleanup — list every file in the vendor's folder across
    //    both buckets (logo + gallery images) and remove.
    for (const bucket of ["vendor-logos", "vendor-images"]) {
      try {
        const { data: files } = await supabase.storage
          .from(bucket)
          .list(`vendor-${vendorId}`);
        if (files && files.length > 0) {
          const paths = files.map((f: any) => `vendor-${vendorId}/${f.name}`);
          const { error: removeError } = await supabase.storage
            .from(bucket)
            .remove(paths);
          if (removeError) {
            console.warn(`${bucket} cleanup error:`, removeError);
          }
        }
      } catch (e) {
        console.warn(`${bucket} list/remove error:`, e);
      }
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

      // Vendor must exist and not already be linked to a user.
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

      const provisioned = await provisionVendorPortalAccount(
        supabase,
        vendorId,
        rawEmail,
        firstName,
        lastName,
        vendor.name,
      );
      if (!("user" in provisioned)) {
        return new Response(
          JSON.stringify({
            error: provisioned.error,
            existingUserId: provisioned.existingUserId,
          }),
          {headers: {"Content-Type": "application/json"}, status: provisioned.status},
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Portal account created. Share the temp password with the vendor — they can change it from Profile after signing in.",
          vendor: {id: vendor.id, name: vendor.name},
          user: provisioned.user,
          tempPassword: provisioned.tempPassword,
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
