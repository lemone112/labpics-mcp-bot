# Wave 2 — Full Iteration Plan (Iter 10–16)

> Status: **Wave 1 complete** (Iter 0–9, 58/60 tasks, maturity 65% → 92%)
> Target: **97%+ maturity** after Wave 2
> Source: [Senior+ Audit 2026-02](./review-senior-audit-2026-02.md), existing [backlog](./backlog.md)
>
> **⚠ Supersedes** Iter 12 ("Frontend Resilience") and Iter 13 ("CI/CD Hardening")
> from the original roadmap in [`mvp-vs-roadmap.md`](./mvp-vs-roadmap.md).
> Those definitions are replaced by this plan.

---

## Dependency Graph

```
                  ┌──→ Iter 12 (Backend hardening) ──┐
                  │                                    │
Iter 10 ──────────┼──→ Iter 11 (LightRAG) ────────────┼──→ Iter 16 (Polish)
  (KAG cleanup)   │                                    │
                  └──→ Iter 13 (Frontend) ──→ Iter 14 ─┘
                          (resilience)       (design)

Iter 15 (CI/CD) — independent, can run in parallel with any iteration
```

**Critical path:** 10 → 11 (LightRAG requires clean schema)
**Parallel after 10:** Iter 12, 13 can start immediately after 10 — no dependency on 11
**Independent:** Iter 15 (CI/CD) — anytime
**Final:** Iter 16 — after 11, 12, 14

---

## Summary

| Iter | Name | Priority | Tasks | Depends on | Est. effort |
|------|------|----------|-------|------------|-------------|
| **10** | KAG Cleanup + DB Hygiene | CRITICAL | 9 | — | S |
| **11** | Full LightRAG Integration | CRITICAL | 10 | 10 | L |
| **12** | Backend Security & Reliability | HIGH | 11 | 10 | M |
| **13** | Frontend Resilience & Auth | HIGH | 11 | 10 | M |
| **14** | Design System & Accessibility | MEDIUM | 10 | 13 | M |
| **15** | CI/CD & Infrastructure | MEDIUM | 6 | — | S |
| **16** | Polish & Technical Debt | LOW | 5 | 11, 12, 14 | S |
| | **Total** | | **62** | | |

Effort: S = 1-2 days, M = 3-5 days, L = 5-8 days

---

## Iter 10 — KAG Cleanup + DB Hygiene

**Priority:** CRITICAL
**Goal:** Remove ~2,770 LOC dead code, fix schema hygiene issues, prepare clean foundation for LightRAG.
**Blocked by:** nothing — can start immediately.
**Blocks:** Iter 11 (LightRAG uses tables freed by KAG cleanup), Iter 12, Iter 13

| # | Task | Source | Details |
|---|------|--------|---------|
| 10.1 | Delete dead KAG modules | backlog | Remove `kag.js`, `kag/` directory (~2,602 LOC). Keep `kag/templates/` (used by recommendations-v2). |
| 10.2 | Rename `kag_event_log` → `connector_events` | backlog | Migration + service code update. Table is used by connector-sync, not KAG. |
| 10.3 | Delete `/kag/*` API routes | backlog | ~118 LOC in `index.js`. Remove entirely (currently returns 410 in LIGHTRAG_ONLY mode — no need to keep). |
| 10.4 | Clear scheduler of KAG jobs | backlog | Remove KAG job types from CASCADE_CHAINS and seed data. |
| 10.5 | DROP unused KAG DB tables | DB-03 | `kag_nodes`, `kag_edges`, `kag_provenance_refs`, `kag_signal_state`, `kag_signals`, `kag_signal_history`, `kag_scores`, `kag_score_history`, `kag_recommendations`, `kag_templates`. |
| 10.6 | Remove KAG tests and documentation | backlog | Clean test files, update docs. |
| 10.7 | Fix duplicate migration numbering (0017) | DB-01 | Rename `0017_production_indexes_and_pool.sql` → `0017b_production_indexes_and_pool.sql`. Update `schema_migrations` row. |
| 10.8 | Add partial index for pending embeddings | DB-04 | `CREATE INDEX ON rag_chunks (project_id, created_at) WHERE embedding_status = 'pending'`. Speeds up `claimPendingRows`. |
| 10.9 | Resolve `audit_events_partitioned` | DB-06 | Table created in migration 0018 but never referenced in code. Either wire up INSERT triggers or DROP it. |

