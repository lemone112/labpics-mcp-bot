CREATE TABLE IF NOT EXISTS commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner text NOT NULL DEFAULT 'unknown',
  due_at timestamptz,
  status text NOT NULL DEFAULT 'proposed',
  confidence text NOT NULL DEFAULT 'medium',
  summary text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commitments_status_check CHECK (status IN ('active', 'proposed', 'closed', 'done', 'cancelled')),
  CONSTRAINT commitments_owner_check CHECK (owner IN ('studio', 'client', 'unknown')),
  CONSTRAINT commitments_confidence_check CHECK (confidence IN ('high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS commitments_project_status_due_idx
  ON commitments (project_id, status, due_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS commitments_project_created_idx
  ON commitments (project_id, created_at DESC);
