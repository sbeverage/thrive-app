// Where to send a donor whose monthly giving isn't paying.
//
// The discounts lock screen used to offer two buttons that both led nowhere
// useful: "Choose my amount" went to editDonationAmount, which changes a
// number and never presents a payment sheet, and "Update payment method" went
// to manageCards, which attaches a card and charges nothing. A donor whose
// first payment failed had no route back — the only screen that creates *and*
// pays a subscription is signupFlow/stripeIntegration, and nothing outside
// signup navigated to it.
//
// beneficiary/checkout looks like a candidate but calls
// createOneTimePaymentSheet — it takes a one-off gift and leaves the
// subscription just as broken.
//
// POST /donations/monthly/subscribe already does the right thing when a
// subscription exists: it resumes the Payment Sheet for a resumable unpaid
// invoice, and drops the dead row and builds a fresh subscription otherwise.
// So sending the donor there is enough — no new screen required.

/** The screen that both creates and charges a monthly subscription. */
export const PAYMENT_SCREEN = '/signupFlow/stripeIntegration';
/** Amount picker — no payment sheet, so only useful before an amount exists. */
export const AMOUNT_SCREEN = '/(tabs)/menu/editDonationAmount';

/**
 * Route for recovering a blocked subscription.
 *
 * Without an amount there is nothing to charge, so the donor picks one first.
 * With an amount we go straight to the screen that can take the payment,
 * passing the amount through so it doesn't silently fall back to the $15
 * default and charge the wrong figure.
 *
 * @param {object} user the current user from UserContext
 * @returns {{pathname: string, params?: object}} an expo-router target
 */
export function paymentRecoveryRoute(user) {
  const amount = Number(user?.monthlyDonation);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { pathname: AMOUNT_SCREEN };
  }
  return {
    pathname: PAYMENT_SCREEN,
    params: { amount: String(amount), resumePayment: 'true' },
  };
}
