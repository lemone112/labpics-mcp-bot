# Spec 0005 — Integrations: Linear & Attio preview/apply (DRAFT)

Status: **draft**

## Goal

Provide safe integrations where the agent can propose changes, but a human approves them.

## Requirements

- **Attio**: preview/approve only.
- **Linear**: allow limited auto-create only for high-confidence commitments, otherwise preview.
- Idempotency keys for creating issues/patches.
- Audit log of every proposal and applied action.

## Data model

Table `integration_actions`:

- `id uuid pk`
- `project_id uuid not null`
- `tool text not null` (`linear|attio`)
- `kind text not null` (`create_issue|update_company|...`)
- `status text not null` (`proposed|approved|applied|failed|rejected`)
- `proposal jsonb not null`
- `result jsonb null`
- `idempotency_key text not null unique`
- `created_at`, `updated_at`

## UI

- Page `/integrations` with:
  - list of proposals
  - approve/apply buttons
  - error details

## Acceptance

- No automatic CRM patching.
- Every applied action has an audit record.
