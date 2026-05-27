import {
  create as createJWT,
  verify as verifyJWT,
} from "https://deno.land/x/djwt@v2.9/mod.ts";
import { bcryptHash, bcryptCompare } from "../lib/password.ts";
import { capitalizeName } from "../lib/strings.ts";
import { geocodeAddress } from "../lib/geocoding.ts";
import { getAppAuthHeader } from "../lib/jwt-app.ts";
import { createOrGetStripeCustomer } from "../lib/stripe.ts";
import {
  verifyAppleToken,
  verifyGoogleToken,
  verifyFacebookToken,
} from "../lib/social-auth.ts";

export type AuthRouteDeps = {
  createReferralRecord: (
    supabase: any,
    referrerId: number,
    referredUserId: number,
    referralToken?: string,
  ) => Promise<void>;
  getReferrerFromToken: (
    supabase: any,
    referralToken: string,
  ) => Promise<number | null>;
  sendInvitationEmail: (args: {
    to: string;
    name: string;
    verificationToken: string;
    donorId: number;
  }) => Promise<void>;
  sendPasswordResetEmail: (args: {
    to: string;
    name: string;
    resetToken: string;
  }) => Promise<void>;
};

export async function handleAuthRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  deps: AuthRouteDeps,
) {
  const {
    createReferralRecord,
    getReferrerFromToken,
    sendInvitationEmail,
    sendPasswordResetEmail,
  } = deps;
  const jwtSecret = Deno.env.get("JWT_SECRET");
  if (!jwtSecret) {
    return new Response(JSON.stringify({error: "JWT_SECRET not configured"}), {
      headers: {"Content-Type": "application/json"},
      status: 500,
    });
  }

  // POST /auth/signup
  if (method === "POST" && route === "/auth/signup") {
    try {
      const body = await req.json();

      // Log entire request body for debugging
      console.log("📝 Signup request body:", JSON.stringify(body, null, 2));

      const {
        email,
        password,
        role,
        firstName, // User's first name
        lastName, // User's last name
        first_name, // Alternative field name
        last_name, // Alternative field name
        phone,
        profileImage,
        profileImageUrl,
        profile_picture_url,
        coworking,
        inviteType,
        invite_type,
        sponsorAmount,
        extraDonationAmount,
        totalMonthlyDonation,
        city,
        state,
        zipCode, // zip code for more accurate location
        zip_code, // alternative field name
        latitude, // GPS latitude
        longitude, // GPS longitude
        locationPermissionGranted, // location permission flag
        location_permission_granted, // alternative field name
        beneficiary, // charity_id or charity name
        charityId, // alternative field name
        donationAmount,
        monthlyDonation, // alternative field name
        referralToken, // referral token from referral link
        referrerId, // direct referrer ID (alternative to token)
        token: inviteToken, // invitation verification token (for invited donor completion)
      } = body;

      // Validate required fields
      if (!email || !password) {
        return new Response(
          JSON.stringify({message: "Email and password are required."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Validate email format (basic)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({message: "Invalid email format."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Validate password length
      if (password.length < 6) {
        return new Response(
          JSON.stringify({
            message: "Password must be at least 6 characters long.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Validate role
      const validRoles = ["donor", "charityAdmin", "vendorAdmin"];
      const userRole = role && validRoles.includes(role) ? role : "donor";

      // Check if user exists
      // If an invitation token is provided, look up by token first so we find the
      // exact invited donor row even when the same email exists on another account.
      let existing: any[] | null = null;
      let existingError: any = null;
      let foundByToken = false;

      if (inviteToken) {
        const tokenLookup = await supabase
          .from("users")
          .select(
            "id, email, account_status, is_verified, role, verification_token",
          )
          .eq("verification_token", inviteToken)
          .eq("role", "donor")
          .limit(1);
        existingError = tokenLookup.error;
        existing = tokenLookup.data;
        if (existing && existing.length > 0) {
          foundByToken = true;
        } else {
          // Token not found or already consumed — fall back to email lookup
          const emailLookup = await supabase
            .from("users")
            .select(
              "id, email, account_status, is_verified, role, verification_token",
            )
            .eq("email", email)
            .eq("role", "donor")
            .limit(1);
          existingError = emailLookup.error;
          existing = emailLookup.data;
        }
      } else {
        const emailLookup = await supabase
          .from("users")
          .select(
            "id, email, account_status, is_verified, role, verification_token",
          )
          .eq("email", email)
          .limit(1);
        existingError = emailLookup.error;
        existing = emailLookup.data;
      }

      // If there was an error (unexpected)
      if (existingError) {
        console.error("❌ Error checking existing user:", existingError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // If user exists, check if it's an invited donor completing signup
      if (existing && existing.length > 0) {
        const existingUser = existing[0];

        // Allow completion when:
        // - Found by invitation token (token is proof of invitation regardless of status), OR
        // - Found by email with an invitation-specific account_status
        const isInvitedDonor =
          foundByToken ||
          existingUser.account_status === "pending_verification" ||
          existingUser.account_status === "email_verified";

        if (isInvitedDonor) {
          // User is completing invitation signup - update password and activate account
          console.log("✅ Invited donor completing signup:", email);

          // Hash password
          let hashedPassword;
          try {
            hashedPassword = await bcryptHash(password);
          } catch (hashError) {
            console.error("❌ Password hashing error:", hashError);
            return new Response(
              JSON.stringify({
                message: "Server error. Please try again later.",
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 500,
              },
            );
          }

          // Build update data with optional fields
          const updateData: any = {
            password_hash: hashedPassword,
            account_status: "active",
            is_verified: true,
            verification_token: null,
            updated_at: new Date().toISOString(),
          };

          if (phone !== undefined) {
            updateData.phone = phone || null;
          }

          const profileUrl =
            profileImageUrl || profileImage || profile_picture_url;
          if (profileUrl !== undefined) {
            updateData.profile_picture_url = profileUrl || null;
          }

          if (coworking !== undefined) {
            updateData.coworking =
              coworking === true || coworking === "Yes" || coworking === "yes";
          }
          if (inviteType !== undefined && inviteType !== null) {
            updateData.invite_type = inviteType;
          }
          if (
            sponsorAmount !== undefined &&
            sponsorAmount !== null &&
            sponsorAmount !== ""
          ) {
            updateData.sponsor_amount = parseFloat(sponsorAmount);
          }
          if (
            extraDonationAmount !== undefined &&
            extraDonationAmount !== null &&
            extraDonationAmount !== ""
          ) {
            updateData.extra_donation_amount = parseFloat(extraDonationAmount);
          }
          if (
            totalMonthlyDonation !== undefined &&
            totalMonthlyDonation !== null &&
            totalMonthlyDonation !== ""
          ) {
            updateData.total_monthly_donation =
              parseFloat(totalMonthlyDonation);
          }

          // Add city, state, and zip code if provided
          if (city !== undefined && city !== null) {
            updateData.city = city;
          }
          if (state !== undefined && state !== null) {
            updateData.state = state;
          }
          const zip = zipCode || zip_code;
          if (zip !== undefined && zip !== null) {
            updateData.zip_code = zip;
          }

          // Add GPS coordinates if provided
          if (latitude !== undefined && latitude !== null) {
            updateData.latitude = parseFloat(latitude);
          }
          if (longitude !== undefined && longitude !== null) {
            updateData.longitude = parseFloat(longitude);
          }

          // Handle location permission
          const locationPermission =
            locationPermissionGranted || location_permission_granted;
          if (locationPermission !== undefined) {
            updateData.location_permission_granted =
              locationPermission === true;
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

          // Extract beneficiary and donation amount (for use in donation creation later)
          const beneficiaryId = beneficiary || charityId;
          const donationAmt = donationAmount || monthlyDonation;

          // Build preferences object for beneficiary and donation amount
          const preferences: any = {};
          if (beneficiaryId !== undefined && beneficiaryId !== null) {
            preferences.preferredCharity = beneficiaryId;
            preferences.beneficiary = beneficiaryId;
          }
          if (donationAmt !== undefined && donationAmt !== null) {
            preferences.monthlyDonation = parseFloat(donationAmt);
            preferences.donationAmount = parseFloat(donationAmt);
          }

          // Get existing preferences and merge
          if (Object.keys(preferences).length > 0) {
            try {
              const {data: existingUserData} = await supabase
                .from("users")
                .select("preferences")
                .eq("id", existingUser.id)
                .single();

              const existingPreferences = existingUserData?.preferences || {};
              updateData.preferences = {...existingPreferences, ...preferences};
            } catch (prefError) {
              // If we can't get existing preferences, just use new ones
              console.log(
                "⚠️ Could not fetch existing preferences, using new ones only",
              );
              updateData.preferences = preferences;
            }
          }

          // Update user with password and activate account
          const {data: updatedUser, error: updateError} = await supabase
            .from("users")
            .update(updateData)
            .eq("id", existingUser.id)
            .select(
              "id, email, role, is_verified, first_name, last_name, city, state, zip_code, preferences",
            )
            .single();

          if (updateError) {
            console.error("❌ Error updating invited user:", updateError);
            return new Response(
              JSON.stringify({
                message: "Server error. Please try again later.",
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 500,
              },
            );
          }

          // Generate JWT token
          if (!jwtSecret) {
            return new Response(
              JSON.stringify({
                message:
                  "Signup completed but JWT_SECRET not configured. Please contact support.",
                user: {
                  id: updatedUser.id,
                  email: updatedUser.email,
                  role: updatedUser.role,
                  isVerified: updatedUser.is_verified,
                },
                token: null,
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 201,
              },
            );
          }

          try {
            const secretKey = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(jwtSecret),
              {name: "HMAC", hash: "SHA-256"},
              false,
              ["sign", "verify"],
            );

            const authToken = await createJWT(
              {alg: "HS256", typ: "JWT"},
              {
                id: updatedUser.id,
                email: updatedUser.email,
                role: updatedUser.role,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
              },
              secretKey,
            );

            // Create donation record if charity_id and donation amount are provided
            let donationRecord = null;
            if (beneficiaryId && donationAmt) {
              try {
                const charityIdInt = parseInt(beneficiaryId);
                if (!isNaN(charityIdInt) && charityIdInt > 0) {
                  const {data: donation, error: donationError} = await supabase
                    .from("donations")
                    .insert([
                      {
                        donor_id: updatedUser.id,
                        charity_id: charityIdInt,
                        amount: parseFloat(donationAmt),
                        status: "pending",
                      },
                    ])
                    .select()
                    .single();

                  if (!donationError) {
                    donationRecord = donation;
                  }
                }
              } catch (donationErr) {
                // Don't fail the signup if donation creation fails
              }
            }

            return new Response(
              JSON.stringify({
                success: true,
                message: "Signup completed successfully!",
                user: {
                  id: updatedUser.id,
                  email: updatedUser.email,
                  role: updatedUser.role,
                  firstName: updatedUser.first_name,
                  lastName: updatedUser.last_name,
                  isVerified: updatedUser.is_verified,
                  city: updatedUser.city || null,
                  state: updatedUser.state || null,
                  zipCode: updatedUser.zip_code || null,
                  preferences: updatedUser.preferences || null,
                },
                token: authToken,
                donation: donationRecord
                  ? {
                      id: donationRecord.id,
                      charityId: donationRecord.charity_id,
                      amount: donationRecord.amount,
                      status: donationRecord.status,
                    }
                  : null,
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 200,
              },
            );
          } catch (tokenError) {
            console.error("❌ JWT token generation error:", tokenError);
            return new Response(
              JSON.stringify({
                message:
                  "Signup completed but token generation failed. Please login.",
                user: {
                  id: updatedUser.id,
                  email: updatedUser.email,
                  role: updatedUser.role,
                  isVerified: updatedUser.is_verified,
                },
                token: null,
              }),
              {
                headers: {"Content-Type": "application/json"},
                status: 201,
              },
            );
          }
        }

        // User exists but is not an invited donor - return error
        return new Response(
          JSON.stringify({message: "Email already in use."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 409,
          },
        );
      }

      // User doesn't exist - proceed with normal signup
      console.log("✅ Email is available - creating new user:", email);

      // Hash password
      console.log("🔐 Hashing password for:", email);
      let hashedPassword;
      try {
        hashedPassword = await bcryptHash(password);
        console.log("✅ Password hashed successfully");
      } catch (hashError) {
        console.error("❌ Password hashing error:", hashError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Generate verification token
      const tokenArray = new Uint8Array(20);
      crypto.getRandomValues(tokenArray);
      const token = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      // Build user data object with optional fields
      const userData: any = {
        email,
        password_hash: hashedPassword,
        verification_token: token,
        is_verified: false,
        role: userRole,
        account_status: "active",
      };

      // Add first name and last name if provided (with capitalization)
      const signupFirstName = firstName || first_name;
      const signupLastName = lastName || last_name;
      if (
        signupFirstName !== undefined &&
        signupFirstName !== null &&
        signupFirstName !== ""
      ) {
        userData.first_name = capitalizeName(signupFirstName);
        console.log(
          "✅ Saving first name:",
          userData.first_name,
          "from:",
          signupFirstName,
        );
      }
      if (
        signupLastName !== undefined &&
        signupLastName !== null &&
        signupLastName !== ""
      ) {
        userData.last_name = capitalizeName(signupLastName);
        console.log(
          "✅ Saving last name:",
          userData.last_name,
          "from:",
          signupLastName,
        );
      }

      // Log if no name provided
      if (!signupFirstName && !signupLastName) {
        console.warn("⚠️ No name provided in signup request:", {
          firstName,
          first_name,
          lastName,
          last_name,
        });
      }

      // Add city, state, and zip code if provided
      if (city !== undefined && city !== null) {
        userData.city = city;
      }
      if (state !== undefined && state !== null) {
        userData.state = state;
      }
      const zip = zipCode || zip_code;
      if (zip !== undefined && zip !== null) {
        userData.zip_code = zip;
      }

      // Build preferences object for beneficiary and donation amount
      // IMPORTANT: Only save beneficiary if explicitly provided (no auto-selection)
      const preferences: any = {};
      const beneficiaryId = beneficiary || charityId;
      // Only save if beneficiary is explicitly provided (not null, not undefined, not empty string)
      if (
        beneficiaryId !== undefined &&
        beneficiaryId !== null &&
        beneficiaryId !== ""
      ) {
        preferences.preferredCharity = beneficiaryId;
        preferences.beneficiary = beneficiaryId;
        console.log("✅ Saving beneficiary preference:", beneficiaryId);
      } else {
        console.log(
          "ℹ️ No beneficiary provided in signup - not setting default",
        );
      }
      const donationAmt = donationAmount || monthlyDonation;
      if (donationAmt !== undefined && donationAmt !== null) {
        preferences.monthlyDonation = parseFloat(donationAmt);
        preferences.donationAmount = parseFloat(donationAmt);
      }

      // Add preferences if we have any
      if (Object.keys(preferences).length > 0) {
        userData.preferences = preferences;
      }

      // Coworking / account type (Stripe business rules: standard vs coworking)
      const isCoworkingSignup =
        coworking === true || coworking === "Yes" || coworking === "yes";
      if (coworking !== undefined && coworking !== null) {
        userData.coworking = isCoworkingSignup;
      }
      const inviteTypeResolved =
        inviteType || invite_type ||
        (coworking !== undefined && coworking !== null
          ? (isCoworkingSignup ? "coworking" : "standard")
          : undefined);
      if (
        inviteTypeResolved !== undefined &&
        inviteTypeResolved !== null &&
        inviteTypeResolved !== ""
      ) {
        userData.invite_type = inviteTypeResolved;
      }

      // Insert new user
      console.log("👤 Creating user:", email);
      const locationStr = city
        ? `${city}, ${state || ""}${zip ? ` ${zip}` : ""}`
        : "Not provided";
      console.log("📍 Location:", locationStr);
      console.log("💝 Beneficiary:", beneficiaryId || "Not provided");
      console.log("💰 Donation amount:", donationAmt || "Not provided");

      const {data: newUser, error: insertError} = await supabase
        .from("users")
        .insert([userData])
        .select(
          "id, email, role, is_verified, first_name, last_name, city, state, zip_code, preferences",
        )
        .single();

      if (insertError) {
        console.error("❌ Error creating user:", insertError);
        console.error(
          "❌ Error details:",
          JSON.stringify(insertError, null, 2),
        );

        // Handle specific database errors
        if (insertError.code === "23505") {
          // PostgreSQL unique violation
          return new Response(
            JSON.stringify({message: "Email already in use."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 409,
            },
          );
        }

        return new Response(
          JSON.stringify({
            message: "Server error. Please try again later.",
            // Include error details in development
            ...(Deno.env.get("ENVIRONMENT") === "development"
              ? {error: insertError.message}
              : {}),
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Generate JWT token for immediate authentication
      console.log("🎫 Generating JWT token for:", email);
      console.log("🔑 JWT_SECRET available:", !!jwtSecret);
      console.log("🔑 JWT_SECRET length:", jwtSecret ? jwtSecret.length : 0);
      console.log(
        "🔑 JWT_SECRET first 10 chars:",
        jwtSecret ? jwtSecret.substring(0, 10) : "N/A",
      );
      let authToken: string | null = null;

      if (!jwtSecret) {
        console.error("❌ JWT_SECRET not available for token generation");
        console.error(
          "❌ Please set JWT_SECRET in Supabase Edge Function secrets",
        );
        return new Response(
          JSON.stringify({
            message:
              "Signup successful! Please check your email to verify your account. (JWT_SECRET not configured - token not generated)",
            user: {
              id: newUser.id,
              email: newUser.email,
              role: newUser.role,
              isVerified: newUser.is_verified,
            },
            token: null,
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 201,
          },
        );
      }

      try {
        console.log("✅ JWT_SECRET is available, creating token...");
        console.log(
          "📝 Payload:",
          JSON.stringify({
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          }),
        );

        // Convert secret string to CryptoKey for djwt v2.9
        // djwt v2.9 requires the secret to be a CryptoKey for HS256
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );

        authToken = await createJWT(
          {alg: "HS256", typ: "JWT"},
          {
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
          },
          secretKey,
        );

        console.log("✅ JWT token generated successfully");
        console.log("✅ Token length:", authToken ? authToken.length : 0);
        console.log(
          "✅ Token first 50 chars:",
          authToken ? authToken.substring(0, 50) : "N/A",
        );
      } catch (tokenError: any) {
        console.error("❌ JWT token generation error:", tokenError);
        console.error("❌ Token error name:", tokenError?.name || "Unknown");
        console.error(
          "❌ Token error message:",
          tokenError?.message || "Unknown error",
        );
        console.error(
          "❌ Token error stack:",
          tokenError?.stack || "No stack trace",
        );
        console.error(
          "❌ Token error details:",
          JSON.stringify(tokenError, Object.getOwnPropertyNames(tokenError)),
        );
        // Continue without token - user can still login later
        authToken = null;
      }

      // Handle Stripe integration for recurring donations (if beneficiary and donation amount provided)
      // Note: beneficiaryId and donationAmt are already declared above in the preferences section
      let stripeSubscriptionInfo: any = null;
      let donationRecord: any = null;

      if (beneficiaryId && donationAmt && parseFloat(donationAmt) > 0) {
        try {
          console.log("💳 Setting up Stripe subscription for donation:", {
            beneficiaryId,
            amount: donationAmt,
          });

          // Create or get Stripe customer
          const stripeCustomer = await createOrGetStripeCustomer(
            email,
            newUser.id,
          );
          console.log(
            "✅ Stripe customer created/retrieved:",
            stripeCustomer.id,
          );

          // Create subscription setup (incomplete, requires payment method)
          const subscription = await createStripeSubscriptionSetup(
            stripeCustomer.id,
            parseFloat(donationAmt),
            "usd",
            {
              user_id: newUser.id.toString(),
              charity_id: beneficiaryId.toString(),
              source: "signup",
            },
          );
          console.log(
            "✅ Stripe subscription created:",
            subscription.subscriptionId,
          );

          stripeSubscriptionInfo = {
            subscriptionId: subscription.subscriptionId,
            clientSecret: subscription.clientSecret,
            status: subscription.status,
            requiresPaymentMethod: subscription.status === "incomplete",
          };

          // Create donation record with pending status
          // Try beneficiaries table first, fallback to charities
          const beneficiaryTable = "beneficiaries"; // Will try this first
          let charityExists = false;

          // Check if beneficiaries table exists, otherwise use charities
          const {data: beneficiaryCheck} = await supabase
            .from("beneficiaries")
            .select("id")
            .eq("id", beneficiaryId)
            .single()
            .catch(() => ({data: null}));

          if (!beneficiaryCheck) {
            // Try charities table
            const {data: charityCheck} = await supabase
              .from("charities")
              .select("id")
              .eq("id", beneficiaryId)
              .single();

            if (charityCheck) {
              charityExists = true;
            }
          } else {
            charityExists = true;
          }

          if (charityExists) {
            const {data: newDonation, error: donationError} = await supabase
              .from("donations")
              .insert([
                {
                  donor_id: newUser.id,
                  charity_id: beneficiaryId,
                  amount: parseFloat(donationAmt),
                  stripe_subscription_id: subscription.subscriptionId,
                  status: "pending",
                },
              ])
              .select()
              .single();

            if (donationError) {
              console.error(
                "❌ Error creating donation record:",
                donationError,
              );
              // Don't fail signup if donation record creation fails
            } else {
              donationRecord = newDonation;
              console.log("✅ Donation record created:", newDonation.id);
            }
          } else {
            console.warn(
              "⚠️ Beneficiary/charity not found, skipping donation record creation",
            );
          }
        } catch (stripeError: any) {
          console.error(
            "❌ Stripe integration error during signup:",
            stripeError,
          );
          console.error("❌ Error details:", stripeError.message);
          // Don't fail signup if Stripe setup fails - user can set up payment later
          // Just log the error and continue
        }
      }

      // Handle referral tracking (if referral token or referrer ID provided)
      let foundReferrerId: number | null = null;
      if (referralToken) {
        foundReferrerId = await getReferrerFromToken(supabase, referralToken);
        if (foundReferrerId) {
          console.log("🔗 Referral found:", {
            referralToken,
            referrerId: foundReferrerId,
          });
          // Create referral record
          await createReferralRecord(
            supabase,
            foundReferrerId,
            newUser.id,
            referralToken,
          );
          // Update user's referrer_id for quick lookup
          await supabase
            .from("users")
            .update({referrer_id: foundReferrerId})
            .eq("id", newUser.id);
        } else {
          console.log("⚠️ Referral token not found:", referralToken);
        }
      } else if (referrerId) {
        // Direct referrer ID provided
        console.log("🔗 Direct referrer ID provided:", referrerId);
        await createReferralRecord(supabase, referrerId, newUser.id);
        // Update user's referrer_id for quick lookup
        await supabase
          .from("users")
          .update({referrer_id: referrerId})
          .eq("id", newUser.id);
      }

      // Send verification email
      console.log("📧 Sending verification email to:", email);

      // Build user's name for email greeting
      // Priority: 1) Request body (what user just entered), 2) Database (newUser), 3) Email prefix
      // Apply proper capitalization using capitalizeName function

      // Log raw values first
      console.log("📧 Name extraction - Raw values:", {
        firstName_from_body: firstName,
        first_name_from_body: first_name,
        lastName_from_body: lastName,
        last_name_from_body: last_name,
        newUser_first_name: newUser.first_name,
        newUser_last_name: newUser.last_name,
        email: email,
      });

      const emailFirstName = capitalizeName(
        firstName || first_name || newUser.first_name,
      );
      const emailLastName = capitalizeName(
        lastName || last_name || newUser.last_name,
      );
      let userName: string;
      if (emailFirstName && emailLastName) {
        userName = `${emailFirstName} ${emailLastName}`;
      } else if (emailFirstName) {
        userName = emailFirstName;
      } else if (emailLastName) {
        userName = emailLastName;
      } else {
        // Fallback to email prefix if no name provided (capitalize it)
        userName = capitalizeName(email.split("@")[0]) || email.split("@")[0];
        console.warn("⚠️ No name found, using email prefix:", userName);
      }

      // Log final result
      console.log("📧 Final email name:", {
        emailFirstName,
        emailLastName,
        finalUserName: userName,
      });

      // NOTE: Verification email is NOT sent here.
      // The frontend will send it after the user completes their profile (first/last name),
      // so the greeting reads "Welcome, Stephanie!" instead of the email prefix.
      // The token is stored in the DB and the frontend calls /auth/resend-verification
      // (which fetches the saved name) after profile setup is complete.

      console.log("✅ User created successfully:", email);
      console.log("📧 Verification email will be sent after profile setup");
      if (stripeSubscriptionInfo) {
        console.log(
          "💳 Stripe subscription setup complete:",
          stripeSubscriptionInfo.subscriptionId,
        );
      }

      return new Response(
        JSON.stringify({
          message:
            "Signup successful! Please check your email to verify your account.",
          user: {
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            isVerified: newUser.is_verified,
            city: newUser.city || null,
            state: newUser.state || null,
            zipCode: newUser.zip_code || null,
            preferences: newUser.preferences || null,
          },
          token: authToken || null, // Include JWT token for immediate authentication
          donation: donationRecord
            ? {
                id: donationRecord.id,
                charityId: donationRecord.charity_id,
                amount: donationRecord.amount,
                status: donationRecord.status,
              }
            : null,
          stripe: stripeSubscriptionInfo
            ? {
                subscriptionId: stripeSubscriptionInfo.subscriptionId,
                clientSecret: stripeSubscriptionInfo.clientSecret,
                status: stripeSubscriptionInfo.status,
                requiresPaymentMethod:
                  stripeSubscriptionInfo.requiresPaymentMethod,
              }
            : null,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 201,
        },
      );
    } catch (error) {
      console.error("❌ Signup Error:", error);
      console.error("❌ Error stack:", error.stack || error.toString());
      return new Response(
        JSON.stringify({
          message: "Server error. Please try again later.",
          // Include error details in development
          ...(Deno.env.get("ENVIRONMENT") === "development"
            ? {
                error: error.message,
                stack: error.stack,
              }
            : {}),
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/login
  if (method === "POST" && route === "/auth/login") {
    try {
      const body = await req.json();
      const {email, password} = body;

      // Get user by email
      const {data: users, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .limit(1);

      // If error querying users table
      if (userError) {
        return new Response(
          JSON.stringify({message: "Login failed. Please try again."}),
          {headers: {"Content-Type": "application/json"}, status: 500},
        );
      }

      // Email not found — distinct 404 so the client can prompt signup
      if (!users || users.length === 0) {
        return new Response(
          JSON.stringify({
            code: "USER_NOT_FOUND",
            message: "No account found for this email. Please sign up.",
          }),
          {headers: {"Content-Type": "application/json"}, status: 404},
        );
      }

      const user = users[0];

      // Check if account is active
      if (user.account_status !== "active") {
        return new Response(
          JSON.stringify({
            message: "Account is suspended. Please contact support.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 403,
          },
        );
      }

      // Verify password
      let isPasswordValid = false;
      try {
        console.log("🔐 Verifying password for:", email);
        isPasswordValid = await bcryptCompare(password, user.password_hash);
        console.log("✅ Password verification result:", isPasswordValid);
      } catch (compareError) {
        console.error("❌ Password comparison error:", compareError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      if (!isPasswordValid) {
        return new Response(
          JSON.stringify({message: "Invalid email or password."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // Generate JWT token
      // Convert secret string to CryptoKey for djwt v2.9
      const secretKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(jwtSecret),
        {name: "HMAC", hash: "SHA-256"},
        false,
        ["sign", "verify"],
      );
      const token = await createJWT(
        {alg: "HS256", typ: "JWT"},
        {
          id: user.id,
          email: user.email,
          role: user.role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        },
        secretKey,
      );

      // Update last login
      await supabase
        .from("users")
        .update({updated_at: new Date().toISOString()})
        .eq("id", user.id);

      // Check if user has completed onboarding.
      // Consider onboarding complete if user has either:
      // 1) a selected beneficiary in preferences, OR
      // 2) recurring donation setup/billing metadata.
      const hasBeneficiaryPreference = Boolean(
        user.preferences?.preferredCharity || user.preferences?.beneficiary,
      );
      const hasRecurringSetup =
        Number(user.total_monthly_donation || 0) > 0 ||
        Number(user.sponsor_amount || 0) > 0 ||
        user.external_billed === true;
      const needsOnboarding = !(hasBeneficiaryPreference || hasRecurringSetup);

      // Detailed logging for debugging
      console.log(
        "═══════════════════════════════════════════════════════════",
      );
      console.log("📋 [EMAIL-LOGIN] Final decision data:");
      console.log(
        "═══════════════════════════════════════════════════════════",
      );
      console.log("🆔 [EMAIL-LOGIN] User ID:", user.id);
      console.log("📧 [EMAIL-LOGIN] Email:", user.email);
      console.log("👤 [EMAIL-LOGIN] First Name:", user.first_name);
      console.log("👤 [EMAIL-LOGIN] Last Name:", user.last_name);
      console.log(
        "📋 [EMAIL-LOGIN] user.preferences:",
        JSON.stringify(user.preferences),
      );
      console.log(
        "📋 [EMAIL-LOGIN] preferredCharity:",
        user.preferences?.preferredCharity,
      );
      console.log(
        "📋 [EMAIL-LOGIN] beneficiary:",
        user.preferences?.beneficiary,
      );
      console.log(
        "💳 [EMAIL-LOGIN] total_monthly_donation:",
        user.total_monthly_donation,
      );
      console.log("💳 [EMAIL-LOGIN] sponsor_amount:", user.sponsor_amount);
      console.log("💳 [EMAIL-LOGIN] external_billed:", user.external_billed);
      console.log("📋 [EMAIL-LOGIN] needsOnboarding:", needsOnboarding);
      console.log("✅ [EMAIL-LOGIN] isVerified:", user.is_verified);
      console.log(
        "═══════════════════════════════════════════════════════════",
      );

      // Return user data (excluding sensitive fields)
      const userData = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        isVerified: user.is_verified,
        needsOnboarding: needsOnboarding,
      };

      return new Response(
        JSON.stringify({
          token,
          user: userData,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Login Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /auth/verify - Verify email token and redirect to mobile app
  if (method === "GET" && route === "/auth/verify") {
    try {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      const wantsJson =
        url.searchParams.get("format") === "json" ||
        (req.headers.get("accept")?.includes("application/json") ?? false);
      const email = url.searchParams.get("email");

      if (!token || !email) {
        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Verification Failed</h1>
    <p>Missing verification token or email.</p>
  </div>
</body>
</html>`,
          {
            status: 400,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              ...corsHeaders,
            },
          },
        );
      }

      // Verify user with token
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("verification_token", token)
        .single();

      if (userError || !user) {
        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Verification Failed</h1>
    <p>Invalid or expired verification token.</p>
  </div>
</body>
</html>`,
          {
            status: 400,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              ...corsHeaders,
            },
          },
        );
      }

      // Update user as verified
      const {error: updateError} = await supabase
        .from("users")
        .update({
          is_verified: true,
          email_verified_at: new Date().toISOString(),
          verification_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("❌ Error verifying user:", {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
        });
        // Continue anyway - token is valid
      }

      // Use universal link (HTTPS) instead of custom scheme for better compatibility
      // Universal links work in all browsers and can open the app if configured
      const appBaseUrl =
        Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";
      const universalLink = `${appBaseUrl}/verify-success?token=${token}&email=${encodeURIComponent(email)}&verified=true`;

      // Also provide custom scheme as fallback
      const appDeepLinkScheme =
        Deno.env.get("APP_DEEP_LINK_SCHEME") || "thriveapp";
      const appDeepLink = `${appDeepLinkScheme}://verify?token=${token}&email=${encodeURIComponent(email)}&verified=true`;

      // Return HTML page that redirects to mobile app
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verified - Opening App</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
    .check { font-size: 48px; margin-bottom: 20px; color: #4a6b7a; }
    .link {
      display: inline-block;
      margin: 10px;
      padding: 12px 24px;
      background: #324E58;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .link:hover { background: #4a6b7a; }
    .link.secondary {
      background: #6c757d;
    }
    .link.secondary:hover {
      background: #5a6268;
    }
    .button-group {
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">✅</div>
    <h1>Email Verified!</h1>
    <p>Your email has been verified successfully.</p>
    <p style="font-size: 14px; color: #666; margin-top: 20px;">
      Opening the Thrive app...
    </p>
    <div class="button-group">
      <a href="${universalLink}" class="link" id="appLink">Open in Thrive App</a>
      <a href="${appDeepLink}" class="link" id="deepLink" style="display: none;">Try Alternative Link</a>
      <button onclick="window.close()" class="link secondary" id="skipLink" style="border: none; font-size: inherit; font-family: inherit; width: 100%;">Close & Return to App</button>
      <p style="font-size: 12px; color: #999; margin-top: 10px;">
        Your email is verified! You can close this page and return to the Thrive app.
      </p>
    </div>
  </div>
  <script>
    // Try universal link first (works better with universal links configured)
    setTimeout(function() {
      window.location.href = "${universalLink}";
    }, 500);
    
    // Fallback: try custom scheme after 1 second
    setTimeout(function() {
      const deepLink = document.getElementById('deepLink');
      if (deepLink) {
        deepLink.style.display = 'block';
        window.location.href = "${appDeepLink}";
      }
    }, 1500);
    
    // Update message after 2 seconds if app hasn't opened
    setTimeout(function() {
      const message = document.querySelector('p:last-of-type');
      if (message) {
        message.innerHTML = 'If the app didn\'t open automatically, tap "Close & Return to App" above.';
        message.style.color = '#324E58';
        message.style.fontWeight = '600';
      }
    }, 2000);
  </script>
</body>
</html>`,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          },
        },
      );
    } catch (error) {
      console.error("❌ Verify Error:", error);
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Verification Error</h1>
    <p>An error occurred during verification. Please try again later.</p>
  </div>
</body>
</html>`,
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
          },
        },
      );
    }
  }

  // POST /auth/verify
  if (method === "POST" && route === "/auth/verify") {
    try {
      const body = await req.json();
      const {token, email} = body;

      // Verify user with token
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("verification_token", token)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({message: "Invalid verification token."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Update user as verified
      const {error: updateError} = await supabase
        .from("users")
        .update({
          is_verified: true,
          email_verified_at: new Date().toISOString(),
          verification_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("❌ Error verifying user:", {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
          userId: user.id,
        });
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({message: "Email verified successfully!"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Verify Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // GET /auth/verify-email - Verify email token from invitation link
  if (method === "GET" && route === "/auth/verify-email") {
    try {
      const url = new URL(req.url);
      let token = url.searchParams.get("token");
      const wantsJson =
        url.searchParams.get("format") === "json" ||
        (req.headers.get("accept")?.includes("application/json") ?? false) ||
        true; // Mobile app always wants JSON from this endpoint

      if (!token) {
        console.error("❌ No token provided in verify-email request");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Verification token is required",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Decode token in case it's URL encoded
      token = decodeURIComponent(token);
      console.log(
        "🔍 Verifying token (first 10 chars):",
        token.substring(0, 10) + "...",
      );

      // Verify token exists and is valid
      // First, check if token exists at all (without role filter for better debugging)
      const {data: tokenCheck, error: tokenCheckError} = await supabase
        .from("users")
        .select("id, email, role, verification_token")
        .eq("verification_token", token)
        .limit(1);

      if (tokenCheckError) {
        console.error("❌ Error checking token:", tokenCheckError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Database error checking token",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      if (!tokenCheck || tokenCheck.length === 0) {
        console.error("❌ Token not found in database:", token);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid or expired verification token",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Check if user has correct role
      const tokenUser = tokenCheck[0];
      if (tokenUser.role !== "donor") {
        console.error("❌ Token found but user role is not donor:", {
          userId: tokenUser.id,
          email: tokenUser.email,
          role: tokenUser.role,
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid user role for this verification link",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Now get full user data
      // Try with all columns first, fallback to basic columns if coworking columns don't exist
      let user: any = null;
      let userError: any = null;

      // First attempt: try with all columns including coworking fields
      const fullUserResult = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, phone, role, verification_token, account_status, is_verified, coworking, invite_type, sponsor_amount, sponsor_source, external_billed, extra_donation_amount, total_monthly_donation",
        )
        .eq("verification_token", token)
        .eq("role", "donor")
        .single();

      if (fullUserResult.error) {
        // If error is about missing columns, retry with basic columns only
        if (
          fullUserResult.error.message?.includes("does not exist") ||
          fullUserResult.error.message?.includes("column")
        ) {
          console.warn("⚠️ Coworking columns not found, using basic columns");
          const basicUserResult = await supabase
            .from("users")
            .select(
              "id, email, first_name, last_name, role, verification_token, account_status, is_verified",
            )
            .eq("verification_token", token)
            .eq("role", "donor")
            .single();

          if (basicUserResult.error) {
            userError = basicUserResult.error;
          } else {
            user = basicUserResult.data;
          }
        } else {
          userError = fullUserResult.error;
        }
      } else {
        user = fullUserResult.data;
      }

      if (userError || !user) {
        console.error("❌ Error fetching full user data:", {
          error: userError,
          tokenUserId: tokenUser.id,
          tokenUserEmail: tokenUser.email,
          errorMessage: userError?.message,
          errorCode: userError?.code,
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: "Error fetching user data",
            details: userError?.message || "Unknown error",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Check if token is expired (if verification_token_expires column exists)
      // Note: verification_token_expires column may not exist in your schema
      // You can add token expiration logic later if needed

      // Mark email as verified (if not already verified)
      if (!user.is_verified) {
        const {error: updateError} = await supabase
          .from("users")
          .update({
            is_verified: true,
            email_verified_at: new Date().toISOString(),
            account_status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (updateError) {
          console.error("❌ Error updating verification status:", {
            message: updateError.message,
            code: updateError.code,
            details: updateError.details,
            hint: updateError.hint,
          });
          // Continue anyway - token is valid, user can complete signup
        }
      }

      // Format user data
      const fullName =
        `${user.first_name || ""} ${user.last_name || ""}`.trim();
      const userData = {
        id: user.id,
        email: user.email,
        name: fullName || user.email.split("@")[0],
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        phone: user.phone || null,
        role: user.role,
        isVerified: true,
        status: user.account_status,
        // Handle coworking fields - may not exist if migration hasn't been run
        coworking:
          user.coworking === true || user.invite_type === "coworking" || false,
        inviteType: user.invite_type || null,
        sponsorAmount: user.sponsor_amount || 0,
        sponsorSource: user.sponsor_source || null,
        externalBilled: user.external_billed === true || false,
        extraDonationAmount: user.extra_donation_amount || 0,
        totalMonthlyDonation: user.total_monthly_donation || 0,
      };

      if (wantsJson) {
        return new Response(JSON.stringify({success: true, user: userData}), {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 200,
        });
      }

      // Return HTML page (same as /auth/verify) for better user experience
      const appBaseUrl =
        Deno.env.get("APP_BASE_URL") || "https://thrive-web-jet.vercel.app";
      const universalLink = `${appBaseUrl}/verify-success?token=${token}&verified=true`;
      const appDeepLinkScheme =
        Deno.env.get("APP_DEEP_LINK_SCHEME") || "thriveapp";
      const appDeepLink = `${appDeepLinkScheme}://verify?token=${token}&verified=true`;

      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verified - Opening App</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #4a6b7a 0%, #324E58 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      color: #333;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { color: #324E58; margin-bottom: 20px; }
    .check { font-size: 48px; margin-bottom: 20px; color: #4a6b7a; }
    .link {
      display: inline-block;
      margin: 10px;
      padding: 12px 24px;
      background: #324E58;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      box-sizing: border-box;
    }
    .link:hover { background: #4a6b7a; }
    .link.secondary {
      background: #6c757d;
    }
    .link.secondary:hover {
      background: #5a6268;
    }
    .button-group {
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    button.link {
      border: none;
      font-size: inherit;
      font-family: inherit;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">✅</div>
    <h1>Email Verified!</h1>
    <p>Your email has been verified successfully.</p>
    <p style="font-size: 14px; color: #666; margin-top: 20px;">
      Opening the Thrive app...
    </p>
    <div class="button-group">
      <a href="${universalLink}" class="link" id="appLink">Open in Thrive App</a>
      <a href="${appDeepLink}" class="link" id="deepLink" style="display: none;">Try Alternative Link</a>
      <button onclick="window.close()" class="link secondary" id="skipLink">Close & Return to App</button>
      <p style="font-size: 12px; color: #999; margin-top: 10px;">
        Your email is verified! You can close this page and return to the Thrive app.
      </p>
    </div>
  </div>
  <script>
    // Try universal link first
    setTimeout(function() {
      window.location.href = "${universalLink}";
    }, 500);
    
    // Fallback: try custom scheme after 1 second
    setTimeout(function() {
      const deepLink = document.getElementById('deepLink');
      if (deepLink) {
        deepLink.style.display = 'block';
        window.location.href = "${appDeepLink}";
      }
    }, 1500);
    
    // Update message after 2 seconds
    setTimeout(function() {
      const message = document.querySelector('p:last-of-type');
      if (message) {
        message.innerHTML = 'If the app didn\'t open automatically, tap "Close & Return to App" above.';
        message.style.color = '#324E58';
        message.style.fontWeight = '600';
      }
    }, 2000);
  </script>
</body>
</html>`,
        {
          headers: {"Content-Type": "text/html; charset=utf-8", ...corsHeaders},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Verify Email Error:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Server error. Please try again later.",
          details: error?.message || String(error),
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/forgot-password
  if (method === "POST" && route === "/auth/forgot-password") {
    try {
      const body = await req.json();
      const {email} = body;

      // Get user by email
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

      // Don't reveal if user exists or not (security best practice)
      if (!userError && user) {
        // Generate reset token
        const tokenArray = new Uint8Array(32);
        crypto.getRandomValues(tokenArray);
        const resetToken = Array.from(tokenArray, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        const resetTokenExpiry = new Date();
        resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // 1 hour expiry

        // Update user with reset token
        await supabase
          .from("users")
          .update({
            password_reset_token: resetToken,
            password_reset_expires: resetTokenExpiry.toISOString(),
          })
          .eq("id", user.id);

        // Send reset email using configured email service
        const recipientName =
          `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
          user.email.split("@")[0];
        sendPasswordResetEmail({
          to: email,
          name: recipientName,
          resetToken,
        }).catch((emailError) => {
          console.error("❌ Error sending password reset email:", emailError);
        });
      }

      // Always return success (don't reveal if user exists)
      return new Response(
        JSON.stringify({
          message: "If an account exists, a password reset link has been sent.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Forgot Password Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/reset-password
  if (method === "POST" && route === "/auth/reset-password") {
    try {
      const body = await req.json();
      const {token, email, newPassword} = body;

      // Get user by email and token
      const {data: user, error: userError} = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("password_reset_token", token)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({message: "Invalid or expired reset token."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Check if token is expired
      if (
        user.password_reset_expires &&
        new Date(user.password_reset_expires) < new Date()
      ) {
        return new Response(
          JSON.stringify({message: "Reset token has expired."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Hash new password
      const hashedPassword = await bcryptHash(newPassword);

      // Update password and clear reset token
      const {error: updateError} = await supabase
        .from("users")
        .update({
          password_hash: hashedPassword,
          password_reset_token: null,
          password_reset_expires: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("❌ Error resetting password:", updateError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({message: "Password reset successfully!"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Reset Password Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/resend-verification
  if (method === "POST" && route === "/auth/resend-verification") {
    try {
      const body = await req.json();
      const {email, firstName: bodyFirstName} = body;

      // Validate email
      if (!email) {
        return new Response(JSON.stringify({message: "Email is required."}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({message: "Invalid email format."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      console.log("📧 Resending verification email for:", email);

      // Check if user exists (include name fields for email)
      const {data: users, error: userError} = await supabase
        .from("users")
        .select(
          "id, email, is_verified, verification_token, first_name, last_name",
        )
        .eq("email", email)
        .limit(1);

      // Security: Don't reveal if user exists
      // Always return success message regardless of whether user exists
      if (userError || !users || users.length === 0) {
        console.log(
          "⚠️ User not found (or error) - returning generic success for security",
        );
        return new Response(
          JSON.stringify({
            message:
              "If an account exists with this email, a verification link has been sent.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 200,
          },
        );
      }

      const user = users[0];

      // Check if already verified
      if (user.is_verified) {
        return new Response(
          JSON.stringify({message: "This email is already verified."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Generate new verification token
      console.log("🔐 Generating new verification token");
      const tokenArray = new Uint8Array(20);
      crypto.getRandomValues(tokenArray);
      const verificationToken = Array.from(tokenArray, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      // Update user with new verification token
      const {error: tokenError} = await supabase
        .from("users")
        .update({
          verification_token: verificationToken,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (tokenError) {
        console.error("❌ Error saving verification token:", tokenError);
        return new Response(
          JSON.stringify({
            message:
              "Failed to generate verification token. Please try again later.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log("✅ Verification token updated for user:", email);

      // Build user's name for email greeting.
      // Priority: 1) firstName passed directly in request body (most reliable during signup,
      // before the profile save roundtrip completes), 2) DB fields, 3) email prefix fallback.
      let userName: string;
      if (bodyFirstName && bodyFirstName.trim()) {
        userName = capitalizeName(bodyFirstName.trim()) || bodyFirstName.trim();
      } else {
        const firstName = capitalizeName(user.first_name);
        const lastName = capitalizeName(user.last_name);
        if (firstName && lastName) {
          userName = `${firstName} ${lastName}`;
        } else if (firstName) {
          userName = firstName;
        } else if (lastName) {
          userName = lastName;
        } else {
          // Fallback to email prefix if no name anywhere
          userName = capitalizeName(email.split("@")[0]) || email.split("@")[0];
        }
      }

      // Send verification email (async - don't wait for it)
      // sendInvitationEmail uses APP_BASE_URL env var (defaults to https://thrive-web-jet.vercel.app)
      sendInvitationEmail({
        to: email,
        name: userName,
        verificationToken: verificationToken,
        donorId: user.id,
      }).catch((emailError) => {
        console.error("❌ Error sending verification email:", emailError);
        // Don't fail the request if email fails - user can try again later
      });

      console.log("📧 Verification email sent to:", email);
      console.log("🔗 Verification token:", verificationToken);

      return new Response(
        JSON.stringify({
          message: "Verification email sent successfully.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Resend Verification Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/request-new-invite
  // Allows a donor whose invite link is expired/consumed to request a fresh one.
  // Generates a 64-char token so the app routes to /donorInvitationVerify.
  if (method === "POST" && route === "/auth/request-new-invite") {
    try {
      const body = await req.json();
      const {email} = body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(
          JSON.stringify({success: false, error: "Valid email is required."}),
          {headers: {...corsHeaders, "Content-Type": "application/json"}, status: 400},
        );
      }

      // Look up donor by email
      const {data: users} = await supabase
        .from("users")
        .select("id, email, first_name, last_name, role, account_status, is_verified")
        .eq("email", email.toLowerCase().trim())
        .eq("role", "donor")
        .limit(1);

      // Always return a generic success (don't leak whether email exists)
      const genericSuccess = new Response(
        JSON.stringify({success: true, message: "If an account exists for this email, a new invitation has been sent."}),
        {headers: {...corsHeaders, "Content-Type": "application/json"}, status: 200},
      );

      if (!users || users.length === 0) {
        console.log("⚠️ request-new-invite: donor not found for", email);
        return genericSuccess;
      }

      const donor = users[0];

      // If donor has fully completed signup (active + verified, no token needed), don't resend
      if (donor.is_verified && donor.account_status === "active") {
        console.log("ℹ️ request-new-invite: donor already active, skipping resend for", email);
        return genericSuccess;
      }

      // Generate fresh 64-char invitation token
      const tokenArray = new Uint8Array(32);
      crypto.getRandomValues(tokenArray);
      const newToken = Array.from(tokenArray, (b) => b.toString(16).padStart(2, "0")).join("");

      await supabase
        .from("users")
        .update({
          verification_token: newToken,
          is_verified: false,
          account_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", donor.id);

      const fullName = `${donor.first_name || ""} ${donor.last_name || ""}`.trim();
      sendInvitationEmail({
        to: donor.email,
        name: fullName || donor.email.split("@")[0],
        verificationToken: newToken,
        donorId: donor.id,
      }).catch((e) => console.error("❌ request-new-invite email error:", e));

      console.log("✅ request-new-invite: resent invite to", email);
      return genericSuccess;
    } catch (err) {
      console.error("❌ request-new-invite error:", err);
      return new Response(
        JSON.stringify({success: false, error: "Server error. Please try again."}),
        {headers: {...corsHeaders, "Content-Type": "application/json"}, status: 500},
      );
    }
  }

  // DELETE /auth/delete-user
  if (method === "DELETE" && route === "/auth/delete-user") {
    try {
      const body = await req.json();
      const {email} = body;

      // Validate email
      if (!email) {
        return new Response(JSON.stringify({message: "Email is required."}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({message: "Invalid email format."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      console.log(`🗑️ Attempting to delete user: ${email}`);

      // Get user to check if exists and get profile picture URL
      const {data: users, error: userError} = await supabase
        .from("users")
        .select("id, email, profile_picture_url")
        .eq("email", email)
        .limit(1);

      if (userError || !users || users.length === 0) {
        return new Response(JSON.stringify({message: "User not found."}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      const user = users[0];

      // Delete profile picture from Supabase Storage if it exists
      if (user.profile_picture_url) {
        try {
          // Extract file path from URL
          // URL format: https://mdqgndyhzlnwojtubouh.supabase.co/storage/v1/object/public/profile-pictures/...
          const urlParts = user.profile_picture_url.split("/");
          const publicIndex = urlParts.indexOf("public");
          if (publicIndex !== -1 && publicIndex < urlParts.length - 1) {
            const filePath = urlParts
              .slice(publicIndex + 1)
              .join("/")
              .split("?")[0];
            const bucketName = "profile-pictures";

            console.log(
              `🗑️ Deleting profile picture from storage: ${bucketName}/${filePath}`,
            );

            const {error: storageError} = await supabase.storage
              .from(bucketName)
              .remove([filePath]);

            if (storageError) {
              console.error(
                "⚠️ Error deleting profile picture from storage:",
                storageError,
              );
              // Continue with user deletion even if storage delete fails
            } else {
              console.log("✅ Profile picture deleted from storage");
            }
          }
        } catch (storageError) {
          console.error("⚠️ Error deleting profile picture:", storageError);
          // Continue with user deletion even if storage delete fails
        }
      }

      // Delete user from database
      // Note: Database foreign keys will handle cascading deletes:
      // - donations with donor_id will be deleted (ON DELETE CASCADE)
      // - charities/vendors created_by_user_id will be set to NULL (ON DELETE SET NULL)
      // - redemptions user_id will be set to NULL (ON DELETE SET NULL)
      const {error: deleteError} = await supabase
        .from("users")
        .delete()
        .eq("email", email);

      if (deleteError) {
        console.error("❌ Error deleting user:", deleteError);
        return new Response(
          JSON.stringify({message: "Failed to delete user."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      console.log(`✅ User deleted successfully: ${email}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "User and all associated data deleted successfully.",
          deletedEmail: email,
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      console.error("❌ Delete User Error:", error);
      return new Response(
        JSON.stringify({message: "Server error. Please try again later."}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/profile-picture (file upload - requires authentication)
  if (method === "POST" && route === "/auth/profile-picture") {
    try {
      console.log("🔍 Profile picture upload route matched");

      // Check for authentication
      const authHeader = getAppAuthHeader(req);
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("❌ Missing or invalid Authorization header");
        return new Response(JSON.stringify({error: "Unauthorized"}), {
          headers: {"Content-Type": "application/json"},
          status: 401,
        });
      }

      // Verify JWT token
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return new Response(
          JSON.stringify({error: "Server configuration error"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let decoded: any;
      try {
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );
        decoded = await verifyJWT(token, secretKey);
      } catch (jwtError) {
        console.error("JWT verification error:", jwtError);
        return new Response(
          JSON.stringify({error: "Invalid or expired token"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const userId = decoded.id || decoded.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({error: "Invalid token: user ID not found"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // Parse multipart form data
      const formData = await req.formData();
      const file =
        formData.get("profilePicture") ||
        formData.get("image") ||
        (formData.get("file") as File);

      if (!file || !(file instanceof File)) {
        console.log("❌ No file uploaded or invalid file");
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
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `profile-${userId}-${timestamp}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `user-${userId}/${fileName}`;

      // Upload to Supabase Storage
      const bucketName = "profile-pictures";
      const {data: uploadData, error: uploadError} = await supabase.storage
        .from(bucketName)
        .upload(filePath, fileBuffer, {
          contentType: file.type || "image/jpeg",
          upsert: true, // Allow overwriting existing files
        });

      if (uploadError) {
        console.error("❌ Error uploading profile picture:", uploadError);
        return new Response(
          JSON.stringify({
            error: "Failed to upload profile picture",
            details: uploadError.message,
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Get public URL
      const {
        data: {publicUrl},
      } = supabase.storage.from(bucketName).getPublicUrl(filePath);

      // Update user profile with new picture URL
      const {error: updateError} = await supabase
        .from("users")
        .update({
          profile_picture_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        console.error("❌ Error updating profile picture URL:", updateError);
        // Still return success with the URL, as the upload succeeded
      }

      console.log("✅ Profile picture uploaded successfully:", publicUrl);

      // Return success response with the public URL
      return new Response(
        JSON.stringify({
          success: true,
          message: "Profile picture uploaded successfully",
          profileImageUrl: publicUrl,
          profileImage: publicUrl,
        }),
        {
          status: 200,
          headers: {"Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Profile picture upload error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to upload profile picture",
        }),
        {status: 500, headers: {"Content-Type": "application/json"}},
      );
    }
  }

  // GET /auth/profile (requires authentication)
  if (method === "GET" && route === "/auth/profile") {
    try {
      console.log("🔍 Get profile route matched");

      // Check for authentication
      const authHeader = getAppAuthHeader(req);
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("❌ Missing or invalid Authorization header");
        return new Response(JSON.stringify({error: "Unauthorized"}), {
          headers: {"Content-Type": "application/json"},
          status: 401,
        });
      }

      // Verify JWT token
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return new Response(
          JSON.stringify({error: "Server configuration error"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let decoded: any;
      try {
        // Convert secret string to CryptoKey for djwt v2.9
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );
        decoded = await verifyJWT(token, secretKey);
      } catch (jwtError) {
        console.error("JWT verification error:", jwtError);
        return new Response(
          JSON.stringify({error: "Invalid or expired token"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      const userId = decoded.id || decoded.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({error: "Invalid token: user ID not found"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // Fetch user profile from database
      const {data: user, error: userError} = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, phone, profile_picture_url, city, state, zip_code, latitude, longitude, location_permission_granted, location_updated_at, preferences, is_verified, account_status",
        )
        .eq("id", userId)
        .single();

      if (userError || !user) {
        console.error("❌ Error fetching user profile:", userError);
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Resolve full beneficiary object so the app can display it immediately
      const charityId =
        user.preferences?.preferredCharity ||
        user.preferences?.beneficiary ||
        null;

      let selectedBeneficiary: any = null;
      if (charityId) {
        const {data: charity} = await supabase
          .from("charities")
          .select("id, name, description, logo_url, image_url, category, location")
          .eq("id", charityId)
          .single();
        if (charity) {
          const heroUrl =
            (charity.image_url && String(charity.image_url).trim()) ||
            (charity.logo_url && String(charity.logo_url).trim()) ||
            "";
          selectedBeneficiary = {
            id: charity.id,
            name: charity.name || "",
            description: charity.description || null,
            logo_url: charity.logo_url || "",
            image_url: charity.image_url || null,
            imageUrl: heroUrl || null,
            category: charity.category || null,
            location: charity.location || "",
            image: heroUrl ? {uri: heroUrl} : null,
          };
        }
      }

      // Return profile data in the format the app expects
      return new Response(
        JSON.stringify({
          success: true,
          profile: {
            id: user.id,
            email: user.email,
            firstName: user.first_name || null,
            lastName: user.last_name || null,
            phone: user.phone || null,
            profileImage: user.profile_picture_url || null,
            profileImageUrl: user.profile_picture_url || null,
            address: {
              city: user.city || "",
              state: user.state || "",
              zipCode: user.zip_code || "",
              latitude: user.latitude ? parseFloat(user.latitude) : null,
              longitude: user.longitude ? parseFloat(user.longitude) : null,
            },
            locationPermissionGranted:
              user.location_permission_granted || false,
            locationUpdatedAt: user.location_updated_at || null,
            monthlyDonation: user.preferences?.monthlyDonation || null,
            points: user.preferences?.points || null,
            totalSavings: user.preferences?.totalSavings || null,
            preferredCharity: charityId,
            beneficiary: charityId,
            selectedBeneficiary,
            referredCharity: selectedBeneficiary,
            isVerified: user.is_verified || false,
            accountStatus: user.account_status || "active",
          },
        }),
        {
          status: 200,
          headers: {"Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Get profile unexpected error:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      });

      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: error?.message || String(error) || "Unknown error occurred",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /auth/save-profile (requires authentication)
  if (method === "POST" && route === "/auth/save-profile") {
    let userId: number | undefined; // Declare userId outside try block for catch block access
    try {
      console.log("🔍 Save profile route matched");

      // Check for authentication
      const authHeader = getAppAuthHeader(req);
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("❌ Missing or invalid Authorization header");
        return new Response(JSON.stringify({error: "Unauthorized"}), {
          headers: {"Content-Type": "application/json"},
          status: 401,
        });
      }

      // Verify JWT token
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return new Response(
          JSON.stringify({error: "Server configuration error"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let decoded: any;
      try {
        // Convert secret string to CryptoKey for djwt v2.9 (same as when creating token)
        const secretKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(jwtSecret),
          {name: "HMAC", hash: "SHA-256"},
          false,
          ["sign", "verify"],
        );
        decoded = await verifyJWT(token, secretKey);
      } catch (jwtError) {
        console.error("JWT verification error:", jwtError);
        return new Response(
          JSON.stringify({error: "Invalid or expired token"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      userId = decoded.id || decoded.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({error: "Invalid token: user ID not found"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 401,
          },
        );
      }

      // Parse request body
      let body: any = {};
      try {
        body = await req.json();
      } catch (parseError) {
        console.log("⚠️ No body or invalid JSON, using empty object");
      }

      const {
        firstName,
        lastName,
        phone,
        phoneNumber, // Support both phone and phoneNumber
        email,
        profileImage,
        profileImageUrl,
        monthlyDonation,
        points,
        totalSavings,
        coworking,
        inviteType,
        invite_type, // Support snake_case
        sponsorAmount,
        sponsor_amount, // Support snake_case
        sponsorSource,
        sponsor_source, // Support snake_case
        externalBilled,
        external_billed, // Support snake_case
        extraDonationAmount,
        extra_donation_amount, // Support snake_case
        totalMonthlyDonation,
        total_monthly_donation, // Support snake_case
        // Beneficiary/charity selection
        beneficiary,
        charityId,
        preferredCharity,
        // Location fields
        address,
        city,
        state,
        zipCode,
        zip_code,
        street,
        latitude,
        longitude,
        locationPermissionGranted,
        location_permission_granted,
      } = body;

      // Build update object (only include fields that are provided)
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (firstName !== undefined)
        updateData.first_name = capitalizeName(firstName);
      if (lastName !== undefined)
        updateData.last_name = capitalizeName(lastName);
      if (phone !== undefined) updateData.phone = phone || null;
      if (phoneNumber !== undefined) updateData.phone = phoneNumber || null; // phoneNumber takes precedence
      if (email !== undefined && email) updateData.email = email;

      // Handle profile image (support both profileImage and profileImageUrl)
      const profileImageValue = profileImage || profileImageUrl;
      if (profileImageValue !== undefined) {
        updateData.profile_picture_url = profileImageValue || null;
      }

      if (monthlyDonation !== undefined)
        updateData.monthly_donation = monthlyDonation;

      // Handle coworking and sponsor fields (support both camelCase and snake_case)
      if (coworking !== undefined) {
        updateData.coworking =
          coworking === true || coworking === "Yes" || coworking === "yes";
      }
      const inviteTypeValue = inviteType || invite_type;
      if (inviteTypeValue !== undefined) {
        updateData.invite_type = inviteTypeValue || null;
      }
      const sponsorAmountValue = sponsorAmount || sponsor_amount;
      if (sponsorAmountValue !== undefined) {
        updateData.sponsor_amount =
          sponsorAmountValue !== "" && sponsorAmountValue !== null
            ? parseFloat(sponsorAmountValue)
            : null;
      }
      const sponsorSourceValue = sponsorSource || sponsor_source;
      if (sponsorSourceValue !== undefined) {
        updateData.sponsor_source = sponsorSourceValue || null;
      }
      const externalBilledValue = externalBilled || external_billed;
      if (externalBilledValue !== undefined) {
        updateData.external_billed =
          externalBilledValue === true || externalBilledValue === "true";
      }
      const extraDonationAmountValue =
        extraDonationAmount || extra_donation_amount;
      if (extraDonationAmountValue !== undefined) {
        updateData.extra_donation_amount =
          extraDonationAmountValue !== "" && extraDonationAmountValue !== null
            ? parseFloat(extraDonationAmountValue)
            : null;
      }
      const totalMonthlyDonationValue =
        totalMonthlyDonation || total_monthly_donation;
      if (totalMonthlyDonationValue !== undefined) {
        updateData.total_monthly_donation =
          totalMonthlyDonationValue !== "" && totalMonthlyDonationValue !== null
            ? parseFloat(totalMonthlyDonationValue)
            : null;
      }

      // Handle location/address fields
      // Support both address object and flat fields
      if (address) {
        if (address.city !== undefined) updateData.city = address.city || null;
        if (address.state !== undefined)
          updateData.state = address.state || null;
        if (address.zipCode !== undefined)
          updateData.zip_code = address.zipCode || null;
        if (address.zip_code !== undefined)
          updateData.zip_code = address.zip_code || null;
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

      // Also support flat fields (for backward compatibility)
      if (city !== undefined) updateData.city = city || null;
      if (state !== undefined) updateData.state = state || null;
      const zip = zipCode || zip_code;
      if (zip !== undefined) updateData.zip_code = zip || null;
      if (street !== undefined) updateData.street_address = street || null;

      // Handle GPS coordinates
      if (latitude !== undefined) {
        updateData.latitude = latitude ? parseFloat(latitude) : null;
      }
      if (longitude !== undefined) {
        updateData.longitude = longitude ? parseFloat(longitude) : null;
      }

      // Handle location permission
      const locationPermission =
        locationPermissionGranted || location_permission_granted;
      if (locationPermission !== undefined) {
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
        try {
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
        } catch (geocodeError) {
          // Geocoding is optional, so we don't fail the entire request if it fails
          console.warn(
            "⚠️ Geocoding failed (non-critical):",
            geocodeError?.message || String(geocodeError),
          );
        }
      }

      // Handle additional fields (store in preferences JSONB if they don't have dedicated columns)
      const preferences: any = {};
      if (monthlyDonation !== undefined)
        preferences.monthlyDonation = monthlyDonation;
      if (points !== undefined) preferences.points = points;
      if (totalSavings !== undefined) preferences.totalSavings = totalSavings;
      if (coworking !== undefined) preferences.coworking = coworking === true;
      if (inviteType !== undefined) preferences.inviteType = inviteType || null;
      if (sponsorAmount !== undefined)
        preferences.sponsorAmount = sponsorAmount;
      if (externalBilled !== undefined)
        preferences.externalBilled = externalBilled === true;
      if (extraDonationAmount !== undefined)
        preferences.extraDonationAmount = extraDonationAmount;
      if (totalMonthlyDonation !== undefined)
        preferences.totalMonthlyDonation = totalMonthlyDonation;

      // Handle beneficiary/charity selection - only update if explicitly provided
      const beneficiaryId = beneficiary || charityId || preferredCharity;
      if (
        beneficiaryId !== undefined &&
        beneficiaryId !== null &&
        beneficiaryId !== ""
      ) {
        preferences.preferredCharity = beneficiaryId;
        preferences.beneficiary = beneficiaryId;
        console.log("✅ Updating beneficiary preference:", beneficiaryId);
      } else if (beneficiaryId === null) {
        // Explicitly null means user wants to clear the selection
        preferences.preferredCharity = null;
        preferences.beneficiary = null;
        console.log("✅ Clearing beneficiary preference");
      }

      // If we have preferences to update, get existing preferences first
      if (Object.keys(preferences).length > 0) {
        try {
          const {data: existingUser, error: fetchError} = await supabase
            .from("users")
            .select("preferences")
            .eq("id", userId)
            .single();

          if (fetchError) {
            // If we can't fetch existing preferences, log but continue with new preferences only
            console.warn(
              "⚠️ Could not fetch existing preferences (non-critical):",
              fetchError.message,
            );
            updateData.preferences = preferences;
          } else {
            const existingPreferences = existingUser?.preferences || {};
            updateData.preferences = {...existingPreferences, ...preferences};
          }
        } catch (prefError) {
          // If preferences fetch fails, just use the new preferences
          console.warn(
            "⚠️ Preferences fetch error (non-critical):",
            prefError?.message || String(prefError),
          );
          updateData.preferences = preferences;
        }
      }

      // Update user profile in database
      // First attempt: try with all fields
      let {data: updatedUser, error: updateError} = await supabase
        .from("users")
        .update(updateData)
        .eq("id", userId)
        .select(
          "id, email, first_name, last_name, phone, profile_picture_url, city, state, zip_code, latitude, longitude, location_permission_granted, location_updated_at, preferences, coworking, invite_type, sponsor_amount, sponsor_source, external_billed, extra_donation_amount, total_monthly_donation",
        )
        .single();

      // If update fails due to missing columns, retry without location permission fields
      if (updateError && updateError.message?.includes("does not exist")) {
        console.warn(
          "⚠️ Column does not exist error detected, retrying without location permission fields",
        );

        // Remove location permission fields that might not exist
        const retryUpdateData = {...updateData};
        delete retryUpdateData.location_permission_granted;
        delete retryUpdateData.location_updated_at;

        // Also remove latitude/longitude if they don't exist
        if (
          updateError.message.includes("latitude") ||
          updateError.message.includes("longitude")
        ) {
          delete retryUpdateData.latitude;
          delete retryUpdateData.longitude;
        }

        // Retry update without problematic fields
        const retryResult = await supabase
          .from("users")
          .update(retryUpdateData)
          .eq("id", userId)
          .select(
            "id, email, first_name, last_name, phone, profile_picture_url, city, state, zip_code, preferences",
          )
          .single();

        if (retryResult.error) {
          // If retry also fails, return the original error
          updateError = retryResult.error;
          updatedUser = null;
        } else {
          // Retry succeeded
          updateError = null;
          updatedUser = retryResult.data;
          console.log(
            "✅ Profile updated successfully (without location permission fields)",
          );
        }
      }

      if (updateError) {
        console.error("❌ Profile update error:", {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
          userId: userId,
          updateData: updateData,
        });

        // Always return error message for debugging (not just in development)
        // This helps identify column mismatches, missing columns, type errors, etc.
        const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
        return new Response(
          JSON.stringify({
            error: "Failed to save profile",
            // Always include the error message so we can debug issues
            details: updateError.message || "Unknown database error",
            // Include code and hint in development for more context
            ...(isDevelopment
              ? {
                  code: updateError.code,
                  hint: updateError.hint,
                  details_full: updateError.details,
                }
              : {}),
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      if (!updatedUser) {
        return new Response(JSON.stringify({error: "User not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      // Return success response
      // Handle missing location fields gracefully (in case migration hasn't been run)
      return new Response(
        JSON.stringify({
          success: true,
          message: "Profile saved successfully",
          profile: {
            id: updatedUser.id,
            email: updatedUser.email,
            firstName: updatedUser.first_name,
            lastName: updatedUser.last_name,
            phone: updatedUser.phone,
            profileImage: updatedUser.profile_picture_url,
            profileImageUrl: updatedUser.profile_picture_url,
            address: {
              city: updatedUser.city || "",
              state: updatedUser.state || "",
              zipCode: updatedUser.zip_code || "",
              latitude: updatedUser.latitude
                ? parseFloat(updatedUser.latitude)
                : null,
              longitude: updatedUser.longitude
                ? parseFloat(updatedUser.longitude)
                : null,
            },
            // Only include location permission fields if they exist in the response
            ...(updatedUser.location_permission_granted !== undefined && {
              locationPermissionGranted:
                updatedUser.location_permission_granted || false,
            }),
            ...(updatedUser.location_updated_at !== undefined && {
              locationUpdatedAt: updatedUser.location_updated_at || null,
            }),
            monthlyDonation: updatedUser.preferences?.monthlyDonation || null,
            points: updatedUser.preferences?.points || null,
            totalSavings: updatedUser.preferences?.totalSavings || null,
            preferredCharity:
              updatedUser.preferences?.preferredCharity ||
              updatedUser.preferences?.beneficiary ||
              null,
            beneficiary:
              updatedUser.preferences?.beneficiary ||
              updatedUser.preferences?.preferredCharity ||
              null,
            coworking: updatedUser.coworking || false,
            inviteType: updatedUser.invite_type || null,
            sponsorAmount: updatedUser.sponsor_amount || null,
            sponsorSource: updatedUser.sponsor_source || null,
            externalBilled: updatedUser.external_billed || false,
            extraDonationAmount: updatedUser.extra_donation_amount || null,
            totalMonthlyDonation: updatedUser.total_monthly_donation || null,
          },
        }),
        {
          status: 200,
          headers: {"Content-Type": "application/json"},
        },
      );
    } catch (error: any) {
      console.error("❌ Save profile unexpected error:", {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
        userId: userId || "unknown",
      });

      // Always return error message for debugging
      const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          // Always include the error message so we can debug issues
          details: error?.message || String(error) || "Unknown error occurred",
          // Include stack trace in development for more context
          ...(isDevelopment
            ? {
                stack: error?.stack,
                name: error?.name,
              }
            : {}),
        }),
        {
          status: 500,
          headers: {"Content-Type": "application/json"},
        },
      );
    }
  }

  // POST /auth/social-login - Social login (Apple, Google, Facebook)
  if (method === "POST" && route === "/auth/social-login") {
    try {
      const body = await req.json();
      const {
        provider,
        providerId,
        email,
        firstName,
        lastName,
        identityToken, // Apple
        authorizationCode, // Apple
        accessToken, // Google/Facebook
        idToken, // Google
        picture,
        city,
        state,
        zipCode,
        zip_code,
        referralToken,
        referrerId,
        loginOnly, // When true, reject if user doesn't exist (called from login screen)
        coworking,
        inviteType,
        invite_type,
      } = body;

      // Validate required fields
      if (!provider || !providerId) {
        return new Response(
          JSON.stringify({message: "Provider and providerId are required."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Validate provider
      const validProviders = ["apple", "google", "facebook"];
      if (!validProviders.includes(provider)) {
        return new Response(
          JSON.stringify({
            message: "Invalid provider. Must be apple, google, or facebook.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Verify OAuth token based on provider
      let verifiedUser: {sub?: string; id?: string; email?: string} | null =
        null;

      if (provider === "apple") {
        if (!identityToken) {
          return new Response(
            JSON.stringify({message: "Apple identityToken is required."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 400,
            },
          );
        }
        verifiedUser = await verifyAppleToken(identityToken);
        if (!verifiedUser || verifiedUser.sub !== providerId) {
          return new Response(
            JSON.stringify({message: "Invalid Apple token."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 401,
            },
          );
        }
      } else if (provider === "google") {
        if (!idToken) {
          return new Response(
            JSON.stringify({message: "Google idToken is required."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 400,
            },
          );
        }
        verifiedUser = await verifyGoogleToken(idToken);
        if (!verifiedUser || verifiedUser.sub !== providerId) {
          return new Response(
            JSON.stringify({message: "Invalid Google token."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 401,
            },
          );
        }
      } else if (provider === "facebook") {
        if (!accessToken) {
          return new Response(
            JSON.stringify({message: "Facebook accessToken is required."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 400,
            },
          );
        }
        verifiedUser = await verifyFacebookToken(accessToken);
        if (!verifiedUser || verifiedUser.id !== providerId) {
          return new Response(
            JSON.stringify({message: "Invalid Facebook token."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 401,
            },
          );
        }
      }

      // Use email from verified token if available, otherwise use provided email
      const userEmail = verifiedUser?.email || email;
      if (!userEmail) {
        return new Response(
          JSON.stringify({message: "Email is required for social login."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Check if user exists by provider_id or email
      const {data: existingUsers, error: findError} = await supabase
        .from("users")
        .select("*")
        .or(`provider_id.eq.${providerId},email.eq.${userEmail}`)
        .limit(2);

      if (findError) {
        console.error("❌ Error finding user:", findError);
        return new Response(
          JSON.stringify({message: "Server error. Please try again later."}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      let user: any = null;
      let isNewUser = false;

      // Find existing user
      if (existingUsers && existingUsers.length > 0) {
        // Check for exact provider match first
        user = existingUsers.find(
          (u: any) => u.provider === provider && u.provider_id === providerId,
        );

        // If not found, check for email match
        if (!user) {
          user = existingUsers.find((u: any) => u.email === userEmail);

          // If user exists with different provider, link the provider
          if (user) {
            const {data: updatedUser, error: updateError} = await supabase
              .from("users")
              .update({
                provider,
                provider_id: providerId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", user.id)
              .select()
              .single();

            if (updateError) {
              console.error("❌ Error updating user provider:", updateError);
            } else {
              user = updatedUser;
            }
          }
        }
      }

      // If called from the login screen, reject unknown users instead of creating them
      if (!user && loginOnly) {
        return new Response(
          JSON.stringify({
            message:
              "No account found for this social login. Please sign up first.",
          }),
          {
            headers: {"Content-Type": "application/json"},
            status: 404,
          },
        );
      }

      // Create new user if doesn't exist
      if (!user) {
        isNewUser = true;

        // Build user data
        const userData: any = {
          email: userEmail,
          provider,
          provider_id: providerId,
          is_verified: true, // OAuth emails are pre-verified
          role: "donor",
          account_status: "active",
          password_hash: null, // No password for OAuth users
        };

        // Add optional fields (with name capitalization)
        if (firstName) userData.first_name = capitalizeName(firstName);
        if (lastName) userData.last_name = capitalizeName(lastName);
        if (picture) userData.profile_picture_url = picture;
        if (city) userData.city = city;
        if (state) userData.state = state;
        const zip = zipCode || zip_code;
        if (zip) userData.zip_code = zip;

        const isCoworkingSocial =
          coworking === true || coworking === "Yes" || coworking === "yes";
        if (coworking !== undefined && coworking !== null) {
          userData.coworking = isCoworkingSocial;
        }
        const inviteTypeSocial = inviteType || invite_type;
        if (inviteTypeSocial !== undefined && inviteTypeSocial !== null && inviteTypeSocial !== "") {
          userData.invite_type = inviteTypeSocial;
        } else if (coworking !== undefined && coworking !== null) {
          userData.invite_type = isCoworkingSocial ? "coworking" : "standard";
        }

        // Handle referral
        if (referralToken || referrerId) {
          const referrer = await getReferrerFromToken(
            supabase,
            referralToken || referrerId?.toString() || "",
          );
          if (referrer) {
            // Will create referral record after user is created
          }
        }

        const {data: newUser, error: createError} = await supabase
          .from("users")
          .insert([userData])
          .select()
          .single();

        if (createError) {
          console.error("❌ Error creating user:", createError);
          return new Response(
            JSON.stringify({message: "Server error. Please try again later."}),
            {
              headers: {"Content-Type": "application/json"},
              status: 500,
            },
          );
        }

        user = newUser;

        // Create referral record if applicable
        if (referralToken || referrerId) {
          const referrer = await getReferrerFromToken(
            supabase,
            referralToken || referrerId?.toString() || "",
          );
          if (referrer) {
            await createReferralRecord(
              supabase,
              referrer,
              user.id,
              referralToken,
            );
          }
        }
      } else {
        // Update last login
        await supabase
          .from("users")
          .update({updated_at: new Date().toISOString()})
          .eq("id", user.id);
      }

      // Generate JWT token
      if (!jwtSecret) {
        return new Response(
          JSON.stringify({message: "JWT_SECRET not configured"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      const secretKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(jwtSecret),
        {name: "HMAC", hash: "SHA-256"},
        false,
        ["sign", "verify"],
      );

      const token = await createJWT(
        {alg: "HS256", typ: "JWT"},
        {
          id: user.id,
          email: user.email,
          role: user.role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        },
        secretKey,
      );

      // Check if user has completed onboarding.
      // Consider onboarding complete if user has either:
      // 1) a selected beneficiary in preferences, OR
      // 2) recurring donation setup/billing metadata.
      const hasBeneficiaryPreference = Boolean(
        user.preferences?.preferredCharity || user.preferences?.beneficiary,
      );
      const hasRecurringSetup =
        Number(user.total_monthly_donation || 0) > 0 ||
        Number(user.sponsor_amount || 0) > 0 ||
        user.external_billed === true;
      const needsOnboarding = !(hasBeneficiaryPreference || hasRecurringSetup);

      // Detailed logging for debugging
      console.log(
        "═══════════════════════════════════════════════════════════",
      );
      console.log("📋 [SOCIAL-LOGIN] Final decision data:");
      console.log(
        "═══════════════════════════════════════════════════════════",
      );
      console.log("🆔 [SOCIAL-LOGIN] User ID:", user.id);
      console.log("📧 [SOCIAL-LOGIN] Email:", user.email);
      console.log("👤 [SOCIAL-LOGIN] First Name:", user.first_name);
      console.log("👤 [SOCIAL-LOGIN] Last Name:", user.last_name);
      console.log("📞 [SOCIAL-LOGIN] Phone:", user.phone);
      console.log("🆕 [SOCIAL-LOGIN] isNewUser:", isNewUser);
      console.log(
        "👤 [SOCIAL-LOGIN] needsProfileSetup:",
        !user.first_name || !user.last_name,
      );
      console.log(
        "📋 [SOCIAL-LOGIN] user.preferences:",
        JSON.stringify(user.preferences),
      );
      console.log(
        "📋 [SOCIAL-LOGIN] preferredCharity:",
        user.preferences?.preferredCharity,
      );
      console.log(
        "📋 [SOCIAL-LOGIN] beneficiary:",
        user.preferences?.beneficiary,
      );
      console.log(
        "💳 [SOCIAL-LOGIN] total_monthly_donation:",
        user.total_monthly_donation,
      );
      console.log("💳 [SOCIAL-LOGIN] sponsor_amount:", user.sponsor_amount);
      console.log("💳 [SOCIAL-LOGIN] external_billed:", user.external_billed);
      console.log("📋 [SOCIAL-LOGIN] needsOnboarding:", needsOnboarding);
      console.log("✅ [SOCIAL-LOGIN] isVerified:", user.is_verified);
      console.log(
        "═══════════════════════════════════════════════════════════",
      );

      // Return response
      return new Response(
        JSON.stringify({
          success: true,
          token,
          isNewUser,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            needsProfileSetup: !user.first_name || !user.last_name,
            needsOnboarding: needsOnboarding,
            isVerified: user.is_verified,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error) {
      // Log detailed error for debugging (server-side only)
      console.error("❌ Social login error:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      // Return generic error message to client (don't expose internal details)
      return new Response(
        JSON.stringify({
          success: false,
          message: "Authentication failed. Please try again.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({error: "Auth route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}
