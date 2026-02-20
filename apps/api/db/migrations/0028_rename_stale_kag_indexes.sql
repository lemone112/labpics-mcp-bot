-- Migration 0027: Rename remaining kag_event_log indexes (Iter 63.5)
-- 0022 renamed table and 2 indexes; 3 indexes + 1 constraint were missed.

ALTER INDEX IF EXISTS kag_event_log_project_occurred_idx RENAME TO connector_events_project_occurred_idx;
ALTER INDEX IF EXISTS kag_event_log_source_ref_idx RENAME TO connector_events_source_ref_idx;
ALTER INDEX IF EXISTS kag_event_log_type_occurred_idx RENAME TO connector_events_type_occurred_idx;

-- Rename constraint from migration 0013
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kag_event_log_event_type_check'
  ) THEN
    ALTER TABLE connector_events RENAME CONSTRAINT kag_event_log_event_type_check TO connector_events_event_type_check;
  END IF;
END $$;
