// Distance-based marker clustering, shared by the vendor and beneficiary maps.
//
// THRIVE vendors are frequently concentrated in a single downtown block, so
// clustering reacts to zoom rather than to a fixed real-world distance: the
// overlap threshold is derived from the visible region, so pins merge only
// while they would collide on screen and split as the donor zooms in.
//
// Pure functions, no dependencies — deliberately hand-rolled so the map does
// not pull in another package.

// Pins merge only while they would physically overlap on screen. A pin is
// 36pt wide, so grouping within ~48pt reads as "these are on top of each
// other" and anything further apart gets its own pin — the Apple Maps
// behaviour, where zooming keeps splitting groups until you are looking at
// individual buildings.
const CLUSTER_RADIUS_PT = 48;

// Assumed viewport width when a caller doesn't pass one (iPhone-ish).
const FALLBACK_SCREEN_PT = 390;

// Tiny floor purely to keep the math finite at absurd zoom levels.
const MIN_CELL_DEG = 1e-7;

// Two records closer together than this are treated as the same address
// (roughly 9 metres). Zooming can never separate them, so the map lists them
// instead of pretending they sit in different places.
const CO_LOCATED_EPSILON = 0.00008;

const num = (value) => {
  // Number(null) and Number('') are both 0, which would silently drop vendors
  // onto the equator instead of excluding them. Reject empties explicitly.
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Group vendors into clusters for the current region.
 * Returns entries of { id, latitude, longitude, count, vendors }.
 * A count of 1 is a single vendor pin; higher counts render as a cluster.
 */
export function clusterVendors(vendors, region, screenWidthPt = FALLBACK_SCREEN_PT) {
  if (!region || !Array.isArray(vendors) || vendors.length === 0) return [];

  const latDelta = region.latitudeDelta || 0.05;
  const lngDelta = region.longitudeDelta || 0.05;
  // Overlap threshold expressed as a fraction of the viewport, so the test is
  // "would these two pins collide on screen" at any zoom level.
  const threshold = CLUSTER_RADIUS_PT / (screenWidthPt || FALLBACK_SCREEN_PT);

  // Sorted so grouping is deterministic — otherwise membership could shift
  // between renders and markers would churn for no reason.
  const points = vendors
    .map((vendor) => ({
      vendor,
      lat: num(vendor.latitude),
      lng: num(vendor.longitude),
    }))
    // Vendors without real coordinates are skipped rather than piled onto a
    // default point, which is what made the old map look like one big stack.
    .filter((p) => p.lat !== null && p.lng !== null)
    .sort((a, b) => a.lat - b.lat || a.lng - b.lng);

  // Greedy nearest-neighbour grouping. Distance-based rather than grid-based:
  // a grid splits tight groups along arbitrary cell borders, which made
  // clusters appear to *merge* as you zoomed in.
  const remaining = [...points];
  const clusters = [];

  while (remaining.length > 0) {
    const seed = remaining.shift();
    const members = [seed];

    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const dLat = Math.abs(remaining[i].lat - seed.lat) / Math.max(latDelta, MIN_CELL_DEG);
      const dLng = Math.abs(remaining[i].lng - seed.lng) / Math.max(lngDelta, MIN_CELL_DEG);
      if (Math.sqrt(dLat * dLat + dLng * dLng) <= threshold) {
        members.push(remaining.splice(i, 1)[0]);
      }
    }

    const memberVendors = members.map((p) => p.vendor);
    if (memberVendors.length === 1) {
      clusters.push({
        id: `vendor-${memberVendors[0].id}`,
        latitude: seed.lat,
        longitude: seed.lng,
        count: 1,
        vendors: memberVendors,
      });
      continue;
    }

    const latSum = members.reduce((acc, p) => acc + p.lat, 0);
    const lngSum = members.reduce((acc, p) => acc + p.lng, 0);
    clusters.push({
      // Identity follows membership, not position, so the same set of vendors
      // keeps the same marker across small camera moves.
      id: `cluster-${memberVendors.map((v) => v.id).sort().join('-')}`,
      latitude: latSum / members.length,
      longitude: lngSum / members.length,
      count: members.length,
      vendors: memberVendors,
    });
  }

  return clusters;
}

/** True when every member sits at effectively the same coordinate. */
export function isCoLocated(cluster) {
  if (!cluster || cluster.count < 2) return false;
  const lats = cluster.vendors.map((v) => num(v.latitude)).filter((v) => v !== null);
  const lngs = cluster.vendors.map((v) => num(v.longitude)).filter((v) => v !== null);
  if (lats.length === 0) return false;
  return (
    Math.max(...lats) - Math.min(...lats) < CO_LOCATED_EPSILON &&
    Math.max(...lngs) - Math.min(...lngs) < CO_LOCATED_EPSILON
  );
}

/**
 * Region that frames a cluster's members, with padding so pins aren't flush
 * against the edges. Used to zoom in when a cluster is tapped.
 */
export function regionForCluster(cluster, currentRegion = null) {
  const lats = cluster.vendors.map((v) => num(v.latitude)).filter((v) => v !== null);
  const lngs = cluster.vendors.map((v) => num(v.longitude)).filter((v) => v !== null);
  if (lats.length === 0) return null;

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const FLOOR = 0.0008;
  let latitudeDelta = Math.max((maxLat - minLat) * 2.2, FLOOR);
  let longitudeDelta = Math.max((maxLng - minLng) * 2.2, FLOOR);

  // Tapping a cluster must never zoom *out*. The old fixed floor did exactly
  // that once you were already zoomed past it, which felt like the tap was
  // fighting you.
  if (currentRegion?.latitudeDelta) {
    latitudeDelta = Math.min(latitudeDelta, currentRegion.latitudeDelta);
    longitudeDelta = Math.min(
      longitudeDelta,
      currentRegion.longitudeDelta || currentRegion.latitudeDelta,
    );
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

/**
 * Human-readable label for the address a co-located cluster shares, e.g.
 * "19 Academy Street" or, with no street on file, "Alpharetta, GA".
 */
export function sharedAddressLabel(cluster) {
  const first = cluster?.vendors?.[0];
  const street = first?.vendor?.address?.street;
  if (street && String(street).trim()) return String(street).trim();
  return first?.location || 'this location';
}
