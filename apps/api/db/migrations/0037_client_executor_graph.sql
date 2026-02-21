-- =============================================================================
-- Migration 0037: Client ↔ Executor dependency graph (Iter 64.2)
-- =============================================================================
-- Adds:
--   1) client_executor_links
--   2) client_executor_dependencies
--   3) client_executor_events
-- with strict integrity guarantees: scope safety, client existence,
-- active allocation <= 100%, and cycle-free dependencies.

-- ---------------------------------------------------------------------------
-- 1) Links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_executor_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  client_type text NOT NULL,
  client_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  link_type text NOT NULL,
  allocation_pct numeric(5,2) NOT NULL DEFAULT 0,
  priority int NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'planned',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_executor_links_client_type_check
    CHECK (client_type IN ('crm_account', 'crm_opportunity')),
  CONSTRAINT client_executor_links_link_type_check
    CHECK (link_type IN ('owner', 'delivery_lead', 'backup', 'reviewer', 'observer')),
  CONSTRAINT client_executor_links_allocation_check
    CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
  CONSTRAINT client_executor_links_priority_check
    CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT client_executor_links_status_check
    CHECK (status IN ('active', 'planned', 'paused', 'ended')),
  CONSTRAINT client_executor_links_period_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS client_executor_links_project_client_status_idx
  ON client_executor_links (project_id, client_type, client_id, status);

CREATE INDEX IF NOT EXISTS client_executor_links_employee_status_idx
  ON client_executor_links (employee_id, status, effective_from DESC);

CREATE INDEX IF NOT EXISTS client_executor_links_scope_link_type_idx
  ON client_executor_links (account_scope_id, link_type, status);

CREATE UNIQUE INDEX IF NOT EXISTS client_executor_links_active_unique_idx
  ON client_executor_links (project_id, client_type, client_id, employee_id, link_type)
  WHERE status IN ('active', 'planned')
    AND effective_to IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Dependencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_executor_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  parent_link_id uuid NOT NULL REFERENCES client_executor_links(id) ON DELETE CASCADE,
  child_link_id uuid NOT NULL REFERENCES client_executor_links(id) ON DELETE CASCADE,
  dependency_kind text NOT NULL DEFAULT 'requires',
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_executor_dependencies_no_self_check
    CHECK (parent_link_id <> child_link_id),
  CONSTRAINT client_executor_dependencies_kind_check
    CHECK (dependency_kind IN ('requires', 'blocks', 'handoff', 'review')),
  CONSTRAINT client_executor_dependencies_unique_pair
    UNIQUE (parent_link_id, child_link_id)
);

CREATE INDEX IF NOT EXISTS client_executor_dependencies_parent_idx
  ON client_executor_dependencies (parent_link_id);

CREATE INDEX IF NOT EXISTS client_executor_dependencies_child_idx
  ON client_executor_dependencies (child_link_id);

