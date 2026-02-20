ALTER TABLE project_sources
  DROP CONSTRAINT IF EXISTS project_sources_source_kind_check;

ALTER TABLE project_sources
  ADD CONSTRAINT project_sources_source_kind_check
  CHECK (source_kind IN ('chatwoot_account', 'attio_workspace', 'linear_workspace'));

CREATE TABLE IF NOT EXISTS attio_accounts_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  external_id text NOT NULL,
  name text,
  domain text,
  annual_revenue numeric(14,2) NOT NULL DEFAULT 0,
  stage text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE INDEX IF NOT EXISTS attio_accounts_raw_project_updated_idx
  ON attio_accounts_raw (project_id, updated_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS attio_opportunities_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  external_id text NOT NULL,
  account_external_id text,
  title text,
  stage text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  probability numeric(5,4) NOT NULL DEFAULT 0.1 CHECK (probability >= 0 AND probability <= 1),
  expected_close_date date,
  next_step text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE INDEX IF NOT EXISTS attio_opportunities_raw_project_stage_idx
  ON attio_opportunities_raw (project_id, stage, expected_close_date);

CREATE TABLE IF NOT EXISTS linear_projects_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  state text,
  lead_name text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE INDEX IF NOT EXISTS linear_projects_raw_project_updated_idx
  ON linear_projects_raw (project_id, updated_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS linear_issues_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  external_id text NOT NULL,
  linear_project_external_id text,
  title text NOT NULL,
  state text,
  priority int,
  assignee_name text,
  due_date date,
  completed_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE INDEX IF NOT EXISTS linear_issues_raw_project_state_idx
  ON linear_issues_raw (project_id, state, due_date);

CREATE TABLE IF NOT EXISTS identity_link_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  left_entity_type text NOT NULL,
  left_entity_id text NOT NULL,
  right_entity_type text NOT NULL,
  right_entity_id text NOT NULL,
  confidence numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  reason text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'applied', 'dismissed')),
  dedupe_key text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS identity_link_suggestions_project_status_idx
  ON identity_link_suggestions (project_id, status, confidence DESC);

CREATE TABLE IF NOT EXISTS identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  left_entity_type text NOT NULL,
  left_entity_id text NOT NULL,
  right_entity_type text NOT NULL,
  right_entity_id text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'suggestion', 'system')),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, left_entity_type, left_entity_id, right_entity_type, right_entity_id)
);

CREATE INDEX IF NOT EXISTS identity_links_project_status_idx
  ON identity_links (project_id, status, created_at DESC);

ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'proposed',
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'conversation';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signals_status_check'
  ) THEN
    ALTER TABLE signals DROP CONSTRAINT signals_status_check;
  END IF;
END $$;

ALTER TABLE signals
  ADD CONSTRAINT signals_status_check
  CHECK (status IN ('proposed', 'accepted', 'dismissed', 'done'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signals_source_kind_check'
  ) THEN
    ALTER TABLE signals DROP CONSTRAINT signals_source_kind_check;
  END IF;
END $$;

ALTER TABLE signals
  ADD CONSTRAINT signals_source_kind_check
  CHECK (source_kind IN ('conversation', 'crm', 'linear', 'campaign', 'system'));

ALTER TABLE next_best_actions
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS owner_username text,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS next_best_actions_project_dedupe_unique_idx
  ON next_best_actions (project_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS upsell_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_external_id text,
  source_ref text,
  title text NOT NULL,
  rationale text,
  score numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (score >= 0 AND score <= 1),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'dismissed', 'converted')),
  suggested_offer_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_outbound_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS upsell_opportunities_project_status_idx
  ON upsell_opportunities (project_id, status, score DESC);

CREATE TABLE IF NOT EXISTS continuity_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('attio', 'chatwoot', 'hybrid')),
  source_ref text NOT NULL,
  title text NOT NULL,
  description text,
  preview_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  linear_issue_external_id text,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed', 'applied', 'dismissed', 'failed')),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  dedupe_key text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS continuity_actions_project_status_idx
  ON continuity_actions (project_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  digest_date date NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, digest_date)
);

CREATE TABLE IF NOT EXISTS weekly_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  week_start date NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, week_start)
);

CREATE TABLE IF NOT EXISTS risk_pattern_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  pattern_key text NOT NULL,
  title text NOT NULL,
  weight numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigated', 'ignored')),
  mitigation_playbook jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_pattern_events_project_status_idx
  ON risk_pattern_events (project_id, status, weight DESC);

CREATE TABLE IF NOT EXISTS analytics_delivery_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  open_issues int NOT NULL DEFAULT 0,
  overdue_issues int NOT NULL DEFAULT 0,
  completed_issues int NOT NULL DEFAULT 0,
  lead_time_days numeric(8,2) NOT NULL DEFAULT 0,
  throughput int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS analytics_comms_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  inbound_messages int NOT NULL DEFAULT 0,
  outbound_messages int NOT NULL DEFAULT 0,
  unique_contacts int NOT NULL DEFAULT 0,
  avg_response_minutes numeric(10,2) NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, period_start, period_end)
);

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'attio_accounts_raw',
    'attio_opportunities_raw',
    'linear_projects_raw',
    'linear_issues_raw',
    'identity_link_suggestions',
    'identity_links',
    'upsell_opportunities',
    'continuity_actions',
    'daily_digests',
    'weekly_digests',
    'risk_pattern_events',
    'analytics_delivery_snapshots',
    'analytics_comms_snapshots'
  ]
  LOOP
    trg := tbl || '_scope_guard';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = to_regclass(tbl)
        AND tgname = trg
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_project_scope_match()',
        trg,
        tbl
      );
    END IF;
  END LOOP;
END $$;
