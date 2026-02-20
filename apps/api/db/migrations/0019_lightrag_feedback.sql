-- =============================================================================
-- Migration 0019: LightRAG feedback + quality scoring
-- =============================================================================
-- 6.2  Feedback table for lightrag query runs
-- 6.5  Completeness diff view for reconciliation
-- =============================================================================

-- 6.2: Feedback on lightrag query runs
ALTER TABLE lightrag_query_runs
  ADD COLUMN IF NOT EXISTS quality_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS source_diversity int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS lightrag_feedback (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  query_run_id bigint NOT NULL REFERENCES lightrag_query_runs(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN -1 AND 1),
  comment text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lightrag_feedback_run_idx
  ON lightrag_feedback (query_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lightrag_feedback_project_idx
  ON lightrag_feedback (project_id, created_at DESC);
