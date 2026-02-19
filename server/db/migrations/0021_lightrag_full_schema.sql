-- Migration 0021: Full LightRAG schema
-- Aligns labpics-dashboard with lightrag-db-requirements.md from telegram-assistant-bot.
-- Introduces: source_documents, entities, entity_links, document_entity_mentions,
-- ingestion_cursors, ingestion_runs, ACL tags, and adapts rag_chunks.
-- Existing tables (cw_*, linear_*, attio_*) are NOT removed — they stay as
-- connector-specific raw storage. source_documents is the unified LightRAG layer.
--
-- Architecture note: source_documents/entities/entity_links are the LABPICS
-- canonical data layer. HKUDS LightRAG Server (Iter 11.4) uses its own internal
-- PGGraphStorage/PGVectorStorage/PGKVStorage tables for knowledge graph + embeddings.
-- The two schemas are COMPLEMENTARY:
--   source_documents → ingestion pipeline → LightRAG /documents API → LightRAG internal tables
--   LightRAG /query API → returns answers → labpics enriches with source_documents metadata (citations)
-- This means source_documents is the citation/ACL/audit layer, NOT a duplicate of LightRAG storage.
--
-- Ingestion order constraint: entities MUST be inserted BEFORE entity_links (FK dependency).
-- Application code must do two-pass ingestion: 1) upsert entities, 2) create links.

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
  source_url       text        NOT NULL DEFAULT '',  -- empty string = URL unknown; ingestion SHOULD populate
  project_id       uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid        NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  author_ref       text,
  raw_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  text_content     text        NOT NULL DEFAULT '',
  language         text        NOT NULL DEFAULT 'ru',
  content_hash     text,       -- NULL = not yet computed; non-NULL = skip re-embedding when unchanged
  is_deleted       boolean     NOT NULL DEFAULT false,
  acl_tags         text[]      NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- source_type: NO CHECK constraint — intentionally open-ended (spec uses "...").
-- Known types: company, deal, note, person, activity, issue, comment, project,
-- cycle, conversation, message, contact, inbox, attachment, task, label, team.
-- New source types can be added without DDL migration.

CREATE INDEX IF NOT EXISTS source_documents_system_type_updated_idx
  ON source_documents (source_system, source_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS source_documents_content_hash_idx
  ON source_documents (content_hash)
  WHERE content_hash IS NOT NULL;

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

-- Backfill chunk_ref for existing rows: "chunk:<id>::<chunk_index>"
-- Uses the row's own UUID id as a stable fallback when document_ref is NULL.
UPDATE rag_chunks
SET chunk_ref = 'chunk:' || COALESCE(document_ref, id::text) || ':' || COALESCE(chunk_index, 0)
WHERE chunk_ref IS NULL;

-- Keep chunk_ref nullable: existing INSERT paths (chatwoot.js insertChunkRows)
-- do not supply chunk_ref yet. NOT NULL will be enforced after Iter 11 updates
-- all writers. UNIQUE constraint still applied (NULLs are distinct in PG unique).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rag_chunks_chunk_ref_unique'
  ) THEN
    ALTER TABLE rag_chunks
      ADD CONSTRAINT rag_chunks_chunk_ref_unique UNIQUE (chunk_ref);
  END IF;
END $$;

-- Backfill chunk_hash from existing text_hash
UPDATE rag_chunks
SET chunk_hash = text_hash
WHERE chunk_hash IS NULL AND text_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS rag_chunks_document_ref_idx
  ON rag_chunks (document_ref, chunk_index);

CREATE INDEX IF NOT EXISTS rag_chunks_chunk_hash_idx
  ON rag_chunks (chunk_hash)
  WHERE chunk_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS rag_chunks_acl_tags_gin_idx
  ON rag_chunks USING gin (acl_tags);

-- Verify vector index exists (created in 0003 conditionally; re-attempt here)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'rag_chunks_embedding_hnsw_idx') THEN
    EXECUTE 'CREATE INDEX rag_chunks_embedding_hnsw_idx ON rag_chunks USING hnsw (embedding vector_cosine_ops)';
  END IF;
END $$;

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

-- entity_kind: NO CHECK constraint — intentionally open-ended (spec uses "...").
-- Known kinds: company, deal, person, issue, project, conversation, message,
-- contact, cycle, inbox, note, activity, attachment, team.
-- Validated at application layer (Zod schema).

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
  acl_tags      text[]      NOT NULL DEFAULT '{}',
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

CREATE INDEX IF NOT EXISTS entity_links_acl_tags_gin_idx
  ON entity_links USING gin (acl_tags);

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
  acl_tags      text[]      NOT NULL DEFAULT '{}',  -- inherited from document or explicit
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_entity_mentions_acl_tags_gin_idx
  ON document_entity_mentions USING gin (acl_tags);

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

-- View: entity context — entity + pre-aggregated link/mention counts
-- Uses LEFT JOIN + GROUP BY instead of correlated subqueries for performance.
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
  COALESCE(lc.link_count, 0)::int AS link_count,
  COALESCE(mc.mention_count, 0)::int AS mention_count
FROM entities e
LEFT JOIN (
  SELECT ref, count(*)::int AS link_count
  FROM (
    SELECT from_ref AS ref FROM entity_links WHERE status IN ('proposed', 'confirmed')
    UNION ALL
    SELECT to_ref AS ref FROM entity_links WHERE status IN ('proposed', 'confirmed')
  ) sub
  GROUP BY ref
) lc ON lc.ref = e.entity_ref
LEFT JOIN (
  SELECT entity_ref, count(*)::int AS mention_count
  FROM document_entity_mentions
  GROUP BY entity_ref
) mc ON mc.entity_ref = e.entity_ref
WHERE e.is_deleted = false;

-- ============================================================
-- 11) Helper function for GlobalRef construction
-- ============================================================
CREATE OR REPLACE FUNCTION make_global_ref(
  p_source_system text,
  p_source_type   text,
  p_source_id     text
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT  -- STRICT: returns NULL if any arg is NULL
AS $$
  SELECT p_source_system || ':' || p_source_type || ':' || p_source_id;
$$;

-- ============================================================
-- 12) Auto-update `updated_at` trigger for LightRAG tables
--     Prevents stale updated_at when application code forgets to set it.
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'source_documents',
    'entities',
    'entity_links'
  ]
  LOOP
    trg := tbl || '_set_updated_at';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = to_regclass(tbl)
        AND tgname = trg
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        trg,
        tbl
      );
    END IF;
  END LOOP;
END $$;
