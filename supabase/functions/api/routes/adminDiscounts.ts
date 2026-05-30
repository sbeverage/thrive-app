import { corsHeaders } from "../lib/cors.ts";

export async function handleAdminDiscounts(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/discounts/highlights
  // Returns three founder-eye KPIs for the Discounts page top strip:
  //   - activeDiscounts:    { count, vendorCount } — live discounts + distinct vendors offering them
  //   - redemptionsMonth:   { count, growthRate } — redemptions in last 30 days + % change vs prior month
  //   - topPerforming:      { title, vendorName, totalSavings } — discount with the most $ saved lifetime
  if (method === "GET" && route === "/admin/discounts/highlights") {
    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const ms = (days: number) => days * 24 * 60 * 60 * 1000;
      const thirtyAgo = new Date(now.getTime() - ms(30)).toISOString();
      const sixtyAgo = new Date(now.getTime() - ms(60)).toISOString();

      // ---- Active discounts + vendor name lookup ----
      // "Active" mirrors the admin list filter: is_active = true AND
      // (end_date is null OR end_date >= today).
      const { data: discounts } = await supabase
        .from("discounts")
        .select("id, title, is_active, end_date, vendor_id");
      let activeCount = 0;
      const activeVendorIds = new Set<number>();
      const discountTitleById: Record<number, string> = {};
      const discountVendorById: Record<number, number | null> = {};
      for (const d of discounts || []) {
        discountTitleById[d.id] = d.title || `Discount ${d.id}`;
        discountVendorById[d.id] = d.vendor_id ?? null;
        if (!d.is_active) continue;
        if (d.end_date && d.end_date < today) continue;
        activeCount += 1;
        if (d.vendor_id != null) activeVendorIds.add(d.vendor_id);
      }

      const { data: vendors } = await supabase
        .from("vendors")
        .select("id, name");
      const vendorNameById: Record<number, string> = {};
      for (const v of vendors || []) vendorNameById[v.id] = v.name;

      // ---- Redemptions this month + growth vs prior month ----
      const { data: redemptions } = await supabase
        .from("redemptions")
        .select("discount_id, redeemed_at, total_savings");
      let monthCount = 0;
      let priorMonthCount = 0;
      const savingsByDiscount: Record<number, number> = {};
      for (const r of redemptions || []) {
        if (!r.redeemed_at) continue;
        if (r.redeemed_at >= thirtyAgo) monthCount += 1;
        else if (r.redeemed_at >= sixtyAgo) priorMonthCount += 1;
        if (r.discount_id != null) {
          const saved = parseFloat((r.total_savings ?? 0).toString());
          if (!Number.isNaN(saved)) {
            savingsByDiscount[r.discount_id] =
              (savingsByDiscount[r.discount_id] || 0) + saved;
          }
        }
      }
      const growthRate =
        priorMonthCount === 0
          ? monthCount > 0
            ? 100
            : 0
          : Math.round(((monthCount - priorMonthCount) / priorMonthCount) * 1000) /
            10;

      // ---- Top performing discount by lifetime $ saved ----
      let topId: number | null = null;
      let topSavings = 0;
      for (const [id, total] of Object.entries(savingsByDiscount)) {
        if ((total as number) > topSavings) {
          topSavings = total as number;
          topId = Number(id);
        }
      }
      const topPerforming =
        topId !== null
          ? {
              discountId: topId,
              title: discountTitleById[topId] || `Discount ${topId}`,
              vendorName:
                discountVendorById[topId] != null
                  ? vendorNameById[discountVendorById[topId]!] || null
                  : null,
              totalSavings: Math.round(topSavings * 100) / 100,
            }
          : null;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            activeDiscounts: {
              count: activeCount,
              vendorCount: activeVendorIds.size,
            },
            redemptionsMonth: {
              count: monthCount,
              growthRate,
            },
            topPerforming,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (err: any) {
      console.error("discounts/highlights error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "highlights failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /admin/discounts
  if (method === "GET" && route === "/admin/discounts") {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;
    const search = url.searchParams.get("search");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const vendorId = url.searchParams.get("vendorId");

    // Build query with JOIN to vendors
    let query = supabase.from("discounts").select(
      `
        *,
        vendor:vendors!vendor_id (
          id,
          name
        )
      `,
      {count: "exact"},
    );

    // Search filter
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Category filter
    if (category) {
      query = query.eq("category", category);
    }

    // Status filter
    if (status) {
      if (status === "active") {
        const today = new Date().toISOString().split("T")[0];
        query = query
          .eq("is_active", true)
          .or(`end_date.is.null,end_date.gte.${today}`);
      } else if (status === "inactive") {
        query = query.eq("is_active", false);
      } else if (status === "expired") {
        const today = new Date().toISOString().split("T")[0];
        query = query.lt("end_date", today);
      }
    }

    // Vendor filter
    if (vendorId) {
      query = query.eq("vendor_id", vendorId);
    }

    // Order and pagination
    query = query
      .order("created_at", {ascending: false})
      .range(offset, offset + limit - 1);

    const {data: discounts, error, count} = await query;

    if (error) {
      console.error("❌ Admin get discounts error:", error);
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    // Format discounts to include vendor_name
    const formattedDiscounts = (discounts || []).map((discount: any) => ({
      ...discount,
      vendor_name: discount.vendor?.name || null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedDiscounts,
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

  // POST /admin/discounts
  if (method === "POST" && route === "/admin/discounts") {
    const body = await req.json();
    const {
      vendorId,
      title,
      description,
      discountCode,
      discountType,
      discountValue,
      usageLimit,
      category,
      tags,
      startDate,
      endDate,
      isActive,
      terms,
      availability,
    } = body;

    if (!vendorId || !title) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Vendor ID and title are required",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 400,
        },
      );
    }

    // Ensure tags is an array for JSONB
    let tagsArray = null;
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else if (typeof tags === "string") {
        try {
          tagsArray = JSON.parse(tags);
          if (!Array.isArray(tagsArray)) {
            tagsArray = [tags];
          }
        } catch {
          tagsArray = [tags];
        }
      } else {
        tagsArray = [tags];
      }
    }

    // Map camelCase to snake_case for database
    // Support both discountCode and posCode (frontend sends discountCode)
    // IMPORTANT: Only include columns that exist in the database
    // DO NOT include: min_purchase, max_discount (these columns don't exist)
    const dbData: any = {
      vendor_id: vendorId,
      title: title, // Use title field
      description: description || null,
      discount_code: discountCode || null, // Support discountCode from frontend
      discount_type: discountType || "percentage",
      discount_value: discountValue || 0,
      usage_limit: usageLimit || "unlimited", // New field: usage limit
      category: category || null,
      tags: tagsArray,
      start_date: startDate || null,
      end_date: endDate || null,
      is_active: isActive !== undefined ? isActive : true,
      terms: terms || null,
      availability: availability || null,
    };

    // Explicitly remove any fields that don't exist in the database
    // This prevents PostgREST from trying to validate non-existent columns
    delete dbData.min_purchase;
    delete dbData.max_discount;
    delete dbData.minPurchase;
    delete dbData.maxDiscount;

    const {data: newDiscount, error: insertError} = await supabase
      .from("discounts")
      .insert([dbData])
      .select(
        `
        *,
        vendor:vendors!vendor_id (
          id,
          name
        )
      `,
      )
      .single();

    if (insertError) {
      console.error("❌ Admin create discount error:", insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: insertError.message,
          details: insertError.details,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 400,
        },
      );
    }

    const formattedDiscount = {
      ...newDiscount,
      vendor_name: newDiscount.vendor?.name || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedDiscount,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 201,
      },
    );
  }

  // GET /admin/discounts/:id
  const discountIdMatch = route.match(/^\/admin\/discounts\/(\d+)$/);
  if (method === "GET" && discountIdMatch) {
    const discountId = discountIdMatch[1];

    const {data: discount, error} = await supabase
      .from("discounts")
      .select(
        `
        *,
        vendor:vendors!vendor_id (
          id,
          name
        )
      `,
      )
      .eq("id", discountId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(JSON.stringify({error: "Discount not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    const formattedDiscount = {
      ...discount,
      vendor_name: discount.vendor?.name || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedDiscount,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // PUT /admin/discounts/:id
  const putDiscountMatch = route.match(/^\/admin\/discounts\/(\d+)$/);
  if (method === "PUT" && putDiscountMatch) {
    const discountId = putDiscountMatch[1];
    const body = await req.json();

    const {
      vendorId,
      title,
      description,
      discountCode,
      discountType,
      discountValue,
      usageLimit,
      category,
      tags,
      startDate,
      endDate,
      isActive,
      terms,
      availability,
    } = body;

    // Ensure tags is array for JSONB
    let tagsArray = null;
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else if (typeof tags === "string") {
        try {
          const parsed = JSON.parse(tags);
          tagsArray = Array.isArray(parsed) ? parsed : [tags];
        } catch {
          tagsArray = [tags];
        }
      } else {
        tagsArray = [tags];
      }
    }

    // Map camelCase to snake_case for database
    // Support both discountCode and posCode (frontend sends discountCode)
    // IMPORTANT: Only include columns that exist in the database
    // DO NOT include: min_purchase, max_discount (these columns don't exist)
    const updateData: any = {
      vendor_id: vendorId,
      title: title,
      description: description || null,
      discount_code: discountCode || null, // Support discountCode from frontend
      discount_type: discountType || "percentage",
      discount_value: discountValue || 0,
      usage_limit: usageLimit !== undefined ? usageLimit : "unlimited", // New field: usage limit
      category: category || null,
      tags: tagsArray,
      start_date: startDate || null,
      end_date: endDate || null,
      is_active: isActive !== undefined ? isActive : true,
      terms: terms || null,
      availability: availability || null,
      updated_at: new Date().toISOString(),
    };

    // Explicitly remove any fields that don't exist in the database
    // This prevents PostgREST from trying to validate non-existent columns
    delete updateData.min_purchase;
    delete updateData.max_discount;
    delete updateData.minPurchase;
    delete updateData.maxDiscount;

    const {data: updatedDiscount, error} = await supabase
      .from("discounts")
      .update(updateData)
      .eq("id", discountId)
      .select(
        `
        *,
        vendor:vendors!vendor_id (
          id,
          name
        )
      `,
      )
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Discount not found",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 404,
          },
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          details: error.details,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 400,
        },
      );
    }

    const formattedDiscount = {
      ...updatedDiscount,
      vendor_name: updatedDiscount.vendor?.name || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: formattedDiscount,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // DELETE /admin/discounts/:id
  const deleteDiscountMatch = route.match(/^\/admin\/discounts\/(\d+)$/);
  if (method === "DELETE" && deleteDiscountMatch) {
    const discountId = deleteDiscountMatch[1];

    const {error} = await supabase
      .from("discounts")
      .delete()
      .eq("id", discountId);

    if (error) {
      console.error("❌ Admin delete discount error:", error);
      return new Response(JSON.stringify({error: error.message}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Discount deleted successfully",
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  // POST /admin/discounts/:id/image (file upload)
  const discountImageMatch = route.match(/^\/admin\/discounts\/(\d+)\/image$/);
  if (method === "POST" && discountImageMatch) {
    const discountId = discountImageMatch[1];

    // Verify discount exists
    const {data: discount, error: discountError} = await supabase
      .from("discounts")
      .select("*")
      .eq("id", discountId)
      .single();

    if (discountError || !discount) {
      return new Response(JSON.stringify({error: "Discount not found"}), {
        headers: {"Content-Type": "application/json"},
        status: 404,
      });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("image") as File;

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
    const filePath = `discount-${discountId}/${fileName}`;

    // Upload to Supabase Storage
    const {data: uploadData, error: uploadError} = await supabase.storage
      .from("discount-images")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("❌ Error uploading discount image:", uploadError);
      return new Response(JSON.stringify({error: "Failed to upload image"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }

    // Get public URL
    const {
      data: {publicUrl},
    } = supabase.storage.from("discount-images").getPublicUrl(filePath);

    // Update discount with new image URL
    const {error: updateError} = await supabase
      .from("discounts")
      .update({
        image_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", discountId);

    if (updateError) {
      console.error("❌ Error updating discount image:", updateError);

      // Try to delete uploaded file if database update fails
      try {
        await supabase.storage.from("discount-images").remove([filePath]);
      } catch (deleteError) {
        console.error("Error deleting uploaded file:", deleteError);
      }

      return new Response(
        JSON.stringify({error: "Failed to update discount image"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: publicUrl,
      }),
      {
        headers: {"Content-Type": "application/json"},
        status: 200,
      },
    );
  }

  return new Response(JSON.stringify({error: "Discount route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}