CREATE INDEX IF NOT EXISTS client_executor_dependencies_scope_idx
  ON client_executor_dependencies (account_scope_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Event log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_executor_events (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  link_id uuid REFERENCES client_executor_links(id) ON DELETE CASCADE,
  dependency_id uuid REFERENCES client_executor_dependencies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_executor_events_event_type_check
    CHECK (
      event_type IN (
        'link_created',
        'link_updated',
        'link_status_changed',
        'dependency_created',
        'dependency_removed',
        'allocation_adjusted'
      )
    ),
  CONSTRAINT client_executor_events_ref_check
    CHECK (link_id IS NOT NULL OR dependency_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS client_executor_events_link_created_idx
  ON client_executor_events (link_id, created_at DESC)
  WHERE link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_executor_events_dependency_created_idx
  ON client_executor_events (dependency_id, created_at DESC)
  WHERE dependency_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_executor_events_scope_created_idx
  ON client_executor_events (account_scope_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Integrity functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_client_executor_link_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  client_project_id uuid;
  client_scope_id uuid;
  employee_scope_id uuid;
BEGIN
  SELECT e.account_scope_id
  INTO employee_scope_id
  FROM employees AS e
  WHERE e.id = NEW.employee_id
  LIMIT 1;

  IF employee_scope_id IS NULL THEN
    RAISE EXCEPTION 'employee % not found for client_executor_links', NEW.employee_id;
  END IF;

  IF NEW.client_type = 'crm_account' THEN
    SELECT c.project_id, c.account_scope_id
    INTO client_project_id, client_scope_id
    FROM crm_accounts AS c
    WHERE c.id = NEW.client_id
    LIMIT 1;
  ELSIF NEW.client_type = 'crm_opportunity' THEN
    SELECT o.project_id, o.account_scope_id
    INTO client_project_id, client_scope_id
    FROM crm_opportunities AS o
    WHERE o.id = NEW.client_id
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'unsupported client_type: %', NEW.client_type;
  END IF;

  IF client_project_id IS NULL OR client_scope_id IS NULL THEN
    RAISE EXCEPTION
      'client % (%) not found for client_executor_links',
      NEW.client_id, NEW.client_type;
  END IF;

  IF NEW.project_id IS DISTINCT FROM client_project_id THEN
    RAISE EXCEPTION
      'client/project mismatch. expected project %, got %',
      client_project_id, NEW.project_id;
  END IF;

  IF NEW.account_scope_id IS DISTINCT FROM client_scope_id THEN
    RAISE EXCEPTION
      'client/scope mismatch. expected scope %, got %',
      client_scope_id, NEW.account_scope_id;
  END IF;

  IF NEW.account_scope_id IS DISTINCT FROM employee_scope_id THEN
    RAISE EXCEPTION
      'employee/scope mismatch. expected employee scope %, got %',
      employee_scope_id, NEW.account_scope_id;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_client_executor_active_allocation_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_total numeric(7,2);
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- Serialize competing writes on the same client row.
  IF NEW.client_type = 'crm_account' THEN
    PERFORM 1 FROM crm_accounts WHERE id = NEW.client_id FOR UPDATE;
  ELSIF NEW.client_type = 'crm_opportunity' THEN
    PERFORM 1 FROM crm_opportunities WHERE id = NEW.client_id FOR UPDATE;
  END IF;

  SELECT COALESCE(sum(l.allocation_pct), 0)::numeric(7,2)
  INTO active_total
  FROM client_executor_links AS l
  WHERE l.project_id = NEW.project_id
    AND l.client_type = NEW.client_type
    AND l.client_id = NEW.client_id
    AND l.status = 'active'
    AND l.id IS DISTINCT FROM NEW.id;

  IF active_total + NEW.allocation_pct > 100 THEN
    RAISE EXCEPTION
      'active allocation overflow for client % (%): % + % > 100',
      NEW.client_id, NEW.client_type, active_total, NEW.allocation_pct;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_client_executor_dependency_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_project_id uuid;
  parent_scope_id uuid;
  parent_client_type text;
  parent_client_id uuid;
  child_project_id uuid;
  child_scope_id uuid;
  child_client_type text;
  child_client_id uuid;
BEGIN
  SELECT project_id, account_scope_id, client_type, client_id
  INTO parent_project_id, parent_scope_id, parent_client_type, parent_client_id
  FROM client_executor_links
  WHERE id = NEW.parent_link_id
  LIMIT 1;

  IF parent_project_id IS NULL THEN
    RAISE EXCEPTION 'parent_link % not found', NEW.parent_link_id;
  END IF;

  SELECT project_id, account_scope_id, client_type, client_id
  INTO child_project_id, child_scope_id, child_client_type, child_client_id
  FROM client_executor_links
  WHERE id = NEW.child_link_id
  LIMIT 1;

  IF child_project_id IS NULL THEN
    RAISE EXCEPTION 'child_link % not found', NEW.child_link_id;
  END IF;

  IF NEW.parent_link_id = NEW.child_link_id THEN
    RAISE EXCEPTION 'self dependency is not allowed for link %', NEW.parent_link_id;
  END IF;

  IF parent_project_id IS DISTINCT FROM child_project_id
     OR parent_scope_id IS DISTINCT FROM child_scope_id THEN
    RAISE EXCEPTION
      'dependency links must share same project and scope. parent(%, %) child(%, %)',
      parent_project_id, parent_scope_id, child_project_id, child_scope_id;
  END IF;

  IF parent_client_type IS DISTINCT FROM child_client_type
     OR parent_client_id IS DISTINCT FROM child_client_id THEN
    RAISE EXCEPTION
      'dependency links must target same client. parent(%:%) child(%:%)',
      parent_client_type, parent_client_id, child_client_type, child_client_id;
  END IF;

  IF NEW.project_id IS DISTINCT FROM parent_project_id
     OR NEW.account_scope_id IS DISTINCT FROM parent_scope_id THEN
    RAISE EXCEPTION
      'dependency row scope mismatch. expected project/scope (%, %), got (%, %)',
      parent_project_id, parent_scope_id, NEW.project_id, NEW.account_scope_id;
  END IF;

  RETURN NEW;
END $$;

-- Cycle detection:
-- We run a DFS-like recursive CTE from NEW.child_link_id and reject if we can
-- reach NEW.parent_link_id. Complexity is O(V + E) over the reachable subgraph.
CREATE OR REPLACE FUNCTION enforce_client_executor_dependency_acyclic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_found boolean;
BEGIN
  IF NEW.parent_link_id = NEW.child_link_id THEN
    RAISE EXCEPTION 'self dependency is not allowed for link %', NEW.parent_link_id;
  END IF;

  WITH RECURSIVE walk(node) AS (
    SELECT d.child_link_id
    FROM client_executor_dependencies AS d
    WHERE d.parent_link_id = NEW.child_link_id
      AND d.id IS DISTINCT FROM NEW.id
    UNION
    SELECT d.child_link_id
    FROM client_executor_dependencies AS d
    INNER JOIN walk AS w ON d.parent_link_id = w.node
    WHERE d.id IS DISTINCT FROM NEW.id
  )
  SELECT EXISTS (
    SELECT 1
    FROM walk
    WHERE node = NEW.parent_link_id
  )
  INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION
      'dependency cycle detected when adding edge % -> %',
      NEW.parent_link_id, NEW.child_link_id;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_client_executor_event_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  link_project_id uuid;
  link_scope_id uuid;
  dep_project_id uuid;
  dep_scope_id uuid;
BEGIN
  IF NEW.link_id IS NOT NULL THEN
    SELECT project_id, account_scope_id
    INTO link_project_id, link_scope_id
    FROM client_executor_links
    WHERE id = NEW.link_id
    LIMIT 1;

    IF link_project_id IS NULL THEN
      RAISE EXCEPTION 'link_id % not found for event', NEW.link_id;
    END IF;

    IF NEW.project_id IS DISTINCT FROM link_project_id
       OR NEW.account_scope_id IS DISTINCT FROM link_scope_id THEN
      RAISE EXCEPTION
        'event/link scope mismatch. expected project/scope (%, %), got (%, %)',
        link_project_id, link_scope_id, NEW.project_id, NEW.account_scope_id;
    END IF;
  END IF;

  IF NEW.dependency_id IS NOT NULL THEN
    SELECT project_id, account_scope_id
    INTO dep_project_id, dep_scope_id
    FROM client_executor_dependencies
    WHERE id = NEW.dependency_id
    LIMIT 1;

    IF dep_project_id IS NULL THEN
      RAISE EXCEPTION 'dependency_id % not found for event', NEW.dependency_id;
    END IF;

    IF NEW.project_id IS DISTINCT FROM dep_project_id
       OR NEW.account_scope_id IS DISTINCT FROM dep_scope_id THEN
      RAISE EXCEPTION
        'event/dependency scope mismatch. expected project/scope (%, %), got (%, %)',
        dep_project_id, dep_scope_id, NEW.project_id, NEW.account_scope_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('client_executor_links')
      AND tgname = 'client_executor_links_scope_guard'
  ) THEN
    CREATE TRIGGER client_executor_links_scope_guard
    BEFORE INSERT OR UPDATE ON client_executor_links
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('client_executor_links')
      AND tgname = 'client_executor_links_integrity_guard'
  ) THEN
    CREATE TRIGGER client_executor_links_integrity_guard
    BEFORE INSERT OR UPDATE ON client_executor_links
    FOR EACH ROW
    EXECUTE FUNCTION enforce_client_executor_link_integrity();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('client_executor_links')
      AND tgname = 'client_executor_links_allocation_guard'
  ) THEN
    CREATE TRIGGER client_executor_links_allocation_guard
    BEFORE INSERT OR UPDATE ON client_executor_links
    FOR EACH ROW
    EXECUTE FUNCTION enforce_client_executor_active_allocation_limit();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('client_executor_dependencies')
      AND tgname = 'client_executor_dependencies_scope_guard'
  ) THEN
    CREATE TRIGGER client_executor_dependencies_scope_guard
    BEFORE INSERT OR UPDATE ON client_executor_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('client_executor_dependencies')
      AND tgname = 'client_executor_dependencies_integrity_guard'
  ) THEN
    CREATE TRIGGER client_executor_dependencies_integrity_guard
    BEFORE INSERT OR UPDATE ON client_executor_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION enforce_client_executor_dependency_integrity();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('client_executor_dependencies')
      AND tgname = 'client_executor_dependencies_cycle_guard'
  ) THEN
    CREATE TRIGGER client_executor_dependencies_cycle_guard
    BEFORE INSERT OR UPDATE ON client_executor_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION enforce_client_executor_dependency_acyclic();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('client_executor_events')
      AND tgname = 'client_executor_events_scope_guard'
  ) THEN
    CREATE TRIGGER client_executor_events_scope_guard
    BEFORE INSERT OR UPDATE ON client_executor_events
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('client_executor_events')
      AND tgname = 'client_executor_events_integrity_guard'
  ) THEN
    CREATE TRIGGER client_executor_events_integrity_guard
    BEFORE INSERT OR UPDATE ON client_executor_events
    FOR EACH ROW
    EXECUTE FUNCTION enforce_client_executor_event_integrity();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill owner links where owner_username can be resolved to employee
