CREATE TABLE IF NOT EXISTS user_preferences (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 notifications JSONB NOT NULL DEFAULT '{}',
 dashboard JSONB NOT NULL DEFAULT '{}'
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS in_app BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS dispute_events (
 id SERIAL PRIMARY KEY,
 dispute_id INTEGER NOT NULL REFERENCES disputes(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 status VARCHAR(255) NOT NULL,
 note VARCHAR(2048) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS dispute_events_dispute_id_id_idx ON dispute_events(dispute_id, id);
CREATE INDEX IF NOT EXISTS disputes_user_status_idx ON disputes(user_id, status, id);
