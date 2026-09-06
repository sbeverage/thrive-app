import { corsHeaders } from "../lib/cors.ts";

export async function handleUploadRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  if (method === "POST" && route === "/uploads") {
    try {
      // ── Auth ──────────────────────────────────────────────────────────
      // This endpoint uploads with the service role, which bypasses RLS, and
      // takes both the bucket and the path from the caller. Unauthenticated,
      // that let anyone holding the anon key — which ships inside the mobile
      // app bundle — write to any bucket in the project, and with
      // upsert:true, overwrite a live charity's or vendor's images.
      //
      // Admin secret rather than a user JWT because no client calls this: the
      // app uses /uploads/charity-logo/:id (unhandled — see note below) and
      // the admin panel uses /admin/storage/upload. Widen this to accept a
      // user JWT if a donor-facing upload ever needs it, but scope the path
      // to that user.
      const adminSecret = req.headers.get("x-admin-secret");
      const expectedSecret = Deno.env.get("ADMIN_SECRET_KEY");
      if (!expectedSecret || adminSecret !== expectedSecret) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 401,
          },
        );
      }

      const { bucket, path, file, contentType } = await req.json();

      if (!bucket || !path || !file || !contentType) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing required fields: bucket, path, file, contentType",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Only the project's own asset buckets, so a stolen secret can't be
      // pointed at anything else that may exist now or later.
      const ALLOWED_BUCKETS = [
        "charity-images",
        "beneficiary-images",
        "vendor-images",
        "profile-images",
      ];
      if (!ALLOWED_BUCKETS.includes(String(bucket))) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Bucket not allowed. Permitted: ${ALLOWED_BUCKETS.join(", ")}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Reject traversal and absolute paths — the path is concatenated into a
      // storage key, so "../" or a leading slash could land outside the
      // intended prefix.
      const cleanPath = String(path);
      if (
        cleanPath.startsWith("/") ||
        cleanPath.includes("..") ||
        cleanPath.includes("\\")
      ) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid path" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      let fileData: Uint8Array;
      try {
        const base64Data = file.includes(",") ? file.split(",")[1] : file;
        fileData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      } catch (_error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid base64 file data",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, fileData, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("❌ Storage upload error:", uploadError);
        return new Response(
          JSON.stringify({
            success: false,
            error: uploadError.message || "Failed to upload file",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

      return new Response(
        JSON.stringify({ success: true, url: urlData.publicUrl }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Storage upload error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error. Please try again later.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }

  return new Response(JSON.stringify({ error: "Upload route not found" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 404,
  });
}
