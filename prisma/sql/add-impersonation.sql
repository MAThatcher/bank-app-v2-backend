CREATE TABLE IF NOT EXISTS impersonations (
 id UUID PRIMARY KEY,
 admin_id INTEGER NOT NULL REFERENCES users(id),
 target_id INTEGER NOT NULL REFERENCES users(id),
 session_id INTEGER NOT NULL REFERENCES sessions(id),
 reason VARCHAR(500) NOT NULL,
 read_only BOOLEAN NOT NULL DEFAULT TRUE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 expires_at TIMESTAMP(6) NOT NULL,
 ended_at TIMESTAMP(6)
);
CREATE INDEX IF NOT EXISTS impersonations_session_idx ON impersonations(session_id, active);
