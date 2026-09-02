// The one description of how a discount is presented to donors.
//
// A discount used to be shown as a derived headline ("Free Item", "10% off")
// in the coupon band with the vendor's real title repeated underneath. That
// pushed vendors to cram the offer into every field, so donors read the same
// sentence three times and still didn't know what they were getting.
//
// The card now gives each field exactly one job:
//
//   band     title        the offer, in the vendor's own words
//   pill     availability where it can be redeemed
//   body     description  what's included
//   footer   terms        the fine print
//
// discount_type / discount_value stay in the database — they drive filtering
// and reporting — but they are no longer rendered. Category and tags are
// internal classification and never appear on the card.

/**
 * Hard cap on the band title.
 *
 * The band is one line of bold text across a phone-width card, sharing that
 * line with the availability pill. Enforced at input time in both portals and
 * in both API routes, rather than papered over with a smaller font at render
 * time — shrinking to fit is what made these unreadable to begin with.
 */
export const TITLE_MAX = 26;
/** Where the counter turns amber — enough runway to finish the thought. */
export const TITLE_WARN = 22;
export const DESCRIPTION_MAX = 140;
export const TERMS_MAX = 200;

/** Donor-facing wording for discounts.availability. */
export const AVAILABILITY_LABELS = {
  "in-store": "In-store",
  online: "Online",
  both: "In-store & online",
};

/**
 * Label for the availability pill, or null when the vendor never set one.
 *
 * Returns null rather than guessing: claiming a discount works online when
 * nobody said so sends a donor to a website that won't honour it.
 */
export function availabilityLabel(availability) {
  if (!availability) return null;
  return AVAILABILITY_LABELS[String(availability).toLowerCase().trim()] || null;
}
