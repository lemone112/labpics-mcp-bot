-- =============================================================================
-- Migration 0017: Production index optimizations
-- =============================================================================
-- Context: Deep architecture audit identified missing indexes on the KAG graph
-- layer that would block efficient reverse edge lookups and future graph
-- traversal queries.
--
-- Changes:
--   1. Reverse edge lookup index on kag_edges(to_node_id)
--   2. Forward edge lookup index on kag_edges(from_node_id) scoped by project
--   3. Covering index for edge traversal (index-only scans)
--   4. Partial index on kag_events for unprocessed event queue
--   5. History table retention indexes for efficient pruning
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) kag_edges: reverse edge lookup (incoming edges to a node)
--    The existing UNIQUE constraint covers (project_id, from_node_id, to_node_id,
--    relation_type) which supports forward lookups. This index enables efficient
--    "what edges point TO this node?" queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS kag_edges_to_node_project_idx
  ON kag_edges (to_node_id, project_id, relation_type);

-- ---------------------------------------------------------------------------
-- 2) kag_edges: forward edge lookup by node (without filtering by relation_type)
--    Complements the UNIQUE constraint when relation_type is unknown.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS kag_edges_from_node_project_idx
  ON kag_edges (from_node_id, project_id);

-- ---------------------------------------------------------------------------
-- 3) kag_events: partial index for unprocessed event queue
--    The signal computation reads events WHERE status = 'open' AND id > $last.
--    A partial index avoids scanning the bulk of already-processed events.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS kag_events_open_queue_idx
  ON kag_events (project_id, id ASC)
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 4) kag_signal_history: retention-friendly index
--    Enables efficient DELETE WHERE computed_at < $cutoff per project.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS kag_signal_history_retention_idx
  ON kag_signal_history (project_id, computed_at ASC);

-- ---------------------------------------------------------------------------
-- 5) kag_score_history: retention-friendly index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS kag_score_history_retention_idx
  ON kag_score_history (project_id, computed_at ASC);

-- ---------------------------------------------------------------------------
-- 6) kag_event_log: unprocessed events for pipeline pickup
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS kag_event_log_project_dedupe_idx
  ON kag_event_log (project_id, dedupe_key);

-- ---------------------------------------------------------------------------
-- 7) recommendations_v2: active queue for dashboard display
--    Optimizes the most common query: visible + non-dismissed + ordered by priority.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS recommendations_v2_active_visible_idx
  ON recommendations_v2 (project_id, priority DESC, created_at DESC)
  WHERE evidence_gate_status = 'visible' AND status IN ('new', 'acknowledged');
