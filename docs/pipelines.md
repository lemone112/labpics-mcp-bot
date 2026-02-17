# Pipelines & jobs (MVP)

Automation has two layers:

1. **Manual jobs** (API-triggered)
2. **Scheduler/worker tick** (claims due jobs)

## Manual jobs

- Chatwoot sync: `POST /jobs/chatwoot/sync`
- Embeddings: `POST /jobs/embeddings/run`

## Scheduler tick

- Inspect: `GET /jobs/scheduler`
- Run due jobs: `POST /jobs/scheduler/tick`

## Job invariants

- idempotent (safe to retry)
- bounded work per run (limits)
- scoped by project/account scope
- observable (status + error + counts)

## Typical loop

1. Run sync
2. Run embeddings
3. Search and review evidence

See also:

- API contract: [`docs/api.md`](./api.md)
- Runbooks: [`docs/runbooks.md`](./runbooks.md)
