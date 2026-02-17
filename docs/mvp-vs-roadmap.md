# MVP now vs Roadmap

This document prevents drift between what the system **does today** and what is **planned**.

## MVP (now)

The MVP is defined by:

- Login/password authentication + server sessions
- Project selection stored in session (`active_project_id`)
- Chatwoot → DB sync
- Chunking + embeddings stored in Postgres/pgvector
- Vector search over embedded chunks (strict project/account SQL scope)
- Jobs UI (`/jobs`) to run/observe sync & embeddings
- Platform layer: audit events, outbox/approval, scheduler tick, evidence index

## Explicit non-goals (MVP)

- Multi-tenant organizations and RBAC
- Automatic cross-project linking
- Backfill of legacy data
- Automated “derived artifacts” (commitments/risks/digests) unless they are evidence-linked and spec’d

## Roadmap (later)

Future work belongs in specs and should be tagged as roadmap:

- Commitments / risks / weekly digests derived views
- Integrations beyond Chatwoot
- Advanced permission model
