CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cw_conversations (
  id text PRIMARY KEY,
  account_id bigint,
  conversation_id bigint,
  data jsonb NOT NULL,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cw_messages (
  id text PRIMARY KEY,
  account_id bigint,
  message_id bigint,
  conversation_id bigint,
  content text,
  data jsonb NOT NULL,
  created_at timestamptz
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_global_id text,
  message_global_id text,
  chunk_index int,
  text text NOT NULL,
  embedding vector(1536),
  embedding_status text NOT NULL DEFAULT 'pending',
  embedding_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rag_chunks_embedding_status_check
    CHECK (embedding_status IN ('pending', 'ready', 'failed')),
  CONSTRAINT rag_chunks_message_chunk_unique
    UNIQUE (message_global_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS sync_watermarks (
  source text PRIMARY KEY,
  cursor_ts timestamptz,
  cursor_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_runs (
  id bigserial PRIMARY KEY,
  job_name text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed_count int NOT NULL DEFAULT 0,
  error text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id text PRIMARY KEY,
  username text NOT NULL,
  active_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
