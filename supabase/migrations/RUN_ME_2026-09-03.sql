-- Everything still outstanding, in one paste. Run in the Supabase dashboard
-- SQL editor (Database -> SQL Editor -> New query). Do NOT use
-- `supabase db push` on this project — its migration history is out of sync.
--
-- All of it is idempotent: running it twice changes nothing the second time.
-- Verified against live data on 2026-09-03 before writing:
--   • 0 discount titles exceed 26 characters, so the constraint applies cleanly
--   • 0 discounts are missing availability, so step 2 is already a no-op and is
--     kept only as a safety net for rows added later
--   • 6 vendors still carry lower-case categories ("restaurant" x5,
--     "coworking" x1), which is the one part doing real work


-- ── 1. Categories to Title Case ─────────────────────────────────────────────
-- The donor app already groups case-insensitively, so nothing is broken for
-- donors. This fixes the stored values, because admin filters, reporting
-- queries and CSV exports compare the raw string and none of them normalise —
-- so filtering vendors by "Restaurant" today misses five of them.
-- The API normalises on write now, so this is a one-off catch-up.

UPDATE vendors
   SET category = initcap(btrim(regexp_replace(category, '\s+', ' ', 'g')))
 WHERE category IS NOT NULL
   AND btrim(category) <> ''
   AND category <> initcap(btrim(regexp_replace(category, '\s+', ' ', 'g')));

UPDATE vendors
   SET category = NULL
 WHERE category IS NOT NULL AND btrim(category) = '';

UPDATE discounts
   SET category = initcap(btrim(regexp_replace(category, '\s+', ' ', 'g')))
 WHERE category IS NOT NULL
   AND btrim(category) <> ''
   AND category <> initcap(btrim(regexp_replace(category, '\s+', ' ', 'g')));

UPDATE discounts
   SET category = NULL
 WHERE category IS NOT NULL AND btrim(category) = '';


-- ── 2. Availability safety net ──────────────────────────────────────────────
-- Currently matches nothing; you set the last of these by hand in the panel.
-- Left in so a row created without availability still gets a sensible default
-- rather than rendering a card with no in-store/online pill.

UPDATE discounts
   SET availability = 'in-store'
 WHERE availability IS NULL OR btrim(availability) = '';


-- ── 3. Title length cap in the database ─────────────────────────────────────
-- Both API routes and all three forms already reject a longer title. This
-- closes the last gap: a direct PostgREST write or a hand-run UPDATE.
-- If it ever fails, a row is over the limit — shorten that title rather than
-- dropping the constraint.

ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_title_length_check;

ALTER TABLE discounts
  ADD CONSTRAINT discounts_title_length_check
  CHECK (char_length(btrim(title)) <= 26);


NOTIFY pgrst, 'reload schema';
