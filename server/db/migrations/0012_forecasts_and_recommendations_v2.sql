CREATE TABLE IF NOT EXISTS kag_risk_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  risk_type text NOT NULL CHECK (risk_type IN ('delivery_risk', 'finance_risk', 'client_risk', 'scope_risk')),
  probability_7d numeric(6,4) NOT NULL CHECK (probability_7d >= 0 AND probability_7d <= 1),
  probability_14d numeric(6,4) NOT NULL CHECK (probability_14d >= 0 AND probability_14d <= 1),
  probability_30d numeric(6,4) NOT NULL CHECK (probability_30d >= 0 AND probability_30d <= 1),
  expected_time_to_risk_days numeric(8,2),
  confidence numeric(6,4) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  top_drivers jsonb NOT NULL DEFAULT '[]'::jsonb,
  similar_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, risk_type)
);

CREATE INDEX IF NOT EXISTS kag_risk_forecasts_project_generated_idx
  ON kag_risk_forecasts (project_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS kag_risk_forecasts_project_type_idx
  ON kag_risk_forecasts (project_id, risk_type);

CREATE TABLE IF NOT EXISTS recommendations_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (
    category IN (
      'waiting_on_client',
      'scope_creep_change_request',
      'delivery_risk',
      'finance_risk',
      'upsell_opportunity',
      'winback'
    )
  ),
  priority int NOT NULL CHECK (priority BETWEEN 1 AND 5),
  due_date date,
  owner_role text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'done', 'dismissed')),
  title text NOT NULL,
  rationale text NOT NULL,
  why_now text,
  expected_impact text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_template_key text NOT NULL,
  suggested_template text NOT NULL,
  signal_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  forecast_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  helpful_feedback text NOT NULL DEFAULT 'unknown' CHECK (helpful_feedback IN ('unknown', 'helpful', 'not_helpful')),
  feedback_note text,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS recommendations_v2_project_priority_idx
  ON recommendations_v2 (project_id, status, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS recommendations_v2_status_feedback_idx
  ON recommendations_v2 (status, helpful_feedback, updated_at DESC);

CREATE INDEX IF NOT EXISTS recommendations_v2_evidence_gin_idx
  ON recommendations_v2 USING gin (evidence_refs jsonb_path_ops);

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'kag_risk_forecasts',
    'recommendations_v2'
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
