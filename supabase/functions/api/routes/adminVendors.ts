import { corsHeaders } from "../lib/cors.ts";

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

    return new Response(
      JSON.stringify({
        success: true,
        data: vendors || [],
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
      email,
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
          email: email || null,
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
      email,
      socialLinks,
      address,
      hours,
      logoUrl,
      logo_url,
      status,
      is_enabled,
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
    if (email !== undefined) updateObj.email = email || null;
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

    return new Response(JSON.stringify({success: true, data: updatedVendor}), {
      headers: {"Content-Type": "application/json"},
      status: 200,
    });
  }

  // DELETE /admin/vendors/:id
  const deleteVendorMatch = route.match(/^\/admin\/vendors\/(\d+)$/);
  if (method === "DELETE" && deleteVendorMatch) {
    const vendorId = deleteVendorMatch[1];

    const {error} = await supabase.from("vendors").delete().eq("id", vendorId);

    if (error) {
      console.error("❌ Admin delete vendor error:", error);
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({message: "Vendor deleted successfully"}),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  return new Response(JSON.stringify({error: "Vendor route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}