**Exit criteria:** No `kag` references in server/src/ (except `kag_event_log` → `connector_events`). All 0017 numbering resolved. Tests green.

**Risks:**
- `kag/templates/` used by recommendations-v2 — must verify before deleting parent directory
- `kag_event_log` rename requires updating all SQL references in services atomically

---

## Iter 11 — Full LightRAG Integration

**Priority:** CRITICAL
**Goal:** Connect labpics-dashboard to a real LightRAG with entity graph, citations, and MCP for telegram-assistant-bot.
**Blocked by:** Iter 10 (clean schema required)
**Blocks:** Iter 16 (polish depends on stable LightRAG)

| # | Task | Source | Details |
|---|------|--------|---------|
| 11.1 | Apply migration 0021 (LightRAG full schema) | audit | `source_documents`, `entities`, `entity_links`, `document_entity_mentions`, `ingestion_cursors`, `ingestion_runs`. Already written. Review and test. |
| 11.2 | Build ingestion pipeline: raw → source_documents | BE-15, audit | Service that reads `cw_messages`, `linear_issues_raw`, `attio_*_raw` and upserts into `source_documents` with `global_ref`, `content_hash`. Idempotent via `ON CONFLICT(global_ref)`. Skip if `content_hash` unchanged. |
| 11.3 | Build entity extraction: source_documents → entities | audit | Extract canonical entities from `source_documents.raw_payload`. Create `entity_links` (e.g., message → conversation = `thread_of`, deal → company = `belongs_to`). Populate `document_entity_mentions`. |
| 11.4 | Deploy HKUDS LightRAG Server | backlog | Add Python LightRAG container to `docker-compose.yml`. Configure PGKVStorage + PGVectorStorage + PGGraphStorage pointing to same PostgreSQL. |
| 11.5 | Data ingestion → LightRAG /documents API | backlog | Pipe `source_documents.text_content` into LightRAG `/documents/text` endpoint. Batch ingestion, skip if `content_hash` unchanged. |
| 11.6 | Proxy LightRAG query endpoints | BE-17 | Rewrite `POST /lightrag/query` to call HKUDS LightRAG `/query` with mode (naive/local/global/hybrid). Proxy status and health. |
| 11.7 | Implement ACL filtering | BE-16, audit | Pass `acl_tags` from session to LightRAG queries. Filter `source_documents` and `entities` by `acl_tags && $request_acl_tags`. |
| 11.8 | Implement structured citations | audit | Every response includes: `source_url`, `source_system`, `source_type`, `document_ref`, `snippet`, `score`. If no citations → "insufficient evidence". |
| 11.9 | MCP Server for Telegram bot | backlog | Deploy `daniel-lightrag-mcp` (22 tools). Service account auth via `X-API-Key`. Connect to telegram-assistant-bot. |
| 11.10 | Integration tests | backlog | End-to-end: ingest raw data → verify source_documents → query LightRAG → verify citations with entity context. |

**Exit criteria:** `POST /lightrag/query` returns grounded answers with citations. telegram-assistant-bot can query via MCP. Entities visible in `v_entity_context` view.

**Risks:**
- HKUDS LightRAG Python container adds ~2GB to image size — monitor build times
- PGGraphStorage shares PostgreSQL with app — may need connection pool tuning
- Entity extraction quality depends on LLM prompt engineering — budget time for iteration
- MCP server (`daniel-lightrag-mcp`) is external dependency — pin version, test compatibility

---

## Iter 12 — Backend Security & Reliability

