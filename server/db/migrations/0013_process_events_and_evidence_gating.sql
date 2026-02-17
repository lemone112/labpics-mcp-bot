DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kag_event_log_event_type_check'
  ) THEN
    ALTER TABLE kag_event_log DROP CONSTRAINT kag_event_log_event_type_check;
  END IF;
END $$;

ALTER TABLE kag_event_log
  ADD CONSTRAINT kag_event_log_event_type_check
  CHECK (
    event_type IN (
      'message_sent',
      'client_silent_started',
      'approval_requested',
      'approval_approved',
      'stage_started',
      'stage_completed',
      'issue_created',
      'issue_blocked',
      'issue_unblocked',
      'scope_change_detected',
      'deal_stage_changed',
      'invoice_sent',
      'invoice_paid',
      'contact_updated',
      'note_logged',
      'activity_logged',
      'process_started',
      'process_finished',
      'process_failed',
      'process_warning'
    )
  );

ALTER TABLE project_snapshots
  ADD COLUMN IF NOT EXISTS evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publishable boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS project_snapshots_project_publishable_idx
  ON project_snapshots (project_id, publishable, snapshot_date DESC);

ALTER TABLE kag_risk_forecasts
  ADD COLUMN IF NOT EXISTS publishable boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS kag_risk_forecasts_project_publishable_idx
  ON kag_risk_forecasts (project_id, publishable, generated_at DESC);
