CREATE TABLE IF NOT EXISTS crm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  name text NOT NULL,
  domain text,
  external_ref text,
  stage text NOT NULL DEFAULT 'active' CHECK (stage IN ('active', 'inactive', 'prospect')),
  owner_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS crm_accounts_project_stage_idx
  ON crm_accounts (project_id, stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_account_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  contact_global_id text NOT NULL,
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, account_id, contact_global_id)
);

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  stage text NOT NULL CHECK (
    stage IN ('discovery', 'qualified', 'proposal', 'negotiation', 'won', 'lost')
  ),
  amount_estimate numeric(14,2) NOT NULL DEFAULT 0,
  probability numeric(5,4) NOT NULL DEFAULT 0.1 CHECK (probability >= 0 AND probability <= 1),
  expected_close_date date,
  next_step text NOT NULL,
  owner_username text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_opportunities_project_stage_idx
  ON crm_opportunities (project_id, stage, expected_close_date);
CREATE INDEX IF NOT EXISTS crm_opportunities_evidence_refs_gin_idx
  ON crm_opportunities USING gin (evidence_refs jsonb_path_ops);

CREATE TABLE IF NOT EXISTS crm_opportunity_stage_events (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  reason text,
  actor_username text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  audit_event_id bigint NOT NULL REFERENCES audit_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_opportunity_stage_events_project_idx
  ON crm_opportunity_stage_events (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_id uuid REFERENCES crm_accounts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  signal_type text NOT NULL,
  severity int NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 5),
  confidence numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  summary text NOT NULL,
  dedupe_key text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS signals_project_created_idx
  ON signals (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS signals_project_severity_idx
  ON signals (project_id, severity DESC, confidence DESC);

CREATE TABLE IF NOT EXISTS next_best_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  signal_id uuid REFERENCES signals(id) ON DELETE SET NULL,
  account_id uuid REFERENCES crm_accounts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  priority int NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'done', 'cancelled')),
  summary text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS next_best_actions_project_status_idx
  ON next_best_actions (project_id, status, priority DESC);

CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_id uuid REFERENCES crm_accounts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  title text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'signed', 'rejected')),
  generated_doc_url text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offers_project_status_idx
  ON offers (project_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('package', 'addon', 'discount')),
  item_code text NOT NULL,
  name text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_items_project_offer_idx
  ON offer_items (project_id, offer_id);

CREATE TABLE IF NOT EXISTS offer_approvals (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approve_discount', 'approve_send', 'reject')),
  actor_username text NOT NULL,
  comment text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  audit_event_id bigint NOT NULL REFERENCES audit_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'chatwoot', 'telegram')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'running', 'paused', 'completed', 'failed')),
  frequency_cap int NOT NULL DEFAULT 3,
  frequency_window_hours int NOT NULL DEFAULT 24,
  stop_on_reply boolean NOT NULL DEFAULT true,
  default_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaigns_project_status_idx
  ON campaigns (project_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS campaign_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  filter_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_global_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'completed', 'opted_out')),
  next_send_at timestamptz,
  last_sent_at timestamptz,
  sent_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, campaign_id, contact_global_id)
);

CREATE INDEX IF NOT EXISTS campaign_members_project_status_idx
  ON campaign_members (project_id, status, next_send_at);

CREATE TABLE IF NOT EXISTS campaign_events (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  member_id uuid REFERENCES campaign_members(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('approved', 'sent', 'failed', 'reply_detected', 'opt_out', 'frequency_block')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  audit_event_id bigint REFERENCES audit_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_events_project_created_idx
  ON campaign_events (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_id uuid REFERENCES crm_accounts(id) ON DELETE CASCADE,
  score numeric(6,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, account_id, generated_at)
);

CREATE INDEX IF NOT EXISTS health_scores_project_generated_idx
  ON health_scores (project_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS risk_radar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_id uuid REFERENCES crm_accounts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  severity int NOT NULL CHECK (severity BETWEEN 1 AND 5),
  probability numeric(5,4) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  title text NOT NULL,
  mitigation_action text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigating', 'closed')),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_radar_items_project_status_idx
  ON risk_radar_items (project_id, status, severity DESC);

CREATE TABLE IF NOT EXISTS case_library_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  title text NOT NULL,
  summary text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  privacy_level text NOT NULL DEFAULT 'internal' CHECK (privacy_level IN ('internal', 'restricted', 'public')),
  visibility_scope text NOT NULL DEFAULT 'project' CHECK (visibility_scope IN ('project', 'account_scope')),
  tags text[] NOT NULL DEFAULT '{}',
  retention_until timestamptz,
  approved_by text,
  approved_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_library_entries_project_status_idx
  ON case_library_entries (project_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS case_evidence_refs (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES case_library_entries(id) ON DELETE CASCADE,
  evidence_ref jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_evidence_refs_project_case_idx
  ON case_evidence_refs (project_id, case_id);

CREATE TABLE IF NOT EXISTS analytics_revenue_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  horizon_days int NOT NULL CHECK (horizon_days IN (30, 60, 90)),
  pipeline_amount numeric(14,2) NOT NULL DEFAULT 0,
  commit_amount numeric(14,2) NOT NULL DEFAULT 0,
  won_amount numeric(14,2) NOT NULL DEFAULT 0,
  expected_revenue numeric(14,2) NOT NULL DEFAULT 0,
  costs_amount numeric(14,2) NOT NULL DEFAULT 0,
  gross_margin numeric(14,2) NOT NULL DEFAULT 0,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, period_start, horizon_days)
);

CREATE INDEX IF NOT EXISTS analytics_revenue_snapshots_project_generated_idx
  ON analytics_revenue_snapshots (project_id, generated_at DESC);

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'crm_accounts',
    'crm_account_contacts',
    'crm_opportunities',
    'crm_opportunity_stage_events',
    'signals',
    'next_best_actions',
    'offers',
    'offer_items',
    'offer_approvals',
    'campaigns',
    'campaign_segments',
    'campaign_members',
    'campaign_events',
    'health_scores',
    'risk_radar_items',
    'case_library_entries',
    'case_evidence_refs',
    'analytics_revenue_snapshots'
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
