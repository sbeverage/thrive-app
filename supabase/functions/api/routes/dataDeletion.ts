import { corsHeaders } from "../lib/cors.ts";

// Data deletion request handler (partial data deletion)
export async function handleDataDeletionRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
): Promise<Response> {
  // GET /data-deletion/types - Get available data types
  if (method === "GET" && route === "/data-deletion/types") {
    return new Response(
      JSON.stringify({
        success: true,
        dataTypes: [
          {
            id: "profile",
            name: "Profile Information",
            description: "Name, bio, phone number, and other profile details",
            deletable: true,
          },
          {
            id: "location",
            name: "Location Data",
            description:
              "City, state, zip code, street address, and GPS coordinates",
            deletable: true,
          },
          {
            id: "preferences",
            name: "User Preferences",
            description: "App preferences and settings",
            deletable: true,
          },
          {
            id: "profile_picture",
            name: "Profile Picture",
            description: "Your profile picture image",
            deletable: true,
          },
          {
            id: "donation_history",
            name: "Donation History",
            description: "Records of all your donations",
            deletable: true,
            note: "May require manual processing",
          },
          {
            id: "transaction_history",
            name: "Transaction History",
            description: "Records of all transactions",
            deletable: true,
            note: "May be retained for legal compliance (up to 7 years)",
          },
          {
            id: "activity",
            name: "User Activity",
            description: "Referrals, credits, milestones, badges, and points",
            deletable: true,
            note: "May require manual processing",
          },
          {
            id: "all_personal_data",
            name: "All Personal Data",
            description:
              "Delete all personal data while keeping your account active",
            deletable: true,
          },
        ],
        fullAccountDeletion: {
          available: true,
          endpoint: "/api/auth/delete-user",
          infoPage: "/delete-account",
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // POST /data-deletion/request - Request partial or full data deletion
  if (method === "POST" && route === "/data-deletion/request") {
    try {
      const body = await req.json();
      const { email, deletionType, dataTypes } = body;

      // Validate required fields
      if (!email) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Email address is required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invalid email format",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Validate deletionType
      const validDeletionTypes = ["partial", "full"];
      if (!deletionType || !validDeletionTypes.includes(deletionType)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'deletionType must be "partial" or "full"',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // For partial deletion, validate dataTypes
      if (deletionType === "partial") {
        if (!dataTypes || !Array.isArray(dataTypes) || dataTypes.length === 0) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "dataTypes array is required for partial deletion",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const validDataTypes = [
          "profile",
          "location",
          "preferences",
          "donation_history",
          "transaction_history",
          "activity",
          "profile_picture",
          "all_personal_data",
        ];

        const invalidTypes = dataTypes.filter(
          (type: string) => !validDataTypes.includes(type),
        );
        if (invalidTypes.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              message: `Invalid data types: ${invalidTypes.join(", ")}`,
              validTypes: validDataTypes,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      // Check if user exists
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, email, first_name, last_name, profile_picture_url")
        .eq("email", email)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "User not found with this email address",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Full deletion - redirect to account deletion
      if (deletionType === "full") {
        return new Response(
          JSON.stringify({
            success: true,
            message:
              "For full account deletion, please use the account deletion process",
            redirectTo: "/delete-account",
            action:
              "Use the DELETE /api/auth/delete-user endpoint or visit /delete-account page",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Process partial deletion
      const updates: any = {};
      const deletionLog: string[] = [];

      if (
        dataTypes.includes("profile") ||
        dataTypes.includes("all_personal_data")
      ) {
        updates.first_name = null;
        updates.last_name = null;
        updates.bio = null;
        updates.phone = null;
        deletionLog.push("Profile information");
      }

      if (
        dataTypes.includes("location") ||
        dataTypes.includes("all_personal_data")
      ) {
        updates.city = null;
        updates.state = null;
        updates.zip_code = null;
        updates.street_address = null;
        updates.latitude = null;
        updates.longitude = null;
        deletionLog.push("Location data");
      }

      if (
        dataTypes.includes("preferences") ||
        dataTypes.includes("all_personal_data")
      ) {
        updates.preferences = null;
        deletionLog.push("User preferences");
      }

      if (
        dataTypes.includes("profile_picture") ||
        dataTypes.includes("all_personal_data")
      ) {
        if (user.profile_picture_url) {
          try {
            const urlParts = user.profile_picture_url.split("/");
            const publicIndex = urlParts.indexOf("public");
            if (publicIndex !== -1 && publicIndex < urlParts.length - 1) {
              const filePath = urlParts
                .slice(publicIndex + 1)
                .join("/")
                .split("?")[0];
              const bucketName = "profile-pictures";

              const { error: storageError } = await supabase.storage
                .from(bucketName)
                .remove([filePath]);

              if (!storageError) {
                deletionLog.push("Profile picture");
              }
            }
          } catch (storageError) {
            console.error("Error deleting profile picture:", storageError);
          }
        }
        updates.profile_picture_url = null;
      }

      // Update user record
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from("users")
          .update(updates)
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating user:", updateError);
          return new Response(
            JSON.stringify({
              success: false,
              message: "Failed to process data deletion request",
              error: updateError.message,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      // Note: donation_history, transaction_history, and activity require manual processing
      const requiresManualProcessing: string[] = [];
      if (dataTypes.includes("donation_history")) {
        requiresManualProcessing.push(
          "Donation history (requires manual review)",
        );
      }
      if (dataTypes.includes("transaction_history")) {
        requiresManualProcessing.push(
          "Transaction history (may be retained for legal compliance)",
        );
      }
      if (dataTypes.includes("activity")) {
        requiresManualProcessing.push(
          "User activity (referrals, credits, milestones, badges)",
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Data deletion request processed successfully",
          deleted: deletionLog,
          requiresManualProcessing:
            requiresManualProcessing.length > 0
              ? requiresManualProcessing
              : undefined,
          note:
            requiresManualProcessing.length > 0
              ? "Some data types require manual review and will be processed within 30 days"
              : "All requested data has been deleted",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (error: any) {
      console.error("❌ Data deletion request error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Internal server error",
          error: error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  // 404 for other data-deletion routes
  return new Response(
    JSON.stringify({ error: "Data deletion route not found" }),
    {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
