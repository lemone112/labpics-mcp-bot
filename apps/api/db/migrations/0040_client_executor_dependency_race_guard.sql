-- =============================================================================
-- Migration 0040: Serialize dependency writes to avoid race-created cycles
-- =============================================================================
-- In concurrent transactions, reciprocal dependency inserts could pass cycle
-- checks before either write is committed. We guard dependency writes with a
-- per-client advisory transaction lock so cycle detection always sees the
-- latest committed edge set.

CREATE OR REPLACE FUNCTION enforce_client_executor_dependency_acyclic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_found boolean;
  lock_key bigint;
BEGIN
  IF NEW.parent_link_id = NEW.child_link_id THEN
    RAISE EXCEPTION 'self dependency is not allowed for link %', NEW.parent_link_id;
  END IF;

  -- Serialize graph mutations for the same client scope to avoid
  -- read-committed races (A->B and B->A inserted in parallel transactions).
  SELECT hashtextextended(
    concat_ws(':', l.project_id::text, l.account_scope_id::text, l.client_type, l.client_id::text),
    0
  )::bigint
  INTO lock_key
  FROM client_executor_links AS l
  WHERE l.id = NEW.parent_link_id
  LIMIT 1;

  IF lock_key IS NULL THEN
    SELECT hashtextextended(
      concat_ws(':', l.project_id::text, l.account_scope_id::text, l.client_type, l.client_id::text),
      0
    )::bigint
    INTO lock_key
    FROM client_executor_links AS l
    WHERE l.id = NEW.child_link_id
    LIMIT 1;
  END IF;

  IF lock_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(lock_key);
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
