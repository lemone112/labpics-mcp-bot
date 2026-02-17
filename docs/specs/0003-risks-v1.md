# Spec 0003 — Risks v1 (DRAFT)

Status: **draft**

## Goal

Detect and track project risks from conversations and commitments.

## Requirements

- Evidence-first (must reference `rag_chunks` and/or messages).
- Mixed model:
  - flag-like risks from conversation
  - blocking risks from commitments
  - probabilistic risks (probability/impact)

## Data model

Add table `risks`:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references projects(id) on delete cascade`
- `type text not null` (`scope|timeline|budget|sentiment|blocking|unknown`)
- `severity int not null` (1..5)
- `probability real not null` (0..1)
- `impact int not null` (1..5)
- `summary text not null`
- `status text not null` (`open|mitigated|accepted`)
- `related_commitment_id uuid null references commitments(id) on delete set null`
- `evidence_chunk_id uuid null references rag_chunks(id) on delete set null`
- `message_global_id text null`
- `conversation_global_id text null`
- `next_action text null`
- `owner text null`
- `meta jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## API & UI

- `POST /jobs/risks/extract`
- Page `/risks` with evidence drill-down.

## Acceptance

- Risks list shows only project-scoped risks.
- Every risk has evidence.
