import { geocodeAddress } from "../lib/geocoding.ts";
import { formatCharityResponse } from "../lib/charities.ts";
import { corsHeaders } from "../lib/cors.ts";

export async function handleAdminCharities(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /admin/charities/highlights
  // Returns the four health KPIs for the Beneficiaries page top strip:
  //   - active:           total active beneficiaries + how many have ever received a donation
  //   - awaitingBankInfo: count of active beneficiaries missing bank account number
  //   - topByDonations:   { name, lifetimeTotal } highest-receiving beneficiary
  //   - mostSelected:     { name, count } charity most often chosen as primary by donors
  if (method === "GET" && route === "/admin/charities/highlights") {
    try {
      const SERVICE_FEE = 3.0;
      const STRIPE_FEE_PERCENT = 0.022;
      const STRIPE_FIXED_FEE = 0.30;
      const LEGACY_CC_RATE = 0.035;
      // Same gross→donation inference used by donation-overview + donor highlights.
      const inferDonation = (gross: number): number => {
        const g = Math.round(gross * 100) / 100;
        if (g <= 0) return 0;
        const a = Math.round((g - SERVICE_FEE) * 100) / 100;
        if (a > 0 && Math.abs(a - Math.round(a)) < 0.005) return Math.round(a);
        const bR = Math.round(g / (1 + LEGACY_CC_RATE) - SERVICE_FEE);
        const bE =
          Math.round((bR + SERVICE_FEE) * (1 + LEGACY_CC_RATE) * 100) / 100;
        if (bR > 0 && Math.abs(g - bE) < 0.05) return bR;
        const cR = Math.round(
          g * (1 - STRIPE_FEE_PERCENT) - SERVICE_FEE - STRIPE_FIXED_FEE,
        );
        const cE =
          Math.ceil(
            ((cR + SERVICE_FEE + STRIPE_FIXED_FEE) / (1 - STRIPE_FEE_PERCENT)) *
              100,
          ) / 100;
        if (cR > 0 && Math.abs(g - cE) < 0.05) return cR;
        return Math.max(0, Math.round(g - SERVICE_FEE));
      };

      // ---- All beneficiaries snapshot ----
      const { data: charities } = await supabase
        .from("charities")
        .select("id, name, is_active, bank_account_number");
      const charityNameById: Record<number, string> = {};
      let activeCount = 0;
      let awaitingBankInfo = 0;
      for (const c of charities || []) {
        charityNameById[c.id] = c.name;
        if (c.is_active) {
          activeCount += 1;
          const bank = (c.bank_account_number || "").toString().trim();
          if (!bank) awaitingBankInfo += 1;
        }
      }

      // ---- Lifetime $ received per beneficiary ----
      const { data: txns } = await supabase
        .from("transactions")
        .select("type, amount, beneficiary_id")
        .eq("status", "completed");
      const lifetimeByBeneficiary: Record<number, number> = {};
      const beneficiariesWithDonations = new Set<number>();
      for (const t of txns || []) {
        if (!t.beneficiary_id) continue;
        const amt = parseFloat((t.amount ?? 0).toString());
        if (Number.isNaN(amt)) continue;
        const donation =
          t.type === "monthly_donation" ? inferDonation(amt) : amt;
        lifetimeByBeneficiary[t.beneficiary_id] =
          (lifetimeByBeneficiary[t.beneficiary_id] || 0) + donation;
        beneficiariesWithDonations.add(t.beneficiary_id);
      }
      let topId: number | null = null;
      let topTotal = 0;
      for (const [id, total] of Object.entries(lifetimeByBeneficiary)) {
        const t = total as number;
        if (t > topTotal) {
          topTotal = t;
          topId = Number(id);
        }
      }

      // ---- Most-selected-as-primary count per beneficiary ----
      const { data: donors } = await supabase
        .from("users")
        .select("id, preferences")
        .eq("role", "donor");
      const selectionCount: Record<number, number> = {};
      for (const d of donors || []) {
        const prefId =
          d.preferences?.preferredCharity ?? d.preferences?.beneficiary ?? null;
        const idNum = prefId ? parseInt(prefId, 10) : NaN;
        if (Number.isNaN(idNum)) continue;
        selectionCount[idNum] = (selectionCount[idNum] || 0) + 1;
      }
      let mostSelectedId: number | null = null;
      let mostSelectedCount = 0;
      for (const [id, count] of Object.entries(selectionCount)) {
        if ((count as number) > mostSelectedCount) {
          mostSelectedCount = count as number;
          mostSelectedId = Number(id);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            active: {
              count: activeCount,
              receivingCount: beneficiariesWithDonations.size,
            },
            awaitingBankInfo,
            topByDonations:
              topId !== null
                ? {
                    beneficiaryId: topId,
                    name: charityNameById[topId] || `Beneficiary ${topId}`,
                    lifetimeTotal: Math.round(topTotal * 100) / 100,
                  }
                : null,
            mostSelected:
              mostSelectedId !== null
                ? {
                    beneficiaryId: mostSelectedId,
                    name:
                      charityNameById[mostSelectedId] ||
                      `Beneficiary ${mostSelectedId}`,
                    count: mostSelectedCount,
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
      console.error("charities/highlights error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "highlights failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  // GET /admin/charities - List all charities
  if (method === "GET" && route === "/admin/charities") {
    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const search = url.searchParams.get("search");
      const category = url.searchParams.get("category");
      const isActive = url.searchParams.get("isActive");
      const includeInactive =
        url.searchParams.get("includeInactive") === "true" ||
        url.searchParams.get("include_inactive") === "true";
      console.log(
        "GET /admin/charities - req.url:",
        req.url,
        "| includeInactive:",
        includeInactive,
        "| params:",
        url.searchParams.toString(),
      );

      let query = supabase.from("charities").select("*", {count: "exact"});

      // Search filter
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,description.ilike.%${search}%,about.ilike.%${search}%`,
        );
      }

      // Category filter
      if (category && category !== "All") {
        query = query.eq("category", category);
      }

      // Active status filter - Admin panel needs ALL charities (active + inactive) for toggles/filters
      // Only filter when isActive param is explicitly set; otherwise return all
      if (isActive === "false") {
        query = query.eq("is_active", false);
      } else if (isActive === "true") {
        query = query.eq("is_active", true);
      }
      // No isActive param (or includeInactive=true): return all - no filter

      // Order and pagination
      const {
        data: charities,
        error,
        count,
      } = await query
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching charities:", error);
        return new Response(
          JSON.stringify({error: "Failed to fetch charities"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Format charities for admin panel
      const formattedCharities = (charities || []).map((charity: any) =>
        formatCharityResponse(charity),
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: formattedCharities,
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
    } catch (error) {
      console.error("Error fetching charities:", error);
      return new Response(
        JSON.stringify({error: "Failed to fetch charities"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /admin/charities/:id - Get single charity
  const getCharityMatch = route.match(/^\/admin\/charities\/(\d+)$/);
  if (method === "GET" && getCharityMatch) {
    try {
      const charityId = getCharityMatch[1];

      const {data: charity, error} = await supabase
        .from("charities")
        .select("*")
        .eq("id", charityId)
        .single();

      if (error || !charity) {
        return new Response(JSON.stringify({error: "Charity not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      const formattedCharity = formatCharityResponse(charity);

      return new Response(
        JSON.stringify({
          success: true,
          data: formattedCharity,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error fetching charity:", error);
      return new Response(JSON.stringify({error: "Failed to fetch charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // POST /admin/charities - Create new charity
  if (method === "POST" && route === "/admin/charities") {
    try {
      const body = await req.json();

      // Log the entire request body for debugging
      console.log(
        "📦 POST /admin/charities - Full request body:",
        JSON.stringify(body, null, 2),
      );
      console.log(
        "📦 POST /admin/charities - All keys in body:",
        Object.keys(body),
      );
      console.log("📦 POST /admin/charities - name field:", body.name);
      console.log(
        "📦 POST /admin/charities - beneficiaryName field:",
        body.beneficiaryName,
      );
      console.log(
        "📦 POST /admin/charities - charityName field:",
        body.charityName,
      );
      console.log("📦 POST /admin/charities - Impact metrics:", {
        livesImpacted: body.livesImpacted || body.lives_impacted,
        programsActive: body.programsActive || body.programs_active,
        directToProgramsPercentage:
          body.directToProgramsPercentage || body.direct_to_programs_percentage,
      });

      const {
        name,
        beneficiaryName, // Accept both name and beneficiaryName (frontend might use different field)
        charityName, // Also accept charityName as fallback
        category,
        type,
        description,
        about,
        why_this_matters,
        whyThisMatters,
        success_story,
        successStory,
        story_author,
        storyAuthor,
        // Impact statements - accept both camelCase and snake_case
        impact_statement_1,
        impactStatement1,
        impact_statement_2,
        impactStatement2,
        // Note: Removed non-existent fields from destructuring:
        // families_helped, familiesHelped, communities_served, communitiesServed,
        // direct_to_programs, directToPrograms
        website,
        phone,
        email,
        primary_email,
        contact_name,
        contactName,
        social,
        location,
        latitude,
        longitude,
        ein,
        imageUrl,
        logoUrl,
        likes,
        mutual,
        isActive,
        verification_status,
        verificationStatus,
        profile_links,
        profileLinks,
        // Impact metrics - accept both camelCase and snake_case
        livesImpacted,
        lives_impacted,
        programsActive,
        programs_active,
        directToProgramsPercentage,
        direct_to_programs_percentage,
      } = body;

      // Accept name, beneficiaryName, or charityName (frontend might use different field names)
      const finalName = name || beneficiaryName || charityName;

      if (!finalName) {
        console.error(
          "❌ Missing charity name in request body. Received fields:",
          Object.keys(body),
        );
        return new Response(
          JSON.stringify({
            error:
              'Charity name is required (send as "name", "beneficiaryName", or "charityName")',
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Handle profile_links (accept both snake_case and camelCase)
      let profileLinksData = null;
      if (profile_links !== undefined) {
        profileLinksData = Array.isArray(profile_links) ? profile_links : null;
      } else if (profileLinks !== undefined) {
        profileLinksData = Array.isArray(profileLinks) ? profileLinks : null;
      }

      // Geocode if location provided but coordinates are not
      let finalLatitude = latitude ? parseFloat(latitude) : null;
      let finalLongitude = longitude ? parseFloat(longitude) : null;

      if (location && !finalLatitude && !finalLongitude) {
        const geocodeResult = await geocodeAddress(location);
        finalLatitude = geocodeResult.latitude;
        finalLongitude = geocodeResult.longitude;
        if (finalLatitude && finalLongitude) {
          console.log(
            `✅ Geocoded location "${location}" to (${finalLatitude}, ${finalLongitude})`,
          );
        }
      }

      // Log image URL for debugging
      if (imageUrl) {
        console.log(
          `📸 Image URL received in POST /admin/charities: ${imageUrl}`,
        );
      } else if (logoUrl) {
        console.log(
          `📸 Logo URL received in POST /admin/charities: ${logoUrl}`,
        );
      } else {
        console.log(
          `⚠️ No imageUrl or logoUrl provided in POST /admin/charities`,
        );
      }

      // Define valid database columns for charities table
      // This list should match the actual database schema
      const validCharityColumns = [
        "name",
        "category",
        "type",
        "description",
        "about",
        "why_this_matters",
        "success_story",
        "story_author",
        "impact_statement_1",
        "impact_statement_2",
        "website",
        "phone",
        "email",
        "contact_name",
        "social",
        "location",
        "latitude",
        "longitude",
        "ein",
        "image_url",
        "logo_url",
        "likes",
        "mutual",
        "is_active",
        "verification_status",
        "profile_links",
        "lives_impacted",
        "programs_active",
        "direct_to_programs_percentage",
        "created_by_user_id",
        "created_at",
        "updated_at",
      ];

      const charityData: any = {
        name: finalName, // Use the resolved name value
        category: category || null,
        type: type || null,
        description: description || null,
        about: about || description || null,
        // Impact & Story fields - handle both camelCase and snake_case
        why_this_matters:
          whyThisMatters !== undefined
            ? whyThisMatters
            : why_this_matters !== undefined
              ? why_this_matters
              : null,
        success_story:
          successStory !== undefined
            ? successStory
            : success_story !== undefined
              ? success_story
              : null,
        story_author:
          storyAuthor !== undefined
            ? storyAuthor
            : story_author !== undefined
              ? story_author
              : null,
        // Impact statements - handle both camelCase and snake_case
        impact_statement_1:
          impactStatement1 !== undefined
            ? impactStatement1
            : impact_statement_1 !== undefined
              ? impact_statement_1
              : null,
        impact_statement_2:
          impactStatement2 !== undefined
            ? impactStatement2
            : impact_statement_2 !== undefined
              ? impact_statement_2
              : null,
        // Note: Removed non-existent fields:
        // - families_helped, communities_served, direct_to_programs
        website: website || null,
        phone: phone || null,
        email: email || primary_email || null,
        contact_name: contact_name || contactName || null,
        social: social || null,
        location: location || null,
        latitude: finalLatitude,
        longitude: finalLongitude,
        ein: ein || null,
        image_url: imageUrl || logoUrl || null,
        logo_url: logoUrl || imageUrl || null,
        likes: likes ? parseInt(likes) : 0,
        mutual: mutual ? parseInt(mutual) : 0,
        is_active: isActive !== false,
        verification_status:
          verification_status !== undefined
            ? verification_status
            : verificationStatus !== undefined
              ? verificationStatus
              : true, // Default to true
        // Impact metrics - handle both camelCase and snake_case (now supports full sentences)
        lives_impacted:
          livesImpacted !== undefined
            ? String(livesImpacted)
            : lives_impacted !== undefined
              ? String(lives_impacted)
              : null,
        programs_active:
          programsActive !== undefined
            ? String(programsActive)
            : programs_active !== undefined
              ? String(programs_active)
              : null,
        direct_to_programs_percentage:
          directToProgramsPercentage !== undefined
            ? String(directToProgramsPercentage)
            : direct_to_programs_percentage !== undefined
              ? String(direct_to_programs_percentage)
              : null,
      };

      // Add profile_links if provided
      if (profileLinksData !== null) {
        charityData.profile_links = profileLinksData;
      }

      // Defensive: Remove any fields that don't exist in the database schema
      // This prevents schema cache errors if unexpected fields are sent
      const filteredCharityData: any = {};
      for (const key in charityData) {
        if (validCharityColumns.includes(key)) {
          filteredCharityData[key] = charityData[key];
        } else {
          console.warn(`⚠️ Filtering out non-existent column: ${key}`);
        }
      }

      const {data: newCharity, error: insertError} = await supabase
        .from("charities")
        .insert([filteredCharityData])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating charity:", insertError);
        return new Response(
          JSON.stringify({
            error: insertError.message || "Failed to create charity",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: formatCharityResponse(newCharity),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("Error creating charity:", error);
      return new Response(JSON.stringify({error: "Failed to create charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // PUT /admin/charities/:id - Update charity
  const updateCharityMatch = route.match(/^\/admin\/charities\/(\d+)$/);
  if (method === "PUT" && updateCharityMatch) {
    try {
      const charityId = updateCharityMatch[1];
      const body = await req.json();
      const {
        name,
        category,
        type,
        description,
        about,
        why_this_matters,
        whyThisMatters,
        success_story,
        successStory,
        story_author,
        storyAuthor,
        // Impact statements - accept both camelCase and snake_case
        impact_statement_1,
        impactStatement1,
        impact_statement_2,
        impactStatement2,
        // Note: Removed non-existent fields from destructuring:
        // familiesHelped, families_helped, communitiesServed, communities_served,
        // directToPrograms, direct_to_programs
        website,
        phone,
        email,
        primary_email,
        contact_name,
        contactName,
        social,
        location,
        latitude,
        longitude,
        ein,
        imageUrl,
        logoUrl,
        likes,
        mutual,
        isActive,
        is_active: is_activeBody,
        verificationStatus,
        verification_status,
        profile_links,
        profileLinks,
        // Impact metrics - accept both camelCase and snake_case
        livesImpacted,
        lives_impacted,
        programsActive,
        programs_active,
        directToProgramsPercentage,
        direct_to_programs_percentage,
      } = body;

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (name !== undefined) updateData.name = name;
      if (category !== undefined) updateData.category = category;
      if (type !== undefined) updateData.type = type;
      if (description !== undefined) updateData.description = description;
      if (about !== undefined) updateData.about = about;

      // Impact & Story fields - handle both camelCase and snake_case
      if (whyThisMatters !== undefined || why_this_matters !== undefined) {
        updateData.why_this_matters =
          whyThisMatters !== undefined
            ? whyThisMatters
            : why_this_matters !== undefined
              ? why_this_matters
              : null;
      }
      if (successStory !== undefined || success_story !== undefined) {
        updateData.success_story =
          successStory !== undefined
            ? successStory
            : success_story !== undefined
              ? success_story
              : null;
      }
      if (storyAuthor !== undefined || story_author !== undefined) {
        updateData.story_author =
          storyAuthor !== undefined
            ? storyAuthor
            : story_author !== undefined
              ? story_author
              : null;
      }

      // Impact statements - handle both camelCase and snake_case
      if (impactStatement1 !== undefined || impact_statement_1 !== undefined) {
        updateData.impact_statement_1 =
          impactStatement1 !== undefined
            ? impactStatement1
            : impact_statement_1 !== undefined
              ? impact_statement_1
              : null;
      }
      if (impactStatement2 !== undefined || impact_statement_2 !== undefined) {
        updateData.impact_statement_2 =
          impactStatement2 !== undefined
            ? impactStatement2
            : impact_statement_2 !== undefined
              ? impact_statement_2
              : null;
      }

      // Impact metrics - handle both camelCase and snake_case (now supports full sentences)
      if (livesImpacted !== undefined || lives_impacted !== undefined) {
        updateData.lives_impacted =
          livesImpacted !== undefined
            ? String(livesImpacted)
            : lives_impacted !== undefined
              ? String(lives_impacted)
              : null;
      }
      if (programsActive !== undefined || programs_active !== undefined) {
        updateData.programs_active =
          programsActive !== undefined
            ? String(programsActive)
            : programs_active !== undefined
              ? String(programs_active)
              : null;
      }
      if (
        directToProgramsPercentage !== undefined ||
        direct_to_programs_percentage !== undefined
      ) {
        updateData.direct_to_programs_percentage =
          directToProgramsPercentage !== undefined
            ? String(directToProgramsPercentage)
            : direct_to_programs_percentage !== undefined
              ? String(direct_to_programs_percentage)
              : null;
      }
      // Note: Removed non-existent fields:
      // families_helped, communities_served, direct_to_programs
      // These columns do not exist in the database schema
      if (website !== undefined) updateData.website = website;
      if (email !== undefined || primary_email !== undefined) {
        updateData.email = email || primary_email || null;
      }
      if (contact_name !== undefined || contactName !== undefined) {
        updateData.contact_name = contact_name || contactName || null;
      }
      if (phone !== undefined) updateData.phone = phone;
      if (social !== undefined) updateData.social = social;
      if (location !== undefined) updateData.location = location;
      if (verification_status !== undefined)
        updateData.verification_status = verification_status;
      if (verificationStatus !== undefined)
        updateData.verification_status = verificationStatus;

      // Handle coordinates - geocode if location changed but coordinates not provided
      if (latitude !== undefined) {
        updateData.latitude = latitude ? parseFloat(latitude) : null;
      }
      if (longitude !== undefined) {
        updateData.longitude = longitude ? parseFloat(longitude) : null;
      }

      // Geocode if location is being updated but coordinates are not provided
      if (
        location !== undefined &&
        latitude === undefined &&
        longitude === undefined
      ) {
        const geocodeResult = await geocodeAddress(location);
        if (geocodeResult.latitude && geocodeResult.longitude) {
          updateData.latitude = geocodeResult.latitude;
          updateData.longitude = geocodeResult.longitude;
          console.log(
            `✅ Geocoded location "${location}" to (${geocodeResult.latitude}, ${geocodeResult.longitude})`,
          );
        }
      }

      if (ein !== undefined) updateData.ein = ein;
      if (imageUrl !== undefined) {
        console.log(
          `📸 Image URL received in PUT /admin/charities/${charityId}: ${imageUrl}`,
        );
        updateData.image_url = imageUrl;
      }
      if (logoUrl !== undefined) {
        console.log(
          `📸 Logo URL received in PUT /admin/charities/${charityId}: ${logoUrl}`,
        );
        updateData.logo_url = logoUrl;
      }
      if (imageUrl === undefined && logoUrl === undefined) {
        console.log(
          `⚠️ No imageUrl or logoUrl provided in PUT /admin/charities/${charityId}`,
        );
      }

      // Handle profile_links (accept both snake_case and camelCase)
      if (profile_links !== undefined) {
        updateData.profile_links = Array.isArray(profile_links)
          ? profile_links
          : null;
      } else if (profileLinks !== undefined) {
        updateData.profile_links = Array.isArray(profileLinks)
          ? profileLinks
          : null;
      }

      if (likes !== undefined) updateData.likes = parseInt(likes);
      if (mutual !== undefined) updateData.mutual = parseInt(mutual);
      // Only update is_active if explicitly provided as a boolean (accept isActive or is_active)
      const isActiveVal = isActive ?? is_activeBody;
      if (isActiveVal !== undefined && typeof isActiveVal === "boolean") {
        updateData.is_active = isActiveVal;
      }

      const {data: updatedCharity, error: updateError} = await supabase
        .from("charities")
        .update(updateData)
        .eq("id", charityId)
        .select()
        .single();

      if (updateError || !updatedCharity) {
        return new Response(
          JSON.stringify({error: "Charity not found or update failed"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: formatCharityResponse(updatedCharity),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("Error updating charity:", error);
      return new Response(JSON.stringify({error: "Failed to update charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  // DELETE /admin/charities/:id - Delete charity (soft delete)
  const deleteCharityMatch = route.match(/^\/admin\/charities\/(\d+)$/);
  if (method === "DELETE" && deleteCharityMatch) {
    try {
      const charityId = deleteCharityMatch[1];
      console.log(
        `🗑️ DELETE /admin/charities/${charityId} - Attempting to soft delete charity`,
      );

      // First, verify the charity exists
      const {data: existingCharity, error: fetchError} = await supabase
        .from("charities")
        .select("id, name, is_active")
        .eq("id", charityId)
        .single();

      if (fetchError || !existingCharity) {
        console.error(`❌ Charity ${charityId} not found:`, fetchError);
        return new Response(JSON.stringify({error: "Charity not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      console.log(
        `📋 Found charity: ${existingCharity.name} (id: ${charityId}, is_active: ${existingCharity.is_active})`,
      );

      // Soft delete by setting is_active to false
      const {data: updatedCharity, error: updateError} = await supabase
        .from("charities")
        .update({is_active: false, updated_at: new Date().toISOString()})
        .eq("id", charityId)
        .select("id, name, is_active")
        .single();

      if (updateError || !updatedCharity) {
        console.error(`❌ Error deleting charity ${charityId}:`, updateError);
        return new Response(
          JSON.stringify({
            error: updateError?.message || "Failed to delete charity",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log(
        `✅ Successfully soft-deleted charity: ${updatedCharity.name} (id: ${charityId})`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: "Charity deleted successfully",
          data: {
            id: updatedCharity.id,
            name: updatedCharity.name,
            isActive: updatedCharity.is_active,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Error deleting charity:", error);
      return new Response(JSON.stringify({error: "Failed to delete charity"}), {
        headers: {"Content-Type": "application/json"},
        status: 500,
      });
    }
  }

  return new Response(
    JSON.stringify({error: "Admin charities route not found"}),
    {
      headers: {"Content-Type": "application/json"},
      status: 404,
    },
  );
}
