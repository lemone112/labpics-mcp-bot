CREATE TABLE IF NOT EXISTS connector_sync_state (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  connector text NOT NULL CHECK (connector IN ('chatwoot', 'linear', 'attio')),
  mode text NOT NULL DEFAULT 'http' CHECK (mode IN ('http', 'mcp')),
  cursor_ts timestamptz,
  cursor_id text,
  page_cursor text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'ok', 'partial', 'failed')),
  retry_count int NOT NULL DEFAULT 0,
  last_error text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, connector)
);

CREATE INDEX IF NOT EXISTS connector_sync_state_status_idx
  ON connector_sync_state (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS connector_errors (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  connector text NOT NULL CHECK (connector IN ('chatwoot', 'linear', 'attio')),
  mode text NOT NULL DEFAULT 'http' CHECK (mode IN ('http', 'mcp')),
  operation text NOT NULL,
  source_ref text,
  error_kind text NOT NULL,
  error_message text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt int NOT NULL DEFAULT 1,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'dead_letter', 'resolved')),
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS connector_errors_project_status_retry_idx
  ON connector_errors (project_id, status, next_retry_at ASC);

CREATE INDEX IF NOT EXISTS connector_errors_connector_status_retry_idx
  ON connector_errors (connector, status, next_retry_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS connector_errors_project_dedupe_idx
  ON connector_errors (project_id, connector, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'retrying');

CREATE TABLE IF NOT EXISTS kag_event_log (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN (
      'message_sent',
      'client_silent_started',
      'approval_requested',
      'approval_approved',
      'stage_started',
      'stage_completed',
      'issue_created',
      'issue_blocked',
      'issue_unblocked',
      'scope_change_detected',
      'deal_stage_changed',
      'invoice_sent',
      'invoice_paid',
      'contact_updated',
      'note_logged',
      'activity_logged'
    )
  ),
  occurred_at timestamptz NOT NULL,
  actor text NOT NULL DEFAULT 'system' CHECK (actor IN ('client', 'team', 'system')),
  source text NOT NULL CHECK (source IN ('chatwoot', 'linear', 'attio', 'system')),
  source_ref text NOT NULL,
  source_url text,
  source_message_id text,
  source_linear_issue_id text,
  source_attio_record_id text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS kag_event_log_project_occurred_idx
  ON kag_event_log (project_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS kag_event_log_source_ref_idx
  ON kag_event_log (project_id, source, source_ref);

CREATE INDEX IF NOT EXISTS kag_event_log_type_occurred_idx
  ON kag_event_log (project_id, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS cw_inboxes_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_id bigint NOT NULL,
  inbox_id bigint NOT NULL,
  name text,
  channel_type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, account_id, inbox_id)
);

CREATE INDEX IF NOT EXISTS cw_inboxes_raw_project_updated_idx
  ON cw_inboxes_raw (project_id, updated_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS cw_attachments_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  account_id bigint NOT NULL,
  message_global_id text NOT NULL REFERENCES cw_messages(id) ON DELETE CASCADE,
  conversation_global_id text REFERENCES cw_conversations(id) ON DELETE SET NULL,
  content_type text,
  file_size bigint,
  file_url text,
  thumb_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS cw_attachments_raw_project_message_idx
  ON cw_attachments_raw (project_id, message_global_id, updated_at DESC NULLS LAST);

ALTER TABLE linear_issues_raw
  ADD COLUMN IF NOT EXISTS state_external_id text,
  ADD COLUMN IF NOT EXISTS state_type text,
  ADD COLUMN IF NOT EXISTS cycle_external_id text,
  ADD COLUMN IF NOT EXISTS cycle_name text,
  ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_by_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS linear_issues_raw_project_blocked_idx
  ON linear_issues_raw (project_id, blocked, due_date, updated_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS linear_states_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  external_id text NOT NULL,
  team_external_id text,
  name text NOT NULL,
  type text,
  position int,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE INDEX IF NOT EXISTS linear_states_raw_project_updated_idx
  ON linear_states_raw (project_id, updated_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS linear_cycles_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  external_id text NOT NULL,
  team_external_id text,
  number int,
  starts_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  progress numeric(6,3),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE INDEX IF NOT EXISTS linear_cycles_raw_project_updated_idx
  ON linear_cycles_raw (project_id, updated_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS attio_people_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  external_id text NOT NULL,
  account_external_id text,
  full_name text,
  email text,
  role text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE INDEX IF NOT EXISTS attio_people_raw_project_updated_idx
  ON attio_people_raw (project_id, updated_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS attio_activities_raw (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  workspace_id text NOT NULL,
  external_id text NOT NULL,
  record_external_id text,
  activity_type text,
  note text,
  actor_name text,
  occurred_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_id)
);

CREATE INDEX IF NOT EXISTS attio_activities_raw_project_occurred_idx
  ON attio_activities_raw (project_id, occurred_at DESC NULLS LAST);

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'connector_sync_state',
    'connector_errors',
    'kag_event_log',
    'cw_inboxes_raw',
    'cw_attachments_raw',
    'linear_states_raw',
    'linear_cycles_raw',
    'attio_people_raw',
    'attio_activities_raw'
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
