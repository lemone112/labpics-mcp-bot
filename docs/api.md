# API reference (MVP)

Base URL:

- browser/UI: `NEXT_PUBLIC_API_BASE_URL` (default `/api`)
- direct backend (without Next.js proxy): `http://localhost:8080`

Every response includes `request_id` in body and `x-request-id` in headers.

## Access model

Public routes:

- `GET /health`
- all `"/auth/*"` routes

All other routes require a valid session cookie (`SESSION_COOKIE_NAME`, default `sid`).

## Health

### `GET /health`

Returns service liveness.

## Auth

### `POST /auth/login`

Body:

- `username` (string)
- `password` (string)

On success sets session cookie.

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
- authenticated session payload (`username`, `active_project_id`, timestamps)

## Projects

### `GET /projects`

Returns:

- `projects[]`
- `active_project_id`

### `POST /projects`

Body:

- `name` (2..160 chars)

### `POST /projects/:id/select`

Sets `sessions.active_project_id` for current session.

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

## Search

### `POST /search`

Body:

- `query` (string, required)
- `topK` (int, 1..50, default 10)

Performs cosine-distance vector search over `rag_chunks` with `embedding_status='ready'`.

> Note: current MVP search is not project-scoped in SQL. `active_project_id` is stored in sessions for navigation context and future strict data isolation.
