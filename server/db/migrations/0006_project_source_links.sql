CREATE TABLE IF NOT EXISTS project_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_account_id text NOT NULL DEFAULT '',
  source_external_id text NOT NULL,
  source_url text,
  created_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_source_links_source_type_len CHECK (length(source_type) BETWEEN 3 AND 100),
  CONSTRAINT project_source_links_external_id_len CHECK (length(source_external_id) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_source_links_unique_external_idx
  ON project_source_links (source_type, source_account_id, source_external_id);

CREATE INDEX IF NOT EXISTS project_source_links_project_type_idx
  ON project_source_links (project_id, source_type, is_active);

CREATE INDEX IF NOT EXISTS cw_conversations_inbox_idx
  ON cw_conversations (inbox_id);
