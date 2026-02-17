# Specs (Cursor-ready)

This folder contains **implementation-ready technical specifications**.

## How Cursor should work with these specs

Rules:

1. **One spec = one PR** (unless explicitly stated).
2. Every spec must be implemented **end-to-end**: DB migration → server endpoints → web UI → docs updates.
3. Follow **evidence-first**: any derived entity must reference raw/source rows.
4. Prefer **idempotency** and safe retries.
5. If a spec requires a schema change, add a migration file under `server/db/migrations/`.
6. If the spec changes API behavior, update `docs/api.md`.

## Spec lifecycle

- `draft` → `ready` → `done`
- Cursor should only implement specs marked **ready**.

## Conventions

- Migrations: `server/db/migrations/000X_<name>.sql`
- IDs:
  - Conversations: `cw:<account_id>:<conversation_id>`
  - Messages: `cwmsg:<account_id>:<message_id>`

## Current platform snapshot (Web-first MVP)

- DB tables exist: `projects`, `sessions`, `cw_conversations`, `cw_messages`, `rag_chunks`, `sync_watermarks`, `job_runs`.
- API exists in `server/src/index.js`.
- UI exists in `web/app/*`.

## Specs index

- [0001 — Multi-project RAG scoping](./0001-multiproject-rag-scope.md)
- [0002 — Commitments v1](./0002-commitments-v1.md)
- [0003 — Risks v1](./0003-risks-v1.md)
- [0004 — Weekly digest v1](./0004-weekly-digest-v1.md)
- [0005 — Integrations (Linear/Attio) preview/apply](./0005-integrations-linear-attio-preview.md)
