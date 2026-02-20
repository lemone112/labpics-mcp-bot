-- Migration 0026: Add project lifecycle phase (Iter 62.8)
-- Enables phase-aware upsell detection and NBA generation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_phase') THEN
    CREATE TYPE project_phase AS ENUM (
      'kickoff', 'active', 'review', 'handoff', 'warranty', 'completed'
    );
  END IF;
END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS phase project_phase NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_projects_phase ON projects (phase) WHERE phase NOT IN ('completed');
