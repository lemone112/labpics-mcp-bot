-- Migration 0026: Expression indexes for COALESCE(updated_at, created_at)
-- Iter 63.3: 4 queries in event-log.js use this expression for range filtering.
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Run this migration outside of BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cw_messages_coalesce_ts
  ON cw_messages (project_id, account_scope_id, (COALESCE(updated_at, created_at)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_linear_issues_raw_coalesce_ts
  ON linear_issues_raw (project_id, account_scope_id, (COALESCE(updated_at, created_at)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attio_opportunities_raw_coalesce_ts
  ON attio_opportunities_raw (project_id, account_scope_id, (COALESCE(updated_at, created_at)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cw_contacts_coalesce_ts
  ON cw_contacts (project_id, account_scope_id, (COALESCE(updated_at, created_at)));
