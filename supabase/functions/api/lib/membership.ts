// Membership type for a donor account.
//
//   standard  — pays THRIVE directly via a Stripe subscription
//   coworking — a coworking space pays a per-seat sponsor_amount outside Stripe
//   team      — internal THRIVE account, nobody is billed at all
//
// Both coworking and team are *comped*: the donor completes signup without a
// payment step and never gets a monthly_donations row. That matters because
// discount redemption gates on having a live subscription, so without an
// explicit exemption a comped account is locked out of the very thing it
// exists to exercise.
//
// Kept in one place because the check appears in the redeem gate, the profile
// payload, admin analytics, and the admin donor list — four files that were
// each about to grow their own copy of the same string comparison.

export type MembershipType = "standard" | "coworking" | "team";

/** Normalised membership for a users row. Null invite_type means standard. */
export function membershipOf(user: any): MembershipType {
  if (!user) return "standard";
  const raw = String(user.invite_type ?? user.inviteType ?? "")
    .trim()
    .toLowerCase();
  if (raw === "team") return "team";
  if (raw === "coworking") return "coworking";
  // Legacy rows predate invite_type and only carry the boolean.
  if (user.coworking === true) return "coworking";
  return "standard";
}

/** Internal THRIVE account — excluded from donor counts and pledged totals. */
export function isTeamMember(user: any): boolean {
  return membershipOf(user) === "team";
}

/**
 * Account that is entitled to donor benefits without a Stripe subscription.
 *
 * `external_billed` is honoured as a fallback so a coworking member whose
 * invite_type never got written (the column was missing for a while) is not
 * locked out.
 */
export function isCompedAccount(user: any): boolean {
  const m = membershipOf(user);
  return m === "team" || m === "coworking" || user?.external_billed === true;
}

/** Columns any of the above need. Spread into a .select() list. */
export const MEMBERSHIP_COLUMNS =
  "coworking, invite_type, sponsor_amount, sponsor_source, external_billed";
