/** Injected from index.ts to avoid circular imports with referral helpers. */
export type UpdateReferralStatusFn = (
  supabase: any,
  referredUserId: number,
  status: string,
  monthlyDonationAmount?: number,
  stripeSubscriptionId?: string,
) => Promise<void>;

export async function handleWebhookRoute(
  req: Request,
  supabase: any,
  route: string,
  method: string,
  updateReferralStatus: UpdateReferralStatusFn,
) {
  // POST /webhooks/stripe - Stripe webhook handler
  if (method === "POST" && route === "/webhooks/stripe") {
    try {
      const stripeSignature = req.headers.get("stripe-signature");
      const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

      if (!stripeSignature || !webhookSecret) {
        return new Response(
          JSON.stringify({error: "Missing webhook signature or secret"}),
          {
            headers: {"Content-Type": "application/json"},
            status: 400,
          },
        );
      }

      // Get raw body for signature verification
      const body = await req.text();

      // Note: In production, you should verify the Stripe signature
      // For now, we'll process the event (you can add signature verification later)
      const event = JSON.parse(body);

      console.log("📥 Stripe webhook received:", event.type);

      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;

          const {data: gift, error: giftLookupError} = await supabase
            .from("one_time_gifts")
            .select("*")
            .eq("stripe_payment_intent_id", paymentIntent.id)
            .maybeSingle();

          if (giftLookupError || !gift) {
            console.error(
              "❌ Gift not found for payment intent:",
              paymentIntent.id,
              giftLookupError,
            );
            break;
          }

          // Only update if not already succeeded
          if (gift.status !== "succeeded") {
            const charge =
              paymentIntent.charges?.data?.[0] || paymentIntent.latest_charge;
            const chargeId = typeof charge === "string" ? charge : charge?.id;

            // Extract payment method details
            const paymentMethod = paymentIntent.payment_method;
            let paymentMethodType = "card";
            let paymentMethodLast4 = null;
            let paymentMethodBrand = null;

            if (paymentMethod && typeof paymentMethod === "object") {
              paymentMethodType = paymentMethod.type || "card";
              if (paymentMethod.card) {
                paymentMethodLast4 = paymentMethod.card.last4;
                paymentMethodBrand = paymentMethod.card.brand;
              }
            }

            // Update gift record
            await supabase
              .from("one_time_gifts")
              .update({
                status: "succeeded",
                stripe_charge_id: chargeId,
                payment_method_type: paymentMethodType,
                payment_method_last4: paymentMethodLast4,
                payment_method_brand: paymentMethodBrand,
                processed_at: new Date().toISOString(),
              })
              .eq("id", gift.id);

            const {data: benForGift} = await supabase
              .from("beneficiaries")
              .select("id")
              .eq("id", gift.beneficiary_id)
              .maybeSingle();
            const beneficiaryTable = benForGift ? "beneficiaries" : "charities";
            const {data: charity} = await supabase
              .from(beneficiaryTable)
              .select("total_one_time_gifts, one_time_gifts_count")
              .eq("id", gift.beneficiary_id)
              .single();

            if (charity) {
              await supabase
                .from(beneficiaryTable)
                .update({
                  total_one_time_gifts:
                    parseFloat(charity.total_one_time_gifts || 0) +
                    parseFloat(gift.net_amount),
                  one_time_gifts_count:
                    parseInt(charity.one_time_gifts_count || 0) + 1,
                  last_one_time_gift_at: new Date().toISOString(),
                })
                .eq("id", gift.beneficiary_id);
            }

            // Update user totals
            const {data: user} = await supabase
              .from("users")
              .select("total_one_time_gifts_given, one_time_gifts_count")
              .eq("id", gift.user_id)
              .single();

            if (user) {
              await supabase
                .from("users")
                .update({
                  total_one_time_gifts_given:
                    parseFloat(user.total_one_time_gifts_given || 0) +
                    parseFloat(gift.amount),
                  one_time_gifts_count:
                    parseInt(user.one_time_gifts_count || 0) + 1,
                  last_one_time_gift_at: new Date().toISOString(),
                })
                .eq("id", gift.user_id);
            }

            // Create transaction record — upsert on gift_id to be idempotent
            await supabase.from("transactions").upsert(
              [
                {
                  user_id: gift.user_id,
                  type: "one_time_gift",
                  amount: parseFloat(gift.amount),
                  description: `One-time gift to beneficiary ${gift.beneficiary_id}`,
                  reference_id: gift.id,
                  reference_type: "gift",
                  gift_id: gift.id,
                  beneficiary_id: gift.beneficiary_id,
                  status: "completed",
                },
              ],
              { onConflict: "gift_id", ignoreDuplicates: true },
            );

            console.log("✅ Gift updated to succeeded:", gift.id);
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object;

          // Find gift by payment intent ID
          const {data: gift, error: giftError} = await supabase
            .from("one_time_gifts")
            .select("id")
            .eq("stripe_payment_intent_id", paymentIntent.id)
            .single();

          if (!giftError && gift) {
            const failureReason =
              paymentIntent.last_payment_error?.message || "Payment failed";

            await supabase
              .from("one_time_gifts")
              .update({
                status: "failed",
                failure_reason: failureReason,
                failed_at: new Date().toISOString(),
              })
              .eq("id", gift.id);

            console.log("❌ Gift marked as failed:", gift.id);
          }
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object;

          // Find gift by charge ID
          const {data: gift, error: giftError} = await supabase
            .from("one_time_gifts")
            .select("id, amount, beneficiary_id, user_id")
            .eq("stripe_charge_id", charge.id)
            .single();

          if (!giftError && gift) {
            const refundAmount = charge.amount_refunded / 100; // Convert from cents

            await supabase
              .from("one_time_gifts")
              .update({
                status: "refunded",
                refund_amount: refundAmount,
                refunded_at: new Date().toISOString(),
              })
              .eq("id", gift.id);

            const {data: benRow} = await supabase
              .from("beneficiaries")
              .select("id")
              .eq("id", gift.beneficiary_id)
              .maybeSingle();
            const beneficiaryTable = benRow ? "beneficiaries" : "charities";
            const {data: charity} = await supabase
              .from(beneficiaryTable)
              .select("total_one_time_gifts")
              .eq("id", gift.beneficiary_id)
              .single();

            if (charity) {
              await supabase
                .from(beneficiaryTable)
                .update({
                  total_one_time_gifts: Math.max(
                    0,
                    parseFloat(charity.total_one_time_gifts || 0) -
                      refundAmount,
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
                      refundAmount,
                  ),
                })
                .eq("id", gift.user_id);
            }

            console.log("💰 Gift refunded:", gift.id);
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;

          if (subscriptionId) {
            // Find monthly donation by subscription ID
            const {data: donation, error: donationError} = await supabase
              .from("monthly_donations")
              .select("*")
              .eq("stripe_subscription_id", subscriptionId)
              .single();

            if (!donationError && donation) {
              const amount = invoice.amount_paid / 100; // Convert from cents
              const nextPaymentDate = new Date();
              nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

              // Update monthly donation
              await supabase
                .from("monthly_donations")
                .update({
                  status: "active",
                  last_payment_date: new Date().toISOString().split("T")[0],
                  last_payment_amount: amount,
                  next_payment_date: nextPaymentDate
                    .toISOString()
                    .split("T")[0],
                })
                .eq("id", donation.id);

              // Create transaction record — upsert on stripe_invoice_id to be idempotent
              await supabase.from("transactions").upsert(
                [
                  {
                    user_id: donation.user_id,
                    type: "monthly_donation",
                    amount: amount,
                    description: `Monthly donation to beneficiary ${donation.beneficiary_id}`,
                    reference_id: invoice.id,
                    reference_type: "donation",
                    donation_id: donation.id,
                    beneficiary_id: donation.beneficiary_id,
                    status: "completed",
                  },
                ],
                { onConflict: "reference_id", ignoreDuplicates: true },
              );

              console.log(
                "✅ Monthly donation payment succeeded:",
                donation.id,
              );

              // First successful subscription payment → mark referral paid and run milestone RPC once
              const {data: referralRow} = await supabase
                .from("referrals")
                .select("status")
                .eq("referred_user_id", donation.user_id)
                .maybeSingle();

              if (referralRow && referralRow.status !== "paid") {
                await updateReferralStatus(
                  supabase,
                  donation.user_id,
                  "paid",
                  amount,
                  typeof subscriptionId === "string"
                    ? subscriptionId
                    : String(subscriptionId),
                );
              }
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;

          if (subscriptionId) {
            const {data: donation} = await supabase
              .from("monthly_donations")
              .select("id")
              .eq("stripe_subscription_id", subscriptionId)
              .single();

            if (donation) {
              await supabase
                .from("monthly_donations")
                .update({
                  status: "past_due",
                })
                .eq("id", donation.id);

              console.log("❌ Monthly donation payment failed:", donation.id);
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object;

          const {data: donation} = await supabase
            .from("monthly_donations")
            .select("id")
            .eq("stripe_subscription_id", subscription.id)
            .single();

          if (donation) {
            const statusMap: Record<string, string> = {
              active: "active",
              past_due: "past_due",
              canceled: "cancelled",
              unpaid: "past_due",
              trialing: "active",
              paused: "paused",
            };

            await supabase
              .from("monthly_donations")
              .update({
                status: statusMap[subscription.status] || subscription.status,
              })
              .eq("id", donation.id);

            console.log(
              "📝 Subscription updated:",
              subscription.id,
              subscription.status,
            );
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;

          const {data: donation} = await supabase
            .from("monthly_donations")
            .select("id")
            .eq("stripe_subscription_id", subscription.id)
            .single();

          if (donation) {
            await supabase
              .from("monthly_donations")
              .update({
                status: "cancelled",
              })
              .eq("id", donation.id);

            console.log("🗑️ Subscription cancelled:", subscription.id);
          }
          break;
        }

        default:
          console.log("⚠️ Unhandled webhook event type:", event.type);
      }

      return new Response(JSON.stringify({received: true}), {
        headers: {"Content-Type": "application/json"},
        status: 200,
      });
    } catch (error: any) {
      console.error("❌ Webhook Error:", error);
      return new Response(
        JSON.stringify({error: "Webhook processing failed"}),
        {
          headers: {"Content-Type": "application/json"},
          status: 500,
        },
      );
    }
  }

  // 404 for webhook routes
  return new Response(JSON.stringify({error: "Webhook route not found"}), {
    headers: {"Content-Type": "application/json"},
    status: 404,
  });
}
