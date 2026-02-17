# MVP now vs Roadmap

This document prevents drift between what the system **does today** and what is **planned**.

## MVP (now)

The MVP is defined by:

- Project selection and project-scoped data access
- Chatwoot → DB sync
- Chunking + embeddings stored in Postgres/pgvector
- Vector search over embedded chunks (project-scoped)
- Jobs UI (`/jobs`) to run/observe sync & embeddings

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
