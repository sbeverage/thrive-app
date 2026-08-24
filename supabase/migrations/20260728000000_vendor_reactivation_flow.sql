-- Vendor deactivate → request-reactivation → admin-approve loop.
--
-- Existing state:
--   vendors.is_active         BOOLEAN — controls whether the donor app sees
--                             the vendor and its discounts
--   vendors.signup_status     TEXT   — first-time signup lifecycle
--                             (pending / approved / rejected)
--
-- New:
--   vendors.deactivated_at    TIMESTAMPTZ — stamped when is_active flips false
--   vendors.deactivation_reason TEXT — optional admin note surfaced to the vendor
--   vendors.reactivation_requested_at TIMESTAMPTZ — vendor asked to come back
--   vendors.reactivation_message TEXT — optional "here's what changed" note
--
-- A vendor with `is_active = false AND reactivation_requested_at IS NOT NULL`
-- is queued for admin review on the Pending Approvals page as a
-- "Reactivation Request" (separate from first-time signup approvals which
-- still key on `signup_status = 'pending' AND submitted_at IS NOT NULL`).

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reactivation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactivation_message TEXT;

-- Speeds up the "reactivation requests queued for admin" query.
CREATE INDEX IF NOT EXISTS idx_vendors_pending_reactivation
  ON vendors (reactivation_requested_at DESC)
  WHERE is_active = false AND reactivation_requested_at IS NOT NULL;
