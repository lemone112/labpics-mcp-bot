# System architecture (Web-first MVP)

This branch implements **Web-first** architecture: a single server process (API + jobs) plus a Next.js UI, backed by Postgres (pgvector).

## Components

- **db**: Postgres 16 + pgvector (Docker image `pgvector/pgvector:pg16`)
- **server**: Node.js + Fastify API + background-like jobs
- **web**: Next.js UI

Composition is defined in [`/docker-compose.yml`](../docker-compose.yml).

## Request flow

### UI → API

- Browser calls `NEXT_PUBLIC_API_BASE_URL` (default `/api`).
- Next.js rewrites `/api/*` to `API_UPSTREAM_URL` (default `http://localhost:8080` locally or `http://server:8080` in Docker).
- Auth is cookie-based session (`SESSION_COOKIE_NAME`, default `sid`).

### API authentication

- `POST /auth/login` creates a session row in `sessions` and sets cookie.
- All routes except `/health` and `/auth/*` require a valid session cookie.

### Project scoping

- Active project is stored on the session row: `sessions.active_project_id`.
- UI uses `/projects/:id/select` to set the active project.
- Current MVP retrieval/search SQL is global and does not filter by `active_project_id`.
- Strict per-project isolation requires adding `project_id` to ingestion/search tables and filtering queries by session project.

## Jobs execution model

Jobs are executed as **API endpoints** (triggered by UI):

- `POST /jobs/chatwoot/sync`
- `POST /jobs/embeddings/run`

Each run is recorded in `job_runs` and surfaced in `/jobs/status`.

## Design constraints

- **Idempotency**: raw rows use stable string IDs (`cw:<...>`, `cwmsg:<...>`).
- **Observability**: every response includes `request_id` header/body for tracing.
- **Evidence-first**: future entities must always refer back to raw or chunk rows.

## What is intentionally missing

- Webhooks (polling + jobs only)
- Queue system (single-process jobs, MVP)
- Linear/Attio integrations (planned)
