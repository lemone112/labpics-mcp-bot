# System architecture (web-first MVP)

This repository implements a web-first architecture:

- a single Fastify server process (API + jobs)
- a Next.js UI
- Postgres (pgvector) for storage and vector search

## Components

- `server/` — Fastify API, job runners, scheduler/worker loop, DB migrations
- `web/` — Next.js UI
- `docker-compose.yml` — local/prod composition

## Core loop (MVP)

1. Login
2. Select an active project
3. Sync Chatwoot into scoped tables
4. Build embeddings for new/changed chunks
5. Search with strict scope filtering and evidence links

## Scope model

All non-public endpoints require a session and an active project.

Scope is enforced at multiple layers:

- DB schema constraints/triggers
- explicit SQL filters
- API middleware (resolving `active_project_id` and `account_scope_id`)

## Jobs & worker

Two layers:

- manual API-triggered jobs (`/jobs/*`)
- scheduler tick (`/jobs/scheduler/tick`) which claims due work and records worker runs

## Integrations (current)

- Chatwoot ingest is the MVP source of truth
- Linear/Attio are optional and should follow preview→apply rules

## Docs map

- platform constraints: [`docs/platform-architecture.md`](./platform-architecture.md)
- pipelines/jobs: [`docs/pipelines.md`](./pipelines.md)
- API contract: [`docs/api.md`](./api.md)
