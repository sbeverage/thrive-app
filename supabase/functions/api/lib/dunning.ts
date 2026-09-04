// Payment-failure notices — one definition, two callers.
//
// The Stripe webhook fires these automatically as Smart Retries progress, and
// an admin can send the same notice by hand. Keeping the copy here means the
// manual nudge and the automatic one can't drift apart, which is how a donor
// ends up reading two different accounts of the same problem.

import { notifyUser } from "./notifications.ts";
import { sendNotificationEmail } from "./email.ts";

export type FailureNoticeStage = {
  /** Stripe's attempt_count for the invoice — 1 on the first failure. */
  attempt: number;
  /** True once Stripe has stopped retrying (next_payment_attempt is null). */
  isFinal: boolean;
  amountDue: number;
  /** Human date of the next retry, when there is one. */
  nextTry?: string | null;
  /**
   * Send the push regardless of stage. For donors already mid-sequence when
   * this flow shipped, who would otherwise never receive one.
   */
  forcePush?: boolean;
  /**
   * Stripe invoice id, when the caller has one. Keys the notification so a
   * redelivered invoice.payment_failed doesn't append a second identical row
   * to the donor's feed. The admin's manual nudge omits it, because there
   * sending again is the entire point.
   */
  invoiceId?: string;
};

export type FailureNoticeResult = {
  pushSent: boolean;
  emailSent: boolean;
  title: string;
  reason?: string;
};

/**
 * Tell a donor their payment failed, at the right volume for the stage.
 *
 * Push only on the first failure and the last: Stripe retries roughly four
 * times over two to three weeks, and four identical notifications in a
 * fortnight reads as spam and gets the app muted — which costs the one channel
 * that actually recovers a donor. Email carries the middle of the sequence.
 */
export async function sendPaymentFailureNotice(
  supabase: any,
  userId: number,
  stage: FailureNoticeStage,
): Promise<FailureNoticeResult> {
  const { attempt, isFinal, amountDue, nextTry, forcePush, invoiceId } = stage;

  const title = isFinal
    ? "Your monthly giving is paused"
    : attempt <= 1
      ? "We couldn't process your donation"
      : `Still unable to process your donation (attempt ${attempt})`;

  const message = isFinal
    ? `We tried your card a few times over the past couple of weeks and it didn't go through, so your monthly gift of $${amountDue.toFixed(2)} is paused for now.\n\nNothing is lost — your cause is still saved. Open the THRIVE app and update your payment method to pick up right where you left off.`
    : `Your monthly gift of $${amountDue.toFixed(2)} couldn't be processed${
        attempt > 1 ? ` (this was attempt ${attempt})` : ""
      }.\n\n${
        nextTry ? `We'll try again on ${nextTry}. ` : ""
      }To avoid a gap, open the THRIVE app and update your payment method — it takes a moment and your cause stays exactly as you set it.`;

  const result: FailureNoticeResult = { pushSent: false, emailSent: false, title };

  if (attempt <= 1 || isFinal || forcePush) {
    try {
      // notifyUser records the notice in the donor's feed first and pushes
      // second, so a donor with no registered token still finds out — that
      // silent case is how a payment-failure notice previously vanished
      // while being reported as sent.
      const type = isFinal ? "payment_paused" : "payment_failed";
      const outcome = await notifyUser(supabase, userId, {
        type,
        title: isFinal
          ? "Your giving is paused"
          : "Your THRIVE payment didn't go through",
        body: isFinal
          ? "We couldn't process your card after several tries. Update it to start giving again."
          : "Tap to update your card so we can keep your donation going.",
        data: { path: "/menu/manageCards", type },
        dedupeKey: invoiceId ? `${type}:${invoiceId}:${attempt}` : undefined,
        // A donor cannot mute the notice that their giving has stopped —
        // there is nothing they can act on if they never hear about it.
        ignorePrefs: isFinal,
      });
      result.pushSent = outcome.pushSent;
      if (!outcome.pushSent) {
        result.reason = outcome.reason;
        console.warn(
          `⚠️ Payment-failure push to user ${userId} not delivered: ${outcome.reason}`,
        );
      }
    } catch (e: any) {
      // notifyUser is written not to throw; this is belt-and-braces so a
      // notification can never fail the webhook that triggered it.
      console.warn("payment failure notice failed:", e?.message || e);
    }
  }

  const { data: donor } = await supabase
    .from("users")
    .select("email, first_name")
    .eq("id", userId)
    .maybeSingle();

  if (!donor?.email) {
    console.warn(`⚠️ No email on user ${userId} — payment-failure notice not sent.`);
    result.reason = "user has no email address";
    return result;
  }

  try {
    await sendNotificationEmail({
      to: donor.email,
      name: donor.first_name || "there",
      title,
      message,
      level: isFinal ? "error" : "warning",
    });
    result.emailSent = true;
  } catch (e: any) {
    console.warn("payment failure email failed:", e?.message || e);
    result.reason = e?.message || "email send failed";
  }

  return result;
}