**Priority:** HIGH
**Goal:** Close all critical/high backend vulnerabilities found in audit.
**Blocked by:** Iter 10 (KAG cleanup simplifies code paths)
**Blocks:** Iter 16 (polish depends on stable backend)

> **Note:** Most fixes here are independent of LightRAG migration (Iter 11).
> Can run in parallel with Iter 11 after Iter 10 is complete.

| # | Task | Source | Details |
|---|------|--------|---------|
| 12.1 | Wrap embedding state updates in transactions | BE-01 | `markReadyRows` → `withTransaction`. Partial failure must ROLLBACK. |
| 12.2 | Fix login rate limit: username+IP compound key | BE-02 | Track `loginAttempts` by `username:ip` pair, not just IP. Prevent distributed brute force. |
| 12.3 | Sanitize error messages returned to clients | BE-03 | Replace `String(error?.message)` with generic messages in all catch blocks that call `sendError`. Log original to Pino. |
| 12.4 | Add idempotency key support to mutations | BE-04 | Accept `X-Idempotency-Key` header. Store in new `idempotency_keys` table with `ON CONFLICT → return cached response`. Apply to CRM create, offer create, outbound send. |
| 12.5 | Escape LIKE pattern special characters | BE-05 | `buildLikePatterns()`: escape `%` → `\%`, `_` → `\_` before wrapping in `%...%`. |
| 12.6 | Fix race condition in outbox policy touch | BE-06 | Replace INSERT→SELECT with `INSERT...ON CONFLICT(project_id, contact_global_id, channel) DO UPDATE SET updated_at = now() RETURNING *`. |
| 12.7 | Add SSE broadcaster reaper | BE-07 | Periodic sweep every 60s: remove entries whose `reply.raw.destroyed === true`. Log cleanup count. |
| 12.8 | Implement FOR UPDATE SKIP LOCKED in scheduler | BE-08 | `SELECT ... FROM scheduled_jobs WHERE status = 'active' AND next_run_at <= now() FOR UPDATE SKIP LOCKED LIMIT $1`. Prevents duplicate execution by concurrent workers. |
| 12.9 | Add pool.on('error') handler | BE-13 | Register `pool.on('error', (err) => logger.error({ err }, 'pool_error'))` in `createDbPool`. Prevents silent connection accumulation. |
| 12.10 | Worker graceful shutdown timeout | BE-14 | After SIGTERM, wait max 30s for current cycle, then force-exit. Use `AbortController` or `Promise.race` with timeout. |
| 12.11 | Fix hydrateSessionScope double-call | B-1 | Add `request.scopeHydrated` guard flag. If already hydrated, skip second call in preValidation. |

**Exit criteria:** All 11 fixes applied. No raw error messages in API responses (verified by grep). Scheduler safe for 2+ concurrent workers. `hydrateSessionScope` called exactly once per request.

**Risks:**
- Idempotency keys (12.4) require new DB table + migration — coordinate with 0021
- FOR UPDATE SKIP LOCKED (12.8) changes scheduler behavior — test thoroughly with concurrent workers
- Error sanitization (12.3) must not suppress useful validation messages on 4xx

---

## Iter 13 — Frontend Resilience & Auth

**Priority:** HIGH
**Goal:** Eliminate crash-to-blank-screen scenarios, secure route access, fix data fetching.
**Blocked by:** Iter 10 (KAG route cleanup simplifies frontend)
**Blocks:** Iter 14 (design system needs stable component base)

