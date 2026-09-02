-- Collapse case-variant vendor categories into one canonical form.
--
-- Category is free text, so the same category was stored in whatever case it
-- was typed. As of 2026-09-02 the vendors table held:
--
--     5  "restaurant"
--     3  "Restaurant"
--     1  "Entertainment"
--     1  "Other"
--     1  "Wellness"
--     1  "coworking"
--
-- The donor app keyed its category chips off the raw string, so "Restaurant"
-- and "restaurant" rendered as two chips with the eight restaurants split
-- three/five between them.
--
-- The app now groups case-insensitively, so display is correct regardless of
-- what is stored. This still normalises the stored values because admin
-- filters, reporting queries, and CSV exports compare the raw string and none
-- of them normalise. The API also normalises on write now
-- (supabase/functions/api/lib/categories.ts), so this is a one-off catch-up
-- rather than a recurring cleanup.
--
-- Title Case is the target: it matches the majority of existing values
-- (Entertainment, Other, Wellness) and is what the app displays.
--
-- Safe to re-run. Apply in the Supabase dashboard SQL editor — do NOT run
-- `supabase db push` on this project.

UPDATE vendors
   SET category = initcap(btrim(regexp_replace(category, '\s+', ' ', 'g')))
 WHERE category IS NOT NULL
   AND btrim(category) <> ''
   AND category <> initcap(btrim(regexp_replace(category, '\s+', ' ', 'g')));

-- Blank strings are not a category; leave the column genuinely empty instead.
UPDATE vendors
   SET category = NULL
 WHERE category IS NOT NULL
   AND btrim(category) = '';

-- Same treatment for the discounts table, which carries its own category
-- column used by the discount filters.
UPDATE discounts
   SET category = initcap(btrim(regexp_replace(category, '\s+', ' ', 'g')))
 WHERE category IS NOT NULL
   AND btrim(category) <> ''
   AND category <> initcap(btrim(regexp_replace(category, '\s+', ' ', 'g')));

UPDATE discounts
   SET category = NULL
 WHERE category IS NOT NULL
   AND btrim(category) = '';

NOTIFY pgrst, 'reload schema';
