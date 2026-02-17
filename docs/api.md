# API reference (MVP)

Base URL:

- browser/UI: `NEXT_PUBLIC_API_BASE_URL` (default `/api`)
- direct backend (without Next.js proxy): `http://localhost:8080`
- versioned alias: every route is available under `/v1/...` too

Every response includes `request_id` in body and `x-request-id` in headers.

## Access and security model

Public routes:

- `GET /health`
- `GET /metrics`
- all `"/auth/*"` routes

All other routes require a valid session cookie (`SESSION_COOKIE_NAME`, default `sid`).

### CSRF for protected mutating routes

For authenticated non-GET routes, send:

- cookie: `CSRF_COOKIE_NAME` (default `csrf_token`)
- header: `x-csrf-token` with matching value

If token is missing/mismatch, API returns `403 csrf_invalid`.

## Health

### `GET /health`

Returns service liveness.

## Auth

### `POST /auth/login`

Body:

- `username` (string)
- `password` (string)

On success sets session cookie.
Also sets CSRF cookie.

### `GET /auth/signup/status`

Returns signup availability:

- `enabled`
- `has_telegram_token`
- `owner_bound`

### `POST /auth/signup/start`

Body:

- `username` (`[a-z0-9._-]{3,32}`)
- `password` (8..128 chars)

Creates a pending signup request and sends a 6-digit PIN to bound Telegram owner.

### `POST /auth/signup/confirm`

Body:

- `signup_request_id` (UUID)
- `pin` (6 digits)

On success creates user, starts session, sets cookie.

### `POST /auth/telegram/webhook`

Telegram bot webhook endpoint used for owner binding (`/bind`) and status (`/whoami`).

### `POST /auth/logout`

Clears session cookie and deletes session row when cookie is present.

### `GET /auth/me`

Returns either:

- `{ authenticated: false }`
- authenticated session payload (`username`, `active_project_id`, `account_scope_id`, timestamps)

## Projects

### `GET /projects`

Returns:

- `projects[]`
- `active_project_id`

### `POST /projects`

Body:

- `name` (2..160 chars)
- `account_scope_key` (optional)
- `account_scope_name` (optional)

### `POST /projects/:id/select`

Sets `sessions.active_project_id` for current session.  
All scoped routes below require active project selection.

## Data review

### `GET /contacts`

Query params:

- `limit` (1..500, default 100)
- `q` (optional text filter)

### `GET /conversations`

Query params:

- `limit` (1..500, default 100)

### `GET /messages`

Query params:

- `limit` (1..500, default 100)
- `conversation_global_id` (optional exact filter)

## Jobs

### `POST /jobs/chatwoot/sync`

Runs Chatwoot poll sync. Writes/updates:

- `cw_contacts`
- `cw_conversations`
- `cw_messages`
- `rag_chunks` (`pending` for new or changed chunks)
- `sync_watermarks`

Scope behavior:

- source binding is resolved from `project_sources` (or first bootstrap from env `CHATWOOT_ACCOUNT_ID`)
- writes are strictly filtered by `(project_id, account_scope_id)`

### `POST /jobs/embeddings/run`

Processes `rag_chunks` with `embedding_status='pending'`.
Rows transition through `processing` to `ready` or `failed`.

### `GET /jobs/status`

Returns:

- latest run per job (`job_runs`)
- `rag_counts` (`pending|processing|ready|failed`)
- entity counts (`contacts|conversations|messages|rag_chunks`)
- storage summary (`database_bytes`, `usage_percent`, table sizes)
- recent `sync_watermarks`

### `GET /jobs/scheduler`

Returns configured scheduled jobs for active project.

### `POST /jobs/scheduler/tick`

Runs due scheduler jobs (worker tick) for active project.

## Search

### `POST /search`

Body:

- `query` (string, required)
- `topK` (int, 1..50, default 10)

Performs cosine-distance vector search over `rag_chunks` with `embedding_status='ready'`.
Search is strictly filtered by `(project_id, account_scope_id)`.

## Audit & evidence

### `GET /audit`

Returns audit events for active project.

Query params:

- `action` (optional exact filter)
- `limit`, `offset`

### `GET /evidence/search`

Full-text evidence search in normalized `evidence_items`.

Query params:

- `q` (required for non-empty result)
- `limit`

## Outbound / approval

### `GET /outbound`

List outbound messages for active project.

### `POST /outbound/draft`

Create or upsert outbound draft with idempotency key.

Body:

- `channel` (`email|chatwoot|telegram`)
- `recipient_ref`
- `payload` (object)
- `idempotency_key` (required)
- `dedupe_key` (optional)
- `max_retries` (optional)
- `evidence_refs` (optional array)

### `POST /outbound/:id/approve`

Move outbound message to `approved`.

### `POST /outbound/:id/send`

Send approved outbound message with policy checks:

- opt-out
- stop-on-reply
- frequency cap

### `POST /outbound/opt-out`

Update recipient/channel policy (opt-out, cap, stop-on-reply).

### `POST /outbound/process`

Process due approved/failed outbounds (retry loop).
