import { corsHeaders } from "../lib/cors.ts";
import { bcryptHash } from "../lib/password.ts";
import { capitalizeName } from "../lib/strings.ts";
import { geocodeAddress } from "../lib/geocoding.ts";
import { membershipOf } from "../lib/membership.ts";
import { getStripeClient } from "../lib/stripe.ts";

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

  // GET /admin/donors/highlights
  // Returns the four donor-health KPIs powering the Donors page top strip:
  //   - atRisk: count of past_due/unpaid donors + monthly $ at risk
  //   - topDonor: name + lifetime donation total for the highest giver
  //   - avgLifetimeValue: avg lifetime donation $ across donors who have given
  //   - retentionRate: % of last month's paying donors who are still paying this month
  //   - newThisMonth: count of donors with first donation in last 30 days + growth rate vs prior month
  if (method === "GET" && route === "/admin/donors/highlights") {
    try {
      const SERVICE_FEE = 3.0;
      const now = new Date();
      const ms = (days: number) => days * 24 * 60 * 60 * 1000;
      const thirtyAgo = new Date(now.getTime() - ms(30)).toISOString();
      const sixtyAgo = new Date(now.getTime() - ms(60)).toISOString();

      // ---- Donor universe ----
      const { data: donors } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .eq("role", "donor");
      const donorIds = (donors || []).map((d: any) => d.id);
      const donorNameById: Record<number, string> = {};
      for (const d of donors || []) {
        const name = `${d.first_name || ""} ${d.last_name || ""}`.trim();
        donorNameById[d.id] = name || (d.email || "").split("@")[0];
      }

      // ---- monthly_donations snapshot ----
      const { data: subs } = await supabase
        .from("monthly_donations")
        .select(
          "user_id, status, last_payment_amount, amount, last_payment_date, updated_at",
        )
        .in("user_id", donorIds.length ? donorIds : [0]);

      // Same inference helper used by donation-overview to recover the donor's
      // chosen donation amount from a gross monthly charge.
      const STRIPE_FEE_PERCENT = 0.022;
      const STRIPE_FIXED_FEE = 0.30;
      const LEGACY_CC_RATE = 0.035;
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

      // ---- At-Risk ----
      const atRiskUsers = new Set<number>();
      let monthlyAtRisk = 0;
      for (const s of subs || []) {
        const st = String(s.status || "").toLowerCase();
        if (st === "past_due" || st === "unpaid") {
          atRiskUsers.add(s.user_id);
          const gross = parseFloat(
            (s.last_payment_amount ?? s.amount ?? 0).toString(),
          );
          if (!Number.isNaN(gross)) monthlyAtRisk += inferDonation(gross);
        }
      }

      // ---- Top Donor + Avg Lifetime Value (from transactions) ----
      const { data: txns } = await supabase
        .from("transactions")
        .select("user_id, type, amount")
        .eq("status", "completed");
      const lifetimeByUser: Record<number, number> = {};
      for (const t of txns || []) {
        const amt = parseFloat((t.amount ?? 0).toString());
        if (Number.isNaN(amt)) continue;
        const donation =
          t.type === "monthly_donation" ? inferDonation(amt) : amt;
        lifetimeByUser[t.user_id] =
          (lifetimeByUser[t.user_id] || 0) + donation;
      }
      let topDonorId: number | null = null;
      let topDonorTotal = 0;
      let lifetimeSum = 0;
      let donorWithGivingCount = 0;
      for (const [uid, total] of Object.entries(lifetimeByUser)) {
        const t = total as number;
        if (t > 0) {
          lifetimeSum += t;
          donorWithGivingCount += 1;
          if (t > topDonorTotal) {
            topDonorTotal = t;
            topDonorId = Number(uid);
          }
        }
      }
      const avgLifetimeValue =
        donorWithGivingCount > 0 ? lifetimeSum / donorWithGivingCount : 0;

      // ---- Retention Rate ----
      // "Last month active" = had a payment 30-60 days ago.
      // "This month active" = has an active/trialing sub AND payment in last 30d.
      const lastMonthActive = new Set<number>();
      const thisMonthActive = new Set<number>();
      const ACTIVE = new Set(["active", "trialing"]);
      const thirtyDate = thirtyAgo.split("T")[0];
      const sixtyDate = sixtyAgo.split("T")[0];
      for (const s of subs || []) {
        const st = String(s.status || "").toLowerCase();
        if (s.last_payment_date) {
          const lpd = s.last_payment_date as string;
          if (lpd >= sixtyDate && lpd < thirtyDate) {
            lastMonthActive.add(s.user_id);
          }
          if (lpd >= thirtyDate && ACTIVE.has(st)) {
            thisMonthActive.add(s.user_id);
          }
        }
      }
      let retained = 0;
      for (const uid of lastMonthActive) {
        if (thisMonthActive.has(uid)) retained += 1;
      }
      const retentionRate =
        lastMonthActive.size > 0
          ? Math.round((retained / lastMonthActive.size) * 1000) / 10
          : null;

      // ---- New This Month + growth vs prior month ----
      const { data: monthlyPayments } = await supabase
        .from("monthly_donations")
        .select("user_id, last_payment_date")
        .in("user_id", donorIds.length ? donorIds : [0])
        .not("last_payment_date", "is", null);
      const { data: oneTime } = await supabase
        .from("one_time_gifts")
        .select("user_id, created_at")
        .in("user_id", donorIds.length ? donorIds : [0])
        .eq("status", "completed");
      const firstByUser = new Map<number, string>();
      for (const r of monthlyPayments || []) {
        const ts = `${r.last_payment_date}T00:00:00Z`;
        const cur = firstByUser.get(r.user_id);
        if (!cur || ts < cur) firstByUser.set(r.user_id, ts);
      }
      for (const r of oneTime || []) {
        if (!r.created_at) continue;
        const cur = firstByUser.get(r.user_id);
        if (!cur || r.created_at < cur)
          firstByUser.set(r.user_id, r.created_at);
      }
      let newThisMonth = 0;
      let newLastMonth = 0;
      for (const ts of firstByUser.values()) {
        if (ts >= thirtyAgo) newThisMonth += 1;
        else if (ts >= sixtyAgo) newLastMonth += 1;
      }
      const growthRate =
        newLastMonth === 0
          ? newThisMonth > 0
            ? 100
            : 0
          : Math.round(
              ((newThisMonth - newLastMonth) / newLastMonth) * 1000,
            ) / 10;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            atRisk: {
              count: atRiskUsers.size,
              monthlyAtRisk: Math.round(monthlyAtRisk * 100) / 100,
            },
            topDonor:
              topDonorId !== null
                ? {
                    donorId: topDonorId,
                    name: donorNameById[topDonorId] || `Donor ${topDonorId}`,
                    lifetimeTotal: Math.round(topDonorTotal * 100) / 100,
                  }
                : null,
            avgLifetimeValue: Math.round(avgLifetimeValue * 100) / 100,
            donorWithGivingCount,
            retentionRate, // percent; null if no prior-month base
            lastMonthActiveCount: lastMonthActive.size,
            newThisMonth: { count: newThisMonth, growthRate },
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (err: any) {
      console.error("donors/highlights error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "highlights failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

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
      // Subscription status per donor — derived from their most recently
      // updated monthly_donations row. We surface this as a colored tag in
      // the Donors table so past_due / cancelled donors are actionable.
      const subscriptionStatusByUser = new Map<number, string>();
      if (userIds.length > 0) {
        const {data: monthlyRows} = await supabase
          .from("monthly_donations")
          .select("user_id, status, last_payment_date, updated_at")
          .in("user_id", userIds);
        // Choose one status per user: prefer active/trialing if any sub is
        // currently paying; otherwise fall back to the most recently updated
        // row (so past_due / cancelled / unpaid get surfaced).
        const ACTIVE_STATUSES = new Set(["active", "trialing"]);
        const rowsByUser = new Map<number, any[]>();
        for (const row of monthlyRows || []) {
          if (row.last_payment_date) {
            const cur = lastDonationByUser.get(row.user_id);
            if (!cur || row.last_payment_date > cur) {
              lastDonationByUser.set(row.user_id, row.last_payment_date);
            }
          }
          if (!rowsByUser.has(row.user_id)) rowsByUser.set(row.user_id, []);
          rowsByUser.get(row.user_id)!.push(row);
        }
        for (const [uid, rows] of rowsByUser.entries()) {
          const active = rows.find((r: any) =>
            ACTIVE_STATUSES.has(String(r.status).toLowerCase()),
          );
          if (active) {
            subscriptionStatusByUser.set(uid, active.status);
            continue;
          }
          // No active sub — surface the most recent terminal/problem status.
          const sorted = [...rows].sort((a: any, b: any) => {
            const aT = a.updated_at || "";
            const bT = b.updated_at || "";
            return aT > bT ? -1 : aT < bT ? 1 : 0;
          });
          subscriptionStatusByUser.set(uid, sorted[0].status || "no_subscription");
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
        // Lifetime one-time gifts given. total_one_time_gifts_given is
        // maintained by the payment_intent.succeeded webhook (see webhooks.ts
        // — 1oo-time gifts handler). The legacy extra_donation_amount /
        // preferences.oneTimeDonation fields have no writer and were showing
        // $0 for everyone; keep them as fallbacks so pre-webhook rows still
        // report something.
        const oneTimeDonation =
          user.total_one_time_gifts_given ??
          user.extra_donation_amount ??
          user.preferences?.oneTimeDonation ??
          0;
        return {
          id: user.id,
          name: fullName || user.email.split("@")[0],
          email: user.email,
          phone: user.phone || "N/A",
          beneficiary_id: preferredCharityId,
          beneficiary_name: preferredCharityId
            ? charityNameById[preferredCharityId] || "N/A"
            : "N/A",
          coworking: membershipOf(user) === "coworking",
          // 'standard' | 'coworking' | 'team'. The list response previously
          // exposed only the coworking boolean, so a team account was
          // indistinguishable from a standard one in the admin table.
          invite_type: membershipOf(user),
          inviteType: membershipOf(user),
          sponsor_amount: Number(user.sponsor_amount || 0),
          external_billed: user.external_billed === true,
          total_donations: parseFloat(monthlyDonation) || 0,
          one_time_donation: parseFloat(oneTimeDonation) || 0,
          last_donation_date: lastDonationByUser.get(user.id) || null,
          subscription_status:
            subscriptionStatusByUser.get(user.id) || "no_subscription",
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
        external_billed,
        externalBilled,
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
      if (external_billed !== undefined || externalBilled !== undefined) {
        updateData.external_billed =
          (external_billed ?? externalBilled) === true;
      }
      // Switching an existing donor to Team has to clear the money fields too.
      // Without this a former standard donor kept their pledged monthly amount
      // and stayed in the totals the Team type is supposed to keep them out of.
      if (
        String(updateData.invite_type ?? "").trim().toLowerCase() === "team"
      ) {
        updateData.external_billed = true;
        updateData.coworking = false;
        updateData.sponsor_amount = 0;
        updateData.sponsor_source = "THRIVE Team";
        updateData.total_monthly_donation = 0;
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

  // GET /admin/donors/:id/debug — temporary diagnostic endpoint
  // Returns row counts + first-5 samples from each donor-adjacent table
  // so we can see exactly what data exists for a given donor id without
  // relying on RLS-blocked direct DB access. Safe to remove once the
  // history/redemptions display issue is confirmed fixed.
  // GET /admin/donors/:id/stripe — read-only support diagnostic.
  //
  // Compares what we stored against what Stripe actually says, which is
  // otherwise unanswerable: the Stripe secret key only exists server-side, so
  // there is no way to check a donor's real subscription state from a laptop.
  // Added while chasing a donor stuck at status "pending" whose local row and
  // Stripe had diverged.
  //
  // Strictly read-only — it never writes to the database or to Stripe.
  const donorStripeMatch = route.match(/^\/admin\/donors\/(\d+)\/stripe$/);
  if (method === "GET" && donorStripeMatch) {
    const donorId = parseInt(donorStripeMatch[1], 10);
    const out: any = { donor_id: donorId };
    try {
      const { data: user } = await supabase
        .from("users")
        .select("id, email, stripe_customer_id")
        .eq("id", donorId)
        .maybeSingle();
      if (!user) {
        return new Response(JSON.stringify({ error: "Donor not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }
      out.email = user.email;
      out.stripe_customer_id = user.stripe_customer_id || null;

      const { data: subs } = await supabase
        .from("monthly_donations")
        .select("id, status, amount, stripe_subscription_id, created_at, updated_at")
        .eq("user_id", donorId)
        .order("created_at", { ascending: false });
      out.local_monthly_donations = subs || [];

      const stripe = getStripeClient();
      const get = async (path: string) => {
        const r = await fetch(`${stripe.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${stripe.secretKey}` },
        });
        const body = await r.json();
        return { ok: r.ok, status: r.status, body };
      };

      // Each local subscription, as Stripe sees it.
      out.stripe_subscriptions = [];
      for (const sub of out.local_monthly_donations) {
        if (!sub.stripe_subscription_id) continue;
        const res = await get(
          `/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}?expand[]=latest_invoice.payment_intent`,
        );
        const b = res.body || {};
        out.stripe_subscriptions.push({
          local_id: sub.id,
          local_status: sub.status,
          stripe_id: sub.stripe_subscription_id,
          found: res.ok,
          stripe_error: res.ok ? null : b?.error?.message || `HTTP ${res.status}`,
          stripe_status: b.status ?? null,
          cancel_at_period_end: b.cancel_at_period_end ?? null,
          latest_invoice_status: b.latest_invoice?.status ?? null,
          latest_invoice_paid: b.latest_invoice?.paid ?? null,
          amount_due: b.latest_invoice?.amount_due ?? null,
          amount_paid: b.latest_invoice?.amount_paid ?? null,
          payment_intent_status:
            b.latest_invoice?.payment_intent?.status ?? null,
          last_payment_error:
            b.latest_invoice?.payment_intent?.last_payment_error?.message ??
            null,
          default_payment_method: b.default_payment_method ?? null,
        });
      }

      // Every subscription Stripe has for this customer, including any our
      // rows don't reference — the amount-change path used to delete and
      // recreate subscriptions, so orphans are possible.
      if (user.stripe_customer_id) {
        const all = await get(
          `/subscriptions?customer=${encodeURIComponent(user.stripe_customer_id)}&status=all&limit=20`,
        );
        out.all_stripe_subscriptions = (all.body?.data || []).map((x: any) => ({
          id: x.id,
          status: x.status,
          created: new Date(x.created * 1000).toISOString(),
          amount: x.items?.data?.[0]?.price?.unit_amount ?? null,
          cancel_at_period_end: x.cancel_at_period_end,
          known_locally: (out.local_monthly_donations || []).some(
            (r: any) => r.stripe_subscription_id === x.id,
          ),
        }));
      }

      // Open invoices — what would actually need paying.
      if (user.stripe_customer_id) {
        const inv = await get(
          `/invoices?customer=${encodeURIComponent(user.stripe_customer_id)}&limit=10`,
        );
        out.invoices = (inv.body?.data || []).map((x: any) => ({
          id: x.id,
          status: x.status,
          amount_due: x.amount_due,
          amount_paid: x.amount_paid,
          created: new Date(x.created * 1000).toISOString(),
          subscription: x.subscription ?? null,
        }));
      }

      // Recent activity on the customer — shows whether a fresh attempt
      // (e.g. Apple Pay) actually reached Stripe.
      if (user.stripe_customer_id) {
        const cid = encodeURIComponent(user.stripe_customer_id);
        const pi = await get(`/payment_intents?customer=${cid}&limit=5`);
        out.recent_payment_intents = (pi.body?.data || []).map((x: any) => ({
          id: x.id,
          status: x.status,
          amount: x.amount,
          created: new Date(x.created * 1000).toISOString(),
          last_error: x.last_payment_error?.message ?? null,
        }));
        const pm = await get(`/payment_methods?customer=${cid}&type=card&limit=5`);
        out.saved_cards = (pm.body?.data || []).map((x: any) => ({
          id: x.id,
          brand: x.card?.brand,
          last4: x.card?.last4,
          exp: `${x.card?.exp_month}/${x.card?.exp_year}`,
        }));
      }

      return new Response(JSON.stringify({ success: true, data: out }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: e?.message || "diagnostic failed", partial: out }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  const donorDebugMatch = route.match(/^\/admin\/donors\/(\d+)\/debug$/);
  if (method === "GET" && donorDebugMatch) {
    const donorId = parseInt(donorDebugMatch[1], 10);
    const debugResult: any = { donor_id: donorId };
    try {
      const { data: allTxns } = await supabase
        .from("transactions")
        .select("id, user_id, type, amount, status, created_at, beneficiary_id, description, reference_id, reference_type")
        .eq("user_id", donorId)
        .order("created_at", { ascending: false });
      debugResult.transactions = {
        count: (allTxns || []).length,
        by_type: {},
        by_status: {},
        by_amount_bucket: { zero: 0, positive: 0, negative: 0, null: 0 },
        sample: (allTxns || []).slice(0, 5),
      };
      for (const t of allTxns || []) {
        const bt = debugResult.transactions.by_type;
        const bs = debugResult.transactions.by_status;
        const bb = debugResult.transactions.by_amount_bucket;
        bt[t.type || "null"] = (bt[t.type || "null"] || 0) + 1;
        bs[t.status || "null"] = (bs[t.status || "null"] || 0) + 1;
        const a = t.amount == null ? "null" : (Number(t.amount) > 0 ? "positive" : Number(t.amount) < 0 ? "negative" : "zero");
        bb[a] = (bb[a] || 0) + 1;
      }

      const { data: allReds } = await supabase
        .from("redemptions")
        .select("id, user_id, discount_id, vendor_id, redeemed_at, total_bill, total_savings, redemption_code")
        .eq("user_id", donorId)
        .order("redeemed_at", { ascending: false });
      debugResult.redemptions = {
        count: (allReds || []).length,
        sample: (allReds || []).slice(0, 5),
      };

      const { data: allGifts } = await supabase
        .from("one_time_gifts")
        .select("id, user_id, amount, status, created_at, beneficiary_id, user_covered_fees, processing_fee, net_amount")
        .eq("user_id", donorId)
        .order("created_at", { ascending: false });
      debugResult.one_time_gifts = {
        count: (allGifts || []).length,
        by_status: {},
        sample: (allGifts || []).slice(0, 5),
      };
      for (const g of allGifts || []) {
        const bs = debugResult.one_time_gifts.by_status;
        bs[g.status || "null"] = (bs[g.status || "null"] || 0) + 1;
      }

      const { data: allMonthly } = await supabase
        .from("monthly_donations")
        .select("id, user_id, status, amount, last_payment_amount, last_payment_date, next_payment_date, created_at, beneficiary_id, stripe_subscription_id, user_covered_fees")
        .eq("user_id", donorId)
        .order("updated_at", { ascending: false });
      debugResult.monthly_donations = {
        count: (allMonthly || []).length,
        sample: allMonthly || [],
      };

      return new Response(
        JSON.stringify({ success: true, data: debugResult }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (e: any) {
      return new Response(
        JSON.stringify({ success: false, error: e.message, debugResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

      // ---- Pull the donor's Stripe customer ID once — used by the
      //      payment-methods fetch below.
      const { data: donorRow } = await supabase
        .from("users")
        .select("stripe_customer_id")
        .eq("id", donorId)
        .maybeSingle();
      const stripeCustomerId = donorRow?.stripe_customer_id || null;

      // ---- Payment methods (live from Stripe) ----
      // Prior version queried a `payment_methods` table that doesn't exist
      // in this project — payment methods live in Stripe. Fetch the
      // customer's default PM + full list of cards so the admin sees exactly
      // what the donor is being charged on.
      let paymentMethods: any[] = [];
      if (stripeCustomerId) {
        try {
          const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
          if (stripeKey) {
            const stripeBase = "https://api.stripe.com/v1";
            const auth = { Authorization: `Bearer ${stripeKey}` };
            const custRes = await fetch(`${stripeBase}/customers/${stripeCustomerId}`, { headers: auth });
            let defaultPmId: string | null = null;
            if (custRes.ok) {
              const cust = await custRes.json();
              defaultPmId = cust.invoice_settings?.default_payment_method || null;
            }
            const pmRes = await fetch(
              `${stripeBase}/payment_methods?customer=${stripeCustomerId}&type=card`,
              { headers: auth },
            );
            if (pmRes.ok) {
              const pmJson = await pmRes.json();
              paymentMethods = (pmJson.data || []).map((pm: any) => ({
                type: pm.type === "card" ? "card" : pm.type,
                brand: pm.card?.brand || null,
                last4: pm.card?.last4 || null,
                exp_month: pm.card?.exp_month || null,
                exp_year: pm.card?.exp_year || null,
                is_default: pm.id === defaultPmId,
              }));
            }
          }
        } catch (pmErr) {
          console.log("⚠️ Stripe payment methods fetch failed:", pmErr);
        }
      }

      // ---- Monthly donation (from monthly_donations) ----
      // Reads the donor's active recurring row — status, amount, cadence,
      // last + next charge dates. If none, tab shows the empty state.
      let monthlyDonation: any = null;
      let currentBeneficiary: any = null;
      try {
        const { data: mdData } = await supabase
          .from("monthly_donations")
          .select("id, status, amount, last_payment_amount, last_payment_date, next_payment_date, created_at, beneficiary_id, stripe_subscription_id, user_covered_fees, processing_fee")
          .eq("user_id", donorId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (mdData) {
          const st = String(mdData.status || "").toLowerCase();
          const isLive = st === "active" || st === "trialing" || st === "past_due";
          monthlyDonation = {
            amount: parseFloat((mdData.amount ?? 0).toString()) || 0,
            active: isLive,
            status: mdData.status || null,
            start_date: mdData.created_at || null,
            last_charge_date: mdData.last_payment_date || null,
            last_charge_amount: mdData.last_payment_amount != null
              ? parseFloat(mdData.last_payment_amount.toString())
              : null,
            next_charge_date: mdData.next_payment_date || null,
            stripe_subscription_id: mdData.stripe_subscription_id || null,
            user_covered_fees: mdData.user_covered_fees === true,
            processing_fee: mdData.processing_fee != null
              ? parseFloat(mdData.processing_fee.toString())
              : null,
          };

          // Current beneficiary — pulled from the monthly_donations row
          // (that's where the donor's chosen charity lives, not on the
          // users row).
          if (mdData.beneficiary_id) {
            const { data: benef } = await supabase
              .from("charities")
              .select("id, name, category")
              .eq("id", mdData.beneficiary_id)
              .maybeSingle();
            if (benef) {
              currentBeneficiary = {
                id: benef.id,
                name: benef.name,
                category: benef.category || "Charity",
                amount: monthlyDonation.amount,
                start_date: monthlyDonation.start_date,
              };
            }
          }
        }
      } catch (mdErr) {
        console.log("⚠️ monthly_donations lookup failed:", mdErr);
      }

      // ---- Donation history ----
      // Data lives across two tables, merged into one chronological list:
      //   1. `transactions` filtered to real money-movement rows
      //      (monthly_donation / one_time_gift / held_release, amount > 0).
      //      Transactions with type='redemption' are the mobile app's
      //      discount-redemption ledger and are excluded here.
      //   2. `one_time_gifts` completed / succeeded — some rows pre-date
      //      the transactions upsert flow.
      // The most recent monthly charge is synthesized from monthly_donations
      // when the transactions table lacks a matching row (older subs where
      // the webhook never wrote to transactions).
      let donationHistory: any[] = [];
      try {
        const { data: txns } = await supabase
          .from("transactions")
          .select("id, user_id, type, amount, status, created_at, beneficiary_id, description, gift_id, donation_id, reference_id, stripe_invoice_id")
          .eq("user_id", donorId)
          .eq("status", "completed")
          .in("type", ["monthly_donation", "one_time_gift", "held_release"])
          .gt("amount", 0)
          .order("created_at", { ascending: false })
          .limit(100);

        const { data: gifts } = await supabase
          .from("one_time_gifts")
          .select("id, user_id, amount, status, created_at, beneficiary_id")
          .eq("user_id", donorId)
          .in("status", ["succeeded", "completed", "processed"])
          .order("created_at", { ascending: false })
          .limit(100);

        const { data: monthlyRows } = await supabase
          .from("monthly_donations")
          .select("id, amount, last_payment_amount, last_payment_date, created_at, beneficiary_id, stripe_subscription_id")
          .eq("user_id", donorId);

        // Pull the full paid-invoice history from Stripe for every
        // subscription this donor has. monthly_donations only remembers
        // the most recent charge (last_payment_date), so without this we
        // miss every renewal before the latest one — e.g. Ramon's June
        // signup charge is invisible if only July's is on file.
        const stripeInvoicesBySub = new Map<string, any[]>();
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          for (const m of monthlyRows || []) {
            if (!m.stripe_subscription_id) continue;
            try {
              const invRes = await fetch(
                `https://api.stripe.com/v1/invoices?subscription=${encodeURIComponent(m.stripe_subscription_id)}&status=paid&limit=100`,
                { headers: { Authorization: `Bearer ${stripeKey}` } },
              );
              if (invRes.ok) {
                const invJson = await invRes.json();
                stripeInvoicesBySub.set(m.stripe_subscription_id, invJson.data || []);
              }
            } catch (invErr) {
              console.log(`⚠️ Stripe invoice fetch failed for ${m.stripe_subscription_id}:`, invErr);
            }
          }
        }

        const beneficiaryIds = new Set<number>();
        for (const t of txns || []) if (t.beneficiary_id) beneficiaryIds.add(t.beneficiary_id);
        for (const g of gifts || []) if (g.beneficiary_id) beneficiaryIds.add(g.beneficiary_id);
        for (const m of monthlyRows || []) if (m.beneficiary_id) beneficiaryIds.add(m.beneficiary_id);
        const nameByBenefId = new Map<number, string>();
        if (beneficiaryIds.size > 0) {
          const { data: benefRows } = await supabase
            .from("charities")
            .select("id, name")
            .in("id", Array.from(beneficiaryIds));
          for (const b of benefRows || []) nameByBenefId.set(b.id, b.name);
        }

        const merged: any[] = [];

        // Dedupe by real identifiers, not date+amount+beneficiary:
        //   • seenInvoiceIds — Stripe invoice / reference id for monthly renewals
        //   • seenGiftIds    — one_time_gifts.id when the txn came from a gift
        //   • seenMdDates    — subscription-id + date, so two subs paying the
        //                     same day both show up
        // The previous keying dropped legitimate rows (two $25 gifts to the
        // same charity on the same day collapsed to one) and silently under-
        // counted the "Total Donations" figure. Real IDs never collide.
        const seenInvoiceIds = new Set<string>();
        const seenGiftIds = new Set<string>();
        const seenMdDates = new Set<string>();

        for (const t of txns || []) {
          const invId = t.stripe_invoice_id || t.reference_id;
          if (t.type === "monthly_donation" && invId) {
            seenInvoiceIds.add(invId);
          }
          if (t.type === "one_time_gift" && t.gift_id) {
            seenGiftIds.add(String(t.gift_id));
          }
          merged.push({
            id: `txn-${t.id}`,
            date: t.created_at || null,
            amount: parseFloat((t.amount ?? 0).toString()) || 0,
            beneficiary_name: t.beneficiary_id
              ? (nameByBenefId.get(t.beneficiary_id) || "Beneficiary")
              : (t.description || "One-time gift"),
            type: t.type === "monthly_donation" ? "monthly" : "one_time",
          });
        }

        // Backfill one_time_gifts that never landed in transactions.
        // Match on gift_id — the only stable identifier.
        for (const g of gifts || []) {
          if (seenGiftIds.has(String(g.id))) continue;
          const amt = parseFloat((g.amount ?? 0).toString()) || 0;
          if (amt <= 0) continue;
          seenGiftIds.add(String(g.id));
          merged.push({
            id: `gift-${g.id}`,
            date: g.created_at || null,
            amount: amt,
            beneficiary_name: g.beneficiary_id
              ? (nameByBenefId.get(g.beneficiary_id) || "Beneficiary")
              : "One-time gift",
            type: "one_time",
          });
        }

        // For each subscription, add one row per paid Stripe invoice.
        // Stripe is the source of truth for renewal history since our
        // monthly_donations table only remembers the most recent charge.
        // Falls back to the monthly_donations row when Stripe couldn't
        // be reached OR the subscription has no stripe_subscription_id.
        for (const m of monthlyRows || []) {
          const invoices = m.stripe_subscription_id
            ? (stripeInvoicesBySub.get(m.stripe_subscription_id) || [])
            : [];

          if (invoices.length > 0) {
            for (const inv of invoices) {
              // Skip if we already have a transaction row for this invoice —
              // avoids the double-row that used to happen when the webhook
              // wrote transactions AND the modal also pulled the invoice.
              if (seenInvoiceIds.has(inv.id)) continue;
              const paidAt = (inv.status_transitions?.paid_at || inv.created);
              if (!paidAt) continue;
              seenInvoiceIds.add(inv.id);
              // Stripe amounts are in cents.
              const amt = ((inv.amount_paid ?? 0) as number) / 100;
              if (amt <= 0) continue;
              merged.push({
                id: `inv-${inv.id}`,
                date: new Date(paidAt * 1000).toISOString(),
                amount: amt,
                beneficiary_name: m.beneficiary_id
                  ? (nameByBenefId.get(m.beneficiary_id) || "Beneficiary")
                  : "Monthly donation",
                type: "monthly",
              });
            }
          } else if (m.last_payment_date) {
            // Fallback — no Stripe data available, use whatever the local
            // snapshot has (last charge only). Dedupe by (subscription id,
            // date) so two subs' most-recent charges on the same date both
            // show up.
            const mdKey = `${m.id}|${String(m.last_payment_date).slice(0, 10)}`;
            if (seenMdDates.has(mdKey)) continue;
            seenMdDates.add(mdKey);
            const amt = parseFloat(
              (m.last_payment_amount ?? m.amount ?? 0).toString(),
            ) || 0;
            if (amt <= 0) continue;
            const dateISO = String(m.last_payment_date).length > 10
              ? String(m.last_payment_date)
              : `${m.last_payment_date}T00:00:00`;
            merged.push({
              id: `md-${m.id}-${m.last_payment_date}`,
              date: dateISO,
              amount: amt,
              beneficiary_name: m.beneficiary_id
                ? (nameByBenefId.get(m.beneficiary_id) || "Beneficiary")
                : "Monthly donation",
              type: "monthly",
            });
          }
        }

        merged.sort((a, b) => {
          const da = a.date ? Date.parse(a.date) : 0;
          const db = b.date ? Date.parse(b.date) : 0;
          return db - da;
        });
        donationHistory = merged.slice(0, 50);
      } catch (dhErr) {
        console.log("⚠️ donation history lookup failed:", dhErr);
      }

      // Sum of every entry in the donation history — mirrors the
      // total_savings summary the Discount Redemptions tab already surfaces.
      const totalDonations = donationHistory.reduce(
        (acc: number, row: any) => acc + (Number(row.amount) || 0),
        0,
      );

      // ---- Discount redemptions ----
      // Real redemption events currently live in TWO places:
      //   1. `redemptions` — the "proper" table, joined to discounts +
      //      vendors. Populated by newer code paths.
      //   2. `transactions` with type='redemption' — the mobile app's older
      //      write path. Rows have `description` = discount title but no
      //      vendor_id / discount_id / savings, so display is skinnier.
      // Merged into one chronological list so admins see everything.
      let discountRedemptions: any[] = [];
      let totalSavings = 0;
      try {
        const { data: redData } = await supabase
          .from("redemptions")
          .select("id, discount_id, vendor_id, redeemed_at, total_bill, total_savings, redemption_code")
          .eq("user_id", donorId)
          .order("redeemed_at", { ascending: false })
          .limit(100);

        const discountIds = Array.from(new Set((redData || []).map((r: any) => r.discount_id).filter(Boolean)));
        const vendorIds = Array.from(new Set((redData || []).map((r: any) => r.vendor_id).filter(Boolean)));

        const discountById = new Map<number, any>();
        if (discountIds.length > 0) {
          const { data: dRows } = await supabase
            .from("discounts")
            .select("id, title, discount_type, discount_value, discount_percentage, discount_amount")
            .in("id", discountIds);
          for (const d of dRows || []) discountById.set(d.id, d);
        }
        const vendorById = new Map<number, any>();
        if (vendorIds.length > 0) {
          const { data: vRows } = await supabase
            .from("vendors")
            .select("id, name, address")
            .in("id", vendorIds);
          for (const v of vRows || []) vendorById.set(v.id, v);
        }

        const enriched = (redData || []).map((r: any) => {
          const d = discountById.get(r.discount_id);
          const v = vendorById.get(r.vendor_id);
          const savings = r.total_savings != null
            ? parseFloat(r.total_savings.toString())
            : 0;
          totalSavings += savings;
          const addr = v?.address || {};
          const location = [addr.city, addr.state].filter(Boolean).join(", ");
          return {
            id: `red-${r.id}`,
            vendor_name: v?.name || null,
            discount_name: d?.title || null,
            discount_type: d?.discount_type || null,
            date: r.redeemed_at || null,
            savings,
            total_bill: r.total_bill != null ? parseFloat(r.total_bill.toString()) : null,
            redemption_code: r.redemption_code || null,
            location: location || null,
          };
        });

        // Also pull redemption-typed transactions — the mobile app's write
        // target for discount redemptions. Includes `savings` and `spending`
        // which the mobile Savings Tracker screen edits via PUT
        // /transactions/:id. Also joins to vendors for the location column.
        const { data: redTxns } = await supabase
          .from("transactions")
          .select("id, description, created_at, savings, spending, amount, vendor_id, metadata")
          .eq("user_id", donorId)
          .eq("type", "redemption")
          .order("created_at", { ascending: false })
          .limit(100);

        const redTxnVendorIds = Array.from(
          new Set((redTxns || []).map((t: any) => t.vendor_id).filter(Boolean)),
        );
        const redTxnVendorById = new Map<number, any>();
        if (redTxnVendorIds.length > 0) {
          const { data: vRows } = await supabase
            .from("vendors")
            .select("id, name, address")
            .in("id", redTxnVendorIds);
          for (const v of vRows || []) redTxnVendorById.set(v.id, v);
        }

        const parseMoney = (v: any): number => {
          if (v == null) return 0;
          const n = parseFloat(String(v).replace(/[$,]/g, ""));
          return Number.isFinite(n) ? n : 0;
        };

        const legacy = (redTxns || []).map((t: any) => {
          const v = t.vendor_id ? redTxnVendorById.get(t.vendor_id) : null;
          const addr = v?.address || {};
          const location = [addr.city, addr.state].filter(Boolean).join(", ");
          // Savings tracker writes to the dedicated `savings` column, but
          // legacy edits also mirror into metadata.savings — fall through.
          const meta = (() => {
            if (t.metadata == null) return {};
            if (typeof t.metadata === "string") {
              try { return JSON.parse(t.metadata); } catch { return {}; }
            }
            return t.metadata;
          })();
          const savings = parseMoney(t.savings ?? meta.savings);
          const bill = parseMoney(t.spending ?? meta.spending ?? t.amount);
          totalSavings += savings;
          return {
            id: `redtxn-${t.id}`,
            vendor_name: v?.name || null,
            discount_name: t.description || "Discount",
            discount_type: null,
            date: t.created_at || null,
            savings,
            total_bill: bill || null,
            redemption_code: null,
            location: location || null,
          };
        });

        discountRedemptions = [...enriched, ...legacy]
          .sort((a: any, b: any) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
      } catch (redErr) {
        console.log("⚠️ redemptions lookup failed:", redErr);
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
        total_donations: Math.round(totalDonations * 100) / 100,
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

      // A team account is internal: comped, never billed, and deliberately
      // left out of donation totals. Derived from invite_type here rather than
      // trusting the client to send a consistent set of flags.
      const isTeam =
        String(invite_type ?? inviteType ?? "").trim().toLowerCase() === "team";
      const isCoworking =
        !isTeam &&
        (coworking === true || coworking === "Yes" || coworking === "yes" ||
          String(invite_type ?? inviteType ?? "").trim().toLowerCase() ===
            "coworking");
      const rawSponsorAmount =
        sponsor_amount ??
        sponsorAmount ??
        body.donation ??
        body.donationAmount ??
        0;
      // Team is forced to 0: nobody pays for the seat, so any amount left in
      // the admin form must not become a pledge in total_monthly_donation.
      const sponsorAmountValue = isTeam
        ? 0
        : isCoworking
          ? parseFloat(rawSponsorAmount) || 15
          : parseFloat(rawSponsorAmount) || 0;
      const sponsorSourceValue = isTeam
        ? "THRIVE Team"
        : sponsor_source ||
          sponsorSource ||
          (isCoworking ? "THRIVE Coworking" : null);
      const inviteTypeValue = isTeam
        ? "team"
        : invite_type || inviteType || (isCoworking ? "coworking" : "standard");
      // Comped accounts settle outside Stripe. The app reads this to skip the
      // payment step, and /auth/login treats it as onboarding-complete.
      const externalBilledValue = isTeam
        ? true
        : external_billed ?? externalBilled ?? isCoworking;

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
