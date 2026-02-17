# Product audit — iteration 2

Date: 2026-02-17

## Scope of audit

- `server/` API contracts and data-safety invariants
- `web/` Next.js frontend (new TS SaaS shell)
- Docs consistency for API/data model

## Findings (ordered by severity)

1. **Critical: project-scope leakage risk in retrieval and observability**
   - Before fix: `/search`, `/jobs/status`, `/conversations`, `/messages` could operate across mixed data.
   - Fix:
     - Added `rag_chunks.project_id`.
     - Enforced `active_project_required` on project-scoped endpoints.
     - Filtered search/jobs/review endpoints by active project.

2. **High: sync/embedding jobs were not scoped by active project**
   - Before fix: jobs could process global pending chunks and produce mixed operational state.
   - Fix:
     - Job runs are now project-scoped (`job_runs.project_id`).
     - Embeddings claim/recovery/search now filter by project.
     - Sync watermark source includes project id (`chatwoot:<account>:<project>`).

3. **Medium: frontend type contracts mismatched backend payloads**
   - Before fix: several `bigint/text` DB fields were typed as `number`.
   - Fix:
     - Updated TS contracts for IDs/BigInt-backed fields.
     - Fixed conversation selection typing and related logic.

4. **Medium: UX allowed invalid actions without active project**
   - Before fix: dashboard/jobs/conversations/search could trigger requests that fail by scope.
   - Fix:
     - Added active-project gating and empty states.
     - Disabled actions when active project is missing.
     - Humanized common API error messages.

## Schema changes introduced

- Migration: `server/db/migrations/0004_project_scope_hardening.sql`
  - `rag_chunks.project_id`
  - project-scoped unique/index strategy for chunks
  - `job_runs.project_id`
  - indexes for project-scoped jobs and chunk access

## Remaining risks / next iteration focus

1. Chatwoot source-link mapping (`project ↔ inbox`) is not implemented yet (spec 0006).
2. Legacy unscoped rows (`rag_chunks.project_id IS NULL`) remain and should be phased out with controlled migration policy.
3. Commitments/Risks/Digest pages are still UI scaffold and need real API + persistence layer.
