// What a donor is being asked to deal with, in one place.
//
// Consumed by GET /auth/alerts (what the app shows on launch) and by
// GET /admin/reporting/alerts-preview (what support can check for a given
// account). Both call this so the preview is evidence about the real thing
// rather than a second implementation that can drift.
//
// Copy lives here rather than in the app binary: OTA updates do not work on
// this project, so wording baked into a release cannot be changed without a
// full App Store build.

import { isCompedAccount, MEMBERSHIP_COLUMNS } from "./membership.ts";

export interface AccountAlert {
  id: string;
  type: "charity_rejected" | "payment_failed";
  title: string;
  message: string;
  ctaLabel: string;
  ctaPath: string;
  dismissible: boolean;
}

/**
 * Alerts for one donor, most urgent first. The app shows the first one.
 *
 * Returns an empty array for anything it cannot determine — this runs on app
 * launch, so a wrong answer is worse than no answer.
 */
export async function buildAccountAlerts(
  supabase: any,
  userId: number,
): Promise<AccountAlert[]> {
  const { data: user } = await supabase
    .from("users")
    .select(`id, preferences, ${MEMBERSHIP_COLUMNS}`)
    .eq("id", userId)
    .maybeSingle();
  if (!user) return [];

  const alerts: AccountAlert[] = [];

  // 0) We moved them onto THRIVE because their cause was rejected. Checked
  //    first, and it has to be checked at all: once reassigned their stored
  //    charity is THRIVE, which is perfectly healthy, so every other rule
  //    below goes quiet and the donor would never learn their cause changed.
  //    `reassignedFrom` is cleared by POST /donations/monthly/redirect, so
  //    this stops the moment they choose for themselves.
  const moved = user.preferences?.reassignedFrom;
  if (moved?.name) {
    alerts.push({
      id: `charity_reassigned:${moved.id}:${moved.at || ""}`,
      type: "charity_rejected",
      title: `We couldn't verify ${moved.name}`,
      message:
        "THRIVE Initiative, Inc. is holding your giving until you choose a new cause — that's why you'll see them as your cause for now. Nothing is paid out to them. Pick any cause and everything held moves straight to them.",
      ctaLabel: "Choose a new cause",
      ctaPath: "/beneficiary",
      dismissible: true,
    });
    return alerts;
  }

  // 1) The cause they picked is no longer one we can send money to. First
  //    because their giving is held until they choose again — that blocks
  //    more than a card problem does.
  const picked = user.preferences?.preferredCharity ?? user.preferences?.beneficiary;
  if (picked != null && picked !== "") {
    const { data: charity } = await supabase
      .from("charities")
      .select("id, name, is_active, is_pending_verification, verification_rejected_at")
      .eq("id", picked)
      .maybeSingle();

    // Pending is NOT a problem — it is the normal state of a donor-suggested
    // charity awaiting review, and /charities/suggest deliberately writes
    // is_active false alongside is_pending_verification true. Testing
    // is_active alone therefore told every waiting donor their cause had been
    // rejected, which is both wrong and the fastest way to talk someone out of
    // a cause we were about to approve. The donor already knows it is pending;
    // they chose "save my spot".
    const pending = charity?.is_pending_verification === true;

    if (charity && !pending && charity.verification_rejected_at) {
      // verification_rejected_at is written only by the reject route, so it is
      // the one unambiguous signal that we turned this charity down.
      alerts.push({
        id: `charity_rejected:${charity.id}`,
        type: "charity_rejected",
        title: `We couldn't verify ${charity.name}`,
        message:
          "Your giving is safe and still set aside — nothing has been lost. Choose another cause and it will go to them instead.",
        ctaLabel: "Choose a new cause",
        ctaPath: "/beneficiary",
        dismissible: true,
      });
    } else if (charity && !pending && charity.is_active === false) {
      // Retired or soft-deleted rather than rejected. Same action needed, but
      // saying "we couldn't verify them" would be a claim we cannot support.
      alerts.push({
        id: `charity_rejected:${charity.id}`,
        type: "charity_rejected",
        title: `${charity.name} is no longer available`,
        message:
          "Your giving is safe and still set aside — nothing has been lost. Choose another cause and it will go to them instead.",
        ctaLabel: "Choose a new cause",
        ctaPath: "/beneficiary",
        dismissible: true,
      });
    }
  }

  // 2) Their card is not going through. Skipped for comped accounts: team and
  //    coworking members are never billed, so this would be pure noise.
  if (!isCompedAccount(user)) {
    const { data: subs } = await supabase
      .from("monthly_donations")
      .select("id, status, amount, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);
    const latest = (subs || [])[0];
    const status = String(latest?.status || "").toLowerCase();
    if (["past_due", "unpaid", "incomplete"].includes(status)) {
      const paused = status === "unpaid";
      alerts.push({
        id: `payment_failed:${latest.id}:${status}`,
        type: "payment_failed",
        title: paused
          ? "Your monthly giving is paused"
          : "Your last payment didn't go through",
        message: paused
          ? "We tried your card a few times and it didn't go through, so your giving is paused. Your cause is still saved — update your card to pick up where you left off."
          : "We couldn't process your card. Update it and your giving carries on without a gap.",
        ctaLabel: "Update payment",
        ctaPath: "/menu/manageCards",
        dismissible: true,
      });
    }
  }

  return alerts;
}
