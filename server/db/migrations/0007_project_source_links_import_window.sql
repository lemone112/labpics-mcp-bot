ALTER TABLE project_source_links
  ADD COLUMN IF NOT EXISTS import_from_ts timestamptz;

UPDATE project_source_links
SET import_from_ts = COALESCE(import_from_ts, created_at)
WHERE import_from_ts IS NULL;

ALTER TABLE project_source_links
  ALTER COLUMN import_from_ts SET DEFAULT now();

ALTER TABLE project_source_links
  ALTER COLUMN import_from_ts SET NOT NULL;

CREATE INDEX IF NOT EXISTS project_source_links_project_type_window_idx
  ON project_source_links (project_id, source_type, import_from_ts);
