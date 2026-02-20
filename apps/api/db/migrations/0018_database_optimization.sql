-- =============================================================================
-- Migration 0018: Database Optimization (Iter 4)
-- =============================================================================
-- 4.1  pg_trgm extension + GIN indexes for ILIKE search
-- 4.2  Materialized view mv_portfolio_dashboard
-- 4.4  Strategic indexes on connector_errors, crm_account_contacts
-- 4.5  Cleanup orphaned tables (app_users, signup_requests)
-- 4.6  Partitioning infrastructure for audit_events
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1: pg_trgm extension + GIN trgm indexes
-- ---------------------------------------------------------------------------
-- pg_trgm accelerates ILIKE / LIKE with %pattern% wildcards.
-- Without this, ILIKE performs sequential scans on every match.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- cw_contacts: name / email searched via ILIKE in /contacts endpoint
CREATE INDEX IF NOT EXISTS cw_contacts_name_trgm_idx
  ON cw_contacts USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS cw_contacts_email_trgm_idx
  ON cw_contacts USING gin (email gin_trgm_ops);

-- cw_messages.content: ILIKE ANY in lightrag entity search
CREATE INDEX IF NOT EXISTS cw_messages_content_trgm_idx
  ON cw_messages USING gin (content gin_trgm_ops);

-- linear_issues_raw.title: ILIKE ANY in lightrag entity search
CREATE INDEX IF NOT EXISTS linear_issues_raw_title_trgm_idx
  ON linear_issues_raw USING gin (title gin_trgm_ops);

-- attio_opportunities_raw.title: ILIKE ANY in lightrag entity search
CREATE INDEX IF NOT EXISTS attio_opportunities_raw_title_trgm_idx
  ON attio_opportunities_raw USING gin (title gin_trgm_ops);

-- evidence_items.snippet: ILIKE ANY in portfolio agreements/risks search
CREATE INDEX IF NOT EXISTS evidence_items_snippet_trgm_idx
  ON evidence_items USING gin (snippet gin_trgm_ops);


-- ---------------------------------------------------------------------------
-- 4.2: Materialized view for portfolio dashboard
-- ---------------------------------------------------------------------------
-- Replaces 6 LATERAL subqueries in getPortfolioOverview with a single
-- pre-computed indexed lookup.  Refreshed concurrently after each sync cycle.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_portfolio_dashboard AS
SELECT
  p.id                                                      AS project_id,
  p.account_scope_id,
  p.name                                                    AS project_name,
  COALESCE(msg.messages_7d, 0)::int                         AS messages_7d,
  COALESCE(lin.issues_open, 0)::int                         AS linear_open_issues,
  COALESCE(att.pipeline_amount, 0)::numeric(14,2)           AS attio_pipeline_amount,
  COALESCE(att.expected_revenue, 0)::numeric(14,2)          AS attio_expected_revenue,
  COALESCE(crm.pipeline_amount, 0)::numeric(14,2)          AS crm_pipeline_amount,
  COALESCE(crm.expected_revenue, 0)::numeric(14,2)          AS expected_revenue,
  COALESCE(hs.health_score, 0)::numeric(6,2)                AS health_score,
  COALESCE(risk.risks_open, 0)::int                         AS risks_open
