ALTER TABLE rag_chunks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'rag_chunks'
      AND constraint_name = 'rag_chunks_message_chunk_unique'
  ) THEN
    ALTER TABLE rag_chunks DROP CONSTRAINT rag_chunks_message_chunk_unique;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS rag_chunks_project_message_chunk_unique_idx
  ON rag_chunks (project_id, message_global_id, chunk_index);

CREATE UNIQUE INDEX IF NOT EXISTS rag_chunks_unscoped_message_chunk_unique_idx
  ON rag_chunks (message_global_id, chunk_index)
  WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS rag_chunks_project_status_created_idx
  ON rag_chunks (project_id, embedding_status, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rag_chunks_project_conversation_idx
  ON rag_chunks (project_id, conversation_global_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rag_chunks_project_message_idx
  ON rag_chunks (project_id, message_global_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS job_runs_project_started_idx
  ON job_runs (project_id, started_at DESC);

CREATE INDEX IF NOT EXISTS job_runs_project_job_started_idx
  ON job_runs (project_id, job_name, started_at DESC);
