-- The Savory Gourmet Market (vendor 44) has no coordinates.
--
-- It registered through the vendor portal, and until 7c5f354 only the admin
-- path geocoded an address, so the portal wrote the address straight to the
-- column and left latitude/longitude at 0. 0,0 is in the Gulf of Guinea, so
-- the app reads it as unset and falls back to geocoding on the device. That
-- fallback is what this removes: it makes the pin depend on each phone's own
-- lookup, timing and rate limit, and a failed lookup drops the vendor off the
-- map entirely. It also leaves the vendor out of the nearby-reminder
-- geofences, which are built from stored coordinates only.
--
-- The code bug is already fixed. Every path that writes vendors.address now
-- goes through lib/vendorGeocode.ts, deployed in api v588. This is the one
-- row that predates the fix. Resaving the vendor in the admin panel would do
-- the same thing; this does it without touching the rest of the record.
--
-- Coordinates came from the same query the function would run:
--   "50 Canton Street, Alpharetta, GA" -> Nominatim
--   -> 34.076285, -84.2972377
--   -> "Teasley Place, 50, Canton Street, Alpharetta, Fulton County, GA 30009"
-- Cross-checked: Kale Me Crazy is at 50 Canton Street, Suite 101 and already
-- holds exactly these coordinates. Same building, same pin, as expected.
--
-- Safe to run more than once. The WHERE clause claims the row only while it
-- is still unset AND the street is still the one these coordinates came from,
-- so a second run reports 0 rows and a later address correction is never
-- stamped with a stale pin.

UPDATE vendors
SET address = jsonb_set(
                jsonb_set(
                  address,
                  '{latitude}',
                  to_jsonb(34.076285::double precision),
                  true
                ),
                '{longitude}',
                to_jsonb(-84.2972377::double precision),
                true
              )
WHERE id = 44
  AND address->>'street' = '50 Canton Street'
  AND COALESCE(NULLIF(address->>'latitude', '')::double precision, 0) = 0
  AND COALESCE(NULLIF(address->>'longitude', '')::double precision, 0) = 0;

-- Confirm. Expect one row, with the coordinates above.
SELECT id,
       name,
       address->>'street'    AS street,
       address->>'latitude'  AS latitude,
       address->>'longitude' AS longitude
FROM vendors
WHERE id = 44;
