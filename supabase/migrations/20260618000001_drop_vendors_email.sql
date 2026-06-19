-- The vendors.email field was originally a "public contact email" collected
-- during vendor signup, but it's never displayed anywhere in the donor app
-- and confused vendor signup (donors entered their login email there too).
-- The vendor's account email lives on users.email via vendors.auth_user_id;
-- this column was redundant and dead.

ALTER TABLE vendors DROP COLUMN IF EXISTS email;
