CREATE TABLE IF NOT EXISTS project_snapshots (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  snapshot_date date NOT NULL,
  signals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_signals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  key_aggregates_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS project_snapshots_project_date_idx
  ON project_snapshots (project_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS past_case_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  outcome_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  severity int NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  notes text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_event_id bigint REFERENCES kag_event_log(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS past_case_outcomes_project_type_idx
  ON past_case_outcomes (project_id, outcome_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS past_case_outcomes_project_occurred_idx
  ON past_case_outcomes (project_id, occurred_at DESC);

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'project_snapshots',
    'past_case_outcomes'
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
