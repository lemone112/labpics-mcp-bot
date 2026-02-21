-- =============================================================================
-- Migration 0042: Criteria engine data layer (Iter 66.2)
-- =============================================================================
-- Adds versioned criteria catalog + thresholds + evaluation runs/results.
-- The schema is fully scope-safe and supports reproducible evaluation traces.

-- ---------------------------------------------------------------------------
-- Criteria definitions (versioned)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS criteria_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria_key text NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  name text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  owner_domain text NOT NULL,
  rule_spec jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT criteria_definitions_key_not_blank CHECK (btrim(criteria_key) <> ''),
  CONSTRAINT criteria_definitions_version_positive CHECK (version >= 1),
  CONSTRAINT criteria_definitions_severity_check CHECK (
    severity IN ('info', 'low', 'medium', 'high', 'critical')
  ),
  CONSTRAINT criteria_definitions_owner_domain_not_blank CHECK (btrim(owner_domain) <> ''),
  CONSTRAINT criteria_definitions_key_version_unique UNIQUE (criteria_key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS criteria_definitions_current_key_unique_idx
  ON criteria_definitions (criteria_key)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS criteria_definitions_enabled_idx
  ON criteria_definitions (enabled, severity, criteria_key);

CREATE OR REPLACE FUNCTION enforce_criteria_definition_current_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE criteria_definitions
    SET is_current = false,
        updated_at = now()
    WHERE criteria_key = NEW.criteria_key
      AND id IS DISTINCT FROM NEW.id
      AND is_current = true;
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_definitions')
      AND tgname = 'criteria_definitions_current_guard'
  ) THEN
    CREATE TRIGGER criteria_definitions_current_guard
    BEFORE INSERT OR UPDATE ON criteria_definitions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_criteria_definition_current_version();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_definitions')
      AND tgname = 'criteria_definitions_set_updated_at'
  ) THEN
    CREATE TRIGGER criteria_definitions_set_updated_at
    BEFORE UPDATE ON criteria_definitions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Thresholds by segment / scope
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS criteria_thresholds (
  id bigserial PRIMARY KEY,
  criteria_id uuid NOT NULL REFERENCES criteria_definitions(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid REFERENCES account_scopes(id) ON DELETE RESTRICT,
  segment_key text NOT NULL DEFAULT 'default',
  threshold_spec jsonb NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT criteria_thresholds_segment_not_blank CHECK (btrim(segment_key) <> ''),
  CONSTRAINT criteria_thresholds_effective_range_check CHECK (
    effective_to IS NULL OR effective_to > effective_from
  ),
  CONSTRAINT criteria_thresholds_scope_pairing_check CHECK (
    (project_id IS NULL AND account_scope_id IS NULL)
    OR (project_id IS NOT NULL AND account_scope_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS criteria_thresholds_lookup_idx
  ON criteria_thresholds (criteria_id, account_scope_id, project_id, segment_key, effective_from DESC);

CREATE INDEX IF NOT EXISTS criteria_thresholds_effective_idx
  ON criteria_thresholds (effective_from DESC, effective_to);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_thresholds')
      AND tgname = 'criteria_thresholds_scope_guard'
  ) THEN
    CREATE TRIGGER criteria_thresholds_scope_guard
    BEFORE INSERT OR UPDATE ON criteria_thresholds
    FOR EACH ROW
    WHEN (NEW.project_id IS NOT NULL)
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_thresholds')
      AND tgname = 'criteria_thresholds_set_updated_at'
  ) THEN
    CREATE TRIGGER criteria_thresholds_set_updated_at
    BEFORE UPDATE ON criteria_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Evaluation runs and results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS criteria_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  run_key text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  trigger_source text NOT NULL DEFAULT 'scheduler',
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  criteria_version_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT criteria_evaluation_runs_run_key_not_blank CHECK (btrim(run_key) <> ''),
  CONSTRAINT criteria_evaluation_runs_status_check CHECK (
    status IN ('running', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT criteria_evaluation_runs_trigger_source_not_blank CHECK (btrim(trigger_source) <> ''),
  CONSTRAINT criteria_evaluation_runs_finished_after_start CHECK (
    finished_at IS NULL OR finished_at >= started_at
  ),
  CONSTRAINT criteria_evaluation_runs_unique_key UNIQUE (project_id, run_key)
);

CREATE INDEX IF NOT EXISTS criteria_evaluation_runs_scope_status_idx
  ON criteria_evaluation_runs (account_scope_id, project_id, status, started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_evaluation_runs')
      AND tgname = 'criteria_evaluation_runs_scope_guard'
  ) THEN
    CREATE TRIGGER criteria_evaluation_runs_scope_guard
    BEFORE INSERT OR UPDATE ON criteria_evaluation_runs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_evaluation_runs')
      AND tgname = 'criteria_evaluation_runs_set_updated_at'
  ) THEN
    CREATE TRIGGER criteria_evaluation_runs_set_updated_at
    BEFORE UPDATE ON criteria_evaluation_runs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS criteria_evaluations (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES criteria_evaluation_runs(id) ON DELETE CASCADE,
  criteria_id uuid NOT NULL REFERENCES criteria_definitions(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  status text NOT NULL,
  score numeric(8,2) NOT NULL DEFAULT 0,
  reason text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  metric_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  threshold_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT criteria_evaluations_subject_type_check CHECK (
    subject_type IN ('project', 'employee', 'crm_account', 'crm_opportunity', 'system')
  ),
  CONSTRAINT criteria_evaluations_status_check CHECK (
    status IN ('pass', 'warn', 'fail', 'error')
  ),
  CONSTRAINT criteria_evaluations_score_range_check CHECK (score >= 0 AND score <= 100),
  CONSTRAINT criteria_evaluations_run_unique_subject UNIQUE (run_id, criteria_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS criteria_evaluations_scope_status_idx
  ON criteria_evaluations (account_scope_id, project_id, status, evaluated_at DESC);

CREATE INDEX IF NOT EXISTS criteria_evaluations_run_idx
  ON criteria_evaluations (run_id, evaluated_at DESC);

CREATE INDEX IF NOT EXISTS criteria_evaluations_criteria_idx
  ON criteria_evaluations (criteria_id, status, evaluated_at DESC);

CREATE OR REPLACE FUNCTION enforce_criteria_evaluation_run_scope_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_project_id uuid;
  run_scope_id uuid;
BEGIN
  SELECT r.project_id, r.account_scope_id
  INTO run_project_id, run_scope_id
  FROM criteria_evaluation_runs AS r
  WHERE r.id = NEW.run_id
  LIMIT 1;

  IF run_project_id IS NULL THEN
    RAISE EXCEPTION 'criteria_evaluation_run % not found', NEW.run_id;
  END IF;

  IF NEW.project_id IS DISTINCT FROM run_project_id
     OR NEW.account_scope_id IS DISTINCT FROM run_scope_id THEN
    RAISE EXCEPTION
      'criteria_evaluations run scope mismatch. expected (%, %), got (%, %)',
      run_project_id, run_scope_id, NEW.project_id, NEW.account_scope_id;
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_evaluations')
      AND tgname = 'criteria_evaluations_scope_guard'
  ) THEN
    CREATE TRIGGER criteria_evaluations_scope_guard
    BEFORE INSERT OR UPDATE ON criteria_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_evaluations')
      AND tgname = 'criteria_evaluations_run_scope_guard'
  ) THEN
    CREATE TRIGGER criteria_evaluations_run_scope_guard
    BEFORE INSERT OR UPDATE ON criteria_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_criteria_evaluation_run_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('criteria_evaluations')
      AND tgname = 'criteria_evaluations_set_updated_at'
  ) THEN
    CREATE TRIGGER criteria_evaluations_set_updated_at
    BEFORE UPDATE ON criteria_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
