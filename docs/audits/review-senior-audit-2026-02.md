# Senior+ Audit: labpics-dashboard (2026-02-18)

Cross-reference: [`lightrag-db-requirements.md`](https://github.com/lemone112/telegram-assistant-bot/blob/main/docs/lightrag-db-requirements.md)

---

## Executive Summary

This document contains results of a full-stack senior-level audit of **labpics-dashboard**.
The audit evaluates 4 layers — **Database**, **Backend**, **Frontend**, **Design** — against
production-readiness, the authoritative LightRAG DB requirements from `telegram-assistant-bot`,
and industry best practices.

**Key outcomes:**
- Migration `0021_lightrag_full_schema.sql` written to close the DB gap with LightRAG requirements
- 28 issues identified and described below, ready for GitHub Issues

---

## Part 1 — Database (DB)

### 1.1 GAP: lightrag-db-requirements.md vs current schema

| Requirement (telegram-assistant-bot) | Current state | Gap | Fix (migration 0021) |
|--------------------------------------|---------------|-----|----------------------|
| `source_documents` — unified raw doc store with `global_ref` PK | Absent. Raw data split across `cw_messages`, `linear_issues_raw`, `attio_accounts_raw` etc. | CRITICAL | Created `source_documents` table |
| `document_chunks` with `document_ref` FK, `chunk_hash`, `acl_tags` | `rag_chunks` exists but lacks `document_ref`, `chunk_ref`, `chunk_hash`, `acl_tags`, offsets | HIGH | Added columns to `rag_chunks` |
| `entities` — canonical entity store | Absent. Entities spread across CRM tables with no unified model | CRITICAL | Created `entities` table |
| `entity_links` — typed cross-system mappings | `identity_links` + `identity_link_suggestions` exist but lack `link_type` enum, `evidence` json, `expires_at` | HIGH | Created `entity_links` table |
| `document_entity_mentions` | Absent | HIGH | Created `document_entity_mentions` table |
| `ingestion_cursors` (per source_system + cursor_key) | `sync_watermarks` partially covers but no cursor_key granularity | MEDIUM | Created `ingestion_cursors` table |
| `ingestion_runs` with structured counts | `job_runs` partially covers but not ingestion-specific | MEDIUM | Created `ingestion_runs` table |
| `acl_tags` server-side ACL | Absent. Only `project_id`/`account_scope_id` scoping | HIGH | Added `acl_tags text[]` to source_documents, rag_chunks, entities |
| `GlobalRef` format `<system>:<type>:<id>` | No unified identifier system | HIGH | Created `make_global_ref()` helper function |
| Citations: `source_url`, `source_system`, `snippet`, `score` per chunk | `lightrag_query_runs.evidence` is unstructured jsonb | MEDIUM | source_documents + entity context views enable structured citations |
| Tombstone deletes (`is_deleted`) | Absent on raw tables | MEDIUM | Added `is_deleted` to source_documents, entities |
| `content_hash` / `chunk_hash` idempotent upserts | `rag_chunks.text_hash` exists; raw tables lack `content_hash` | MEDIUM | Added to source_documents; backfilled chunk_hash from text_hash |

### 1.2 Existing DB issues (not LightRAG-related)

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| DB-01 | **Duplicate migration numbering** — two files named `0017_*` | HIGH | `0017_lightrag_query_runs.sql` and `0017_production_indexes_and_pool.sql`. Apply order is alphabetical, which works by accident. Rename `0017_production_indexes_and_pool.sql` to `0017b_production_indexes_and_pool.sql`. |
| DB-02 | **No `ON DELETE CASCADE` on several FKs** | MEDIUM | Deleting projects may leave orphaned rows in: `risk_pattern_events` (no FK to projects), `case_signatures`. Audit all tables for proper cascade behavior. |
| DB-03 | **Legacy KAG tables are dead weight** | LOW | 12+ KAG tables (`kag_nodes`, `kag_edges`, `kag_events`, etc.) remain in schema while `LIGHTRAG_ONLY=1`. They add complexity, confuse onboarding, bloat backups. Plan a cleanup migration. |
| DB-04 | **Missing partial indexes on embedding_status** | MEDIUM | `rag_chunks` WHERE `embedding_status = 'pending'` queries scan entire table. Add `WHERE embedding_status = 'pending'` partial index. |
| DB-05 | **Materialized view `mv_portfolio_dashboard` has no refresh schedule** | MEDIUM | View is created `WITH DATA` but no `REFRESH MATERIALIZED VIEW CONCURRENTLY` mechanism exists in scheduler. Data goes stale. |
| DB-06 | **`audit_events_partitioned` table created but never used** | LOW | Migration 0018 creates partitioned table + partition creator function, but no code references `audit_events_partitioned`. Either migrate or remove. |

---

## Part 2 — Backend

### 2.1 Critical issues

| # | Issue | Severity | File | Details |
|---|-------|----------|------|---------|
| BE-01 | **Embedding state not transactional** | CRITICAL | `services/embeddings.js` | `markReadyRows` updates rag_chunks outside transaction. Partial failure = inconsistent state. Wrap in `withTransaction`. |
| BE-02 | **Login rate limit bypass** | CRITICAL | `index.js:825-868` | Rate limiting is per-IP only. Distributed brute-force with multiple IPs + same username bypasses limit. Add username+IP compound rate limit. |
| BE-03 | **Error messages leak internals** | CRITICAL | `index.js:1447+` | Raw `error.message` passed to client in connector sync, recommendation endpoints. Could expose SQL errors, API keys. Return generic messages; log details server-side. |
| BE-04 | **No idempotency keys on mutations** | HIGH | All POST endpoints | Network retry = duplicate resource creation. Accept optional `idempotency_key` header, store in table with `ON CONFLICT`. |
| BE-05 | **LIKE pattern not escaped** | HIGH | `services/lightrag.js:33-40` | `buildLikePatterns()` doesn't escape `%` and `_`. Query containing these chars causes wildcard match. Escape special chars before wrapping in `%...%`. |
| BE-06 | **Race condition in outbox policy touch** | HIGH | `services/outbox.js:26-48` | INSERT then SELECT without lock. Two concurrent requests create duplicate policies. Use `INSERT...ON CONFLICT` or `SELECT FOR UPDATE`. |
| BE-07 | **SSE broadcaster memory leak** | HIGH | `lib/sse-broadcaster.js:17-43` | If cleanup function never called (client crash without close), entry stays in Set forever. Add periodic reaper with TTL. |

### 2.2 Architectural issues

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| BE-08 | **Missing distributed job locking** | HIGH | Scheduler doesn't use `FOR UPDATE SKIP LOCKED`. Two concurrent workers = duplicate job execution. |
| BE-09 | **Stale embedding recovery has no max retries** | MEDIUM | `recoverStaleProcessingRows` resets chunks to pending without limit. A broken embedding service = infinite retry loop. Add `embedding_attempts < max_retries`. |
| BE-10 | **Cache invalidation gap** | MEDIUM | LightRAG cache only invalidated on embeddings/connectors sync, NOT after fresh embeddings uploaded. Users see stale search results for up to 5 minutes. |
| BE-11 | **N+1-like over-fetching in search** | MEDIUM | `queryLightRag` fetches all sources independently with same patterns, returns all results, truncates in JS. Apply `sourceLimit` at DB level with `LIMIT`. |
| BE-12 | **KAG routes leak existence in LIGHTRAG_ONLY mode** | LOW | Returns 410 ("KAG routes disabled") instead of 404. Confirms feature existence to probes. |
| BE-13 | **DB pool missing error handler** | MEDIUM | `createDbPool` doesn't register `pool.on('error', ...)`. Stale connections may accumulate silently after backend restarts. |
| BE-14 | **Worker loop has no graceful shutdown timeout** | MEDIUM | SIGTERM arrives mid-cycle: waits for full cycle (potentially 5+ min) with no cancel/timeout mechanism. |

### 2.3 LightRAG service gaps vs full implementation

| Gap | Current | Required |
|-----|---------|----------|
| Entity extraction | None | Extract entities from chunks during ingestion |
| Relationship inference | None | Build entity graph from mentions |
| Hybrid search | Vector-only (cosine) | Vector + keyword + reranking |
| Multi-hop reasoning | Single-hop search | Follow entity_links for connected knowledge |
| Citation verification | Unverified evidence refs | Re-check source exists; include source_url, system, type |
| Temporal weighting | All evidence equal | Recent evidence weighted higher in scoring |
| ACL filtering | Not implemented | Filter by `acl_tags` intersection on every query |

---

## Part 3 — Frontend

### 3.1 Critical issues

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| FE-01 | **No error boundaries** | CRITICAL | No `error.jsx` files exist. Any React error = blank screen. Create error boundaries for all routes. |
| FE-02 | **No server-side route protection** | HIGH | Auth is client-side only (`useAuthGuard`). Unauthenticated users briefly see protected content before redirect. Add Next.js middleware. |
| FE-03 | **Missing security headers** | CRITICAL | `next.config.mjs` has no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`. Vulnerable to XSS, clickjacking. |
| FE-04 | **CSRF token initialization race** | HIGH | `api.js` caches CSRF token in module variable. First request has no token. No refresh on 403. |
| FE-05 | **EventSource memory leak** | HIGH | `use-event-stream.js`: if constructor throws, sourceRef not set, cleanup can't happen. Auto-reconnect without backoff hammers backend. |

### 3.2 Architecture issues

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| FE-06 | **No unified data fetching layer** | HIGH | Every feature reinvents loading/error/caching with raw `useState`. No React Query, SWR, or normalized cache. Leads to duplicated logic, no request deduplication, no stale-while-revalidate. |
| FE-07 | **Multiple refresh mechanisms don't coordinate** | HIGH | Auto-refresh timer + SSE events + manual refresh = potential double-fetches, stale state, race conditions. Need unified refresh coordinator. |
| FE-08 | **Missing Suspense boundaries** | MEDIUM | Dynamic imports lack Suspense wrappers. No streaming support, worse Core Web Vitals. |
| FE-09 | **Missing page metadata** | MEDIUM | Only root layout has metadata. All child pages lack dynamic titles, OG tags. |
| FE-10 | **useMobile returns undefined on first render** | MEDIUM | `useState(undefined)` causes layout shift: renders desktop, then switches to mobile. Initialize from SSR or use CSS-only approach. |
| FE-11 | **No retry/backoff on API calls** | MEDIUM | All `apiFetch` calls fail once and stop. No exponential backoff for transient errors. |

---

## Part 4 — Design System / UX / UI

### 4.1 shadcn/ui + anime.js consistency

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| DS-01 | **Dual animation systems** | HIGH | `skeleton.jsx` uses Tailwind `animate-pulse`; `page-loading-skeleton.jsx` uses anime.js via MOTION tokens. Inconsistent motion behavior. Standardize on anime.js for all custom animations. |
| DS-02 | **Sheet animation exceeds budget** | MEDIUM | `sheet.jsx` uses `duration-500` (500ms). MOTION_GUIDELINES specifies max 420ms for standard transitions. Reduce to 420ms. |
| DS-03 | **Sidebar transitions bypass MOTION tokens** | MEDIUM | `sidebar.jsx:160,169` hardcodes `transition-[width] duration-200 ease-linear` instead of using centralized MOTION values. |
| DS-04 | **Tailwind animations ignore prefers-reduced-motion** | MEDIUM | Dropdown, Select, Sheet, Tooltip use `animate-in/animate-out` which bypass the `motionEnabled()` check. Users with `prefers-reduced-motion: reduce` still see animations. WCAG 2.1 SC 2.3.3 violation. |
| DS-05 | **PageLoadingSkeleton infinite loop** | LOW | `loop: true` infinite pulse. Guidelines say "avoid chaining more than 2 sequential animations." |

### 4.2 UX/UI gaps

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| DS-06 | **No FormField component** | HIGH | All forms use ad-hoc `useState`, no inline validation, no accessible labels, no error messages beside fields. Need FormField + FormError components. |
| DS-07 | **Toast doesn't support stacking** | MEDIUM | Single toast state per page. Multiple errors → only last shown. Need toast queue/stack. |
| DS-08 | **Missing Dialog/Modal component** | MEDIUM | Sheet used as workaround. Need proper dialog for confirmation flows (delete, apply). |
| DS-09 | **No Pagination component** | MEDIUM | Tables show all data without pagination. Will break with 100+ rows. |
| DS-10 | **Toast not announced to screen readers** | MEDIUM | Missing `role="status"` / `aria-live="polite"`. Screen reader users miss notifications. |
| DS-11 | **Z-index strategy not formalized** | LOW | Values jump from z-20 to z-50 to z-[60] to z-[70]. No documented hierarchy. Mobile tabbar (z-[60]) can appear over sheet (z-50). |
| DS-12 | **Form labels not associated with inputs** | HIGH | Input elements have placeholders but no `<label>`. Screen readers can't identify fields. |
| DS-13 | **Checkbox not using Radix primitive** | MEDIUM | Custom implementation bypasses built-in a11y handling from `@radix-ui/react-checkbox`. |

---

## GitHub Issues Plan

Below are the recommended issues, grouped by label. Each should be created in `lemone112/labpics-dashboard`.

### Label: `database`

1. **[DB] Implement full LightRAG schema (source_documents, entities, entity_links)** — Migration 0021 already written. Review, test, and apply.
2. **[DB] Fix duplicate migration numbering (0017)** — Rename `0017_production_indexes_and_pool.sql` → `0017b_production_indexes_and_pool.sql`.
3. **[DB] Plan KAG table deprecation** — Mark legacy `kag_*` tables for removal; add migration to drop them.
4. **[DB] Add partial index for pending embeddings** — `rag_chunks WHERE embedding_status = 'pending'`.
5. **[DB] Implement mv_portfolio_dashboard refresh in scheduler** — Add periodic `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
6. **[DB] Audit ON DELETE behavior across all FKs** — Ensure no orphaned rows on project/account deletion.

### Label: `backend`

7. **[BE] Wrap embedding state updates in transactions** — `markReadyRows` must be atomic.
8. **[BE] Fix login rate limiting: add username+IP compound key** — Prevent distributed brute force.
9. **[BE] Sanitize error messages returned to clients** — Never expose raw error.message.
10. **[BE] Add idempotency key support to mutation endpoints** — Prevent duplicate resource creation.
11. **[BE] Escape LIKE pattern special characters in lightrag search** — Fix `%` and `_` injection.
12. **[BE] Implement FOR UPDATE SKIP LOCKED in scheduler** — Prevent duplicate job execution.
13. **[BE] Add SSE broadcaster reaper for stale connections** — Periodic cleanup with TTL.
14. **[BE] Add pool.on('error') handler to db.js** — Prevent silent connection leaks.
15. **[BE] Build ingestion pipeline: raw tables → source_documents → entities** — Core LightRAG integration work.
16. **[BE] Implement ACL filtering in LightRAG queries** — Filter by `acl_tags` intersection.
17. **[BE] Implement hybrid search (vector + keyword + reranking)** — Replace vector-only search.

### Label: `frontend`

18. **[FE] Add error boundaries to all routes** — Create `error.jsx` for root + all feature routes.
19. **[FE] Add Next.js middleware for server-side auth protection** — Prevent flash of protected content.
20. **[FE] Add security headers to next.config.mjs** — CSP, X-Frame-Options, HSTS, etc.
21. **[FE] Fix CSRF token initialization and refresh** — Handle first-request and 403 scenarios.
22. **[FE] Introduce unified data fetching layer (React Query / SWR)** — Replace ad-hoc useState patterns.
23. **[FE] Fix EventSource reconnection with backoff** — Prevent backend hammering.

### Label: `design`

24. **[DS] Standardize animations on anime.js, remove Tailwind animate-pulse** — Single motion system.
25. **[DS] Fix Sheet/Sidebar animation durations to respect MOTION budget** — Max 420ms.
26. **[DS] Add prefers-reduced-motion support to Tailwind animations** — WCAG compliance.
27. **[DS] Create FormField + FormError components** — Inline validation, accessible labels.
28. **[DS] Create Toast stack/queue with aria-live** — Multiple notifications, screen reader support.

---

## Migration 0021 checklist

- [x] `source_documents` table with GlobalRef PK, ACL, content_hash, tombstones
- [x] `rag_chunks` extended with document_ref, chunk_ref, chunk_hash, acl_tags, offsets
- [x] `entities` table with entity_ref PK, kind enum, FTS search
- [x] `entity_links` with typed link semantics, confidence, evidence, expiration
- [x] `document_entity_mentions` with deduplication
- [x] `ingestion_cursors` for per-source + per-key cursor tracking
- [x] `ingestion_runs` with structured insert/update/delete/skip counts
- [x] Scope guard triggers on all new tables
- [x] `v_active_source_documents` and `v_entity_context` convenience views
- [x] `make_global_ref()` helper function
- [x] GIN indexes on `acl_tags` for all tables that have them
