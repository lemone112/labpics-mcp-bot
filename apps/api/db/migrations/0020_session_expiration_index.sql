-- Session expiration: index for efficient cleanup of stale sessions
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions (last_seen_at);
