import { corsHeaders } from "../lib/cors.ts";

export async function handleAdminCredits(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // PUT /admin/credits/:creditId/extend - Extend credit expiration
  const extendCreditMatch = route.match(/^\/admin\/credits\/(\d+)\/extend$/);
  if (method === "PUT" && extendCreditMatch) {
    try {
      const creditId = parseInt(extendCreditMatch[1], 10);
      const body = await req.json();
      const {expirationDays = 90} = body;

      // Get existing credit
      const {data: credit, error: creditError} = await supabase
        .from("user_credits")
        .select("id, expires_at, status")
        .eq("id", creditId)
        .single();

      if (creditError || !credit) {
        return new Response(JSON.stringify({error: "Credit not found"}), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 404,
        });
      }

      if (credit.status !== "active") {
        return new Response(
          JSON.stringify({error: "Can only extend active credits"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      // Calculate new expiration date
      const currentExpiresAt = new Date(credit.expires_at);
      const newExpiresAt = new Date(currentExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + (expirationDays || 90));

      // Update credit
      const {data: updatedCredit, error: updateError} = await supabase
        .from("user_credits")
        .update({
          expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", creditId)
        .select()
        .single();

      if (updateError) {
        console.error("❌ Error extending credit:", updateError);
        return new Response(
          JSON.stringify({error: "Failed to extend credit"}),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: updatedCredit.id,
            expiresAt: updatedCredit.expires_at,
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
      console.error("❌ Admin extend credit error:", error);
      return new Response(
        JSON.stringify({error: error.message || "Failed to extend credit"}),
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

  return new Response(JSON.stringify({error: "Credits route not found"}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status: 404,
  });
}
