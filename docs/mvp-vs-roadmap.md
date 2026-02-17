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
- Control Tower UI (`/control-tower`) with scoped integration health + NBA + evidence
- Attio/Linear sync jobs with watermark/idempotent upsert/retry semantics
- Identity graph preview/apply (`/identity/*`) with audit trail
- Signals + NBA extraction/status lifecycle (`/signals/*`, `/nba/*`)
- Upsell radar and deal→delivery continuity preview/apply (`/upsell/*`, `/continuity/*`)
- Daily/weekly digests + risk/health + analytics snapshots (`/digests/*`, `/risk/*`, `/analytics/*`)

## Explicit non-goals (MVP)

- Multi-tenant organizations and RBAC
- Automatic cross-project linking
- Backfill of legacy data
- Automated “derived artifacts” (commitments/risks/digests) unless they are evidence-linked and spec’d

## Roadmap (later)

Future work belongs in specs and should be tagged as roadmap:

- Deep external writeback (Attio/Linear object mutation beyond controlled preview/apply)
- Rich CRM UX (full board interactions, inline editing, ownership workflows)
- High-fidelity visual regression automation (baseline lifecycle in CI)
- Advanced permission model
