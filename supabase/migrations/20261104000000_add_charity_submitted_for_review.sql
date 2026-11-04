-- Draft vs submitted, for a charity that registered itself in the portal.
--
-- /charity/signup set is_pending_verification = true on insert, and the admin
-- approvals queue filters on exactly that flag. So a charity landed in the
-- review queue the instant the account was created, before it had a logo, a
-- cover, a highlight or a second thought. Reviewing those is reviewing a form
-- submission, not a profile.
--
-- The portal now holds a new charity as a draft and puts it in the queue only
-- when they press "Submit for review".
--
-- NULL means "never submitted". Every row that already exists predates the
-- draft idea and is either live, pending or rejected, so they are all
-- backfilled as submitted. After this migration NULL identifies exactly the
-- new portal drafts and nothing else, which is what lets the admin "rejected"
-- bucket keep using its verification_status = false test without sweeping
-- drafts in alongside genuinely rejected charities.
--
-- Idempotent: safe to run more than once.

ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ;

-- suggested_at is set by the donor-suggest flow; NOW() covers the 51 charities
-- that predate both flows. Only rows still NULL are touched, so a second run
-- is a no-op rather than a mass re-stamp.
UPDATE charities
   SET submitted_for_review_at = COALESCE(suggested_at, NOW())
 WHERE submitted_for_review_at IS NULL;

COMMENT ON COLUMN charities.submitted_for_review_at IS
  'When the charity pressed Submit for review in the portal. NULL means it is still a draft and is not in the admin approvals queue.';
