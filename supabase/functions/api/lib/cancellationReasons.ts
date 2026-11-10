/**
 * Labels for the reason ids the app writes into
 * membership_cancellation_feedback.reason_code.
 *
 * The app owns the list: CANCELLATION_REASONS in
 * app/(tabs)/menu/donationSummary.js is the source of truth, and these are
 * only for reading a code back out as a sentence, in the cancellation email
 * and in the admin panel.
 *
 * Two things follow from that, and both are deliberate:
 *
 *   - A code with no entry here falls back to the code itself rather than
 *     being dropped or shown blank. An older build can send a reason this
 *     deploy has never heard of, and a slightly ugly label beats losing it.
 *
 *   - Never rename a key to tidy it up. The key is what is already stored in
 *     every historical row, so changing one orphans that history. Add a new
 *     key instead and leave the old one here for the rows that carry it, even
 *     after the app stops offering it.
 */
export const CANCELLATION_REASON_LABELS: Record<string, string> = {
  too_expensive: "It costs too much right now",
  not_using_discounts: "Not using the discounts",
  unclear_how_it_works: "Not sure how it works",
  switch_charity: "Wants to support a different charity",
  app_problem: "Ran into a problem with the app",
  other: "Something else",
};

export function cancellationReasonLabel(reasonCode: string): string {
  return CANCELLATION_REASON_LABELS[reasonCode] || reasonCode;
}

/**
 * How the cancel sheet ended. Anything that is not an explicit save is a
 * cancellation, including an unrecognised value: miscounting a save as churn
 * overstates the problem, miscounting churn as a save hides it, and the
 * second is the more expensive mistake.
 */
export function isCancellationOutcome(outcome: string | null): boolean {
  return outcome !== "kept_changing_charity";
}
