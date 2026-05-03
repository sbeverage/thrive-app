/**
 * Extract an https URL from a React Native Image source or string (for router params).
 * Returns '' for local require() sources or invalid values.
 */
export function resolveRemoteImageUri(source) {
  if (source == null || source === "") return "";
  if (typeof source === "string") {
    const s = source.trim();
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "";
  }
  if (typeof source === "object" && typeof source.uri === "string") {
    const s = source.uri.trim();
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
  }
  return "";
}
