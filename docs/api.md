# API reference (MVP)

Base URL: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8080`).

All responses include `request_id` (and `x-request-id` header).

## Health

### `GET /health`
Public.

## Auth

### `POST /auth/login`
Public.

Body:
- `username` (string)
- `password` (string)

Sets cookie `SESSION_COOKIE_NAME` (default `sid`).

### `POST /auth/logout`
Auth required.

Clears cookie and deletes session.

### `GET /auth/me`
Public.

Returns either `{ authenticated: false }` or session info.

## Projects

### `GET /projects`
Auth required.

Returns:
- `projects[]`
- `active_project_id`

### `POST /projects`
Auth required.

Body:
- `name` (2..160 chars)

### `POST /projects/:id/select`
Auth required.

Sets `sessions.active_project_id`.

## Jobs

### `POST /jobs/chatwoot/sync`
Auth required.

Runs Chatwoot poll sync. Writes:
- `cw_conversations`
- `cw_messages`
- creates `rag_chunks` (status `pending`)
- updates `sync_watermarks`

### `POST /jobs/embeddings/run`
Auth required.

Embeds `rag_chunks` with `embedding_status='pending'` → `ready|failed`.

### `GET /jobs/status`
Auth required.

Returns:
- latest `job_runs` per job
- `rag_counts` by `embedding_status`
- latest `sync_watermarks`

## Search

### `POST /search`
Auth required.

Body:
- `query` (string, required)
- `topK` (int, 1..50, default 10)

Performs cosine-distance vector search over `rag_chunks` where `embedding_status='ready'`.

> Note: current MVP search is not project-scoped in SQL. If you need strict per-project isolation, add `project_id` to `rag_chunks` and filter by `sessions.active_project_id`.
