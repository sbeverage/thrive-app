// Vendor category display — one definition, used everywhere donors see a
// category.
//
// Categories are free text in the database, so "Restaurant" and "restaurant"
// were stored as different values and rendered as two separate chips with the
// counts split between them. Grouping is done on a normalised key and the label
// is rebuilt for display, so casing drift can never split a category again —
// even if new rows arrive with a different case.

/**
 * The grouping key for a category. Case and surrounding whitespace are noise.
 */
export function categoryKey(category) {
  return String(category || '').trim().toLowerCase();
}

/**
 * Donor-facing label for a category, in Title Case.
 *
 * Rebuilt from the normalised key rather than trusting the stored string, so
 * one vendor typing "RESTAURANT" doesn't shout at everyone.
 */
export function categoryLabel(category) {
  const key = categoryKey(category);
  if (!key) return '';
  return key
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Categories listed before the alphabetical remainder. */
const PREFERRED = ['restaurant', 'retail', 'coworking'];

/**
 * "Other" is a bucket, not a category. It sorts last no matter what — a donor
 * scrolling the chips should reach the real categories before the catch-all,
 * and alphabetical ordering would otherwise drop it in the middle.
 */
const ALWAYS_LAST = ['other'];

/**
 * Order category keys for display: preferred first, then alphabetical, then
 * the catch-all buckets.
 *
 * @param {string[]} keys normalised category keys
 * @returns {string[]} the same keys, ordered
 */
export function orderCategoryKeys(keys) {
  const unique = Array.from(new Set(keys.map(categoryKey).filter(Boolean)));
  const isLast = (k) => ALWAYS_LAST.includes(k);

  const preferred = PREFERRED.filter((k) => unique.includes(k));
  const rest = unique
    .filter((k) => !PREFERRED.includes(k) && !isLast(k))
    .sort((a, b) => a.localeCompare(b));
  const last = unique.filter(isLast);

  return [...preferred, ...rest, ...last];
}

/**
 * Group items by category, case-insensitively.
 *
 * @param {Array} items anything with a `category` and optional `tags`
 * @returns {Array<{key: string, label: string, count: number}>} ordered
 */
export function groupByCategory(items) {
  const counts = new Map();
  (items || []).forEach((item) => {
    const raw = [item?.category, ...(Array.isArray(item?.tags) ? item.tags : [])];
    // A vendor tagged "Restaurant" whose category is also "restaurant" must
    // count once, not twice — dedupe per item before counting.
    const keys = new Set(raw.map(categoryKey).filter(Boolean));
    keys.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
  });

  return orderCategoryKeys([...counts.keys()]).map((key) => ({
    key,
    label: categoryLabel(key),
    count: counts.get(key) || 0,
  }));
}
