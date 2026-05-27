export async function handleVendorRoute(
  _req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // GET /vendors (public - for mobile app)
  if (method === "GET" && route === "/vendors") {
    try {
      const { data: vendors, error } = await supabase
        .from("vendors")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching vendors:", error);
        return new Response(
          JSON.stringify({ error: "Failed to fetch vendors" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      // Format vendors for API response
      const formattedVendors = (vendors || []).map((vendor: any) => ({
        id: vendor.id,
        name: vendor.name,
        category: vendor.category,
        description: vendor.description,
        website: vendor.website,
        phone: vendor.phone,
        email: vendor.email,
        socialLinks: vendor.social_links || {},
        logoUrl: vendor.logo_url,
        address: vendor.address || null,
        hours: vendor.hours || null,
        createdAt: vendor.created_at,
        updatedAt: vendor.updated_at,
      }));

      return new Response(JSON.stringify({ vendors: formattedVendors }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching vendors:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch vendors" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }
  }

  // GET /vendors/:id (public - for mobile app)
  const vendorIdMatch = route.match(/^\/vendors\/(\d+)$/);
  if (method === "GET" && vendorIdMatch) {
    try {
      const vendorId = vendorIdMatch[1];

      const { data: vendor, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", vendorId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(JSON.stringify({ error: "Vendor not found" }), {
            headers: { "Content-Type": "application/json" },
            status: 404,
          });
        }
        console.error("Error fetching vendor:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch vendor" }), {
          headers: { "Content-Type": "application/json" },
          status: 500,
        });
      }

      // Format vendor for API response
      const formattedVendor = {
        id: vendor.id,
        name: vendor.name,
        category: vendor.category,
        description: vendor.description,
        website: vendor.website,
        phone: vendor.phone,
        email: vendor.email,
        socialLinks: vendor.social_links || {},
        logoUrl: vendor.logo_url,
        address: vendor.address || null,
        hours: vendor.hours || null,
        createdAt: vendor.created_at,
        updatedAt: vendor.updated_at,
      };

      return new Response(JSON.stringify(formattedVendor), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching vendor:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch vendor" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }
  }

  return new Response(JSON.stringify({ error: "Vendor route not found" }), {
    headers: { "Content-Type": "application/json" },
    status: 404,
  });
}