| # | Task | Source | Details |
|---|------|--------|---------|
| 13.1 | Create error boundaries | FE-01 | `app/error.jsx` (root), `app/control-tower/error.jsx`, `app/crm/error.jsx`, `app/search/error.jsx`, `app/analytics/error.jsx`. Each: show error message + "Retry" button + "Go home" link. |
| 13.2 | Add Next.js middleware for server-side auth | FE-02 | `web/middleware.js`: check session cookie existence before rendering protected routes. Redirect to `/login` if absent. Whitelist: `/login`, `/api`, `/_next`, `/favicon.ico`. |
| 13.3 | Add security headers to next.config.mjs | FE-03 | `headers()` async function: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy. Note: HSTS and some headers already set by Fastify (Iter 8) — these cover Next.js SSR responses. |
| 13.4 | Fix CSRF token initialization and refresh | FE-04 | On app mount: call `GET /auth/me` to populate `csrfTokenCache`. On 403 with `csrf_invalid`: auto-retry after refreshing token. |
| 13.5 | Fix EventSource reconnection with backoff | FE-05 | Replace native EventSource with manual implementation: exponential backoff (1s, 2s, 4s, 8s, max 30s). Add `heartbeat` timeout (60s silence → reconnect). Cap at 10 reconnect attempts, then fallback to polling-only. |
| 13.6 | Introduce unified data fetching layer | FE-06, FE-11 | Add `@tanstack/react-query`. Wrap all `apiFetch` calls in `useQuery`/`useMutation`. Configure defaults: `retry: 3`, `retryDelay: exponentialBackoff` (only for 5xx/network errors, NOT 4xx). Get: automatic caching, deduplication, stale-while-revalidate, retry, loading/error states. |
| 13.7 | Coordinate refresh mechanisms | FE-07 | SSE events → `queryClient.invalidateQueries()` instead of custom hooks. Remove `useAutoRefresh` polling when SSE connected. Single source of truth for data freshness. |
| 13.8 | Add Suspense boundaries | FE-08 | Wrap dynamic imports and data-dependent sections in `<Suspense fallback={<PageLoadingSkeleton />}>`. |
| 13.9 | Add page metadata to all routes | FE-09 | `export const metadata = { title: "...", description: "..." }` in every `page.jsx`. Dynamic titles for `[section]` routes. |
| 13.10 | Consistent loading skeletons | backlog | Skeleton loaders for all dashboard sections (CRM, analytics, search, control tower). Consistent shimmer pattern using MOTION tokens. |
| 13.11 | Offline detection | backlog | `navigator.onLine` + fetch probe (`GET /health`). Show banner when offline. Auto-dismiss on reconnect. Pause react-query refetches while offline. |

**Exit criteria:** No blank screens on errors. Unauthenticated users never see protected UI. All pages have titles in browser tab. react-query devtools show cache hits. Offline banner appears within 5s of connectivity loss.

---

## Iter 14 — Design System & Accessibility

**Priority:** MEDIUM
**Goal:** Consistent animation system, accessible forms, WCAG compliance.
**Blocked by:** Iter 13 (needs stable component base + react-query)
**Blocks:** Iter 16 (polish)

| # | Task | Source | Details |
|---|------|--------|---------|
| 14.1 | Standardize animations on anime.js | DS-01 | Replace `animate-pulse` in `skeleton.jsx` with anime.js-based pulse using MOTION tokens. Single animation library across all components. |
| 14.2 | Fix Sheet/Sidebar animation durations | DS-02, DS-03 | `sheet.jsx`: `duration-500` → `duration-[420ms]`. `sidebar.jsx`: replace hardcoded `duration-200 ease-linear` with MOTION.durations.fast / MOTION.easing.standard. |
| 14.3 | Add prefers-reduced-motion to Tailwind animations | DS-04 | Create Tailwind plugin or add `@media (prefers-reduced-motion: reduce)` override in `globals.css` to disable `animate-in`/`animate-out` on Dropdown, Select, Sheet, Tooltip. |
| 14.4 | Create FormField + FormError components | DS-06, DS-12 | `FormField`: wraps `<label>` + `<Input>` + `<FormError>`. Auto-generates `htmlFor`/`id`. Shows inline error with `role="alert"`. Supports required indicator. |
| 14.5 | Create Toast stack with aria-live | DS-07, DS-10 | `ToastProvider` context: queue up to 5 toasts, auto-dismiss after 5s (errors: 8s). Container with `role="status" aria-live="polite"`. Entry/exit animation via MOTION. |
| 14.6 | Create Dialog/Modal component | DS-08 | Based on `@radix-ui/react-dialog`. For confirmation flows (delete project, apply offer, dismiss recommendation). Focus trap + Escape to close. |
| 14.7 | Create Pagination component | DS-09 | Simple page-based: Previous/Next + page numbers. Integrate with react-query for server-side pagination on tables (CRM accounts, signals, audit events). |
| 14.8 | Migrate Checkbox to Radix primitive | DS-13 | Replace custom `checkbox.jsx` with `@radix-ui/react-checkbox`. Preserves existing API, gains built-in a11y. |
| 14.9 | Fix useMobile initial undefined | FE-10 | Initialize `useState(false)` instead of `undefined`. Use `useEffect` + `matchMedia` for hydration-safe detection. Or CSS-only approach with `@container` queries. |
| 14.10 | Document z-index hierarchy | DS-11 | Add to DESIGN_SYSTEM_2026.md: `1-9 interactive`, `10-19 navigation`, `20-29 overlays`, `30-49 dropdowns`, `50-59 modals`, `60-69 system (tabbar)`, `70+ critical`. Enforce with Tailwind config. |

