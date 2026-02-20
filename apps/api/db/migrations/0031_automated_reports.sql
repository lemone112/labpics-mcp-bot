-- =============================================================================
-- Migration 0031: Automated Reporting System (Iter 48)
-- =============================================================================
-- Tasks: 48.1 report_templates, 48.3 generated_reports
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 48.1: Report templates table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  format text NOT NULL DEFAULT 'json',
  schedule text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_templates_format_check'
  ) THEN
    ALTER TABLE report_templates
      ADD CONSTRAINT report_templates_format_check
      CHECK (format IN ('json', 'html'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS report_templates_project_idx
  ON report_templates (project_id, account_scope_id);

CREATE INDEX IF NOT EXISTS report_templates_active_idx
  ON report_templates (active) WHERE active = true;

-- ---------------------------------------------------------------------------
-- 48.3: Generated reports table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS generated_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES report_templates(id) ON DELETE SET NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL,
  template_name text NOT NULL,
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  format text NOT NULL DEFAULT 'json',
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_reports_format_check'
  ) THEN
    ALTER TABLE generated_reports
      ADD CONSTRAINT generated_reports_format_check
      CHECK (format IN ('json', 'html'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_reports_status_check'
  ) THEN
    ALTER TABLE generated_reports
      ADD CONSTRAINT generated_reports_status_check
      CHECK (status IN ('pending', 'generating', 'completed', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS generated_reports_template_idx
  ON generated_reports (template_id);

CREATE INDEX IF NOT EXISTS generated_reports_project_idx
  ON generated_reports (project_id, account_scope_id);

CREATE INDEX IF NOT EXISTS generated_reports_created_idx
  ON generated_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS generated_reports_status_idx
  ON generated_reports (status);
