import { createStripeRefund } from "../lib/stripe.ts";

export async function handleAdminOneTimeGifts(
  req: Request,
  supabase: any,
  route: string,
  method: string,
) {
  // POST /admin/one-time-gifts/:id/refund
  const refundMatch = route.match(/^\/admin\/one-time-gifts\/(\d+)\/refund$/);
  if (method === "POST" && refundMatch) {
    try {
      const giftId = parseInt(refundMatch[1]);
      const body = await req.json();
      const {amount, reason, admin_notes} = body;

      if (!giftId) {
        return new Response(JSON.stringify({error: "Invalid gift ID"}), {
          headers: {"Content-Type": "application/json"},
          status: 400,
        });
      }

      // Get gift record (try beneficiaries first, fallback to charities)
      let gift: any = null;
      let giftError: any = null;

      const beneficiariesGift = await supabase
        .from("one_time_gifts")
        .select("*, beneficiaries!inner(id, name)")
        .eq("id", giftId)
        .single();

      if (!beneficiariesGift.error && beneficiariesGift.data) {
        gift = beneficiariesGift.data;
      } else {
        const charitiesGift = await supabase
          .from("one_time_gifts")
          .select("*, charities!inner(id, name)")
          .eq("id", giftId)
          .single();
        gift = charitiesGift.data;
        giftError = charitiesGift.error;
      }

      if (giftError || !gift) {
        return new Response(JSON.stringify({error: "Gift not found"}), {
          headers: {"Content-Type": "application/json"},
          status: 404,
        });
      }

      if (gift.status !== "succeeded") {
        return new Response(
          JSON.stringify({error: "Can only refund succeeded gifts"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      if (!gift.stripe_charge_id) {
        return new Response(
          JSON.stringify({error: "Gift does not have a Stripe charge ID"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Create refund in Stripe
      const refundAmount = amount
        ? parseFloat(amount)
        : parseFloat(gift.amount);
      const stripeRefund = await createStripeRefund(
        gift.stripe_charge_id,
        refundAmount,
        reason || "requested_by_customer",
      );

      // Update gift record
      const refundAmountDecimal = refundAmount;
      const isFullRefund =
        Math.abs(refundAmountDecimal - parseFloat(gift.amount)) < 0.01;

      const {error: updateError} = await supabase
        .from("one_time_gifts")
        .update({
          status: isFullRefund ? "refunded" : "refunded",
          refund_amount: refundAmountDecimal,
          refunded_at: new Date().toISOString(),
          admin_notes: admin_notes || gift.admin_notes || null,
        })
        .eq("id", gift.id);

      if (updateError) {
        console.error("❌ Error updating gift refund:", updateError);
        return new Response(
          JSON.stringify({error: "Failed to update gift record"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 500,
          },
        );
      }

      // Update beneficiary totals (subtract refunded amount)
      const {data: charity} = await supabase
        .from("charities")
        .select("total_one_time_gifts, one_time_gifts_count")
        .eq("id", gift.beneficiary_id)
        .single();

      if (charity) {
        await supabase
          .from("charities")
          .update({
            total_one_time_gifts: Math.max(
              0,
              parseFloat(charity.total_one_time_gifts || 0) -
                refundAmountDecimal,
            ),
          })
          .eq("id", gift.beneficiary_id);
      }

      // Update user totals (subtract refunded amount)
      const {data: user} = await supabase
        .from("users")
        .select("total_one_time_gifts_given")
        .eq("id", gift.user_id)
        .single();

      if (user) {
        await supabase
          .from("users")
          .update({
            total_one_time_gifts_given: Math.max(
              0,
              parseFloat(user.total_one_time_gifts_given || 0) -
                refundAmountDecimal,
            ),
          })
          .eq("id", gift.user_id);
      }

      // Get updated gift
      const {data: updatedGift} = await supabase
        .from("one_time_gifts")
        .select("*, charities!inner(id, name)")
        .eq("id", gift.id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          gift: {
            id: updatedGift.id,
            status: updatedGift.status,
            refund_amount: parseFloat(updatedGift.refund_amount || 0),
            refunded_at: updatedGift.refunded_at,
          },
          stripe_refund: {
            id: stripeRefund.id,
            amount: stripeRefund.amount / 100, // Convert from cents
            status: stripeRefund.status,
          },
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 200,
        },
      );
    } catch (error: any) {
      console.error("❌ Refund Error:", error);
      return new Response(
        JSON.stringify({
          error: error.message || "Server error. Please try again later.",
        }),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // 404 for admin one-time gift routes
  return new Response(
    JSON.stringify({error: "Admin one-time gift route not found"}),
    {
      headers: {"Content-Type": "application/json"},
      status: 404,
    },
  );
}
