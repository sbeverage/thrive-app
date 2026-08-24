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
export default function useSubscriptionGate({ enabled = true } = {}) {
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

  const isActive = status === null ? null : ALLOWED_STATUSES.has(status);

  return { loading, isActive, status, refresh: load };
}
