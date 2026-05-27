import { corsHeaders } from "../lib/cors.ts";

export async function handleUploadRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  if (method === "POST" && route === "/uploads") {
    try {
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
