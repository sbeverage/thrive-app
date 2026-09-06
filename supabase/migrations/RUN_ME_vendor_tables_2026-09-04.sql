-- Create the three vendor tables the app has been writing to all along.
--
-- Found 2026-09-04: PostgREST reports vendor_favorites, vendor_views and
-- discount_code_history as absent from the schema cache — the same error a
-- table that never existed returns. They come from
-- 20260530000000_add_vendor_portal_workflow.sql, whose ALTER TABLE vendors
-- section did get applied but whose CREATE TABLE section never did.
--
-- What has been silently broken as a result:
--
--   • Favouriting a vendor. POST /vendors/:id/favorite fails its insert and
--     returns 500; the app catches and ignores it, so the heart appears to
--     work and the favourite only ever exists in AsyncStorage. Because
--     vendor_favorites is empty, the "your saved vendor added a discount"
--     push has never had a single recipient — that is why adding a discount
--     to THRIVE Coworking produced no notification even with a registered
--     push token.
--   • Vendor profile-view counts in the vendor portal, which read
--     vendor_views and are therefore always zero.
--   • The discount-code rotation audit trail.
--
-- Copied verbatim from that migration. Idempotent — CREATE TABLE IF NOT
-- EXISTS. Additive only; nothing is dropped or modified.
--
-- Apply in the Supabase dashboard SQL editor. Do NOT run `supabase db push`
-- on this project — its migration history is out of sync.

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

CREATE TABLE IF NOT EXISTS vendor_favorites (
  id          SERIAL PRIMARY KEY,
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vendor_favorites_unique UNIQUE (vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_favorites_vendor_id ON vendor_favorites(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_favorites_user_id ON vendor_favorites(user_id);

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

NOTIFY pgrst, 'reload schema';
