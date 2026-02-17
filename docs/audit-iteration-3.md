# Product audit — iteration 3 (hardening pass)

Date: 2026-02-17

## Why this pass

Previous scope hardening closed SQL-level isolation but still left semantic risk:
without explicit project ↔ source linking, the same external data could be ingested into multiple projects.

## Critical gaps found

1. Missing safe-by-default source binding for Chatwoot ingestion.
2. Review endpoints were scoped through `rag_chunks`, which could hide unchunked/short/private-adjacent raw data.
3. Missing UUID validation on selected route params (`projects/:id/select`, `commitments/:id` patch).
4. Jobs UX allowed sync trigger without inbox links, causing avoidable no-op cycles.

## Changes applied

### Backend / schema

- Added `project_source_links` table with uniqueness on external source identity:
  - migration: `server/db/migrations/0006_project_source_links.sql`
  - supports `chatwoot_inbox` source type
- Added `cw_conversations(inbox_id)` index.
- Added `/project-links` API:
  - `GET /project-links`
  - `POST /project-links`
  - `DELETE /project-links/:id`
- Chatwoot sync now:
  - reads linked inboxes for active project
  - skips ingestion when no links
  - records explicit skip reason in sync metadata
  - counts skipped unlinked conversations
  - ignores messages older than link activation window (`import_from_ts`) by default
- Review endpoints (`/contacts`, `/conversations`, `/messages`) now scope by linked inboxes.
- Added strict UUID format validation in high-risk route params.

### Frontend

- Settings page connected to real project-link API:
  - add/remove Chatwoot inbox links
  - shows safe-default state when links absent
- Jobs page:
  - shows linked inbox count
  - blocks sync action when no links
  - shows explicit skip reason when last sync was skipped due to missing links
- Dashboard status labels updated to reflect iteration progress.

## Residual risks

1. Full source-link model for Linear/Attio is still pending.
2. Legacy unscoped chunk rows (`project_id IS NULL`) still require explicit cleanup policy.
3. No dedicated automated integration tests yet for source-linking invariants.
