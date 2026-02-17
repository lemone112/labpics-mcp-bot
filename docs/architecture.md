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
- All routes except `/health`, `/metrics`, and `/auth/*` require a valid session cookie.
- Protected mutating routes require CSRF header/token match.

### Project scoping

- Active project is stored on the session row: `sessions.active_project_id`.
- UI uses `/projects/:id/select` to set the active project.
- Ingestion/search/jobs tables carry `(project_id, account_scope_id)`.
- API SQL filters are scope-aware; cross-scope writes are blocked by DB trigger `enforce_project_scope_match()`.
- `project_sources` prevents binding one external source to multiple projects.

## Jobs execution model

Manual jobs via API:

- `POST /jobs/chatwoot/sync`
- `POST /jobs/embeddings/run`

Scheduled jobs via worker tick:

- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`

Worker/scheduler state:

- `scheduled_jobs`
- `worker_runs`
- run history in scoped `job_runs`

## Outbound / approval model

- Draft/approval/send lifecycle is stored in `outbound_messages`.
- Delivery attempts are stored in `outbound_attempts`.
- Opt-out, stop-on-reply, and frequency caps are stored in `contact_channel_policies`.
- Critical actions are written to `audit_events` with `evidence_refs`.

## Design constraints

- **Idempotency**: raw rows use stable string IDs (`cw:<...>`, `cwmsg:<...>`).
- **Observability**: every response includes `request_id` header/body for tracing.
- **Evidence-first**: future entities must always refer back to raw or chunk rows.
- **Safety rails for outbound**: idempotency keys, dedupe keys, approval state machine, opt-out/frequency controls.

## What is intentionally missing

- Webhooks (polling + jobs only)
- Distributed queue system (single-process scheduler tick in MVP)
- Linear/Attio integrations (planned)
