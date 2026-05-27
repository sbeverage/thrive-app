import { corsHeaders } from "../lib/cors.ts";

export async function handleAdminStorageRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // POST /admin/storage/upload
  if (method === "POST" && route === "/admin/storage/upload") {
    try {
      const {bucket, path, file, contentType, fileName} = await req.json();

      if (!bucket || !path || !file || !contentType) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing required fields: bucket, path, file, contentType",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Convert base64 to Uint8Array
      let fileData: Uint8Array;
      try {
        // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        const base64Data = file.includes(",") ? file.split(",")[1] : file;
        fileData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid base64 file data",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Upload to Supabase Storage
      const {data: uploadData, error: uploadError} = await supabase.storage
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
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Get public URL
      const {data: urlData} = supabase.storage.from(bucket).getPublicUrl(path);

      return new Response(
        JSON.stringify({
          success: true,
          url: urlData.publicUrl,
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
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
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // POST /admin/storage/delete
  if (method === "POST" && route === "/admin/storage/delete") {
    try {
      const {bucket, path} = await req.json();

      if (!bucket || !path) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing required fields: bucket, path",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Extract just the file path (remove bucket name if included)
      let filePath = path;
      if (path.startsWith(`${bucket}/`)) {
        filePath = path.replace(`${bucket}/`, "");
      }

      // Delete from Supabase Storage
      const {error: deleteError} = await supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (deleteError) {
        console.error("❌ Storage delete error:", deleteError);
        return new Response(
          JSON.stringify({
            success: false,
            error: deleteError.message || "Failed to delete file",
          }),
          {
            headers: {...corsHeaders, "Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({success: true}), {
        headers: {...corsHeaders, "Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("❌ Storage delete error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Server error. Please try again later.",
        }),
        {
          headers: {...corsHeaders, "Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // 404 for admin storage routes
  return new Response(
    JSON.stringify({error: "Admin storage route not found"}),
    {
      headers: {...corsHeaders, "Content-Type": "application/json"},
      status: 404,
    },
  );
}
