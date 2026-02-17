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
- `account_scope_id uuid not null references account_scopes(id)`
- `created_at timestamptz not null default now()`

### `sessions`

Cookie-backed sessions.

- `session_id text primary key`
- `username text not null`
- `active_project_id uuid references projects(id) on delete set null`
- `csrf_token text not null`
- `created_at timestamptz not null default now()`
- `last_seen_at timestamptz not null default now()`

### `account_scopes`

Account-level isolation boundary used by projects.

- `id uuid primary key`
- `scope_key text unique`
- `name text`

### `project_sources`

External source bindings per project.

- `project_id uuid not null`
- `account_scope_id uuid not null`
- `source_kind text` (`chatwoot_account`)
- `external_id text`

Safety constraints:

- `unique(source_kind, external_id)` to avoid multi-project source binding
- `unique(project_id, source_kind)`

### `cw_contacts`

Normalized Chatwoot contacts.

- `id text primary key` (format: `cwc:<project_id>:<account_id>:<contact_id>`)
- `project_id uuid not null`
- `account_scope_id uuid not null`
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

- `id text primary key` (format: `cw:<project_id>:<account_id>:<conversation_id>`)
- `project_id uuid not null`
- `account_scope_id uuid not null`
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

- `id text primary key` (format: `cwmsg:<project_id>:<account_id>:<message_id>`)
- `project_id uuid not null`
- `account_scope_id uuid not null`
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
- `project_id uuid not null`
- `account_scope_id uuid not null`
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

- primary key: `(project_id, source)`
- `project_id uuid not null`
- `account_scope_id uuid not null`
- `source text` (e.g. `chatwoot:<account_id>`)
- `cursor_ts timestamptz`
- `cursor_id text`
- `meta jsonb not null default '{}'::jsonb`
- `updated_at timestamptz not null default now()`

### `job_runs`

Job execution audit.

- `id bigserial primary key`
- `project_id uuid not null`
- `account_scope_id uuid not null`
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

## Platform control tables

### `audit_events`

Immutable audit trail for critical actions, with mandatory evidence refs.

### `evidence_items`

Normalized evidence index with FTS search (`search_text`).

### `outbound_messages`, `outbound_attempts`, `contact_channel_policies`

Approval/send/retry pipeline with opt-out and frequency controls.

### `scheduled_jobs`, `worker_runs`

Unified scheduler/worker execution model.

## Roadmap domain tables

- CRM: `crm_accounts`, `crm_account_contacts`, `crm_opportunities`, `crm_opportunity_stage_events`
- Signals/NBA: `signals`, `next_best_actions`
- Offers: `offers`, `offer_items`, `offer_approvals`
- Campaigns: `campaigns`, `campaign_segments`, `campaign_members`, `campaign_events`
- Health/Risk: `health_scores`, `risk_radar_items`
- Cases: `case_library_entries`, `case_evidence_refs`
- Analytics: `analytics_revenue_snapshots`

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

- Search/sync/jobs are scoped by `(project_id, account_scope_id)`.
- DB trigger `enforce_project_scope_match()` blocks cross-scope writes on scoped tables.
