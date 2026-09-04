/**
 * Turn a notification's data payload into an in-app route.
 *
 * Extracted from _layout.js so tapping a row in the notification centre lands
 * in exactly the same place as tapping the push banner for the same event.
 * Two copies of this normalisation would drift, and the drift would be
 * invisible until a deep link quietly stopped working.
 */

/**
 * @param {object} data - the notification's `data` payload ({ path, type, ... })
 * @returns {string|null} an app route, or null when there is nowhere to go
 */
export function notificationTargetPath(data) {
  const raw = (data?.path || data?.url || '').toString();
  if (!raw) return null;

  try {
    // Strip optional scheme + host so we always route within the app.
    const withoutHost = raw
      .replace(/^thrive:\/\//, '')
      .replace(/^https?:\/\/[^/]+/, '');

    // Drop expo-router group segments. Parenthesised folders like (tabs) and
    // (main) are organisational and never appear in a URL, so an href such as
    // "/(tabs)/(main)/discounts/10" does not resolve — router.push falls
    // through and the app sits on the default tab. Every push payload carried
    // that form until 2026-09-02. The senders are fixed, but stripping here
    // means a future one cannot break the deep link.
    const cleaned = withoutHost.replace(/\(([^)]+)\)\/?/g, '');
    const normalised = cleaned.replace(/\/{2,}/g, '/');
    const target = normalised.startsWith('/') ? normalised : `/${normalised}`;

    if (target === '/') return null;
    return target;
  } catch (e) {
    console.warn('Notification route normalisation failed:', e);
    return null;
  }
}

/** Icon + tint per notification type, shared by the feed rows. */
export const NOTIFICATION_STYLE = {
  payment_failed: { icon: '⚠️', tint: '#DB8633' },
  payment_paused: { icon: '⏸️', tint: '#C0392B' },
  donation_success: { icon: '💝', tint: '#21555b' },
  favorite_new_discount: { icon: '🏷️', tint: '#DB8633' },
  favorite_expiring_discount: { icon: '⏳', tint: '#C0392B' },
  charity_approved: { icon: '✅', tint: '#21555b' },
  charity_rejected: { icon: '🔄', tint: '#DB8633' },
  charity_reassigned: { icon: '🔄', tint: '#DB8633' },
};

export function notificationStyle(type) {
  return NOTIFICATION_STYLE[type] || { icon: '🔔', tint: '#324E58' };
}

/**
 * "3h ago" / "2d ago". Deliberately coarse: a feed of exact timestamps reads
 * like a log, and the donor only needs to know roughly how fresh it is.
 */
export function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