-- ---------------------------------------------------------------------------
INSERT INTO client_executor_links (
  project_id,
  account_scope_id,
  client_type,
  client_id,
  employee_id,
  link_type,
  allocation_pct,
  priority,
  status,
  effective_from,
  source,
  metadata
)
SELECT
  c.project_id,
  c.account_scope_id,
  'crm_account',
  c.id,
  e.id,
  'owner',
  100,
  1,
  'active',
  COALESCE(c.updated_at, c.created_at, now()),
  'backfill_owner_username',
  jsonb_build_object('owner_username', c.owner_username)
FROM crm_accounts AS c
INNER JOIN app_users AS u
  ON lower(u.username) = lower(c.owner_username)
INNER JOIN employees AS e
  ON e.user_id = u.id
 AND e.account_scope_id = c.account_scope_id
WHERE c.owner_username IS NOT NULL
  AND btrim(c.owner_username) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM client_executor_links AS l
    WHERE l.project_id = c.project_id
      AND l.client_type = 'crm_account'
      AND l.client_id = c.id
      AND l.employee_id = e.id
      AND l.link_type = 'owner'
      AND l.status IN ('active', 'planned')
      AND l.effective_to IS NULL
  );

INSERT INTO client_executor_links (
  project_id,
  account_scope_id,
  client_type,
  client_id,
  employee_id,
  link_type,
  allocation_pct,
  priority,
  status,
  effective_from,
  source,
  metadata
)
SELECT
  o.project_id,
  o.account_scope_id,
  'crm_opportunity',
  o.id,
  e.id,
  'owner',
  100,
  1,
  'active',
  COALESCE(o.updated_at, o.created_at, now()),
  'backfill_owner_username',
  jsonb_build_object('owner_username', o.owner_username)
FROM crm_opportunities AS o
INNER JOIN app_users AS u
  ON lower(u.username) = lower(o.owner_username)
INNER JOIN employees AS e
  ON e.user_id = u.id
 AND e.account_scope_id = o.account_scope_id
WHERE o.owner_username IS NOT NULL
  AND btrim(o.owner_username) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM client_executor_links AS l
    WHERE l.project_id = o.project_id
      AND l.client_type = 'crm_opportunity'
      AND l.client_id = o.id
      AND l.employee_id = e.id
      AND l.link_type = 'owner'
      AND l.status IN ('active', 'planned')
      AND l.effective_to IS NULL
  );
