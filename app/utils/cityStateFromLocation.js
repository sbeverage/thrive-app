// Extract a "City, ST" display string from a charity's free-form location
// field. The DB stores values like "44 Milton Ave, Alpharetta, GA" so we
// can match the filter — but the card UI looks cleanest with just the city
// and state (the full address belongs on the detail page).
//
// Examples:
//   "44 Milton Ave, Alpharetta, GA"   -> "Alpharetta, GA"
//   "Atlanta, GA"                      -> "Atlanta, GA"
//   "199 WarAngel Farms Way, Canton GA 30114" -> "Canton, GA"
//   "USA"                              -> "USA"
//   "44 Milton Ave"                    -> "44 Milton Ave"
//   null / ""                          -> "Location not set"

const US_STATE_RE = /\b(A[LKZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/i;

export function cityStateFromLocation(loc) {
  if (!loc || typeof loc !== 'string') return 'Location not set';
  const cleaned = loc.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Location not set';

  // Comma-form: "Street, City, ST [ZIP]" → take last two comma-parts
  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    // Strip a trailing zip from "GA 30114"
    const lastClean = last.replace(/\s+\d{5}(-\d{4})?$/, '').trim();
    return `${prev}, ${lastClean}`;
  }

  // Space-form: "199 Way Canton GA 30114" → find the state abbr, take the
  // token before it as the city.
  const m = cleaned.match(US_STATE_RE);
  if (m) {
    const stateAbbr = m[0].toUpperCase();
    const before = cleaned.slice(0, m.index).trim();
    const tokens = before.split(/\s+/);
    const city = tokens[tokens.length - 1] || '';
    if (city) return `${city}, ${stateAbbr}`;
  }

  return cleaned;
}
