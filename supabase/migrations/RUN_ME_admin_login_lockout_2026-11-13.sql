-- Failed-login lockout for the admin panel.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor). Do not use
-- `supabase db push`: this project's migration history is out of sync with the
-- live database and a push would try to replay everything.
--
-- WHY
-- The admin API used to be gated by a shared secret sent as X-Admin-Secret.
-- The login endpoint sat behind that same check, so you needed the secret in
-- order to log in, which is why the secret had to be shipped to the browser —
-- and Create React App inlines REACT_APP_* into the bundle, so it was readable
-- by anyone who opened admin.forpurposetechnologies.com.
--
-- The login route is now reachable without the secret. That is the fix, but it
-- also means an admin password is now the only thing in front of donor data
-- and a guess costs an attacker nothing. These two columns put a price on it:
-- five failures locks the account for fifteen minutes.
--
-- SAFE TO RUN TWICE. Adding the columns is guarded, and the backfill only
-- touches rows that are still NULL.
--
-- The code works WITHOUT this migration: adminSettings.ts treats missing
-- columns as "lockout disabled" rather than failing the login, because locking
-- every admin out of the panel is a worse failure than a missing lockout. So
-- login keeps working either way; running this is what switches the lockout on.

ALTER TABLE public.admin_team_members
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.admin_team_members
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Existing rows predate the default.
UPDATE public.admin_team_members
SET failed_login_attempts = 0
WHERE failed_login_attempts IS NULL;

COMMENT ON COLUMN public.admin_team_members.failed_login_attempts IS
  'Consecutive failed sign-ins. Reset to 0 on success. 5 triggers locked_until.';
COMMENT ON COLUMN public.admin_team_members.locked_until IS
  'Sign-in refused until this time. NULL means not locked.';

-- Confirm. Expect both columns listed.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'admin_team_members'
  AND column_name IN ('failed_login_attempts', 'locked_until')
ORDER BY column_name;

-- Who would be locked right now (expect none immediately after running).
SELECT id, name, email, role, status,
       failed_login_attempts, locked_until
FROM public.admin_team_members
WHERE locked_until IS NOT NULL OR failed_login_attempts > 0
ORDER BY id;

NOTIFY pgrst, 'reload schema';
