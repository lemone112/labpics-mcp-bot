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

## Planned schema additions
For product roadmap (commitments/risks/digests), extend schema with:

- `commitments` (evidence-backed items)
- `risks`
- `digests`
- `agent_runs` (audit + privacy retention)
