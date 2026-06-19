-- Password reset support. /auth/forgot-password writes a 64-char hex token +
-- 1-hour expiry into these columns; /auth/reset-password matches against them.
-- The endpoints have been live for a while but silently no-op'd because the
-- columns didn't exist on the table.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON users(password_reset_token)
  WHERE password_reset_token IS NOT NULL;
