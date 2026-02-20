-- =============================================================================
-- Migration 0023: Idempotency Keys (Iter 12.4)
-- =============================================================================
-- Stores cached responses for idempotent mutation requests.
-- Client sends X-Idempotency-Key header; server returns cached response on retry.
-- =============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL,
  idempotency_key text NOT NULL,
  route           text NOT NULL,
  status_code     int  NOT NULL DEFAULT 200,
  response_body   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_project_key
  ON idempotency_keys (project_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON idempotency_keys (expires_at);
