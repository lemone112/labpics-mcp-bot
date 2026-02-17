# Data model & tables (MVP)

Source of truth: **Postgres** in `db` container.

Schema is created by migrations in `server/db/migrations/`.

## Extensions

- `pgcrypto` (UUID generation)
- `vector` (pgvector)

## Tables

### `schema_migrations`
Tracks applied migration files.

### `projects`
Project registry.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `created_at timestamptz not null default now()`

### `sessions`
Cookie-based auth sessions.

Columns:
- `session_id text primary key`
- `username text not null`
- `active_project_id uuid references projects(id) on delete set null`
- `created_at timestamptz not null default now()`
- `last_seen_at timestamptz not null default now()`

### `cw_conversations`
Raw Chatwoot conversations.

Columns:
- `id text primary key` (recommended format: `cw:<account_id>:<conversation_id>`)
- `account_id bigint`
- `conversation_id bigint`
- `contact_global_id text`
- `inbox_id bigint`
- `status text`
- `assignee_id bigint`
- `data jsonb not null`
- `updated_at timestamptz`
- `created_at timestamptz not null default now()`

### `cw_messages`
Raw Chatwoot messages.

Columns:
- `id text primary key` (recommended format: `cwmsg:<account_id>:<message_id>`)
- `account_id bigint`
- `message_id bigint`
- `conversation_id bigint`
- `conversation_global_id text`
- `contact_global_id text`
- `sender_type text`
- `sender_id bigint`
- `private boolean`
- `message_type text`
- `content text`
- `data jsonb not null`
- `created_at timestamptz`
- `updated_at timestamptz`

### `rag_chunks`
Chunked message text + embeddings.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `conversation_global_id text`
- `message_global_id text`
- `project_id uuid references projects(id) on delete cascade`
- `chunk_index int`
- `text text not null`
- `embedding vector(1536)`
- `embedding_status text not null default 'pending'` (`pending|processing|ready|failed`)
- `embedding_model text`
- `text_hash text`
- `content_tokens int`
- `updated_at timestamptz not null default now()`
- `last_embedded_at timestamptz`
- `embedding_attempts int not null default 0`
- `embedding_error text`
- `created_at timestamptz not null default now()`

Uniqueness:
- project-scoped unique index: `(project_id, message_global_id, chunk_index)`
- legacy-null scoped unique index: `(message_global_id, chunk_index) WHERE project_id IS NULL`

### `sync_watermarks`
Cursor/watermark per source.

Columns:
- `source text primary key` (e.g. `chatwoot:<account_id>`)
- `cursor_ts timestamptz`
- `cursor_id text`
- `meta jsonb not null default '{}'::jsonb`
- `updated_at timestamptz not null default now()`

### `job_runs`
Job run audit.

Columns:
- `id bigserial primary key`
- `job_name text not null`
- `status text not null` (`running|ok|failed`)
- `project_id uuid references projects(id) on delete cascade`
- `started_at timestamptz not null default now()`
- `finished_at timestamptz`
- `processed_count int not null default 0`
- `error text`
- `meta jsonb not null default '{}'::jsonb`

### `commitments`
Project-scoped commitments with evidence references.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references projects(id) on delete cascade`
- `title text not null`
- `owner text not null` (`studio|client|unknown`)
- `due_at timestamptz`
- `status text not null` (`active|proposed|closed|done|cancelled`)
- `confidence text not null` (`high|medium|low`)
- `summary text`
- `evidence jsonb not null default '[]'::jsonb`
- `source text not null default 'manual'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `project_source_links`
Project-to-source identity links (safe-by-default scoping).

Columns:
- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references projects(id) on delete cascade`
- `source_type text not null` (currently `chatwoot_inbox`)
- `source_account_id text not null`
- `source_external_id text not null`
- `source_url text`
- `created_by text`
- `metadata jsonb not null default '{}'::jsonb`
  - expected key: `import_from_ts` (ISO timestamp for safe ingestion window)
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Uniqueness:
- `(source_type, source_account_id, source_external_id)` is unique

## Indexes
Created in `0002_indexes.sql`:

- `rag_chunks(conversation_global_id)`
- `rag_chunks(message_global_id)`
- `cw_messages(conversation_id)`
- `cw_messages(created_at desc)`
- `rag_chunks.embedding` ivfflat cosine index (lists=100)

Additional indexes are created by later migrations for:

- project-scoped `rag_chunks` access
- project-scoped `job_runs` reads
- message/contact lookups used by scoped review endpoints
- project source linking and inbox lookup (`project_source_links`, `cw_conversations.inbox_id`)

## Planned schema additions
For product roadmap (commitments/risks/digests), extend schema with:

- `risks`
- `digests`
- `agent_runs` (audit + privacy retention)
