-- Migration 0021: Full LightRAG schema
-- Aligns labpics-dashboard with lightrag-db-requirements.md from telegram-assistant-bot.
-- Introduces: source_documents, entities, entity_links, document_entity_mentions,
-- ingestion_cursors, ingestion_runs, ACL tags, and adapts rag_chunks.
-- Existing tables (cw_*, linear_*, attio_*) are NOT removed — they stay as
-- connector-specific raw storage. source_documents is the unified LightRAG layer.

-- ============================================================
-- 0) Prerequisites
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1) source_documents  — unified raw document store
--    Satisfies: lightrag-db-requirements §2.1
-- ============================================================
CREATE TABLE IF NOT EXISTS source_documents (
  global_ref       text        PRIMARY KEY,
  source_system    text        NOT NULL CHECK (source_system IN ('attio', 'linear', 'chatwoot')),
  source_type      text        NOT NULL,
  source_id        text        NOT NULL,
  source_url       text        NOT NULL DEFAULT '',
  project_id       uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid        NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  author_ref       text,
  raw_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  text_content     text        NOT NULL DEFAULT '',
  language         text        NOT NULL DEFAULT 'ru',
  content_hash     text        NOT NULL DEFAULT '',
  is_deleted       boolean     NOT NULL DEFAULT false,
  acl_tags         text[]      NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Validate source_type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'source_documents_source_type_check'
  ) THEN
    ALTER TABLE source_documents
      ADD CONSTRAINT source_documents_source_type_check
      CHECK (source_type IN (
        'company', 'deal', 'note', 'person', 'activity',
        'issue', 'comment', 'project', 'cycle',
        'conversation', 'message', 'contact', 'inbox', 'attachment'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS source_documents_system_type_updated_idx
  ON source_documents (source_system, source_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS source_documents_content_hash_idx
  ON source_documents (content_hash);

CREATE INDEX IF NOT EXISTS source_documents_project_updated_idx
  ON source_documents (project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS source_documents_acl_tags_gin_idx
  ON source_documents USING gin (acl_tags);

CREATE INDEX IF NOT EXISTS source_documents_not_deleted_idx
  ON source_documents (project_id, source_system, source_type, updated_at DESC)
  WHERE is_deleted = false;

-- ============================================================
-- 2) Adapt rag_chunks / document_chunks
--    Satisfies: lightrag-db-requirements §2.2
--    We extend the existing rag_chunks table with missing fields.
-- ============================================================
ALTER TABLE rag_chunks
  ADD COLUMN IF NOT EXISTS document_ref text,
  ADD COLUMN IF NOT EXISTS chunk_ref    text,
  ADD COLUMN IF NOT EXISTS chunk_hash   text,
  ADD COLUMN IF NOT EXISTS token_count  int,
  ADD COLUMN IF NOT EXISTS start_offset int,
  ADD COLUMN IF NOT EXISTS end_offset   int,
  ADD COLUMN IF NOT EXISTS acl_tags     text[] NOT NULL DEFAULT '{}';

-- Generate chunk_ref for new rows (existing rows get backfilled below)
-- chunk_ref format: "chunk:<document_ref>:<chunk_index>"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rag_chunks_document_ref_fk'
  ) THEN
    ALTER TABLE rag_chunks
      ADD CONSTRAINT rag_chunks_document_ref_fk
      FOREIGN KEY (document_ref) REFERENCES source_documents(global_ref) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rag_chunks_document_ref_idx
  ON rag_chunks (document_ref, chunk_index);

CREATE INDEX IF NOT EXISTS rag_chunks_chunk_hash_idx
  ON rag_chunks (chunk_hash)
  WHERE chunk_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS rag_chunks_acl_tags_gin_idx
  ON rag_chunks USING gin (acl_tags);

-- Rename existing text_hash → populate chunk_hash for consistency
UPDATE rag_chunks
SET chunk_hash = text_hash
WHERE chunk_hash IS NULL AND text_hash IS NOT NULL;

-- ============================================================
-- 3) entities  — canonical entity store
--    Satisfies: lightrag-db-requirements §2.3
-- ============================================================
CREATE TABLE IF NOT EXISTS entities (
  entity_ref      text        PRIMARY KEY,
  entity_kind     text        NOT NULL,
  project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid       NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  display_name    text        NOT NULL DEFAULT '',
  normalized_name text        NOT NULL DEFAULT '',
  primary_url     text,
  attributes      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_deleted      boolean     NOT NULL DEFAULT false,
  acl_tags        text[]      NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entities_entity_kind_check'
  ) THEN
    ALTER TABLE entities
      ADD CONSTRAINT entities_entity_kind_check
      CHECK (entity_kind IN (
        'company', 'deal', 'person', 'issue', 'project',
        'conversation', 'message', 'contact', 'cycle', 'inbox'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS entities_kind_normalized_name_idx
  ON entities (entity_kind, normalized_name);

CREATE INDEX IF NOT EXISTS entities_project_kind_idx
  ON entities (project_id, entity_kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS entities_acl_tags_gin_idx
  ON entities USING gin (acl_tags);

-- Full-text search over display_name + attributes
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS search_text tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(normalized_name, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS entities_search_text_gin_idx
  ON entities USING gin (search_text);

-- ============================================================
-- 4) entity_links  — cross-system mappings with semantics
--    Satisfies: lightrag-db-requirements §2.4
--    Replaces/extends identity_links + identity_link_suggestions
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_links (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid    NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  from_ref      text        NOT NULL REFERENCES entities(entity_ref) ON DELETE CASCADE,
  to_ref        text        NOT NULL REFERENCES entities(entity_ref) ON DELETE CASCADE,
  link_type     text        NOT NULL,
  directional   boolean     NOT NULL DEFAULT true,
  confidence    numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by    text        NOT NULL DEFAULT 'system' CHECK (created_by IN ('system', 'user', 'admin')),
  status        text        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_links_link_type_check'
  ) THEN
    ALTER TABLE entity_links
      ADD CONSTRAINT entity_links_link_type_check
      CHECK (link_type IN (
        'same_as', 'related_to', 'belongs_to',
        'mapped_to', 'thread_of', 'mentions'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS entity_links_from_ref_type_status_idx
  ON entity_links (from_ref, link_type, status);

CREATE INDEX IF NOT EXISTS entity_links_to_ref_type_status_idx
  ON entity_links (to_ref, link_type, status);

CREATE INDEX IF NOT EXISTS entity_links_project_status_idx
  ON entity_links (project_id, status, updated_at DESC);

-- Rule: prevent self-links
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_links_no_self_link'
  ) THEN
    ALTER TABLE entity_links
      ADD CONSTRAINT entity_links_no_self_link
      CHECK (from_ref <> to_ref);
  END IF;
END $$;

-- Prevent duplicate directed links
CREATE UNIQUE INDEX IF NOT EXISTS entity_links_unique_directed_idx
  ON entity_links (project_id, from_ref, to_ref, link_type)
  WHERE status <> 'rejected';

-- ============================================================
-- 5) document_entity_mentions
--    Satisfies: lightrag-db-requirements §2.5
-- ============================================================
CREATE TABLE IF NOT EXISTS document_entity_mentions (
  id            bigserial   PRIMARY KEY,
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid    NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  document_ref  text        NOT NULL REFERENCES source_documents(global_ref) ON DELETE CASCADE,
  chunk_ref     text,
  entity_ref    text        NOT NULL REFERENCES entities(entity_ref) ON DELETE CASCADE,
  mention_type  text        NOT NULL DEFAULT 'metadata'
    CHECK (mention_type IN ('explicit', 'inferred', 'metadata')),
  confidence    numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_entity_mentions_entity_created_idx
  ON document_entity_mentions (entity_ref, created_at DESC);

CREATE INDEX IF NOT EXISTS document_entity_mentions_document_entity_idx
  ON document_entity_mentions (document_ref, entity_ref);

CREATE INDEX IF NOT EXISTS document_entity_mentions_project_idx
  ON document_entity_mentions (project_id, created_at DESC);

-- Prevent duplicate mentions per document+entity
CREATE UNIQUE INDEX IF NOT EXISTS document_entity_mentions_dedupe_idx
  ON document_entity_mentions (document_ref, entity_ref, mention_type)
  WHERE chunk_ref IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS document_entity_mentions_chunk_dedupe_idx
  ON document_entity_mentions (chunk_ref, entity_ref, mention_type)
  WHERE chunk_ref IS NOT NULL;

-- ============================================================
-- 6) ingestion_cursors  — replaces sync_watermarks for LightRAG
--    Satisfies: lightrag-db-requirements §2.6
--    sync_watermarks remains for connector-level sync;
--    ingestion_cursors is for LightRAG document ingestion.
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestion_cursors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid      NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  source_system   text        NOT NULL CHECK (source_system IN ('attio', 'linear', 'chatwoot')),
  cursor_key      text        NOT NULL DEFAULT 'default',
  cursor_value    text        NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, source_system, cursor_key)
);

-- ============================================================
-- 7) ingestion_runs  — structured ingestion audit
--    Satisfies: lightrag-db-requirements §2.6
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id              bigserial   PRIMARY KEY,
  project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid      NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  source_system   text        NOT NULL CHECK (source_system IN ('attio', 'linear', 'chatwoot')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text        NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'ok', 'failed', 'partial')),
  inserted_count  int         NOT NULL DEFAULT 0,
  updated_count   int         NOT NULL DEFAULT 0,
  deleted_count   int         NOT NULL DEFAULT 0,
  skipped_count   int         NOT NULL DEFAULT 0,
  error_summary   text,
  meta            jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ingestion_runs_project_started_idx
  ON ingestion_runs (project_id, started_at DESC);

