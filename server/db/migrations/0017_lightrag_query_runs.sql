CREATE TABLE IF NOT EXISTS lightrag_query_runs (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  query_text text NOT NULL,
  top_k int NOT NULL DEFAULT 10,
  chunk_hits int NOT NULL DEFAULT 0,
  source_hits int NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer text NOT NULL DEFAULT '',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lightrag_query_runs_project_created_idx
  ON lightrag_query_runs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lightrag_query_runs_scope_created_idx
  ON lightrag_query_runs (account_scope_id, created_at DESC);
