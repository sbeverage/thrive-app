-- "Team" membership: comped internal accounts used to exercise the app
-- (mainly vendor discounts) without a monthly donation.
--
-- Team is a third value of users.invite_type, alongside 'standard' and
-- 'coworking'. Both team and coworking are *comped*: the donor never sets up
-- a Stripe subscription, so external_billed is true and sponsor_amount stays
-- 0 for team (coworking carries the sponsor's per-seat amount).
--
-- Why the columns are (re)declared here: the original coworking migration was
-- never committed to this repo — the Edge Function referenced
-- 20260125000000_add_coworking_invite_fields.sql in a fallback warning, but no
-- such file exists, and adminDonors.ts still carries a retry path for when the
-- columns are missing. invite_type is null for all 24 existing donors, so the
-- coworking path has never actually run in production. Declaring them here
-- with IF NOT EXISTS makes the schema explicit and is a no-op if they are
-- already present.
--
-- Every statement is idempotent and there is no DROP/DELETE/UPDATE, so this is
-- safe to run repeatedly. Apply it in the Supabase dashboard SQL editor — do
-- NOT run `supabase db push` on this project, the migration history disagrees
-- with the real schema and a push would re-run a DROP COLUMN.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS coworking BOOLEAN DEFAULT false;

-- 'standard' | 'coworking' | 'team'. Left nullable and without a CHECK on
-- purpose: existing rows are null and a constraint would reject them, and the
-- Edge Function already treats null as 'standard'.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invite_type TEXT;

-- Coworking seats carry the amount the space pays per member. Team accounts
-- leave this at 0 — nobody is billed for them.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sponsor_amount NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sponsor_source TEXT;

-- True when the donation is settled outside Stripe (coworking) or not billed
-- at all (team). The signup flow reads this to skip the payment step, and
-- /auth/login treats it as "onboarding already complete".
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS external_billed BOOLEAN DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS extra_donation_amount NUMERIC(10, 2) DEFAULT 0;

-- Analytics filters donor counts and pledged monthly totals by invite_type, so
-- this stays selective enough to matter as the team grows.
CREATE INDEX IF NOT EXISTS idx_users_invite_type
  ON users (invite_type)
  WHERE invite_type IS NOT NULL;

-- Make the columns visible to the Edge Functions immediately.
NOTIFY pgrst, 'reload schema';
