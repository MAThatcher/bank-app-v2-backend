ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP(6) NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS sessions_user_valid_idx ON sessions(user_id, valid, expires_at);
