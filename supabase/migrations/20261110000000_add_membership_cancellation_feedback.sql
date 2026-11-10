-- Why a donor cancelled their monthly membership.
--
-- The app asks for a reason in the cancel sheet. Until now that moment left no
-- trace: the subscription flipped to "cancelling" and the reason, if the donor
-- had one, went nowhere. The existing /feedback route does not help, because it
-- only emails and never stores, so there is nothing to count or trend.
--
-- One row per cancellation, not per donor: a donor can cancel, resume and
-- cancel again, and each of those is a separate thing to learn from.
--
-- Safe to re-run. Apply in the Supabase dashboard SQL editor — do NOT run
-- `supabase db push` on this project.

CREATE TABLE IF NOT EXISTS membership_cancellation_feedback (
  id                     BIGSERIAL PRIMARY KEY,

  -- SET NULL, not CASCADE and not RESTRICT. The aggregate is the point, so a
  -- deleted donor should leave their reason behind rather than take it with
  -- them, and this must not become one more thing blocking the panel's Delete
  -- Donor button the way the four money tables already do.
  user_id                INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- Which subscription this was about. Kept loosely: the row is evidence about
  -- a past moment, so it outlives the donation row it came from.
  monthly_donation_id    INTEGER,
  stripe_subscription_id TEXT,

  -- One of the option ids in CANCELLATION_REASONS in
  -- app/(tabs)/menu/donationSummary.js. Deliberately not a CHECK constraint:
  -- adding an option to that list would then start failing in production the
  -- moment the build shipped, before anyone ran a migration. An unrecognised
  -- code showing up in a report is the cheaper failure.
  reason_code            TEXT NOT NULL,

  -- What they typed, if anything. Always optional in the app.
  details                TEXT,

  -- Snapshots, so a cancellation can still be read years later even if the
  -- donation row, the amount or the charity have all moved on since.
  monthly_amount         NUMERIC(10, 2),
  charity_id             INTEGER REFERENCES charities(id) ON DELETE SET NULL,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The report: what are people saying, most recent first.
CREATE INDEX IF NOT EXISTS membership_cancellation_feedback_created_idx
  ON membership_cancellation_feedback (created_at DESC);

-- The count: how many of each reason, over a window.
CREATE INDEX IF NOT EXISTS membership_cancellation_feedback_reason_idx
  ON membership_cancellation_feedback (reason_code, created_at DESC);

COMMENT ON TABLE membership_cancellation_feedback IS
  'One row per monthly membership cancellation: the reason the donor picked and anything they typed. Written by POST /donations/monthly/cancellation-feedback after the cancellation itself succeeds.';

-- Writes go through the Edge Function with the service role, which bypasses
-- RLS. Enabling it anyway so that if the anon key is ever pointed at this
-- table directly, the default-deny applies rather than every donor's parting
-- words being readable by anyone holding a public key.
ALTER TABLE membership_cancellation_feedback ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
