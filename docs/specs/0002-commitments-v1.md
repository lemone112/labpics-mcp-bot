# Spec 0002 — Commitments v1 (DRAFT)

Status: **draft**

## Goal

Extract and manage **commitments** (agreements / next steps) per project from Chatwoot conversations.

## Core requirements

- Auto-extraction (LLM) with **evidence-first**.
- Commitments are editable by humans.
- Commitments can be converted into Linear issues (preview/apply in later spec).

## Data model

Add table `commitments`:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references projects(id) on delete cascade`
- `side text not null` (`client|us|unknown`)
- `who text null`
- `what text not null`
- `due_at timestamptz null`
- `status text not null` (`pending|done|canceled`)
- `confidence real not null` (0..1)
- `conversation_global_id text null`
- `message_global_id text null`
- `evidence_chunk_id uuid null references rag_chunks(id) on delete set null`
- `meta jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## Pipelines

- Triggered job `POST /jobs/commitments/extract`.
- Reads recent `rag_chunks` for active project (ready only), last N (configurable).
- Produces structured JSON; upserts commitments by deterministic key:
  - `(project_id, evidence_chunk_id, what)` or a computed hash.

## UI

Add page `/commitments`:

- list open commitments
- filters: status, due date
- edit commitment (inline)
- mark done/canceled

## Acceptance

- After sync+embeddings, extraction produces commitments with evidence links.
- No duplicates when re-running extraction.
