CREATE TABLE IF NOT EXISTS cw_contacts (
  id text PRIMARY KEY,
  account_id bigint NOT NULL,
  contact_id bigint NOT NULL,
  name text,
  email text,
  phone_number text,
  identifier text,
  custom_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cw_contacts_account_contact_unique_idx
  ON cw_contacts (account_id, contact_id);

CREATE INDEX IF NOT EXISTS cw_contacts_updated_at_idx
  ON cw_contacts (updated_at DESC NULLS LAST);

ALTER TABLE cw_conversations
  ADD COLUMN IF NOT EXISTS contact_global_id text,
  ADD COLUMN IF NOT EXISTS inbox_id bigint,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS assignee_id bigint;

ALTER TABLE cw_messages
  ADD COLUMN IF NOT EXISTS conversation_global_id text,
  ADD COLUMN IF NOT EXISTS contact_global_id text,
  ADD COLUMN IF NOT EXISTS sender_type text,
  ADD COLUMN IF NOT EXISTS sender_id bigint,
  ADD COLUMN IF NOT EXISTS private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_type text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE rag_chunks
  ADD COLUMN IF NOT EXISTS text_hash text,
  ADD COLUMN IF NOT EXISTS content_tokens int,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_embedded_at timestamptz,
  ADD COLUMN IF NOT EXISTS embedding_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_error text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rag_chunks_embedding_status_check'
  ) THEN
    ALTER TABLE rag_chunks DROP CONSTRAINT rag_chunks_embedding_status_check;
  END IF;
END $$;

ALTER TABLE rag_chunks
  ADD CONSTRAINT rag_chunks_embedding_status_check
  CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS cw_messages_conversation_global_idx
  ON cw_messages (conversation_global_id);

CREATE INDEX IF NOT EXISTS cw_messages_contact_global_idx
  ON cw_messages (contact_global_id);

CREATE INDEX IF NOT EXISTS cw_messages_account_created_idx
  ON cw_messages (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rag_chunks_status_created_idx
  ON rag_chunks (embedding_status, created_at DESC);

CREATE INDEX IF NOT EXISTS rag_chunks_text_hash_idx
  ON rag_chunks (text_hash);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw_idx ON rag_chunks USING hnsw (embedding vector_cosine_ops)';
  END IF;
END $$;

ALTER TABLE rag_chunks
  SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01
  );

ALTER TABLE cw_messages
  SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
  );
