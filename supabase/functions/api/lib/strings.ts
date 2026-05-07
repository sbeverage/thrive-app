/** First letter uppercase, remainder lowercase — for display-normalized names. */
export function capitalizeName(name: string | null | undefined): string | null {
  if (!name || typeof name !== "string") {
    return null;
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
