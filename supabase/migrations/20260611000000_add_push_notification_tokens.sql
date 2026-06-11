-- Push notification token storage. The donor app registers its Expo push
-- token after sign-in; the backend stores the latest one per user so we can
-- send via Expo Push API. updated_at lets us prune stale tokens later.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_expo_push_token
  ON users(expo_push_token)
  WHERE expo_push_token IS NOT NULL;
