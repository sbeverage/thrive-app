-- Sign in with Apple — store the refresh token Apple returns from the
-- authorization-code exchange so we can revoke it when a user deletes their
-- account (App Store Review Guideline 5.1.1(v)).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apple_refresh_token TEXT;
