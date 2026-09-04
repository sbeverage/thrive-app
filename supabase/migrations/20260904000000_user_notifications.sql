-- Donor notification centre.
--
-- Until now a push notification was the ONLY record that anything happened.
-- If the donor had no token registered, had notifications denied, or simply
-- swiped the banner away, the event was gone — there was nowhere in the app
-- to go and look. admin_notifications already does this job for the admin
-- panel; this is the donor-side equivalent.
--
-- Every donor-facing notification now writes a row here first and sends the
-- push second, so the feed is correct even when delivery isn't. push_sent and
-- push_error record what actually happened to the push, which is the thing
-- that was previously being guessed at.
--
-- dedupe_key exists because the callers are not all idempotent. The Stripe
-- webhook that fires donation_success can be redelivered, and a vendor can
-- re-save the same discount; without a key each retry appends another
-- identical row to the donor's feed. Uniqueness is scoped (user_id,
-- dedupe_key) rather than global — the same lesson as
-- transactions_reference_scope_uidx in 20260901000001: two different
-- notification kinds number independently and must not collide. A null key
-- means "no dedupe", and the partial index lets unlimited nulls coexist.
--
-- Safe to re-run. Apply in the Supabase dashboard SQL editor — do NOT run
-- `supabase db push` on this project.

CREATE TABLE IF NOT EXISTS user_notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Matches the `type` already carried in each push's data payload:
  -- payment_failed, payment_paused, donation_success,
  -- favorite_new_discount, charity_approved, charity_rejected.
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  -- The push data payload verbatim, including `path` for deep linking, so
  -- tapping a row in the feed lands exactly where tapping the push would.
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  push_sent   BOOLEAN NOT NULL DEFAULT false,
  push_error  TEXT,
  dedupe_key  TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The feed query: one user's rows, newest first.
CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON user_notifications (user_id, created_at DESC);

-- The badge count. Partial, because unread is a small slice of the table and
-- this runs on every app foreground.
CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
  ON user_notifications (user_id)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_uidx
  ON user_notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Reads go through the Edge Function with the service role, which bypasses
-- RLS. Enabling it anyway so that if the anon key is ever pointed at this
-- table directly, the default-deny applies rather than the whole table being
-- readable — a donor's feed names their charity and their payment problems.
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
