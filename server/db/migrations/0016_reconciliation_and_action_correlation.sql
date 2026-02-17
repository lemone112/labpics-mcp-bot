CREATE TABLE IF NOT EXISTS sync_reconciliation_metrics (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  connector text NOT NULL CHECK (connector IN ('chatwoot', 'linear', 'attio', 'portfolio')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'sync_cycle', 'daily_job', 'scheduler')),
  completeness_pct numeric(6,2) NOT NULL DEFAULT 0 CHECK (completeness_pct >= 0 AND completeness_pct <= 100),
  duplicate_count int NOT NULL DEFAULT 0,
  missing_count int NOT NULL DEFAULT 0,
  total_count int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_reconciliation_metrics_project_captured_idx
  ON sync_reconciliation_metrics (project_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS sync_reconciliation_metrics_scope_connector_idx
  ON sync_reconciliation_metrics (account_scope_id, connector, captured_at DESC);

ALTER TABLE recommendation_action_runs
  ADD COLUMN IF NOT EXISTS correlation_id text;

UPDATE recommendation_action_runs
SET correlation_id = COALESCE(correlation_id, 'rec_action_' || id::text)
WHERE correlation_id IS NULL OR btrim(correlation_id) = '';

ALTER TABLE recommendation_action_runs
  ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS recommendation_action_runs_correlation_idx
  ON recommendation_action_runs (correlation_id, created_at DESC);
