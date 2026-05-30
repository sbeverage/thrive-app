-- Vendor Portal: self-serve vendor signup + approval workflow + engagement tracking.
--
-- Adds the columns the admin Pending Approvals page already expects (status,
-- rejection reason, etc.) plus the tracking tables that power the vendor
-- dashboard stats (views, favorites, discount-code rotation history).
--
-- Existing vendor rows (legacy admin-created) are backfilled to `approved`
-- so they keep appearing in the donor app the moment the public `/vendors`
-- endpoint starts filtering on signup_status.

-- ============================================================================
-- 1. Extend vendors with signup/approval columns
-- ============================================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS auth_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signup_status VARCHAR(20)
    CHECK (signup_status IN ('pending', 'approved', 'rejected'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

-- One auth user = one vendor (v1 constraint; can be loosened later for teams).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_vendors_auth_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_vendors_auth_user_id_unique
      ON vendors(auth_user_id)
      WHERE auth_user_id IS NOT NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_vendors_signup_status ON vendors(signup_status);
CREATE INDEX IF NOT EXISTS idx_vendors_submitted_at ON vendors(submitted_at);

-- Backfill: every vendor that pre-existed this migration is treated as already
-- approved (otherwise they'd vanish from the donor app once `/vendors` filters
-- by status). Also stamp approved_at so admin views show something sensible.
UPDATE vendors
SET signup_status = 'approved',
    approved_at = COALESCE(approved_at, created_at)
WHERE signup_status IS NULL OR signup_status = 'pending';

-- ============================================================================
-- 2. vendor_views — every time a donor opens a vendor profile in the app
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_views (
  id            SERIAL PRIMARY KEY,
  vendor_id     INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  viewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  viewed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendor_views_vendor_id ON vendor_views(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_views_viewed_at ON vendor_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_vendor_views_vendor_viewed_at
  ON vendor_views(vendor_id, viewed_at DESC);

-- ============================================================================
-- 3. vendor_favorites — donor-side "save / heart" for a vendor
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_favorites (
  id          SERIAL PRIMARY KEY,
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vendor_favorites_unique UNIQUE (vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_favorites_vendor_id ON vendor_favorites(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_favorites_user_id ON vendor_favorites(user_id);

-- ============================================================================
-- 4. discount_code_history — audit trail for the monthly rotation feature
-- ============================================================================

CREATE TABLE IF NOT EXISTS discount_code_history (
  id          SERIAL PRIMARY KEY,
  discount_id INTEGER NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  old_code    VARCHAR(50),
  new_code    VARCHAR(50) NOT NULL,
  rotated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rotated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discount_code_history_discount_id
  ON discount_code_history(discount_id);

-- ============================================================================
-- 5. Re-stamp updated_at on vendor changes (existing trigger pattern)
-- ============================================================================

-- The legacy update_updated_at_column() trigger already runs on vendor updates,
-- so no new trigger is needed here.