**Exit criteria:** Lighthouse accessibility score 90+. All forms have associated labels. `prefers-reduced-motion: reduce` disables all animations. FormField used in all feature forms.

---

## Iter 15 — CI/CD & Infrastructure

**Priority:** MEDIUM
**Goal:** Harden build/deploy pipeline, reduce incident blast radius.
**Blocked by:** nothing — can run in parallel with any iteration.
**Blocks:** nothing

| # | Task | Source | Details |
|---|------|--------|---------|
| 15.1 | Add `.dockerignore` files | backlog | Server and web: exclude `node_modules`, `.git`, `test/`, `docs/`, `*.md`. Reduce build context and image size. |
| 15.2 | Add `npm audit` to CI | backlog | GitHub Action step: `npm audit --audit-level=high`. Fail on high/critical vulnerabilities. |
| 15.3 | Pre-deploy database backup | backlog | Add `scripts/backup.sh` call before `docker compose up` in deploy workflow. Verify backup with `scripts/verify-backup.sh`. |
| 15.4 | Rollback strategy | backlog | Document: keep previous 3 Docker images tagged by git SHA. Rollback = `docker compose pull && docker compose up -d` with previous SHA. |
| 15.5 | Implement mv_portfolio_dashboard refresh | DB-05 | Add `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_portfolio_dashboard` to `analytics_aggregates` scheduler job. Add unique index if missing. |
| 15.6 | Extract env vars to .env file | B-2 | Move 80+ duplicated env vars from docker-compose.yml `environment:` blocks into shared `.env` file or `env_file:` directive. Single source of truth. |

**Exit criteria:** CI blocks on `npm audit` high. Deploy creates backup before apply. Rollback tested at least once. docker-compose.yml env duplication eliminated.

---

## Iter 16 — Polish & Technical Debt

**Priority:** LOW
**Goal:** Remaining medium/low issues, cleanup.
**Blocked by:** Iter 11, 12, 14
**Blocks:** nothing

| # | Task | Source | Details |
|---|------|--------|---------|
| 16.1 | Audit ON DELETE behavior across all FKs | DB-02 | Review all FK constraints. Add `ON DELETE CASCADE` where missing (risk_pattern_events, case_signatures). Document reasoning for `ON DELETE RESTRICT` cases. |
| 16.2 | Fix stale embedding recovery max retries | BE-09 | Add `WHERE embedding_attempts < $max_retries` to `recoverStaleProcessingRows`. Mark as `failed` after limit. |
| 16.3 | Fix cache invalidation gap | BE-10 | Invalidate `lightrag:*` cache prefix after `embeddings_run` completion, not just on connector sync. |
| 16.4 | Apply sourceLimit at DB level in search | BE-11 | `queryLightRag`: add `LIMIT $sourceLimit` to each source query (messages, issues, opportunities). Remove JS-side truncation. |
| 16.5 | Remove PageLoadingSkeleton infinite loop | DS-05 | Replace `loop: true` with single iteration or 2-cycle fade. Align with MOTION_GUIDELINES. |

