-- Where a charity is independently vetted.
--
-- Required before a charity can submit its profile for review: either a
-- Charity Navigator page, or links from two of the other ratings bodies we
-- accept (Candid/GuideStar, BBB Wise Giving Alliance, CharityWatch). The rule
-- and the accepted hosts live in
--   supabase/functions/api/routes/charityPortal.ts  (VETTING_SITES)
-- which is what actually enforces it.
--
-- Charity Navigator alone is enough because it is the strongest single
-- source; without one, two independent sites standing behind the same
-- organisation is the substitute. Two links to the SAME site do not count,
-- which is why the check counts distinct hosts rather than URLs.
--
-- Existing charities are not backfilled and are not blocked: the requirement
-- is enforced at submission, and a charity that is already live never
-- submits again. One that gets rejected will have to add links before it can
-- come back, which is the intended behaviour.
--
-- Idempotent: safe to run more than once.

ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS vetting_links TEXT[] DEFAULT '{}';

COMMENT ON COLUMN charities.vetting_links IS
  'Links to independent vetting pages (Charity Navigator, Candid/GuideStar, give.org, CharityWatch). Required to submit a profile for review; see VETTING_SITES in charityPortal.ts.';
