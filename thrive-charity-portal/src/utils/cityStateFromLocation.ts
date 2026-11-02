/**
 * COPY. The original lives in the admin panel at
 *   ti-admin-panel/ti-admin-panel/src/utils/cityStateFromLocation.ts
 * and the donor app's slot styles are the other half of the same decision.
 *
 * Duplicated rather than shared because the panel, this portal and the app are
 * three separate builds with no shared package. If one changes, the others
 * have to change with it, or a charity crops to one shape and donors see
 * another. See CLAUDE.md "Charity images".
 */
/**
 * Port of the donor app's app/utils/cityStateFromLocation.js, kept byte-for-byte
 * in behaviour.
 *
 * The charity browse card does not render charities.location raw: it passes it
 * through this first, because the column stores full addresses like
 * "44 Milton Ave, Alpharetta, GA" so that the location filter can match on
 * them, while the card only wants the city and state. The admin preview showed
 * the raw column and therefore displayed a street address the app never shows.
 *
 * This is a copy rather than a shared import because the app and the panel are
 * separate builds with no shared package. If the app's version changes, this
 * has to change with it, or the preview starts lying about what donors see.
 *
 * Examples:
 *   "44 Milton Ave, Alpharetta, GA"            -> "Alpharetta, GA"
 *   "Atlanta, GA"                              -> "Atlanta, GA"
 *   "199 WarAngel Farms Way, Canton GA 30114"  -> "Canton, GA"
 *   "USA"                                      -> "USA"
 *   "44 Milton Ave"                            -> "44 Milton Ave"
 *   null / ""                                  -> "Location not set"
 */
const US_STATE_RE =
  /\b(A[LKZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/i;

export function cityStateFromLocation(loc?: string | null): string {
  if (!loc || typeof loc !== 'string') return 'Location not set';
  const cleaned = loc.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Location not set';

  // Comma-form: "Street, City, ST [ZIP]" -> take the last two comma-parts
  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    // Strip a trailing zip from "GA 30114"
    const lastClean = last.replace(/\s+\d{5}(-\d{4})?$/, '').trim();
    return `${prev}, ${lastClean}`;
  }

  // Space-form: "199 Way Canton GA 30114" -> find the state abbr, take the
  // token before it as the city.
  const m = cleaned.match(US_STATE_RE);
  if (m && m.index !== undefined) {
    const stateAbbr = m[0].toUpperCase();
    const before = cleaned.slice(0, m.index).trim();
    const tokens = before.split(/\s+/);
    const city = tokens[tokens.length - 1] || '';
    if (city) return `${city}, ${stateAbbr}`;
  }

  return cleaned;
}
