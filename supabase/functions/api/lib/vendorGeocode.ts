import { geocodeAddress } from "./geocoding.ts";

/**
 * Fill in an address's coordinates before it is stored.
 *
 * Vendors were saved with latitude/longitude of 0, which the app reads as
 * "unset" and works around by geocoding on the device. That made the map
 * device-dependent: each phone resolved the coordinates itself, subject to its
 * own timing, cache and rate limits, so clusters split in different places and
 * a vendor could vanish when a lookup failed. Resolving once, here, makes every
 * device agree.
 *
 * Nominatim gives up on a suite or unit number, so the street is retried
 * without one. Returns the address unchanged when nothing resolves — a wrong
 * pin is worse than the app's existing fallback.
 *
 * Shared, not admin-only, because it was admin-only and that was the bug.
 * A vendor who filled in their own address through the portal was written
 * straight to the column with no coordinates at all, which is how The
 * Savory Gourmet Market ended up with a perfectly geocodable address and
 * an empty latitude. Every path that writes vendors.address goes through
 * here.
 */
export async function withGeocodedAddress(address: any, previous?: any): Promise<any> {
  if (!address || typeof address !== "object") return address;

  const lat = Number(address.latitude);
  const lng = Number(address.longitude);
  const hasCoords =
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

  // Existing coordinates are only trustworthy while the address they were
  // derived from is unchanged. Keeping them across an edit is how a corrected
  // street keeps its old pin — Warm Waves Coffee sat on South Main for exactly
  // that reason when it is actually on North Main, 1.5km away.
  const key = (a: any) =>
    ["street", "city", "state", "zipCode"]
      .map((k) => String(a?.[k] ?? "").trim().toLowerCase())
      .join("|");
  const addressChanged = previous ? key(address) !== key(previous) : false;

  // 0/0 is the Gulf of Guinea, not Georgia — treat it as unset.
  if (hasCoords && !addressChanged) {
    return address;
  }

  const clean = (x: any) => (typeof x === "string" ? x.trim() : "");
  const junk = /^(location not specified|n\/a|none|tbd|unknown)$/i;
  const street = clean(address.street);
  const city = junk.test(clean(address.city)) ? "" : clean(address.city);
  const state = clean(address.state);
  const zip = junk.test(clean(address.zipCode)) ? "" : clean(address.zipCode);
  const streetNoUnit = street
    .replace(/[,]?\s*(suite|ste\.?|unit|apt\.?|#)\s*[\w-]+\s*$/i, "")
    .trim();

  const candidates = Array.from(
    new Set(
      [
        [street, city, state, zip],
        [streetNoUnit, city, state, zip],
        [streetNoUnit, city, state],
      ]
        .map((parts) => parts.filter(Boolean).join(", "))
        .filter((q) => q.length > 0),
    ),
  );

  for (const candidate of candidates) {
    try {
      const geo = await geocodeAddress(candidate);
      if (geo.latitude != null && geo.longitude != null) {
        return { ...address, latitude: geo.latitude, longitude: geo.longitude };
      }
    } catch (e) {
      console.warn("vendor geocode failed for", candidate, e);
    }
  }
  console.warn("could not geocode vendor address:", candidates.join(" | "));
  return address;
}