CREATE INDEX IF NOT EXISTS ingestion_runs_status_idx
  ON ingestion_runs (project_id, status, started_at DESC);

-- ============================================================
-- 8) Scope guard triggers for new tables
-- ============================================================
DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'source_documents',
    'entities',
    'entity_links',
    'document_entity_mentions',
    'ingestion_cursors',
    'ingestion_runs'
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

-- ============================================================
-- 9) Fix duplicate migration numbering: rename 0017_production_indexes_and_pool.sql
--    This is a NO-OP SQL marker. The actual file rename is handled outside SQL.
--    See review document for the recommended rename.
-- ============================================================

-- ============================================================
-- 10) Convenience views for LightRAG query layer
-- ============================================================

-- View: active (non-deleted) source documents with ACL filtering support
CREATE OR REPLACE VIEW v_active_source_documents AS
SELECT
  sd.global_ref,
  sd.source_system,
  sd.source_type,
  sd.source_id,
  sd.source_url,
  sd.project_id,
  sd.account_scope_id,
  sd.author_ref,
  sd.text_content,
  sd.language,
  sd.content_hash,
  sd.acl_tags,
  sd.created_at,
  sd.updated_at
FROM source_documents sd
WHERE sd.is_deleted = false;

-- View: entity context — entity + links + latest document mention
CREATE OR REPLACE VIEW v_entity_context AS
SELECT
  e.entity_ref,
  e.entity_kind,
  e.display_name,
  e.normalized_name,
  e.primary_url,
  e.project_id,
  e.account_scope_id,
  e.acl_tags,
  (
    SELECT count(*)
    FROM entity_links el
    WHERE (el.from_ref = e.entity_ref OR el.to_ref = e.entity_ref)
      AND el.status IN ('proposed', 'confirmed')
  )::int AS link_count,
  (
    SELECT count(*)
    FROM document_entity_mentions dem
    WHERE dem.entity_ref = e.entity_ref
  )::int AS mention_count
FROM entities e
WHERE e.is_deleted = false;

-- ============================================================
-- 11) Helper function for GlobalRef construction
-- ============================================================
CREATE OR REPLACE FUNCTION make_global_ref(
  p_source_system text,
  p_source_type   text,
  p_source_id     text
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT p_source_system || ':' || p_source_type || ':' || p_source_id;
$$;
