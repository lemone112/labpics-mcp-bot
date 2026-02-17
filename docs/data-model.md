# Data model & tables (MVP)

Source of truth: Postgres in `db` container.

Schema is applied from `server/db/migrations/*.sql`.

## Extensions

- `pgcrypto` (UUID generation)
- `vector` (pgvector)

## Core tables

### `schema_migrations`

Tracks applied migration files.

### `projects`

Project registry.

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `created_at timestamptz not null default now()`

### `sessions`

Cookie-backed sessions.

- `session_id text primary key`
- `username text not null`
- `active_project_id uuid references projects(id) on delete set null`
- `created_at timestamptz not null default now()`
- `last_seen_at timestamptz not null default now()`

### `cw_contacts`

Normalized Chatwoot contacts.

- `id text primary key` (format: `cwc:<account_id>:<contact_id>`)
- `account_id bigint not null`
- `contact_id bigint not null`
- `name text`
- `email text`
- `phone_number text`
- `identifier text`
- `custom_attributes jsonb not null default '{}'::jsonb`
- `data jsonb not null`
- `updated_at timestamptz`
- `created_at timestamptz not null default now()`

### `cw_conversations`

Raw Chatwoot conversations.

- `id text primary key` (format: `cw:<account_id>:<conversation_id>`)
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

- `id text primary key` (format: `cwmsg:<account_id>:<message_id>`)
- `account_id bigint`
- `message_id bigint`
- `conversation_id bigint`
- `conversation_global_id text`
- `contact_global_id text`
- `sender_type text`
- `sender_id bigint`
- `private boolean not null default false`
- `message_type text`
- `content text`
- `data jsonb not null`
- `created_at timestamptz`
- `updated_at timestamptz`

### `rag_chunks`

Chunked text and embedding lifecycle.

- `id uuid primary key default gen_random_uuid()`
- `conversation_global_id text`
- `message_global_id text`
- `chunk_index int`
- `text text not null`
- `text_hash text`
- `content_tokens int`
- `embedding vector(1536)` (default MVP dimension)
- `embedding_status text not null default 'pending'`
  - allowed: `pending|processing|ready|failed`
- `embedding_model text`
- `embedding_attempts int not null default 0`
- `embedding_error text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `last_embedded_at timestamptz`

Uniqueness:

- `unique(message_global_id, chunk_index)`

### `sync_watermarks`

Ingestion cursor per source.

- `source text primary key` (e.g. `chatwoot:<account_id>`)
- `cursor_ts timestamptz`
- `cursor_id text`
- `meta jsonb not null default '{}'::jsonb`
- `updated_at timestamptz not null default now()`

### `job_runs`

Job execution audit.

- `id bigserial primary key`
- `job_name text not null`
- `status text not null` (`running|ok|failed`)
- `started_at timestamptz not null default now()`
- `finished_at timestamptz`
- `processed_count int not null default 0`
- `error text`
- `meta jsonb not null default '{}'::jsonb`

## Auth/signup tables

### `app_users`

- `id uuid primary key default gen_random_uuid()`
- `username text not null unique`
- `password_hash text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `signup_requests`

- `id uuid primary key default gen_random_uuid()`
- `username text not null`
- `password_hash text not null`
- `pin_hash text not null`
- `pin_salt text not null`
- `attempt_count int not null default 0`
- `expires_at timestamptz not null`
- `used_at timestamptz`
- `created_at timestamptz not null default now()`

### `app_settings`

Simple key/value settings store (used for Telegram owner binding).

- `key text primary key`
- `value text not null`
- `updated_at timestamptz not null default now()`

## Indexes (current migrations)

- `cw_contacts(account_id, contact_id)` unique
- `cw_contacts(updated_at desc nulls last)`
- `cw_messages(conversation_id)`
- `cw_messages(created_at desc)`
- `cw_messages(conversation_global_id)`
- `cw_messages(contact_global_id)`
- `cw_messages(account_id, created_at desc)`
- `rag_chunks(conversation_global_id)`
- `rag_chunks(message_global_id)`
- `rag_chunks(embedding_status, created_at desc)`
- `rag_chunks(text_hash)`
- `rag_chunks.embedding` ivfflat cosine index (`lists=100`)
- optional `rag_chunks.embedding` hnsw index (created only when `hnsw` access method exists)
- `signup_requests(username, created_at desc)`
- `signup_requests(expires_at)`

## Notes

- Search currently operates on global `rag_chunks` (`embedding_status='ready'`), not per-project SQL scope.
- `sessions.active_project_id` is already persisted for navigation context and future strict data isolation.
