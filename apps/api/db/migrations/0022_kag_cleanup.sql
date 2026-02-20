-- =============================================================================
-- Migration 0022: KAG Cleanup + DB Hygiene (Iter 10)
-- =============================================================================
-- Tasks: 10.2 (rename kag_event_log), 10.5 (DROP KAG tables),
--        10.8 (partial index), 10.9 (drop audit_events_partitioned)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 10.2: Rename kag_event_log → connector_events
--       Table is used by connector-sync pipeline, not KAG.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS kag_event_log RENAME TO connector_events;

-- Rename indexes to match new table name
ALTER INDEX IF EXISTS kag_event_log_pkey RENAME TO connector_events_pkey;
ALTER INDEX IF EXISTS kag_event_log_project_dedupe_idx RENAME TO connector_events_project_dedupe_idx;

-- ---------------------------------------------------------------------------
-- 10.5: DROP unused KAG tables
--       These tables are no longer referenced by any application code.
--       kag_templates is intentionally KEPT (used by recommendations-v2).
--       kag_event_log was renamed above (now connector_events).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS kag_provenance_refs CASCADE;
DROP TABLE IF EXISTS kag_edges CASCADE;
DROP TABLE IF EXISTS kag_nodes CASCADE;
DROP TABLE IF EXISTS kag_signal_state CASCADE;
DROP TABLE IF EXISTS kag_signal_history CASCADE;
DROP TABLE IF EXISTS kag_signals CASCADE;
DROP TABLE IF EXISTS kag_score_history CASCADE;
DROP TABLE IF EXISTS kag_scores CASCADE;
DROP TABLE IF EXISTS kag_recommendations CASCADE;
DROP TABLE IF EXISTS kag_events CASCADE;

-- Drop KAG indexes from migration 0017b that referenced dropped tables
-- (these are automatically dropped with CASCADE above, but explicit for clarity)

-- ---------------------------------------------------------------------------
-- 10.8: Add partial index for pending embeddings
--       Speeds up claimPendingChunks query in embeddings.js
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rag_chunks_pending
  ON rag_chunks (project_id, created_at ASC)
  WHERE embedding_status = 'pending';

-- ---------------------------------------------------------------------------
-- 10.9: Drop unused audit_events_partitioned table
--       Created in migration 0018 but never referenced in application code.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS audit_events_partitioned CASCADE;
DROP FUNCTION IF EXISTS create_audit_partition_if_needed CASCADE;
