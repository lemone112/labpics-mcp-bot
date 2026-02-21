-- =============================================================================
-- Migration 0035: Scope hardening for reports and search analytics
-- =============================================================================
-- Goals:
-- 1) Enforce strict project/account_scope consistency on report/search tables.
-- 2) Prevent cross-scope writes at DB level via scope guard triggers.
-- 3) Add missing FKs and indexes for scope-safe analytics queries.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Backfill account_scope_id from projects (for legacy/inconsistent rows)
-- ---------------------------------------------------------------------------
UPDATE report_templates AS t
SET account_scope_id = p.account_scope_id
FROM projects AS p
WHERE t.project_id = p.id
  AND t.account_scope_id IS DISTINCT FROM p.account_scope_id;

UPDATE generated_reports AS t
SET account_scope_id = p.account_scope_id
FROM projects AS p
WHERE t.project_id = p.id
  AND t.account_scope_id IS DISTINCT FROM p.account_scope_id;

UPDATE search_analytics AS t
SET account_scope_id = p.account_scope_id
FROM projects AS p
WHERE t.project_id = p.id
  AND (
    t.account_scope_id IS NULL
    OR t.account_scope_id IS DISTINCT FROM p.account_scope_id
  );

-- search_analytics rows without project/scope cannot be made scope-safe.
DELETE FROM search_analytics
WHERE project_id IS NULL
   OR account_scope_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Add missing account_scope FKs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_templates_scope_fk'
  ) THEN
    ALTER TABLE report_templates
      ADD CONSTRAINT report_templates_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_reports_scope_fk'
  ) THEN
    ALTER TABLE generated_reports
      ADD CONSTRAINT generated_reports_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'search_analytics_scope_fk'
  ) THEN
    ALTER TABLE search_analytics
      ADD CONSTRAINT search_analytics_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Tighten search_analytics scope contract
-- ---------------------------------------------------------------------------
ALTER TABLE search_analytics
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN account_scope_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Scope guards (project_id/account_scope_id consistency)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('report_templates')
      AND tgname = 'report_templates_scope_guard'
  ) THEN
    CREATE TRIGGER report_templates_scope_guard
    BEFORE INSERT OR UPDATE ON report_templates
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('generated_reports')
      AND tgname = 'generated_reports_scope_guard'
  ) THEN
    CREATE TRIGGER generated_reports_scope_guard
    BEFORE INSERT OR UPDATE ON generated_reports
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('search_analytics')
      AND tgname = 'search_analytics_scope_guard'
  ) THEN
    CREATE TRIGGER search_analytics_scope_guard
    BEFORE INSERT OR UPDATE ON search_analytics
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) generated_reports template scope consistency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_generated_reports_template_scope_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tpl_project_id uuid;
  tpl_scope_id uuid;
BEGIN
  IF NEW.template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project_id, account_scope_id
  INTO tpl_project_id, tpl_scope_id
  FROM report_templates
  WHERE id = NEW.template_id
  LIMIT 1;

  IF tpl_project_id IS NULL THEN
    RAISE EXCEPTION 'report template % not found for generated_reports', NEW.template_id;
  END IF;

  IF NEW.project_id IS DISTINCT FROM tpl_project_id THEN
    RAISE EXCEPTION
      'generated_reports template/project mismatch. expected project %, got %',
      tpl_project_id, NEW.project_id;
  END IF;

  IF NEW.account_scope_id IS DISTINCT FROM tpl_scope_id THEN
    RAISE EXCEPTION
      'generated_reports template/scope mismatch. expected scope %, got %',
      tpl_scope_id, NEW.account_scope_id;
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('generated_reports')
      AND tgname = 'generated_reports_template_scope_guard'
  ) THEN
    CREATE TRIGGER generated_reports_template_scope_guard
    BEFORE INSERT OR UPDATE ON generated_reports
    FOR EACH ROW
    EXECUTE FUNCTION enforce_generated_reports_template_scope_match();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Scope-oriented indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS search_analytics_project_scope_created_idx
  ON search_analytics (project_id, account_scope_id, created_at DESC);

CREATE INDEX IF NOT EXISTS search_analytics_scope_event_created_idx
  ON search_analytics (account_scope_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS report_templates_scope_active_updated_idx
  ON report_templates (account_scope_id, active, updated_at DESC);

CREATE INDEX IF NOT EXISTS generated_reports_scope_status_created_idx
  ON generated_reports (account_scope_id, status, created_at DESC);
