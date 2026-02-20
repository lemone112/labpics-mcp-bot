-- =============================================================================
-- Migration 0024: Fix audit_event FK ON DELETE policy (Iter 16.1)
-- =============================================================================
-- Three FK constraints reference audit_events(id) with ON DELETE RESTRICT,
-- which blocks audit event cleanup/retention jobs. Change to SET NULL so
-- audit events can be safely purged while preserving referencing rows.
--
-- Affected tables:
--   crm_opportunity_stage_events.audit_event_id
--   offer_approvals.audit_event_id
--   campaign_events.audit_event_id

-- 1. crm_opportunity_stage_events
ALTER TABLE crm_opportunity_stage_events
  DROP CONSTRAINT IF EXISTS crm_opportunity_stage_events_audit_event_id_fkey;
ALTER TABLE crm_opportunity_stage_events
  ALTER COLUMN audit_event_id DROP NOT NULL;
ALTER TABLE crm_opportunity_stage_events
  ADD CONSTRAINT crm_opportunity_stage_events_audit_event_id_fkey
    FOREIGN KEY (audit_event_id) REFERENCES audit_events(id) ON DELETE SET NULL;

-- 2. offer_approvals
ALTER TABLE offer_approvals
  DROP CONSTRAINT IF EXISTS offer_approvals_audit_event_id_fkey;
ALTER TABLE offer_approvals
  ALTER COLUMN audit_event_id DROP NOT NULL;
ALTER TABLE offer_approvals
  ADD CONSTRAINT offer_approvals_audit_event_id_fkey
    FOREIGN KEY (audit_event_id) REFERENCES audit_events(id) ON DELETE SET NULL;

-- 3. campaign_events
ALTER TABLE campaign_events
  DROP CONSTRAINT IF EXISTS campaign_events_audit_event_id_fkey;
ALTER TABLE campaign_events
  ALTER COLUMN audit_event_id DROP NOT NULL;
ALTER TABLE campaign_events
  ADD CONSTRAINT campaign_events_audit_event_id_fkey
    FOREIGN KEY (audit_event_id) REFERENCES audit_events(id) ON DELETE SET NULL;
