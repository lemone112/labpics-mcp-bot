CREATE TABLE IF NOT EXISTS case_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  window_days int NOT NULL CHECK (window_days IN (7, 14, 30)),
  signature_vector jsonb NOT NULL DEFAULT '[]'::jsonb,
  signature_hash text NOT NULL,
  features_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, window_days)
);

CREATE INDEX IF NOT EXISTS case_signatures_project_computed_idx
  ON case_signatures (project_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS case_signatures_hash_idx
  ON case_signatures (signature_hash);

CREATE INDEX IF NOT EXISTS case_signatures_scope_window_idx
  ON case_signatures (account_scope_id, window_days, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('case_signatures')
      AND tgname = 'case_signatures_scope_guard'
  ) THEN
    CREATE TRIGGER case_signatures_scope_guard
    BEFORE INSERT OR UPDATE ON case_signatures
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;