**Exit criteria:** All 28 audit issues resolved. No known HIGH+ issues in backlog.

---

## Timeline (suggested)

```
Week 1       ┃ Iter 10 — KAG Cleanup + DB Hygiene
             ┃
Week 2-3     ┃ Iter 11 — LightRAG    ║ Iter 12 — Backend    ║ Iter 15 — CI/CD
             ┃  (sequential)          ║  (parallel)           ║  (parallel)
             ┃                        ║                       ║
Week 3-4     ┃ Iter 13 — Frontend     ║                       ║
             ┃                        ║                       ║
Week 4-5     ┃ Iter 14 — Design       ║                       ║
             ┃                        ║                       ║
Week 5-6     ┃ Iter 16 — Polish       ║                       ║
             ┃                        ║                       ║
             ┗━━━ Target: 97%+ maturity ━━━━━━━━━━━━━━━━━━━━━━┛
```

**Key insight:** Iter 12 (Backend) runs in parallel with Iter 11 (LightRAG), not sequentially.
This saves ~1 week vs original plan.

---

## Maturity Projection

| Area | After Wave 1 | After Iter 11 | After Iter 14 | After Wave 2 |
|------|-------------|---------------|---------------|-------------|
| Platform | 99% | 99% | 99% | 99% |
| Connectors | 97% | 99% | 99% | 99% |
| Intelligence (LightRAG) | 90% | **97%** | 97% | 99% |
| Dashboard (Backend) | 88% | 90% | 95% | **98%** |
| Frontend | 85% | 85% | **95%** | **97%** |
| Design/UX | 80% | 80% | **93%** | **96%** |
| Infrastructure | 92% | 93% | 93% | **97%** |
| **Average** | **92%** | **93%** | **96%** | **97%+** |

---

## Deferred (Future Waves)

| Item | Rationale |
|------|-----------|
| **TypeScript migration** | Phase 1 (tsconfig + .d.ts) deferred until Wave 2 completes. Convention: all new files in TS. See backlog L.1–L.3. |
| **B-3: computeClientValueScore → SQL** | LOW priority. Works correctly in JS. Move to matview when performance justifies. |
| **B-4: use-project-portfolio.js split** | Evaluated — splitting not justified. 335 lines is acceptable for a context hook. |
| **B-6: Grafana dashboards** | Datasources provisioned. Pre-built dashboards are nice-to-have, not blocking. |

---

## Cross-reference: Issues → Iterations

