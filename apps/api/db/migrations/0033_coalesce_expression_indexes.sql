-- Expression indexes for COALESCE(updated_at, created_at) used by event-log queries.
-- Without these, PostgreSQL cannot use indexes for the ordering/filtering expressions
-- in loadChatwootEventCandidates, loadLinearEventCandidates, loadAttioEventCandidates.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cw_messages_coalesce_ts
  ON cw_messages (project_id, account_scope_id, (COALESCE(updated_at, created_at)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_linear_issues_raw_coalesce_ts
  ON linear_issues_raw (project_id, account_scope_id, (COALESCE(updated_at, created_at)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attio_opportunities_raw_coalesce_ts
  ON attio_opportunities_raw (project_id, account_scope_id, (COALESCE(updated_at, created_at)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attio_activities_raw_coalesce_ts
  ON attio_activities_raw (project_id, account_scope_id, (COALESCE(updated_at, created_at)));
