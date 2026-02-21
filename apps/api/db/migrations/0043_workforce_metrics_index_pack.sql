-- =============================================================================
-- Migration 0043: Workforce/metrics index pack for read-path stability (Iter 65.3)
-- =============================================================================
-- Purpose:
-- 1) Add covering/composite indexes for critical workload query templates.
-- 2) Reduce probability of regressions to sequential scans on high-cardinality
--    workforce and dependency tables.

-- Workforce active roster lookup:
-- SELECT ... FROM employees WHERE account_scope_id = ? AND status = 'active'
-- ORDER BY updated_at DESC LIMIT ...
CREATE INDEX IF NOT EXISTS employees_scope_status_updated_cover_idx
  ON employees (account_scope_id, status, updated_at DESC, id)
  INCLUDE (display_name);

-- Employee conditions timeline:
-- SELECT ... FROM employee_conditions WHERE employee_id = ?
-- ORDER BY effective_from DESC LIMIT ...
CREATE INDEX IF NOT EXISTS employee_conditions_employee_effective_cover_idx
  ON employee_conditions (employee_id, effective_from DESC, id)
  INCLUDE (project_id, account_scope_id, condition_type, payload, effective_to);

-- Active link list by project/scope with priority sorting:
-- SELECT ... FROM client_executor_links WHERE project_id = ? AND account_scope_id = ?
-- AND status = 'active' ORDER BY priority, effective_from DESC LIMIT ...
CREATE INDEX IF NOT EXISTS client_executor_links_active_project_scope_priority_idx
  ON client_executor_links (project_id, account_scope_id, priority ASC, effective_from DESC, id)
  INCLUDE (client_type, client_id, employee_id, link_type, allocation_pct)
  WHERE status = 'active';

-- Metrics API query/export path:
-- WHERE account_scope_id = ? AND project_id = ? ORDER BY observed_at DESC
CREATE INDEX IF NOT EXISTS metric_observations_scope_project_observed_cover_idx
  ON metric_observations (account_scope_id, project_id, observed_at DESC, id)
  INCLUDE (
    metric_id,
    subject_type,
    subject_id,
    value_numeric,
    value_text,
    source,
    source_event_id,
    is_backfill
  );
