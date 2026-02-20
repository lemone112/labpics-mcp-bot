ALTER TABLE recommendations_v2
  ADD COLUMN IF NOT EXISTS evidence_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_quality_score numeric(6,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_gate_status text NOT NULL DEFAULT 'hidden',
  ADD COLUMN IF NOT EXISTS evidence_gate_reason text,
  ADD COLUMN IF NOT EXISTS shown_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_shown_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_shown_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recommendations_v2_evidence_gate_status_check'
  ) THEN
    ALTER TABLE recommendations_v2 DROP CONSTRAINT recommendations_v2_evidence_gate_status_check;
  END IF;
END $$;

ALTER TABLE recommendations_v2
  ADD CONSTRAINT recommendations_v2_evidence_gate_status_check
  CHECK (evidence_gate_status IN ('visible', 'hidden'));

CREATE INDEX IF NOT EXISTS recommendations_v2_visibility_idx
  ON recommendations_v2 (project_id, evidence_gate_status, status, priority DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  recommendation_id uuid NOT NULL REFERENCES recommendations_v2(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (
    action_type IN (
      'create_or_update_task',
      'send_message',
      'set_reminder'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  attempts int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
  next_retry_at timestamptz,
  dedupe_key text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS recommendation_action_runs_recommendation_idx
  ON recommendation_action_runs (project_id, recommendation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recommendation_action_runs_status_retry_idx
  ON recommendation_action_runs (project_id, status, next_retry_at ASC, updated_at DESC);

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'recommendation_action_runs'
  ]
  LOOP
    trg := tbl || '_scope_guard';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = to_regclass(tbl)
        AND tgname = trg
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_project_scope_match()',
        trg,
        tbl
      );
    END IF;
  END LOOP;
END $$;
