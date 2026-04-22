/**
 * Referral recognition tiers (non-monetary). Friends count = referrals with "paid" status.
 * Keep definitions aligned with REFERRAL_TIERS in supabase/functions/api/index.ts.
 */
export const REFERRAL_TIERS = [
  {
    count: 1,
    reward: 'Supporter Badge',
    description:
      'Unlock the Supporter badge on your profile when one friend becomes an active donor.',
    shortLabel: 'Supporter',
  },
  {
    count: 3,
    reward: 'Website Spotlight',
    description:
      'Be featured on our website as a top community ambassador.',
    shortLabel: 'Spotlight',
  },
  {
    count: 5,
    reward: 'Champion Badge',
    description:
      'Earn the Champion badge when five friends are making a difference together.',
    shortLabel: 'Champion',
  },
];

/** Merge API milestone rows with canonical tiers and paid-friend count. */
export function milestonesForDisplay(apiMilestones, paidFriendsCount) {
  const byCount = new Map(
    (apiMilestones || []).map((m) => [Number(m.count), m])
  );
  return REFERRAL_TIERS.map((tier) => {
    const row = byCount.get(tier.count);
    const unlocked =
      row?.unlocked === true || paidFriendsCount >= tier.count;
    return {
      ...tier,
      reward: row?.reward ?? tier.reward,
      description: row?.description ?? tier.description,
      unlocked,
      earnedAt: row?.earnedAt ?? null,
    };
  });
}

export function nextMilestoneFromPaidCount(paidFriendsCount, milestonesList) {
  const list = milestonesList || milestonesForDisplay([], paidFriendsCount);
  const next = list.find((m) => m.count > paidFriendsCount);
  if (next) return next;
  const last = REFERRAL_TIERS[REFERRAL_TIERS.length - 1];
  return {
    count: last.count,
    reward: 'All recognition tiers unlocked',
    description: 'Thank you for growing the movement.',
    unlocked: true,
  };
}

export function tiersUnlockedCount(milestonesList) {
  return (milestonesList || []).filter((m) => m.unlocked).length;
}
