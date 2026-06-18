-- THRIVE Initiative as a charity + held-funds tracking.
--
-- Two new donor signup paths:
--   1) "Help THRIVE grow" — donor picks THRIVE as their cause (regular donation)
--   2) "Save my spot"     — donor donates to THRIVE while undecided; flag tracks
--                           the intent so later they can redirect to a real cause
--
-- Legally THRIVE Initiative is a 501(c)(3) so both paths are tax-deductible
-- gifts to THRIVE. The flag exists for UX (nudge to pick) and accounting
-- (release prior held gifts to the donor's eventual chosen cause).

-- 1. Mark which charity row is THRIVE Initiative itself (used to filter it out
--    of the regular cause list and to identify it for the signup CTAs).
ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS is_thrive BOOLEAN DEFAULT FALSE;

-- Single-row uniqueness (only one THRIVE row per project).
CREATE UNIQUE INDEX IF NOT EXISTS idx_charities_is_thrive_single
  ON charities(is_thrive) WHERE is_thrive = TRUE;

-- 2. Insert the THRIVE Initiative charity row if it doesn't already exist.
--    Looks for either an existing row flagged is_thrive=true or the literal
--    name 'THRIVE Initiative' to avoid duplicating across re-runs.
INSERT INTO charities (
  name, category, type, description, about,
  ein, website, is_active, is_thrive,
  created_at, updated_at
)
SELECT
  'THRIVE Initiative',
  'Community',
  'Platform',
  'Support the THRIVE platform itself — every dollar helps us reach more donors, partner with more local businesses, and bring monthly giving to new cities.',
  'THRIVE Initiative is a registered 501(c)(3) nonprofit (EIN 81-3223950) building tools that make charitable giving a simple monthly habit. When you donate to THRIVE Initiative, you help us grow the platform and onboard more partner charities, vendors, and donors.',
  '81-3223950',
  'https://thriveinitiative.org',
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM charities WHERE is_thrive = TRUE OR name = 'THRIVE Initiative'
);

-- Backstop: if a row named 'THRIVE Initiative' already existed (created
-- manually at some point), make sure it's flagged.
UPDATE charities SET is_thrive = TRUE WHERE name = 'THRIVE Initiative' AND is_thrive IS NOT TRUE;

-- 3. monthly_donations flag — distinguishes "Save my spot" subscribers from
--    plain THRIVE supporters. Tagged at create/update on the subscription.
ALTER TABLE monthly_donations
  ADD COLUMN IF NOT EXISTS held_for_donor_choice BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_monthly_donations_held_user
  ON monthly_donations(user_id) WHERE held_for_donor_choice = TRUE;

-- 4. transactions flag + release tracking. Each successful charge inherits
--    the subscription's held flag; the release flow later sets released_at
--    and released_to_charity_id when the donor picks a real cause.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS held_for_donor_choice BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS released_to_charity_id INTEGER REFERENCES charities(id) ON DELETE SET NULL;

-- Fast lookup for "all unreleased held transactions for this donor" — used
-- in the release flow when they switch from THRIVE to a real charity.
CREATE INDEX IF NOT EXISTS idx_transactions_held_unreleased
  ON transactions(user_id)
  WHERE held_for_donor_choice = TRUE AND released_at IS NULL;
