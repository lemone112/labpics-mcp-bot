CREATE TABLE IF NOT EXISTS account_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO account_scopes(scope_key, name)
VALUES ('default', 'Default account scope')
ON CONFLICT (scope_key) DO NOTHING;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS account_scope_id uuid;

UPDATE projects
SET account_scope_id = s.id
FROM account_scopes AS s
WHERE projects.account_scope_id IS NULL
  AND s.scope_key = 'default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_account_scope_fk'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_account_scope_fk
      FOREIGN KEY (account_scope_id)
      REFERENCES account_scopes(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE projects
  ALTER COLUMN account_scope_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS projects_account_scope_idx
  ON projects (account_scope_id);

INSERT INTO projects(name, account_scope_id)
SELECT '__legacy_scope__', s.id
FROM account_scopes AS s
WHERE s.scope_key = 'default'
  AND NOT EXISTS (
    SELECT 1
    FROM projects
    WHERE name = '__legacy_scope__'
  );

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS csrf_token text;

UPDATE sessions
SET csrf_token = encode(gen_random_bytes(24), 'hex')
WHERE csrf_token IS NULL OR csrf_token = '';

ALTER TABLE sessions
  ALTER COLUMN csrf_token SET NOT NULL;

ALTER TABLE cw_contacts
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS account_scope_id uuid;

ALTER TABLE cw_conversations
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS account_scope_id uuid;

ALTER TABLE cw_messages
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS account_scope_id uuid;

ALTER TABLE rag_chunks
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS account_scope_id uuid;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS account_scope_id uuid;

ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS account_scope_id uuid;

WITH legacy_scope AS (
  SELECT p.id AS project_id, p.account_scope_id
  FROM projects AS p
  WHERE p.name = '__legacy_scope__'
  LIMIT 1
)
UPDATE cw_contacts AS t
SET project_id = l.project_id,
    account_scope_id = l.account_scope_id
FROM legacy_scope AS l
WHERE t.project_id IS NULL OR t.account_scope_id IS NULL;

WITH legacy_scope AS (
  SELECT p.id AS project_id, p.account_scope_id
  FROM projects AS p
  WHERE p.name = '__legacy_scope__'
  LIMIT 1
)
UPDATE cw_conversations AS t
SET project_id = l.project_id,
    account_scope_id = l.account_scope_id
FROM legacy_scope AS l
WHERE t.project_id IS NULL OR t.account_scope_id IS NULL;

WITH legacy_scope AS (
  SELECT p.id AS project_id, p.account_scope_id
  FROM projects AS p
  WHERE p.name = '__legacy_scope__'
  LIMIT 1
)
UPDATE cw_messages AS t
SET project_id = l.project_id,
    account_scope_id = l.account_scope_id
FROM legacy_scope AS l
WHERE t.project_id IS NULL OR t.account_scope_id IS NULL;

WITH legacy_scope AS (
  SELECT p.id AS project_id, p.account_scope_id
  FROM projects AS p
  WHERE p.name = '__legacy_scope__'
  LIMIT 1
)
UPDATE rag_chunks AS t
SET project_id = l.project_id,
    account_scope_id = l.account_scope_id
FROM legacy_scope AS l
WHERE t.project_id IS NULL OR t.account_scope_id IS NULL;

WITH legacy_scope AS (
  SELECT p.id AS project_id, p.account_scope_id
  FROM projects AS p
  WHERE p.name = '__legacy_scope__'
  LIMIT 1
)
UPDATE sync_watermarks AS t
SET project_id = l.project_id,
    account_scope_id = l.account_scope_id
FROM legacy_scope AS l
WHERE t.project_id IS NULL OR t.account_scope_id IS NULL;

WITH legacy_scope AS (
  SELECT p.id AS project_id, p.account_scope_id
  FROM projects AS p
  WHERE p.name = '__legacy_scope__'
  LIMIT 1
)
UPDATE job_runs AS t
SET project_id = l.project_id,
    account_scope_id = l.account_scope_id
FROM legacy_scope AS l
WHERE t.project_id IS NULL OR t.account_scope_id IS NULL;

ALTER TABLE cw_contacts
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN account_scope_id SET NOT NULL;

ALTER TABLE cw_conversations
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN account_scope_id SET NOT NULL;

ALTER TABLE cw_messages
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN account_scope_id SET NOT NULL;

ALTER TABLE rag_chunks
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN account_scope_id SET NOT NULL;

ALTER TABLE sync_watermarks
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN account_scope_id SET NOT NULL;

ALTER TABLE job_runs
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN account_scope_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cw_contacts_project_fk'
  ) THEN
    ALTER TABLE cw_contacts
      ADD CONSTRAINT cw_contacts_project_fk
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cw_contacts_scope_fk'
  ) THEN
    ALTER TABLE cw_contacts
      ADD CONSTRAINT cw_contacts_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cw_conversations_project_fk'
  ) THEN
    ALTER TABLE cw_conversations
      ADD CONSTRAINT cw_conversations_project_fk
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cw_conversations_scope_fk'
  ) THEN
    ALTER TABLE cw_conversations
      ADD CONSTRAINT cw_conversations_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cw_messages_project_fk'
  ) THEN
    ALTER TABLE cw_messages
      ADD CONSTRAINT cw_messages_project_fk
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cw_messages_scope_fk'
  ) THEN
    ALTER TABLE cw_messages
      ADD CONSTRAINT cw_messages_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rag_chunks_project_fk'
  ) THEN
    ALTER TABLE rag_chunks
      ADD CONSTRAINT rag_chunks_project_fk
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rag_chunks_scope_fk'
  ) THEN
    ALTER TABLE rag_chunks
      ADD CONSTRAINT rag_chunks_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
