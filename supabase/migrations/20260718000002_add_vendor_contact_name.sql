-- Adds `contact_name` to vendors so the admin can record a point-of-contact
-- name for a vendor even when there's no linked portal account yet.
--
-- Prior to this migration the admin panel routed the contact name save to
-- users.first_name / users.last_name via vendors.auth_user_id. Vendors that
-- were created directly from the admin panel and never went through the
-- vendor-portal signup flow have no auth_user_id, so the save silently
-- dropped every field — the admin saw "Saved!" and then the form went blank
-- on the next refetch.
--
-- Contact **email** stays on the users row (via vendors.auth_user_id) and is
-- still routed there — that decision (see 20260618000001_drop_vendors_email)
-- was about avoiding a second, drift-prone email column. Contact name never
-- had the same drift-vs-login concern.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- Backfill: for vendors that already have a linked users row, seed
-- contact_name from users.first_name + users.last_name so the value the
-- admin panel currently shows doesn't appear to "reset" on first save
-- after this migration deploys.
UPDATE vendors v
SET contact_name = NULLIF(
  TRIM(
    COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')
  ),
  ''
)
FROM users u
WHERE v.auth_user_id = u.id
  AND (v.contact_name IS NULL OR v.contact_name = '');