| Issue ID | Description | Iter | Task |
|----------|------------|------|------|
| DB-01 | Duplicate migration numbering (0017) | 10 | 10.7 |
| DB-02 | Missing ON DELETE CASCADE | 16 | 16.1 |
| DB-03 | Legacy KAG tables | 10 | 10.5 |
| DB-04 | Partial index pending embeddings | 10 | 10.8 |
| DB-05 | mv_portfolio_dashboard refresh | 15 | 15.5 |
| DB-06 | audit_events_partitioned unused | 10 | 10.9 |
| BE-01 | Embedding state not transactional | 12 | 12.1 |
| BE-02 | Login rate limit bypass | 12 | 12.2 |
| BE-03 | Error messages leak internals | 12 | 12.3 |
| BE-04 | No idempotency keys | 12 | 12.4 |
| BE-05 | LIKE pattern not escaped | 12 | 12.5 |
| BE-06 | Race condition outbox | 12 | 12.6 |
| BE-07 | SSE broadcaster memory leak | 12 | 12.7 |
| BE-08 | Missing job locking | 12 | 12.8 |
| BE-09 | Stale embedding no max retries | 16 | 16.2 |
| BE-10 | Cache invalidation gap | 16 | 16.3 |
| BE-11 | N+1 over-fetching in search | 16 | 16.4 |
| BE-12 | KAG routes leak existence | 10 | 10.3 *(deleted entirely)* |
| BE-13 | DB pool missing error handler | 12 | 12.9 |
| BE-14 | Worker no shutdown timeout | 12 | 12.10 |
| BE-15 | Ingestion pipeline | 11 | 11.2, 11.3 |
| BE-16 | ACL filtering | 11 | 11.7 |
| BE-17 | Hybrid search | 11 | 11.6 |
| FE-01 | No error boundaries | 13 | 13.1 |
| FE-02 | No server-side auth | 13 | 13.2 |
| FE-03 | Missing security headers | 13 | 13.3 |
| FE-04 | CSRF token race | 13 | 13.4 |
| FE-05 | EventSource memory leak | 13 | 13.5 |
| FE-06 | No unified data fetching | 13 | 13.6 |
| FE-07 | Refresh mechanisms conflict | 13 | 13.7 |
| FE-08 | Missing Suspense | 13 | 13.8 |
| FE-09 | Missing page metadata | 13 | 13.9 |
| FE-10 | useMobile undefined | 14 | 14.9 |
| FE-11 | No retry/backoff | 13 | 13.6 *(merged into react-query config)* |
| DS-01 | Dual animation systems | 14 | 14.1 |
| DS-02 | Sheet animation > budget | 14 | 14.2 |
| DS-03 | Sidebar bypasses MOTION | 14 | 14.2 |
| DS-04 | No prefers-reduced-motion | 14 | 14.3 |
| DS-05 | Skeleton infinite loop | 16 | 16.5 |
| DS-06 | No FormField component | 14 | 14.4 |
| DS-07 | Toast no stacking | 14 | 14.5 |
| DS-08 | Missing Dialog/Modal | 14 | 14.6 |
| DS-09 | No Pagination | 14 | 14.7 |
| DS-10 | Toast no aria-live | 14 | 14.5 |
| DS-11 | Z-index not formalized | 14 | 14.10 |
| DS-12 | Form labels not associated | 14 | 14.4 |
| DS-13 | Checkbox not Radix | 14 | 14.8 |
| B-1 | hydrateSessionScope double-call | 12 | 12.11 |
| B-2 | 80+ env vars duplicated | 15 | 15.6 |
| B-5 | Vector index tuning | 11 | *(resolved by HKUDS LightRAG)* |
| B-7 | Custom RAG quality score | 11 | *(replaced by HKUDS metrics)* |

---

## Changes vs v1 of this document

| Change | Reason |
|--------|--------|
| Iter 12 no longer depends on Iter 11 | Backend security fixes are independent of LightRAG migration. Enables parallel execution, saves ~1 week. |
| Removed task 16.5 (KAG routes → 404) | Contradiction: task 10.3 deletes KAG routes entirely. No routes left to return 404. BE-12 now resolved by 10.3. |
| Merged task 16.6 into 13.6 | react-query default config includes `retry: 3` + exponential backoff. Duplicate of FE-11. |
| Added 12.11 (hydrateSessionScope) | B-1 from backlog was missing. Backend fix: guard flag prevents double hydration. |
| Added 13.10 (loading skeletons) | Original Iter 12.4 from mvp-vs-roadmap.md was missing. |
| Added 13.11 (offline detection) | Original Iter 12.5 from mvp-vs-roadmap.md was missing. |
| Added 15.6 (env vars → .env) | B-2 from backlog was missing. 80+ duplicated vars in docker-compose. |
| Added risk sections | Critical iterations (10, 11, 12) now have explicit risk callouts. |
| Added "Deferred" section | TypeScript migration, B-3, B-4, B-6 explicitly listed as future work. |
| Added "Supersedes" note | Clarifies that old Iter 12/13 definitions from mvp-vs-roadmap.md are replaced. |
| Total tasks: 60 → 62 | +4 added, -2 removed. |