DECLARE pk_name text;
BEGIN
  SELECT conname
  INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'sync_watermarks'::regclass
    AND contype = 'p'
  LIMIT 1;

  IF pk_name IS NOT NULL AND pk_name <> 'sync_watermarks_project_source_pkey' THEN
    EXECUTE format('ALTER TABLE sync_watermarks DROP CONSTRAINT %I', pk_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_watermarks_project_source_pkey'
  ) THEN
    ALTER TABLE sync_watermarks
      ADD CONSTRAINT sync_watermarks_project_source_pkey
      PRIMARY KEY (project_id, source);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_watermarks_scope_fk'
  ) THEN
    ALTER TABLE sync_watermarks
      ADD CONSTRAINT sync_watermarks_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_watermarks_project_fk'
  ) THEN
    ALTER TABLE sync_watermarks
      ADD CONSTRAINT sync_watermarks_project_fk
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_runs_project_fk'
  ) THEN
    ALTER TABLE job_runs
      ADD CONSTRAINT job_runs_project_fk
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_runs_scope_fk'
  ) THEN
    ALTER TABLE job_runs
      ADD CONSTRAINT job_runs_scope_fk
      FOREIGN KEY (account_scope_id) REFERENCES account_scopes(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cw_contacts_project_idx
  ON cw_contacts (project_id, updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS cw_conversations_project_idx
  ON cw_conversations (project_id, COALESCE(updated_at, created_at) DESC);
CREATE INDEX IF NOT EXISTS cw_messages_project_idx
  ON cw_messages (project_id, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS rag_chunks_project_status_idx
  ON rag_chunks (project_id, embedding_status, created_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_project_job_idx
  ON job_runs (project_id, job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS project_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('chatwoot_account')),
  external_id text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, external_id),
  UNIQUE (project_id, source_kind)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  actor_username text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  status text NOT NULL DEFAULT 'ok',
  request_id text,
  idempotency_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_project_created_idx
  ON audit_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_created_idx
  ON audit_events (action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_evidence_refs_gin_idx
  ON audit_events USING gin (evidence_refs jsonb_path_ops);

CREATE TABLE IF NOT EXISTS evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  source_type text NOT NULL,
  source_table text NOT NULL,
  source_pk text NOT NULL,
  conversation_global_id text,
  message_global_id text,
  contact_global_id text,
  snippet text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_text tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(snippet, '') || ' ' || coalesce(source_pk, '') || ' ' ||
      coalesce(conversation_global_id, '') || ' ' || coalesce(message_global_id, '')
    )
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, source_table, source_pk)
);

CREATE INDEX IF NOT EXISTS evidence_items_project_created_idx
  ON evidence_items (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS evidence_items_message_idx
  ON evidence_items (project_id, message_global_id);
CREATE INDEX IF NOT EXISTS evidence_items_conversation_idx
  ON evidence_items (project_id, conversation_global_id);
CREATE INDEX IF NOT EXISTS evidence_items_search_idx
  ON evidence_items USING gin (search_text);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('email', 'chatwoot', 'telegram')),
  recipient_ref text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'failed', 'cancelled', 'blocked_opt_out')),
  idempotency_key text NOT NULL,
  dedupe_key text,
  retry_count int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 5,
  next_attempt_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, idempotency_key),
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS outbound_messages_project_status_next_idx
  ON outbound_messages (project_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS outbound_messages_project_created_idx
  ON outbound_messages (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_messages_evidence_refs_gin_idx
  ON outbound_messages USING gin (evidence_refs jsonb_path_ops);

CREATE TABLE IF NOT EXISTS outbound_attempts (
  id bigserial PRIMARY KEY,
  outbound_id uuid NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  attempt_no int NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outbound_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS outbound_attempts_project_created_idx
  ON outbound_attempts (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contact_channel_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  contact_global_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'chatwoot', 'telegram')),
  opted_out boolean NOT NULL DEFAULT false,
  stop_on_reply boolean NOT NULL DEFAULT true,
  frequency_window_hours int NOT NULL DEFAULT 24,
  frequency_cap int NOT NULL DEFAULT 3,
  sent_in_window int NOT NULL DEFAULT 0,
  window_started_at timestamptz,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, contact_global_id, channel)
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  cadence_seconds int NOT NULL DEFAULT 900,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, job_type)
);

CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx
  ON scheduled_jobs (status, next_run_at);

CREATE TABLE IF NOT EXISTS worker_runs (
  id bigserial PRIMARY KEY,
  scheduled_job_id uuid REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  job_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS worker_runs_project_started_idx
  ON worker_runs (project_id, started_at DESC);

CREATE OR REPLACE FUNCTION enforce_project_scope_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_scope uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required for %', TG_TABLE_NAME;
  END IF;

  SELECT p.account_scope_id
  INTO expected_scope
  FROM projects AS p
  WHERE p.id = NEW.project_id
  LIMIT 1;

  IF expected_scope IS NULL THEN
    RAISE EXCEPTION 'project % not found for table %', NEW.project_id, TG_TABLE_NAME;
  END IF;

  IF NEW.account_scope_id IS NULL THEN
    NEW.account_scope_id = expected_scope;
  END IF;

  IF NEW.account_scope_id IS DISTINCT FROM expected_scope THEN
    RAISE EXCEPTION 'cross-scope write rejected on %. expected scope %, got %', TG_TABLE_NAME, expected_scope, NEW.account_scope_id;
  END IF;

  RETURN NEW;
END $$;

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'project_sources',
    'cw_contacts',
    'cw_conversations',
    'cw_messages',
    'rag_chunks',
    'sync_watermarks',
    'job_runs',
    'audit_events',
    'evidence_items',
    'outbound_messages',
    'outbound_attempts',
    'contact_channel_policies',
    'scheduled_jobs',
    'worker_runs'
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
