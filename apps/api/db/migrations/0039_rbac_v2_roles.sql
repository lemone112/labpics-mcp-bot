-- =============================================================================
-- Migration 0039: RBAC v2 role set expansion
-- =============================================================================
-- Expands app_users.role from owner|pm to:
-- owner|pm|delivery_lead|executor|viewer

UPDATE app_users
SET role = 'pm'
WHERE role IS NULL
   OR lower(btrim(role)) NOT IN ('owner', 'pm', 'delivery_lead', 'executor', 'viewer');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_role_check'
  ) THEN
    ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
  END IF;
END $$;

ALTER TABLE app_users
  ALTER COLUMN role SET DEFAULT 'pm';

ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('owner', 'pm', 'delivery_lead', 'executor', 'viewer'));
