# Spec 0004 — Weekly digest v1 (DRAFT)

Status: **draft**

## Goal

Generate a weekly digest per project:

- commitments: new/overdue/done
- risks: new/escalated
- conversation activity summary
- next-week suggested actions

## Data model

Table `digests`:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references projects(id) on delete cascade`
- `period_start date not null`
- `period_end date not null`
- `sections jsonb not null`
- `rendered_md text not null`
- `created_at timestamptz not null default now()`

## API & UI

- `POST /jobs/digest/generate` (for active project, for current week or given period)
- Page `/digest` shows latest and history.

## Acceptance

- Digest is reproducible and evidence-backed.