FROM projects AS p
LEFT JOIN (
  SELECT project_id, account_scope_id,
    count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS messages_7d
  FROM cw_messages
  GROUP BY project_id, account_scope_id
) AS msg ON msg.project_id = p.id AND msg.account_scope_id = p.account_scope_id
LEFT JOIN (
  SELECT project_id, account_scope_id,
    count(*) FILTER (WHERE completed_at IS NULL)::int AS issues_open
  FROM linear_issues_raw
  GROUP BY project_id, account_scope_id
) AS lin ON lin.project_id = p.id AND lin.account_scope_id = p.account_scope_id
LEFT JOIN (
  SELECT project_id, account_scope_id,
    COALESCE(sum(amount), 0)::numeric(14,2) AS pipeline_amount,
    COALESCE(sum(amount * probability), 0)::numeric(14,2) AS expected_revenue
  FROM attio_opportunities_raw
  WHERE lower(COALESCE(stage, '')) NOT IN ('won', 'lost', 'closed-won', 'closed-lost')
  GROUP BY project_id, account_scope_id
) AS att ON att.project_id = p.id AND att.account_scope_id = p.account_scope_id
LEFT JOIN (
  SELECT project_id, account_scope_id,
    COALESCE(sum(amount_estimate), 0)::numeric(14,2) AS pipeline_amount,
    COALESCE(sum(amount_estimate * probability), 0)::numeric(14,2) AS expected_revenue
  FROM crm_opportunities
  WHERE COALESCE(source_system, 'manual') <> 'attio'
    AND stage NOT IN ('won', 'lost')
  GROUP BY project_id, account_scope_id
) AS crm ON crm.project_id = p.id AND crm.account_scope_id = p.account_scope_id
LEFT JOIN (
  SELECT DISTINCT ON (project_id, account_scope_id)
    project_id, account_scope_id, score AS health_score
  FROM health_scores
  ORDER BY project_id, account_scope_id, generated_at DESC
) AS hs ON hs.project_id = p.id AND hs.account_scope_id = p.account_scope_id
LEFT JOIN (
  SELECT project_id, account_scope_id,
    count(*)::int AS risks_open
  FROM risk_radar_items
  WHERE status <> 'closed'
  GROUP BY project_id, account_scope_id
) AS risk ON risk.project_id = p.id AND risk.account_scope_id = p.account_scope_id
WITH DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS mv_portfolio_dashboard_pk
  ON mv_portfolio_dashboard (project_id);

-- Lookup index for the common filter pattern
CREATE INDEX IF NOT EXISTS mv_portfolio_dashboard_scope_idx
  ON mv_portfolio_dashboard (account_scope_id, project_id);


-- ---------------------------------------------------------------------------
-- 4.4: Strategic indexes
-- ---------------------------------------------------------------------------
-- connector_errors: queried by error_kind in dashboard error analytics
CREATE INDEX IF NOT EXISTS connector_errors_kind_idx
  ON connector_errors (project_id, error_kind, status);

-- crm_account_contacts: queried by (project_id, account_id) in CRM joins
CREATE INDEX IF NOT EXISTS crm_account_contacts_project_account_idx
  ON crm_account_contacts (project_id, account_id);


-- ---------------------------------------------------------------------------
-- 4.5: Cleanup orphaned tables
-- ---------------------------------------------------------------------------
-- app_users and signup_requests were created in migration 0004 but are not
-- referenced by any service code.  Auth uses session-based flow via sessions
-- table (migration 0001).  No foreign keys reference these tables.
DROP TABLE IF EXISTS signup_requests;
DROP TABLE IF EXISTS app_users;


-- ---------------------------------------------------------------------------
-- 4.6: Audit events — partitioning infrastructure
-- ---------------------------------------------------------------------------
-- Composite index to cover listAuditEvents with account_scope_id filter
CREATE INDEX IF NOT EXISTS audit_events_scope_created_idx
  ON audit_events (account_scope_id, project_id, created_at DESC);

-- Partition-ready shadow table.  Existing audit_events remains untouched;
-- when the table grows beyond ~5M rows, migrate data and rename.
CREATE TABLE IF NOT EXISTS audit_events_partitioned (
  id bigserial,
  project_id uuid NOT NULL,
  account_scope_id uuid NOT NULL,
  actor_username text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  status text NOT NULL DEFAULT 'ok',
  request_id text,
  idempotency_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Helper: create a monthly partition for a given date
CREATE OR REPLACE FUNCTION create_monthly_audit_partition(target_date date DEFAULT current_date)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  partition_name text;
  start_date date;
  end_date date;
BEGIN
  start_date := date_trunc('month', target_date)::date;
  end_date   := (start_date + interval '1 month')::date;
  partition_name := 'audit_events_y' || to_char(start_date, 'YYYY') || 'm' || to_char(start_date, 'MM');
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_events_partitioned FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
  RETURN partition_name;
END;
$$;

-- Seed current month + next 3 months
SELECT create_monthly_audit_partition(current_date);
SELECT create_monthly_audit_partition((current_date + interval '1 month')::date);
SELECT create_monthly_audit_partition((current_date + interval '2 months')::date);
SELECT create_monthly_audit_partition((current_date + interval '3 months')::date);
