-- API keys for machine-to-machine authentication
-- Enables telegram-bot, external services, and future products to consume the API
-- without session cookies.
CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL,
  key_hash      text NOT NULL,
  key_prefix    text NOT NULL,          -- first 8 chars of the raw key, for display
  name          text NOT NULL DEFAULT '',
  scopes        text[] NOT NULL DEFAULT ARRAY['read'],  -- read, write, admin
  expires_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys (project_id);

COMMENT ON TABLE api_keys IS 'API keys for machine-to-machine authentication (X-API-Key header)';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the full API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of the key for identification in UI';
COMMENT ON COLUMN api_keys.scopes IS 'Permission scopes: read, write, admin';
