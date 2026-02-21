-- =============================================================================
-- Migration 0038: owner_username -> owner_user_id transition
-- =============================================================================
-- Scope:
--   - Add owner_user_id to CRM entities.
--   - Backfill owner_user_id from legacy owner_username.
--   - Log unresolved usernames into owner_backfill_errors.
--   - Keep read/write compatibility via sync triggers.

-- ---------------------------------------------------------------------------
-- 1) New owner_user_id columns + FK/indexes
-- ---------------------------------------------------------------------------
ALTER TABLE crm_accounts
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_accounts_owner_user_fk'
  ) THEN
    ALTER TABLE crm_accounts
      ADD CONSTRAINT crm_accounts_owner_user_fk
      FOREIGN KEY (owner_user_id) REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_opportunities_owner_user_fk'
  ) THEN
    ALTER TABLE crm_opportunities
      ADD CONSTRAINT crm_opportunities_owner_user_fk
      FOREIGN KEY (owner_user_id) REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_accounts_owner_user_idx
  ON crm_accounts (owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_opportunities_owner_user_idx
  ON crm_opportunities (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Backfill error log for unresolved owner_username
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owner_backfill_errors (
  id bigserial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  owner_username text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_backfill_errors_entity_type_check
    CHECK (entity_type IN ('crm_account', 'crm_opportunity')),
  CONSTRAINT owner_backfill_errors_reason_check
    CHECK (reason IN ('username_not_found'))
);

CREATE UNIQUE INDEX IF NOT EXISTS owner_backfill_errors_unique_idx
  ON owner_backfill_errors (entity_type, entity_id, owner_username, reason);

CREATE INDEX IF NOT EXISTS owner_backfill_errors_scope_created_idx
  ON owner_backfill_errors (account_scope_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('owner_backfill_errors')
      AND tgname = 'owner_backfill_errors_scope_guard'
  ) THEN
    CREATE TRIGGER owner_backfill_errors_scope_guard
    BEFORE INSERT OR UPDATE ON owner_backfill_errors
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Sync & backfill helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_owner_reference_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_user_id uuid;
  resolved_username text;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    SELECT id, username
    INTO resolved_user_id, resolved_username
    FROM app_users
    WHERE id = NEW.owner_user_id
    LIMIT 1;

    IF resolved_user_id IS NULL THEN
      RAISE EXCEPTION 'owner_user_id % not found for table %', NEW.owner_user_id, TG_TABLE_NAME;
    END IF;

    NEW.owner_username = resolved_username;
    RETURN NEW;
  END IF;

  IF NEW.owner_username IS NULL OR btrim(NEW.owner_username) = '' THEN
    NEW.owner_username = NULL;
    RETURN NEW;
  END IF;

  SELECT id, username
  INTO resolved_user_id, resolved_username
  FROM app_users
  WHERE lower(username) = lower(NEW.owner_username)
  LIMIT 1;

  IF resolved_user_id IS NOT NULL THEN
    NEW.owner_user_id = resolved_user_id;
    NEW.owner_username = resolved_username;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION log_unresolved_owner_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entity_name text;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_username IS NULL OR btrim(NEW.owner_username) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'crm_accounts' THEN
    entity_name := 'crm_account';
  ELSIF TG_TABLE_NAME = 'crm_opportunities' THEN
    entity_name := 'crm_opportunity';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO owner_backfill_errors(
    entity_type,
    entity_id,
    project_id,
    account_scope_id,
    owner_username,
    reason
  )
  VALUES (
    entity_name,
    NEW.id,
    NEW.project_id,
    NEW.account_scope_id,
    NEW.owner_username,
    'username_not_found'
  )
  ON CONFLICT (entity_type, entity_id, owner_username, reason) DO NOTHING;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION run_owner_backfill()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE crm_accounts AS c
  SET owner_user_id = u.id,
      owner_username = u.username,
      updated_at = now()
  FROM app_users AS u
  WHERE c.owner_user_id IS NULL
    AND c.owner_username IS NOT NULL
    AND btrim(c.owner_username) <> ''
    AND lower(u.username) = lower(c.owner_username);

  UPDATE crm_opportunities AS o
  SET owner_user_id = u.id,
      owner_username = u.username,
      updated_at = now()
  FROM app_users AS u
  WHERE o.owner_user_id IS NULL
    AND o.owner_username IS NOT NULL
    AND btrim(o.owner_username) <> ''
    AND lower(u.username) = lower(o.owner_username);

  INSERT INTO owner_backfill_errors(
    entity_type,
    entity_id,
    project_id,
    account_scope_id,
    owner_username,
    reason
  )
  SELECT
    'crm_account',
    c.id,
    c.project_id,
    c.account_scope_id,
    c.owner_username,
    'username_not_found'
  FROM crm_accounts AS c
  LEFT JOIN app_users AS u ON lower(u.username) = lower(c.owner_username)
  WHERE c.owner_user_id IS NULL
    AND c.owner_username IS NOT NULL
    AND btrim(c.owner_username) <> ''
    AND u.id IS NULL
  ON CONFLICT (entity_type, entity_id, owner_username, reason) DO NOTHING;

  INSERT INTO owner_backfill_errors(
    entity_type,
    entity_id,
    project_id,
    account_scope_id,
    owner_username,
    reason
  )
  SELECT
    'crm_opportunity',
    o.id,
    o.project_id,
    o.account_scope_id,
    o.owner_username,
    'username_not_found'
  FROM crm_opportunities AS o
  LEFT JOIN app_users AS u ON lower(u.username) = lower(o.owner_username)
  WHERE o.owner_user_id IS NULL
    AND o.owner_username IS NOT NULL
    AND btrim(o.owner_username) <> ''
    AND u.id IS NULL
  ON CONFLICT (entity_type, entity_id, owner_username, reason) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Triggers
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('crm_accounts')
      AND tgname = 'crm_accounts_owner_sync_guard'
  ) THEN
    CREATE TRIGGER crm_accounts_owner_sync_guard
    BEFORE INSERT OR UPDATE ON crm_accounts
    FOR EACH ROW
    EXECUTE FUNCTION sync_owner_reference_fields();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('crm_opportunities')
      AND tgname = 'crm_opportunities_owner_sync_guard'
  ) THEN
    CREATE TRIGGER crm_opportunities_owner_sync_guard
    BEFORE INSERT OR UPDATE ON crm_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION sync_owner_reference_fields();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('crm_accounts')
      AND tgname = 'crm_accounts_owner_log_guard'
  ) THEN
    CREATE TRIGGER crm_accounts_owner_log_guard
    AFTER INSERT OR UPDATE ON crm_accounts
    FOR EACH ROW
    EXECUTE FUNCTION log_unresolved_owner_reference();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('crm_opportunities')
      AND tgname = 'crm_opportunities_owner_log_guard'
  ) THEN
    CREATE TRIGGER crm_opportunities_owner_log_guard
    AFTER INSERT OR UPDATE ON crm_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION log_unresolved_owner_reference();
  END IF;
END $$;

-- Initial pass for existing data.
SELECT run_owner_backfill();
