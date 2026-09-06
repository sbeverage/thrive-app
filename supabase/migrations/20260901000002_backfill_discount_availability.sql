-- Give every existing discount a redemption context, and cap title length.
--
-- The donor's discount card now shows an availability pill on the coupon band
-- so people know whether a trip is involved before they set out. The pill only
-- renders when availability is set, and 4 of the 14 discounts predate the
-- column, so their cards would show nothing at all.
--
-- in-store is the safe default: it is what every vendor on the platform was
-- when these rows were written, and being wrong in this direction sends a donor
-- to a shop that honours the offer. Defaulting to online or both would send
-- them to a website that doesn't.
--
-- Vendors and admins can change it per discount in either portal. Anything set
-- explicitly is left alone.
--
-- Safe to re-run. Apply in the Supabase dashboard SQL editor — do NOT run
-- `supabase db push` on this project.

UPDATE discounts
   SET availability = 'in-store'
 WHERE availability IS NULL
    OR btrim(availability) = '';

NOTIFY pgrst, 'reload schema';

-- Cap the title at what the coupon band can show on one line.
--
-- The band renders the title at 18pt bold and shares that line with the
-- availability pill, so 26 characters is the working limit. The app, both
-- portals, and both API routes already enforce it; this closes the last gap —
-- a direct PostgREST write or a hand-run UPDATE.
--
-- Two titles exceeded 26 characters when the cap was first set, and both were
-- resolved before this file was applied:
--
--     32  "Free Signature Tapas with Dinner"  (Fogón and Lions)   — sample,
--         deleted by Stephanie on 2026-09-02
--     29  "10% off any service or retail"     (PetSuites Roswell) — trimmed to
--         "10% off service or retail" (25) via the admin API, full record
--         re-sent so no other field was nulled
--
-- Every remaining title is under the cap, so ADD CONSTRAINT applies cleanly.
-- If it ever does fail, a row is over the limit — shorten that title rather
-- than dropping the constraint. The admin form demands it on save.
--
-- To find any offenders yourself:
--
--     SELECT id, title, char_length(btrim(title)) AS len
--       FROM discounts
--      WHERE char_length(btrim(title)) > 26
--      ORDER BY len DESC;
--
-- To change the limit later, update it in five places or they will disagree:
--   app/utils/discountDisplay.js                           TITLE_MAX
--   supabase/functions/api/routes/adminDiscounts.ts         TITLE_MAX
--   supabase/functions/api/routes/vendorPortal.ts           TITLE_MAX
--   ti-admin-panel  src/components/DiscountCardPreview.tsx  TITLE_MAX
--   vendor portal   src/components/DiscountCardPreview.tsx  TITLE_MAX

ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_title_length_check;

ALTER TABLE discounts
  ADD CONSTRAINT discounts_title_length_check
  CHECK (char_length(btrim(title)) <= 26);

NOTIFY pgrst, 'reload schema';
