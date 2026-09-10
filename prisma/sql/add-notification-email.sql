ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_status VARCHAR(20) NOT NULL DEFAULT 'disabled';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_next_attempt TIMESTAMP(6) NOT NULL DEFAULT NOW();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_lease UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_locked_until TIMESTAMP(6);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP(6);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_last_error VARCHAR(80);
CREATE INDEX IF NOT EXISTS notifications_email_pending_idx ON notifications(email_next_attempt, id)
WHERE email_status IN ('pending', 'retry', 'processing');
