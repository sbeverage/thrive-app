import { corsHeaders } from "../lib/cors.ts";
import { bcryptHash } from "../lib/password.ts";
import { capitalizeName } from "../lib/strings.ts";
import { geocodeAddress } from "../lib/geocoding.ts";

export type AdminDonorsDeps = {
  sendInvitationEmail: (args: {
    to: string;
    name: string;
    verificationToken: string;
    donorId: number;
  }) => Promise<void>;
};

export async function handleAdminDonors(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: AdminDonorsDeps,
) {
  const { sendInvitationEmail } = deps;
  // GET /admin/donors - List all donors (users with role 'donor')
  if (method === "GET" && route === "/admin/donors") {
    try {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const search = url.searchParams.get("search");

      // Build query to get all users with role 'donor'
      let query = supabase
        .from("users")
        .select("*", {count: "exact"})
        .eq("role", "donor");

      // Search filter (by email, first_name, last_name)
      if (search) {
        query = query.or(
          `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
        );
      }

      // Order and pagination
      query = query
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

      const {data: users, error, count} = await query;

      if (error) {
        console.error("❌ Admin get donors error:", error);
        return new Response(JSON.stringify({error: error.message}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        });
      }

      // Build charity name lookup for preferred beneficiary IDs
      const preferredCharityIds = Array.from(
        new Set(
          (users || [])
            .map(
              (user: any) =>
                user.preferences?.preferredCharity ||
                user.preferences?.beneficiary,
            )
            .filter((id: any) => id !== undefined && id !== null && id !== "")
            .map((id: any) => parseInt(id, 10))
            .filter((id: number) => !Number.isNaN(id)),
        ),
      );

      let charityNameById: Record<number, string> = {};
      if (preferredCharityIds.length > 0) {
        const {data: charities, error: charitiesError} = await supabase
          .from("charities")
          .select("id, name")
          .in("id", preferredCharityIds);

        if (!charitiesError && charities) {
          charityNameById = charities.reduce(
            (acc: Record<number, string>, charity: any) => {
              acc[charity.id] = charity.name;
              return acc;
            },
            {},
          );
        }
      }

      // Build a most-recent-donation-date lookup per user from real data.
      // The previous version hardcoded last_donation_date: null, so every
      // donor showed "Never" in the admin Donors tab.
      const userIds = (users || []).map((u: any) => u.id);
      const lastDonationByUser = new Map<number, string>();
      if (userIds.length > 0) {
        const {data: monthlyRows} = await supabase
          .from("monthly_donations")
          .select("user_id, last_payment_date")
          .in("user_id", userIds)
          .not("last_payment_date", "is", null);
        for (const row of monthlyRows || []) {
          const cur = lastDonationByUser.get(row.user_id);
          if (!cur || row.last_payment_date > cur) {
            lastDonationByUser.set(row.user_id, row.last_payment_date);
          }
        }
        const {data: oneTimeRows} = await supabase
          .from("one_time_gifts")
          .select("user_id, created_at")
          .in("user_id", userIds)
          .eq("status", "completed");
        for (const row of oneTimeRows || []) {
          const dateOnly = (row.created_at || "").split("T")[0];
          if (!dateOnly) continue;
          const cur = lastDonationByUser.get(row.user_id);
          if (!cur || dateOnly > cur) {
            lastDonationByUser.set(row.user_id, dateOnly);
          }
        }
      }

      // Format donors data to match what the frontend expects
      const formattedDonors = (users || []).map((user: any) => {
        const fullName =
          `${user.first_name || ""} ${user.last_name || ""}`.trim();
        const preferredCharityId =
          user.preferences?.preferredCharity ||
          user.preferences?.beneficiary ||
          null;
        const monthlyDonation =
          user.total_monthly_donation ??
          user.preferences?.monthlyDonation ??
          user.preferences?.donationAmount ??
          0;
        const oneTimeDonation =
          user.extra_donation_amount ?? user.preferences?.oneTimeDonation ?? 0;
        return {
          id: user.id,
          name: fullName || user.email.split("@")[0],
          email: user.email,
          phone: user.phone || "N/A",
          beneficiary_id: preferredCharityId,
          beneficiary_name: preferredCharityId
            ? charityNameById[preferredCharityId] || "N/A"
            : "N/A",
          coworking:
            user.coworking === true || user.invite_type === "coworking",
          total_donations: parseFloat(monthlyDonation) || 0,
          one_time_donation: parseFloat(oneTimeDonation) || 0,
          last_donation_date: lastDonationByUser.get(user.id) || null,
          address: {
            city: user.city || "",
            state: user.state || "",
            zipCode: user.zip_code || "",
            street: user.street_address || "",
            latitude: user.latitude ? parseFloat(user.latitude) : null,
            longitude: user.longitude ? parseFloat(user.longitude) : null,
          },
          location_permission_granted:
            user.location_permission_granted || false,
          location_updated_at: user.location_updated_at || null,
          is_active: user.account_status === "active",
          is_enabled: user.account_status === "active",
          created_at: user.created_at,
          updated_at: user.updated_at,
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: formattedDonors,
          pagination: {
            page,
            limit,
            total: count || 0,
            pages: Math.ceil((count || 0) / limit),
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
    } catch (error: any) {
      console.error("❌ Admin get donors error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to fetch donors"}),
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

  // PUT /admin/donors/:id - Update donor information
  const updateDonorMatch = route.match(/^\/admin\/donors\/(\d+)$/);
  if (method === "PUT" && updateDonorMatch) {
    try {
      const donorId = parseInt(updateDonorMatch[1], 10);

      if (!donorId || isNaN(donorId)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid donor ID"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Parse request body
      const body = await req.json();
      const {
        name,
        email,
        phone,
        beneficiary_id,
        beneficiary_name,
        coworking,
        invite_type,
        inviteType,
        sponsor_amount,
        sponsorAmount,
        donation_amount,
        donationAmount,
        one_time_donation,
        oneTimeDonation,
        total_donations,
        last_donation_date,
        address,
        latitude,
        longitude,
        locationPermissionGranted,
        location_permission_granted,
        is_active,
        is_enabled,
        notes,
      } = body;

      // Verify the donor exists and has role 'donor'
      const {data: existingDonor, error: donorError} = await supabase
        .from("users")
        .select("id, email, role, first_name, last_name, phone, preferences")
        .eq("id", donorId)
        .eq("role", "donor")
        .single();

      if (donorError || !existingDonor) {
        if (donorError?.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        return new Response(
          JSON.stringify({success: false, error: "Donor not found"}),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Check if email is being changed and if it conflicts with another user
      if (email && email !== existingDonor.email) {
        const {data: emailCheck, error: emailError} = await supabase
          .from("users")
          .select("id, email")
          .eq("email", email)
          .neq("id", donorId)
          .limit(1);

        if (emailError) {
          console.error("❌ Error checking email:", emailError);
          return new Response(
            JSON.stringify({success: false, error: "Failed to validate email"}),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        if (emailCheck && emailCheck.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Email already in use by another user",
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Check if phone is being changed and if it conflicts with another user
      if (phone && phone !== existingDonor.phone) {
        const {data: phoneCheck, error: phoneError} = await supabase
          .from("users")
          .select("id, phone")
          .eq("phone", phone)
          .neq("id", donorId)
          .limit(1);

        if (phoneError) {
          console.error("❌ Error checking phone:", phoneError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to validate phone number",
            }),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        if (phoneCheck && phoneCheck.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Phone number already in use by another user",
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Parse name into first_name and last_name
      let first_name = existingDonor.first_name;
      let last_name = existingDonor.last_name;

      if (name) {
        const nameParts = name.trim().split(/\s+/);
        if (nameParts.length > 0) {
          first_name = capitalizeName(nameParts[0]);
          last_name = capitalizeName(nameParts.slice(1).join(" ")) || "";
        }
      }

      // Build update object - only include fields that are provided
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Update basic fields if provided (with name capitalization)
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone || null;
      if (first_name !== undefined)
        updateData.first_name = capitalizeName(first_name);
      if (last_name !== undefined)
        updateData.last_name = capitalizeName(last_name);

      // Update address fields if provided
      if (address) {
        if (address.city !== undefined) updateData.city = address.city || null;
        if (address.state !== undefined)
          updateData.state = address.state || null;
        if (address.zipCode !== undefined)
          updateData.zip_code = address.zipCode || null;
        if (address.street !== undefined)
          updateData.street_address = address.street || null;
        if (address.latitude !== undefined)
          updateData.latitude = address.latitude
            ? parseFloat(address.latitude)
            : null;
        if (address.longitude !== undefined)
          updateData.longitude = address.longitude
            ? parseFloat(address.longitude)
            : null;
      }

      // Also support flat location fields
      if (latitude !== undefined) {
        updateData.latitude = latitude ? parseFloat(latitude) : null;
      }
      if (longitude !== undefined) {
        updateData.longitude = longitude ? parseFloat(longitude) : null;
      }

      // Handle location permission
      if (
        locationPermissionGranted !== undefined ||
        location_permission_granted !== undefined
      ) {
        const locationPermission =
          locationPermissionGranted || location_permission_granted;
        updateData.location_permission_granted = locationPermission === true;
        if (locationPermission === true) {
          updateData.location_updated_at = new Date().toISOString();
        }
      }

      // If location fields are provided but coordinates are missing, try to geocode
      if (
        (updateData.city || updateData.state) &&
        !updateData.latitude &&
        !updateData.longitude
      ) {
        const locationString = [
          updateData.city,
          updateData.state,
          updateData.zip_code,
        ]
          .filter(Boolean)
          .join(", ");
        if (locationString) {
          const geocodeResult = await geocodeAddress(locationString);
          if (geocodeResult.latitude && geocodeResult.longitude) {
            updateData.latitude = geocodeResult.latitude;
            updateData.longitude = geocodeResult.longitude;
            console.log(
              `✅ Geocoded location "${locationString}" to (${geocodeResult.latitude}, ${geocodeResult.longitude})`,
            );
          }
        }
      }

      // Update account status (map is_active and is_enabled to account_status)
      if (is_active !== undefined || is_enabled !== undefined) {
        // If either is false, set to inactive; otherwise active
        updateData.account_status =
          is_active !== false && is_enabled !== false ? "active" : "inactive";
      }

      // Update notes field if provided (if notes column exists in users table)
      // Other metadata fields (beneficiary_name, coworking, total_donations, etc.)
      // are typically calculated from related tables and not stored directly on users
      // If you need to store these, consider creating a user_metadata JSONB column
      if (notes !== undefined) {
        updateData.notes = notes;
      }

      // Update coworking/invite fields if provided
      if (coworking !== undefined) {
        updateData.coworking =
          coworking === true || coworking === "Yes" || coworking === "yes";
      }
      if (invite_type !== undefined || inviteType !== undefined) {
        updateData.invite_type = invite_type || inviteType;
      }
      if (sponsor_amount !== undefined || sponsorAmount !== undefined) {
        updateData.sponsor_amount =
          parseFloat(sponsor_amount ?? sponsorAmount) || 0;
      }

      // Update donation amounts if provided
      const donationAmountValue = donation_amount ?? donationAmount;
      if (donationAmountValue !== undefined) {
        updateData.total_monthly_donation =
          parseFloat(donationAmountValue) || 0;
      }
      const oneTimeDonationValue = one_time_donation ?? oneTimeDonation;
      if (oneTimeDonationValue !== undefined) {
        updateData.extra_donation_amount =
          parseFloat(oneTimeDonationValue) || 0;
      }

      // Merge preferences for beneficiary/donation selections
      const preferencesUpdate: any = {
        ...(existingDonor.preferences || {}),
      };
      if (
        beneficiary_id !== undefined &&
        beneficiary_id !== null &&
        beneficiary_id !== ""
      ) {
        preferencesUpdate.preferredCharity = beneficiary_id;
        preferencesUpdate.beneficiary = beneficiary_id;
      }
      if (donationAmountValue !== undefined) {
        preferencesUpdate.monthlyDonation =
          parseFloat(donationAmountValue) || 0;
        preferencesUpdate.donationAmount = parseFloat(donationAmountValue) || 0;
      }
      if (oneTimeDonationValue !== undefined) {
        preferencesUpdate.oneTimeDonation =
          parseFloat(oneTimeDonationValue) || 0;
      }
      if (Object.keys(preferencesUpdate).length > 0) {
        updateData.preferences = preferencesUpdate;
      }

      // Update the donor
      const {data: updatedDonor, error: updateError} = await supabase
        .from("users")
        .update(updateData)
        .eq("id", donorId)
        .eq("role", "donor")
        .select()
        .single();

      if (updateError) {
        console.error("❌ Admin update donor error:", updateError);

        if (updateError.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        // Handle unique constraint violations (e.g., duplicate email)
        if (updateError.code === "23505") {
          return new Response(
            JSON.stringify({success: false, error: "Email already in use"}),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({success: false, error: updateError.message}),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Format response to match frontend expectations
      const fullName =
        `${updatedDonor.first_name || ""} ${updatedDonor.last_name || ""}`.trim();
      const responseData = {
        id: updatedDonor.id,
        name: fullName || updatedDonor.email.split("@")[0],
        email: updatedDonor.email,
        message: "Donor updated successfully",
      };

      return new Response(
        JSON.stringify({
          success: true,
          data: responseData,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Unexpected error updating donor:", error);
      return new Response(
        JSON.stringify({success: false, error: "Internal server error"}),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // DELETE /admin/donors/:id - Delete a donor
  const deleteDonorMatch = route.match(/^\/admin\/donors\/(\d+)$/);
  if (method === "DELETE" && deleteDonorMatch) {
    try {
      const donorId = parseInt(deleteDonorMatch[1], 10);

      if (!donorId || isNaN(donorId)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid donor ID"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Verify the donor exists and has role 'donor'
      const {data: donor, error: donorError} = await supabase
        .from("users")
        .select("id, email, role, profile_picture_url")
        .eq("id", donorId)
        .eq("role", "donor")
        .single();

      if (donorError || !donor) {
        if (donorError?.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: donorError?.message || "Donor not found",
          }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Delete profile picture from Supabase Storage if it exists
      if (donor.profile_picture_url) {
        try {
          const urlParts = donor.profile_picture_url.split("/");
          const publicIndex = urlParts.indexOf("public");
          if (publicIndex !== -1 && publicIndex < urlParts.length - 1) {
            const filePath = urlParts
              .slice(publicIndex + 1)
              .join("/")
              .split("?")[0];
            const bucketName = "profile-pictures";

            const {error: storageError} = await supabase.storage
              .from(bucketName)
              .remove([filePath]);

            if (storageError) {
              console.error(
                "⚠️ Error deleting profile picture from storage:",
                storageError,
              );
              // Continue with user deletion even if storage delete fails
            }
          }
        } catch (storageError) {
          console.error("⚠️ Error deleting profile picture:", storageError);
          // Continue with user deletion even if storage delete fails
        }
      }

      // Delete the donor from the database
      const {data: deletedDonor, error: deleteError} = await supabase
        .from("users")
        .delete()
        .eq("id", donorId)
        .eq("role", "donor")
        .select()
        .single();

      if (deleteError) {
        console.error("❌ Admin delete donor error:", deleteError);

        if (deleteError.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({success: false, error: deleteError.message}),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Success response
      return new Response(
        JSON.stringify({
          success: true,
          data: {id: donorId, message: "Donor deleted successfully"},
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Unexpected error deleting donor:", error);
      return new Response(
        JSON.stringify({success: false, error: "Internal server error"}),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // GET /admin/donors/:id/details - Get comprehensive donor details
  const donorDetailsMatch = route.match(/^\/admin\/donors\/(\d+)\/details$/);
  if (method === "GET" && donorDetailsMatch) {
    try {
      const donorId = parseInt(donorDetailsMatch[1], 10);

      if (!donorId || isNaN(donorId)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid donor ID"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Verify the donor exists
      const {data: donor, error: donorError} = await supabase
        .from("users")
        .select("id, email, role")
        .eq("id", donorId)
        .eq("role", "donor")
        .single();

      if (donorError || !donor) {
        if (donorError?.code === "PGRST116") {
          return new Response(
            JSON.stringify({success: false, error: "Donor not found"}),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        return new Response(
          JSON.stringify({success: false, error: "Donor not found"}),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Fetch payment methods (handle if table doesn't exist)
      let paymentMethods: any[] = [];
      try {
        const {data: pmData, error: pmError} = await supabase
          .from("payment_methods")
          .select("*")
          .eq("donor_id", donorId)
          .order("is_default", {ascending: false});

        if (!pmError && pmData) {
          paymentMethods = pmData.map((pm: any) => ({
            type: pm.type || "card",
            brand: pm.brand || null,
            last4: pm.last4 || null,
            exp_month: pm.exp_month || null,
            exp_year: pm.exp_year || null,
            is_default: pm.is_default || false,
          }));
        }
      } catch (pmErr) {
        console.log("⚠️ Payment methods table may not exist:", pmErr);
        // Continue with empty array
      }

      // Fetch monthly donation/subscription
      let monthlyDonation: any = null;
      try {
        const {data: mdData, error: mdError} = await supabase
          .from("donor_subscriptions")
          .select("*")
          .eq("donor_id", donorId)
          .eq("active", true)
          .single();

        if (!mdError && mdData) {
          monthlyDonation = {
            amount: mdData.amount || 0,
            active: mdData.active || false,
            start_date: mdData.start_date || null,
            next_charge_date: mdData.next_charge_date || null,
          };
        }
      } catch (mdErr) {
        console.log("⚠️ Donor subscriptions table may not exist:", mdErr);
      }

      // Fetch current beneficiary
      let currentBeneficiary: any = null;
      try {
        const {data: cbData, error: cbError} = await supabase
          .from("donor_beneficiaries")
          .select("*, beneficiaries(*)")
          .eq("donor_id", donorId)
          .eq("is_current", true)
          .single();

        if (!cbError && cbData) {
          currentBeneficiary = {
            name: cbData.beneficiaries?.name || cbData.beneficiary_name || null,
            category: cbData.beneficiaries?.category || "Charity",
            amount: cbData.amount || cbData.monthly_amount || 0,
            start_date: cbData.start_date || null,
          };
        }
      } catch (cbErr) {
        console.log("⚠️ Donor beneficiaries table may not exist:", cbErr);
      }

      // Fetch donation history (past donations)
      let donationHistory: any[] = [];
      try {
        const {data: dhData, error: dhError} = await supabase
          .from("donations")
          .select("*, charities(name), beneficiaries(name)")
          .eq("donor_id", donorId)
          .order("created_at", {ascending: false})
          .limit(50);

        if (!dhError && dhData) {
          donationHistory = dhData.map((donation: any) => ({
            date: donation.created_at || donation.date || null,
            amount: parseFloat(donation.amount || 0),
            beneficiary_name:
              donation.charities?.name ||
              donation.beneficiaries?.name ||
              donation.charity_name ||
              "Unknown",
            type:
              donation.type || (donation.is_recurring ? "monthly" : "one_time"),
          }));
        }
      } catch (dhErr) {
        console.log("⚠️ Donations table may not exist:", dhErr);
      }

      // Fetch discount redemptions
      let discountRedemptions: any[] = [];
      let totalSavings = 0;
      try {
        const {data: redData, error: redError} = await supabase
          .from("discount_redemptions")
          .select("*, discounts(name, discount_value), vendors(name, address)")
          .eq("donor_id", donorId)
          .order("redeemed_at", {ascending: false})
          .limit(100);

        if (!redError && redData) {
          discountRedemptions = redData.map((redemption: any) => {
            const savings =
              redemption.savings ||
              redemption.discount_amount ||
              redemption.discounts?.discount_value ||
              0;
            totalSavings += parseFloat(savings);
            return {
              vendor_name:
                redemption.vendors?.name || redemption.vendor_name || null,
              discount_name:
                redemption.discounts?.name || redemption.discount_name || null,
              date: redemption.redeemed_at || redemption.date || null,
              savings: parseFloat(savings),
              location:
                redemption.vendors?.address || redemption.location || null,
            };
          });
        }
      } catch (redErr) {
        console.log("⚠️ Discount redemptions table may not exist:", redErr);
      }

      // Fetch leaderboard position (calculate rank based on points or donations)
      let leaderboardPosition: any = null;
      try {
        // Try to get points from donor_points table
        const {data: pointsData, error: pointsError} = await supabase
          .from("donor_points")
          .select("points, rank")
          .eq("donor_id", donorId)
          .single();

        if (!pointsError && pointsData) {
          let rank = pointsData.rank;

          // Calculate rank if not stored
          if (!rank) {
            const {data: allDonors, error: rankError} = await supabase
              .from("donor_points")
              .select("donor_id, points")
              .order("points", {ascending: false});

            if (!rankError && allDonors) {
              const donorIndex = allDonors.findIndex(
                (d: any) => d.donor_id === donorId,
              );
              rank = donorIndex >= 0 ? donorIndex + 1 : null;
            }
          }

          if (rank) {
            leaderboardPosition = {
              rank: rank,
              points: pointsData.points || 0,
              period: "all_time",
            };
          }
        } else {
          // Fallback: calculate rank based on total donations
          const {data: allDonations, error: allDonationsError} = await supabase
            .from("donations")
            .select("donor_id, amount")
            .eq("status", "active");

          if (!allDonationsError && allDonations) {
            // Aggregate donations by donor
            const donorTotals: Record<number, number> = {};
            allDonations.forEach((donation: any) => {
              if (!donorTotals[donation.donor_id]) {
                donorTotals[donation.donor_id] = 0;
              }
              donorTotals[donation.donor_id] += parseFloat(
                donation.amount || 0,
              );
            });

            // Sort donors by total donations
            const sortedDonors = Object.entries(donorTotals)
              .map(([id, total]) => ({id: parseInt(id), total}))
              .sort((a, b) => b.total - a.total);

            const donorIndex = sortedDonors.findIndex((d) => d.id === donorId);
            if (donorIndex >= 0) {
              leaderboardPosition = {
                rank: donorIndex + 1,
                points: sortedDonors[donorIndex].total,
                period: "all_time",
              };
            }
          }
        }
      } catch (lbErr) {
        console.log("⚠️ Leaderboard calculation error:", lbErr);
      }

      // Format response
      const responseData = {
        payment_methods: paymentMethods,
        monthly_donation: monthlyDonation,
        current_beneficiary: currentBeneficiary,
        donation_history: donationHistory,
        discount_redemptions: discountRedemptions,
        total_savings: totalSavings,
        leaderboard_position: leaderboardPosition,
      };

      return new Response(
        JSON.stringify({
          success: true,
          data: responseData,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Error fetching donor details:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to fetch donor details",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // POST /admin/donors/:id/resend-invitation - Resend invitation email
  const resendInvitationMatch = route.match(
    /^\/admin\/donors\/(\d+)\/resend-invitation$/,
  );
  if (method === "POST" && resendInvitationMatch) {
    try {
      const donorId = parseInt(resendInvitationMatch[1]);

      if (!donorId || isNaN(donorId)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid donor ID"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Get donor by ID
      const {data: donor, error: donorError} = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, role, verification_token, account_status, is_verified",
        )
        .eq("id", donorId)
        .eq("role", "donor")
        .single();

      if (donorError || !donor) {
        return new Response(
          JSON.stringify({success: false, error: "Donor not found"}),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Check if donor is already verified and active
      if (
        donor.is_verified &&
        donor.account_status === "active" &&
        !donor.verification_token
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Donor has already completed signup. Invitation email cannot be resent.",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Generate new verification token if they don't have one
      let verificationToken = donor.verification_token;

      if (!verificationToken) {
        const tokenArray = new Uint8Array(32);
        crypto.getRandomValues(tokenArray);
        verificationToken = Array.from(tokenArray, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");

        // Update donor with new token
        const {error: updateError} = await supabase
          .from("users")
          .update({
            verification_token: verificationToken,
            is_verified: false,
          })
          .eq("id", donorId);

        if (updateError) {
          console.error("❌ Error updating verification token:", updateError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to generate new verification token",
            }),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Send invitation email
      const fullName =
        `${donor.first_name || ""} ${donor.last_name || ""}`.trim();
      const donorName = fullName || donor.email.split("@")[0];

      try {
        await sendInvitationEmail({
          to: donor.email,
          name: donorName,
          verificationToken: verificationToken,
          donorId: donor.id,
        });

        console.log("✅ Invitation email resent successfully to:", donor.email);

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: donor.id,
              email: donor.email,
              name: donorName,
              message: "Invitation email resent successfully",
            },
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (emailError) {
        console.error("❌ Error sending invitation email:", emailError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to send invitation email",
            details: emailError.message,
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
    } catch (error: any) {
      console.error("❌ Unexpected error resending invitation:", error);
      return new Response(
        JSON.stringify({success: false, error: "Internal server error"}),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // POST /admin/donors - Create new donor (invitation flow)
  if (method === "POST" && route === "/admin/donors") {
    try {
      const body = await req.json();
      const {
        name,
        email,
        phone,
        address,
        beneficiary_id,
        coworking,
        sponsor_amount,
        sponsorAmount,
        sponsor_source,
        sponsorSource,
        invite_type,
        inviteType,
        external_billed,
        externalBilled,
      } = body;

      // Validate required fields
      if (!email) {
        return new Response(
          JSON.stringify({success: false, error: "Email is required"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({success: false, error: "Invalid email format"}),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Check if user already exists
      const {data: existingUser, error: checkError} = await supabase
        .from("users")
        .select("id, email, role, account_status")
        .eq("email", email)
        .limit(1);

      if (checkError && checkError.code !== "PGRST116") {
        console.error("❌ Error checking existing user:", checkError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to check existing user",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (existingUser && existingUser.length > 0) {
        const existing = existingUser[0];
        return new Response(
          JSON.stringify({
            success: false,
            error: `User with email ${email} already exists. Status: ${existing.account_status || "unknown"}`,
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Check if phone already exists
      if (phone) {
        const {data: phoneCheck, error: phoneError} = await supabase
          .from("users")
          .select("id, phone, role")
          .eq("phone", phone)
          .limit(1);

        if (phoneError) {
          console.error("❌ Error checking phone:", phoneError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to check existing phone number",
            }),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        if (phoneCheck && phoneCheck.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Phone number already exists. Please use a unique number.",
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Parse name into first_name and last_name
      let first_name = "";
      let last_name = "";
      if (name) {
        const nameParts = name.trim().split(/\s+/);
        if (nameParts.length > 0) {
          first_name = capitalizeName(nameParts[0]);
          last_name = capitalizeName(nameParts.slice(1).join(" ")) || "";
        }
      }

      // Generate verification token
      const tokenArray = new Uint8Array(32);
      crypto.getRandomValues(tokenArray);
      const verificationToken = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      // Set token expiration (24 hours) - store in code for now
      // Note: verification_token_expires column may not exist in users table
      // If you need expiration tracking, add the column to your database
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + 24);
      // We'll log the expiration but won't store it if column doesn't exist

      const isCoworking =
        coworking === true || coworking === "Yes" || coworking === "yes";
      const rawSponsorAmount =
        sponsor_amount ??
        sponsorAmount ??
        body.donation ??
        body.donationAmount ??
        0;
      const sponsorAmountValue = isCoworking
        ? parseFloat(rawSponsorAmount) || 15
        : parseFloat(rawSponsorAmount) || 0;
      const sponsorSourceValue =
        sponsor_source ||
        sponsorSource ||
        (isCoworking ? "THRIVE Coworking" : null);
      const inviteTypeValue =
        invite_type || inviteType || (isCoworking ? "coworking" : "standard");
      const externalBilledValue =
        external_billed ?? externalBilled ?? isCoworking;

      const preferences: any = {};
      if (
        beneficiary_id !== undefined &&
        beneficiary_id !== null &&
        beneficiary_id !== ""
      ) {
        preferences.preferredCharity = beneficiary_id;
        preferences.beneficiary = beneficiary_id;
      }
      if (sponsorAmountValue > 0) {
        preferences.monthlyDonation = sponsorAmountValue;
        preferences.donationAmount = sponsorAmountValue;
      }

      // Create donor with pending verification status
      // Note: password_hash is required - set a temporary hash that won't work for login
      // User will set their real password during signup completion
      const tempPasswordHash = await bcryptHash(
        "temp_invited_" + verificationToken + "_" + Date.now(),
      );

      // Create donor with pending verification status
      // Build insert data object
      const insertData: any = {
        email,
        first_name: capitalizeName(first_name) || null,
        last_name: capitalizeName(last_name) || null,
        phone: phone || null,
        city: address?.city || null,
        state: address?.state || null,
        zip_code: address?.zipCode || null,
        street_address: address?.street || null,
        role: "donor",
        account_status: "active", // Set to active - user will complete signup later
        verification_token: verificationToken,
        is_verified: false,
        password_hash: tempPasswordHash, // Temporary hash - user will update during signup
        preferences: Object.keys(preferences).length > 0 ? preferences : null,
      };

      // Add coworking fields only if they exist in the schema (migration may not be run)
      // Try with all fields first, retry without if column doesn't exist
      try {
        insertData.coworking = isCoworking;
        insertData.invite_type = inviteTypeValue;
        insertData.sponsor_amount = sponsorAmountValue;
        insertData.sponsor_source = sponsorSourceValue;
        insertData.external_billed = externalBilledValue;
        insertData.extra_donation_amount = 0;
        insertData.total_monthly_donation = sponsorAmountValue || 0;
      } catch (e) {
        // Fields will be added conditionally below
      }

      let {data: newDonor, error: insertError} = await supabase
        .from("users")
        .insert([insertData])
        .select()
        .single();

      // If insert fails due to missing columns, retry without coworking fields
      if (
        insertError &&
        (insertError.message?.includes("coworking") ||
          insertError.message?.includes("invite_type") ||
          insertError.message?.includes("sponsor_amount"))
      ) {
        console.warn(
          "⚠️ Coworking columns not found, retrying without them. Please run migration: 20260125000000_add_coworking_invite_fields.sql",
        );

        // Remove coworking-related fields and retry
        const retryData = {...insertData};
        delete retryData.coworking;
        delete retryData.invite_type;
        delete retryData.sponsor_amount;
        delete retryData.sponsor_source;
        delete retryData.external_billed;
        delete retryData.extra_donation_amount;
        delete retryData.total_monthly_donation;

        // Store coworking data in preferences instead
        if (isCoworking) {
          retryData.preferences = {
            ...(retryData.preferences || {}),
            coworking: true,
            inviteType: inviteTypeValue,
            sponsorAmount: sponsorAmountValue,
            sponsorSource: sponsorSourceValue,
            externalBilled: externalBilledValue,
            totalMonthlyDonation: sponsorAmountValue || 0,
          };
        }

        const retryResult = await supabase
          .from("users")
          .insert([retryData])
          .select()
          .single();

        if (retryResult.error) {
          insertError = retryResult.error;
          newDonor = null;
        } else {
          insertError = null;
          newDonor = retryResult.data;
          console.log(
            "✅ Donor created successfully (coworking fields stored in preferences)",
          );
        }
      }

      if (insertError) {
        console.error("❌ Error creating donor:", insertError);

        // Handle unique constraint violations
        if (insertError.code === "23505") {
          return new Response(
            JSON.stringify({success: false, error: "Email already in use"}),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: insertError.message || "Failed to create donor",
            hint: insertError.message?.includes("coworking")
              ? "Please run migration: supabase/migrations/20260125000000_add_coworking_invite_fields.sql"
              : undefined,
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      console.log("✅ Donor created successfully:", email);
      console.log("🔗 Verification token generated:", verificationToken);

      // Send invitation email (async - don't wait for it)
      sendInvitationEmail({
        to: email,
        name: name || email.split("@")[0],
        verificationToken: verificationToken,
        donorId: newDonor.id,
      }).catch((emailError) => {
        console.error("❌ Error sending invitation email:", emailError);
        // Don't fail the request if email fails - user can resend later
      });

      // Return success response
      const fullName =
        `${newDonor.first_name || ""} ${newDonor.last_name || ""}`.trim();
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: newDonor.id,
            email: newDonor.email,
            name: fullName || email.split("@")[0],
            status: "pending_verification",
            message:
              "Donor invitation sent successfully. Email verification required.",
          },
        }),
        {
          status: 201,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Unexpected error creating donor:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Internal server error",
          details: error?.message || String(error),
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Donors route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}
