-- =============================================================================
-- Migration 0036: Workforce domain schema (Iter 64.1)
-- =============================================================================
-- Introduces employee model, conditions, capacity calendar and skills with
-- scope-safe constraints for multi-tenant isolation.

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_status_check
    CHECK (status IN ('active', 'inactive', 'contractor', 'on_leave')),
  CONSTRAINT employees_display_name_not_blank
    CHECK (btrim(display_name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS employees_scope_user_id_unique_idx
  ON employees (account_scope_id, user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_scope_status_idx
  ON employees (account_scope_id, status);

-- ---------------------------------------------------------------------------
-- employee_conditions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  condition_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_conditions_type_check
    CHECK (condition_type IN ('rate', 'workload', 'contract', 'sla', 'availability_rule')),
  CONSTRAINT employee_conditions_period_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS employee_conditions_employee_effective_idx
  ON employee_conditions (employee_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS employee_conditions_project_effective_idx
  ON employee_conditions (project_id, effective_from DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS employee_conditions_scope_type_idx
  ON employee_conditions (account_scope_id, condition_type, effective_from DESC);

-- ---------------------------------------------------------------------------
-- employee_capacity_calendar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_capacity_calendar (
  id bigserial PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  day date NOT NULL,
  capacity_hours numeric(6,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_capacity_calendar_capacity_check
    CHECK (capacity_hours >= 0 AND capacity_hours <= 24),
  CONSTRAINT employee_capacity_calendar_employee_project_day_unique
    UNIQUE (employee_id, project_id, day)
);

-- UNIQUE(employee_id, project_id, day) does not deduplicate NULL project_id rows.
CREATE UNIQUE INDEX IF NOT EXISTS employee_capacity_calendar_employee_day_null_project_unique_idx
  ON employee_capacity_calendar (employee_id, day)
  WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS employee_capacity_calendar_day_project_idx
  ON employee_capacity_calendar (day, project_id);

CREATE INDEX IF NOT EXISTS employee_capacity_calendar_scope_day_idx
  ON employee_capacity_calendar (account_scope_id, day DESC);

-- ---------------------------------------------------------------------------
-- employee_skills
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_skills (
  id bigserial PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  skill_key text NOT NULL,
  skill_level int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_skills_level_check
    CHECK (skill_level BETWEEN 1 AND 5),
  CONSTRAINT employee_skills_skill_key_not_blank
    CHECK (btrim(skill_key) <> ''),
  CONSTRAINT employee_skills_employee_skill_unique
    UNIQUE (employee_id, skill_key)
);

CREATE INDEX IF NOT EXISTS employee_skills_scope_skill_idx
  ON employee_skills (account_scope_id, skill_key);

-- ---------------------------------------------------------------------------
-- Scope and integrity triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_employee_scope_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_scope uuid;
BEGIN
  IF NEW.employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id is required for %', TG_TABLE_NAME;
  END IF;

  SELECT e.account_scope_id
  INTO expected_scope
  FROM employees AS e
  WHERE e.id = NEW.employee_id
  LIMIT 1;

  IF expected_scope IS NULL THEN
    RAISE EXCEPTION 'employee % not found for table %', NEW.employee_id, TG_TABLE_NAME;
  END IF;

  IF NEW.account_scope_id IS NULL THEN
    NEW.account_scope_id = expected_scope;
  END IF;

  IF NEW.account_scope_id IS DISTINCT FROM expected_scope THEN
    RAISE EXCEPTION
      'employee scope mismatch on %. expected scope %, got %',
      TG_TABLE_NAME, expected_scope, NEW.account_scope_id;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_employee_conditions_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conflict_id uuid;
BEGIN
  IF NEW.effective_to IS NOT NULL AND NEW.effective_to <= NEW.effective_from THEN
    RAISE EXCEPTION 'employee_conditions effective_to must be greater than effective_from';
  END IF;

  -- Serialize competing writes for same employee condition timeline.
  PERFORM 1
  FROM employees
  WHERE id = NEW.employee_id
  FOR UPDATE;

  SELECT c.id
  INTO conflict_id
  FROM employee_conditions AS c
  WHERE c.employee_id = NEW.employee_id
    AND c.condition_type = NEW.condition_type
    AND (
      (c.project_id IS NULL AND NEW.project_id IS NULL)
      OR c.project_id = NEW.project_id
    )
    AND c.id IS DISTINCT FROM NEW.id
    AND tstzrange(c.effective_from, COALESCE(c.effective_to, 'infinity'::timestamptz), '[)')
      && tstzrange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::timestamptz), '[)')
  LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION
      'employee condition overlap detected for employee %, condition %, project %',
      NEW.employee_id, NEW.condition_type, NEW.project_id;
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('employee_conditions')
      AND tgname = 'employee_conditions_employee_scope_guard'
  ) THEN
    CREATE TRIGGER employee_conditions_employee_scope_guard
    BEFORE INSERT OR UPDATE ON employee_conditions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_employee_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('employee_capacity_calendar')
      AND tgname = 'employee_capacity_calendar_employee_scope_guard'
  ) THEN
    CREATE TRIGGER employee_capacity_calendar_employee_scope_guard
    BEFORE INSERT OR UPDATE ON employee_capacity_calendar
    FOR EACH ROW
    EXECUTE FUNCTION enforce_employee_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('employee_skills')
      AND tgname = 'employee_skills_employee_scope_guard'
  ) THEN
    CREATE TRIGGER employee_skills_employee_scope_guard
    BEFORE INSERT OR UPDATE ON employee_skills
    FOR EACH ROW
    EXECUTE FUNCTION enforce_employee_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('employee_conditions')
      AND tgname = 'employee_conditions_project_scope_guard'
  ) THEN
    CREATE TRIGGER employee_conditions_project_scope_guard
    BEFORE INSERT OR UPDATE ON employee_conditions
    FOR EACH ROW
    WHEN (NEW.project_id IS NOT NULL)
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('employee_capacity_calendar')
      AND tgname = 'employee_capacity_calendar_project_scope_guard'
  ) THEN
    CREATE TRIGGER employee_capacity_calendar_project_scope_guard
    BEFORE INSERT OR UPDATE ON employee_capacity_calendar
    FOR EACH ROW
    WHEN (NEW.project_id IS NOT NULL)
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('employee_conditions')
      AND tgname = 'employee_conditions_no_overlap_guard'
  ) THEN
    CREATE TRIGGER employee_conditions_no_overlap_guard
    BEFORE INSERT OR UPDATE ON employee_conditions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_employee_conditions_no_overlap();
  END IF;
END $$;
