-- What actually happened at the end of the cancel sheet.
--
-- The sheet now offers a way out that is not a cancellation: a donor who picks
-- "I want to support a different charity" is shown that they can switch
-- without cancelling anything, and most of the reason they were leaving goes
-- away. When they take it, the membership continues.
--
-- Those rows still belong in this table. The donor opened the cancel sheet and
-- told us why, which is the thing worth counting, and a save is only
-- measurable next to the cancellations it came from. But they are not churn,
-- so they must not be counted as churn:
--
--   Cancellations:  WHERE outcome = 'cancelled'
--   Saves:          WHERE outcome = 'kept_changing_charity'
--
-- DEFAULT 'cancelled' is right for every row written before this column
-- existed, because until now the sheet had no other ending.
--
-- Safe to re-run. Apply in the Supabase dashboard SQL editor — do NOT run
-- `supabase db push` on this project.

ALTER TABLE membership_cancellation_feedback
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'cancelled';

COMMENT ON COLUMN membership_cancellation_feedback.outcome IS
  'How the cancel sheet ended: cancelled, or kept_changing_charity when the donor took the switch-charity offer instead. Churn reporting must filter on this.';

-- The split that matters: how many of each, over a window.
CREATE INDEX IF NOT EXISTS membership_cancellation_feedback_outcome_idx
  ON membership_cancellation_feedback (outcome, created_at DESC);

NOTIFY pgrst, 'reload schema';
