-- =============================================================================
-- Migration 0024: Add FK constraint to idempotency_keys (audit fix)
-- =============================================================================
-- idempotency_keys.project_id was NOT NULL but had no FK to projects(id).
-- This caused orphaned rows when a project was deleted.
-- =============================================================================

-- Remove any orphaned rows first (safety)
DELETE FROM idempotency_keys
WHERE project_id NOT IN (SELECT id FROM projects);

-- Add the FK constraint with CASCADE delete
ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_project_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
