-- =============================================================================
-- Migration 0030: Multi-user RBAC (Iter 49)
-- =============================================================================
-- Tasks: 49.1 users table upgrade, 49.3 session user_id, 49.5 project_assignments,
--        49.8 audit_events user_id
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 49.1: Extend app_users with role and email
-- ---------------------------------------------------------------------------

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'pm'
    CHECK (role IN ('owner', 'pm'));

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique_idx
  ON app_users (lower(email)) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 49.3: Add user_id to sessions table
-- ---------------------------------------------------------------------------

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fk'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_user_id_fk
      FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sessions_user_id_idx
  ON sessions (user_id) WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 49.5: Project-user assignments table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS project_assignments_project_idx
  ON project_assignments (project_id);

CREATE INDEX IF NOT EXISTS project_assignments_user_idx
  ON project_assignments (user_id);

-- ---------------------------------------------------------------------------
-- 49.8: Add user_id to audit_events
-- ---------------------------------------------------------------------------

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_events_actor_user_fk'
  ) THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT audit_events_actor_user_fk
      FOREIGN KEY (actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS audit_events_actor_user_idx
  ON audit_events (actor_user_id) WHERE actor_user_id IS NOT NULL;
