# MVP now vs Roadmap (Labpics Dashboard)

This document prevents drift between what the system **does today** and what is **planned**.

## MVP (now)

MVP is the minimal evidence-backed loop:

- login/password authentication + server sessions
- project selection stored in session (`active_project_id`)
- Chatwoot → DB sync
- chunking + embeddings stored in Postgres/pgvector
- vector search over embedded chunks (strict SQL scope)
- jobs UI to run/observe sync & embeddings

## Non-goals (MVP)

- organizations/RBAC
- automatic cross-project linking
- uncontrolled writebacks to external systems

## Roadmap (later)

- commitments / risks / digests automation
- Linear/Attio deep workflows (preview→apply + writeback)
- signals/NBA and outbound approvals
- CRM (accounts/opportunities) and sales tooling
- health score / risk radar
- revenue analytics
