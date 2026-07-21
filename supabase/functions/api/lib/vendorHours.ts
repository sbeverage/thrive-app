// Canonical shape for vendor operating hours across every write path.
//
// Historically vendors were saved with two different key styles for the
// `hours` JSONB column — full day names ("monday") from the original signup
// wizard and 3-letter abbreviations ("mon") from newer entry paths. The
// donor app's discount-detail hours renderer sorts by matching keys against
// a canonical list; when the two shapes mix, some vendors sort correctly and
// others render in arbitrary order.
//
// This module standardises every new write to the 3-letter lowercase form
// so the renderer only ever has to handle one shape. The renderer is still
// defensive about older mixed-shape rows for backfill / historical safety.

export const CANONICAL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// Rewrites any hours-shaped object so its keys are the canonical 3-letter
// lowercase form. Accepts "Monday", "MON", "mon ", etc. Keys that don't map
// to a recognised weekday are preserved verbatim so we never silently drop
// data if a vendor entered something bespoke.
export function normalizeHours(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    const short = String(rawKey || '').toLowerCase().trim().slice(0, 3);
    if ((CANONICAL_DAY_KEYS as readonly string[]).includes(short)) {
      out[short] = value;
    } else {
      out[String(rawKey)] = value;
    }
  }
  return out;
}
