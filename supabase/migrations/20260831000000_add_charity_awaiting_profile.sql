-- Approved-but-incomplete charities.
--
-- Approving a donor-suggested charity used to set is_active = true immediately,
-- so donors could find a profile with no image, no real description, and
-- `type = 'Pending'` still on it. Approval now releases the donor's held giving
-- but leaves the charity hidden until an admin completes the profile.
--
-- Why this needs its own column rather than being inferred: the admin
-- "delete" is a SOFT delete (adminCharities.ts sets is_active = false), so
-- "is_active = false AND approved" also describes every deleted charity.
-- Inferring from that would silently republish a deleted charity the moment
-- someone edited it. This flag is set only by the approvals queue, so nothing
-- else can be brought back to life by accident.
--
-- Idempotent, no DROP/DELETE/UPDATE. Apply in the Supabase dashboard SQL
-- editor — never `supabase db push` on this project.

ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS awaiting_profile_completion BOOLEAN NOT NULL DEFAULT false;

-- Partial index: only a handful of rows are ever waiting, and the admin queue
-- filters on exactly this.
CREATE INDEX IF NOT EXISTS idx_charities_awaiting_profile
  ON charities (awaiting_profile_completion)
  WHERE awaiting_profile_completion = true;

NOTIFY pgrst, 'reload schema';
