// Vendor category normalisation.
//
// Category is free text, so the same category arrived in whatever case the
// vendor or admin happened to type: the database held "restaurant" five times
// and "Restaurant" three, and the app rendered them as two separate chips with
// the vendor count split between them.
//
// The app groups case-insensitively so display is safe either way, but storing
// one canonical form keeps admin filters, reporting, and CSV exports honest —
// none of which normalise.

/**
 * Canonical stored form of a category: trimmed, collapsed whitespace, Title
 * Case. Returns null for empty input so the column stays nullable rather than
 * filling with empty strings.
 */
export function normalizeCategory(category: unknown): string | null {
  if (typeof category !== "string") return null;
  const trimmed = category.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Same treatment for a tags array, dropping blanks and duplicates. */
export function normalizeTags(tags: unknown): string[] | null {
  if (!Array.isArray(tags)) return null;
  const out: string[] = [];
  for (const t of tags) {
    const n = normalizeCategory(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.length ? out : null;
}
