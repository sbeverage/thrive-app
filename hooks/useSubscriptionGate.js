import { useCallback, useEffect, useState } from 'react';
import API from '../app/lib/api';

// Mirrors the server exactly. `POST /discounts/:id/redeem` gates on:
//
//   monthly_donations, latest row by updated_at, status in {active, trialing}
//
// and otherwise returns 402 with code `subscription_required`. The UI must use
// the same rule, or a donor sees an unlocked list and then a failure when they
// try to redeem. See supabase/functions/api/routes/discounts.ts.
const ALLOWED_STATUSES = new Set(['active', 'trialing']);

// Comped memberships: THRIVE team accounts and coworking seats. Neither ever
// creates a monthly_donations row — coworking is billed to the space outside
// Stripe, team is not billed at all — so gating them on subscription status
// would lock them out of the discounts they exist to exercise. Mirrors
// isCompedAccount() in supabase/functions/api/lib/membership.ts, which the
// redeem endpoint applies server-side.
const COMPED_INVITE_TYPES = new Set(['team', 'coworking']);

export function isCompedMembership(user) {
  if (!user) return false;
  const type = String(user.inviteType || user.invite_type || '').toLowerCase();
  return (
    COMPED_INVITE_TYPES.has(type) ||
    user.coworking === true ||
    user.externalBilled === true
  );
}

// ─── DEV BYPASS ──────────────────────────────────────────────────────────
// Forces the gate open so the rest of the app can be exercised without a
// live subscription. Guarded by __DEV__ as well as this flag, so even if it
// is left `true` a release build ignores it entirely.
const DEV_BYPASS_GATE = true;
// ─────────────────────────────────────────────────────────────────────────

function latestByUpdatedAt(subscriptions) {
  // `/donations/monthly` sorts by created_at, but the redeem gate reads
  // updated_at — a reactivated subscription is the newest *update*, not the
  // newest row. Re-sort so both ends agree on which row counts.
  const withTime = subscriptions.map((s) => ({
    sub: s,
    t: Date.parse(s.updated_at || s.created_at || '') || 0,
  }));
  withTime.sort((a, b) => b.t - a.t);
  return withTime.length > 0 ? withTime[0].sub : null;
}

/**
 * Whether the donor currently has a live monthly donation, and if not, why.
 *
 * Returns { loading, isActive, status, refresh }:
 *  - status is the raw Stripe/local status, or 'no_subscription' when the
 *    donor has never set one up — the two need different prompts ("choose an
 *    amount" vs "update your card").
 *  - isActive is null while loading so callers can avoid flashing a lock
 *    screen at someone who turns out to be paid up.
 */
export default function useSubscriptionGate({ enabled = true, user = null } = {}) {
  const [loading, setLoading] = useState(enabled);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const res = await API.getMonthlyDonations();
      const list = Array.isArray(res)
        ? res
        : res?.subscriptions || res?.data || [];
      const latest = latestByUpdatedAt(list);

      if (__DEV__) {
        // Why the gate decided what it decided. Every row, so we can see
        // whether a merged `donations` row is shadowing the real
        // monthly_donations row by updated_at.
        console.log(
          '[GATE] rows:',
          list.length,
          list.map((r) => ({
            status: r.status,
            updated_at: r.updated_at,
            created_at: r.created_at,
            stripe_subscription_id: r.stripe_subscription_id || r.subscription_id || null,
            amount: r.amount ?? r.monthly_amount ?? null,
          })),
        );
        console.log('[GATE] winner ->', latest?.status, '| updated_at', latest?.updated_at);
      }

      setStatus(String(latest?.status || '').toLowerCase() || 'no_subscription');
    } catch (e) {
      // Don't lock the tab on a network blip — a false lock is worse than a
      // false unlock, because the server still refuses the redemption.
      console.warn('Subscription gate check failed:', e?.message || e);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const comped = isCompedMembership(user);

  let isActive = status === null ? null : ALLOWED_STATUSES.has(status);
  // Resolved without waiting on the network: membership comes from the user
  // record, so a comped account never sees a lock flash while the
  // subscription lookup is in flight.
  if (comped) isActive = true;
  if (__DEV__ && DEV_BYPASS_GATE) isActive = true;

  return {
    loading: comped ? false : loading,
    isActive,
    status: comped ? 'comped' : status,
    comped,
    refresh: load,
  };
}
