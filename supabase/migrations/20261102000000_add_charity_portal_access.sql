-- Charity Portal: let a charity sign in and manage its own profile.
--
-- Two ways someone ends up with access, and they are deliberately not the
-- same thing:
--
--   signup  they registered a charity that was not in our catalogue. Nobody
--           else can be impersonated, because the row did not exist a moment
--           ago, so the link is made immediately. What still needs an admin
--           is whether the charity itself goes live to donors, which is the
--           existing verification_status / approvals flow.
--
--   claim   the charity is already one of the ~52 in the catalogue and
--           someone says they work there. The link is NOT made until an admin
--           approves it, because the thing being handed over is an existing
--           public profile that donors already see.
--
-- Both are rows in charity_access_requests, so the admin queue, the audit
-- trail and the portal's "where am I up to" screen are one mechanism rather
-- than two.
--
-- Note on blast radius: charities carries no banking, payout or Stripe
-- columns. Access grants control of the public profile only, which is why
-- this is email and domain evidence rather than document uploads.

-- ============================================================================
-- 1. Who owns a charity profile
-- ============================================================================

ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS auth_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN charities.auth_user_id IS
  'The user who manages this charity in the charity portal. Set at signup, or on approval of a claim. One user manages one charity in v1.';

-- One user manages one charity for now. Partial so the ~52 existing rows,
-- which have no owner, do not collide with each other on NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_charities_auth_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_charities_auth_user_id_unique
      ON charities(auth_user_id)
      WHERE auth_user_id IS NOT NULL;
  END IF;
END$$;

-- ============================================================================
-- 2. Requests for access
-- ============================================================================

CREATE TABLE IF NOT EXISTS charity_access_requests (
  id                 SERIAL PRIMARY KEY,
  charity_id         INTEGER NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 'signup' links immediately; 'claim' waits for an admin.
  kind               VARCHAR(10) NOT NULL CHECK (kind IN ('signup', 'claim')),
  status             VARCHAR(10) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Who is asking, in their words. Not proof on its own: this is what gets
  -- quoted back to them on a phone call, and it distinguishes the executive
  -- director from a summer intern.
  contact_name       TEXT,
  contact_title      TEXT,
  contact_phone      TEXT,

  -- The address they verified. Kept separately from users.email so that
  -- changing the account email later cannot rewrite the evidence the claim
  -- was approved on.
  work_email         TEXT,

  -- True when work_email's domain matches the charity's own website domain.
  -- The strongest signal available and it costs nothing, because website is
  -- already stored. Free-mail domains never match, so a gmail address lands
  -- on the manual path by itself.
  domain_verified    BOOLEAN NOT NULL DEFAULT FALSE,

  -- How they say they are connected, for the manual path.
  note               TEXT,

  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at        TIMESTAMP,
  reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_car_status  ON charity_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_car_charity ON charity_access_requests(charity_id);
CREATE INDEX IF NOT EXISTS idx_car_user    ON charity_access_requests(user_id);

-- One live request per person per charity. Someone rejected once may ask
-- again (a rejected row does not block), but they cannot stack up five
-- pending requests on the same charity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_car_one_pending_per_user_charity'
  ) THEN
    CREATE UNIQUE INDEX idx_car_one_pending_per_user_charity
      ON charity_access_requests(charity_id, user_id)
      WHERE status = 'pending';
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
