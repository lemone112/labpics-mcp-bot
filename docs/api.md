# API reference (MVP)

Base URL: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8080`).

All responses include `request_id` (and `x-request-id` header).

## Active project requirement

For project-scoped endpoints, session must have `active_project_id`.

If no active project is selected, API returns:

- `400 { ok: false, error: "active_project_required" }`

Project-scoped endpoints:

- `GET /contacts`
- `GET /conversations`
- `GET /messages`
- `GET /commitments`
- `POST /commitments`
- `PATCH /commitments/:id`
- `POST /jobs/chatwoot/sync`
- `POST /jobs/embeddings/run`
- `GET /jobs/status`
- `POST /search`

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

## Commitments

### `GET /commitments`
Auth required + active project required.

Query:
- `status` (optional: `active|proposed|closed|done|cancelled`)
- `limit` (optional, default 100)

Returns project-scoped commitments.

### `POST /commitments`
Auth required + active project required.

Body:
- `title` (required, 3..300 chars)
- `owner` (optional: `studio|client|unknown`)
- `due_at` (optional ISO date)
- `status` (optional)
- `confidence` (optional: `high|medium|low`)
- `summary` (optional)
- `evidence` (optional string array)

Creates commitment for active project.

### `PATCH /commitments/:id`
Auth required + active project required.

Partial update for commitment in active project.

## Jobs

### `POST /jobs/chatwoot/sync`
Auth required.

Runs Chatwoot poll sync. Writes:
- `cw_conversations`
- `cw_messages`
- creates `rag_chunks` (status `pending`) with `project_id = active_project_id`
- updates `sync_watermarks`

### `POST /jobs/embeddings/run`
Auth required.

Embeds project-scoped `rag_chunks` with `embedding_status='pending'` → `ready|failed`.

### `GET /jobs/status`
Auth required.

Returns:
- latest project-scoped `job_runs` per job
- project-scoped `rag_counts` by `embedding_status`
- latest project-scoped `sync_watermarks`

## Search

### `POST /search`
Auth required.

Body:
- `query` (string, required)
- `topK` (int, 1..50, default 10)

Performs cosine-distance vector search over `rag_chunks` where `embedding_status='ready'`.
Search is project-scoped by `active_project_id`.
