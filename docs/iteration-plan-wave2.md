# Wave 2 — Full Iteration Plan (Iter 10–16)

> Status: **Wave 1 complete** (Iter 0–9, 58/60 tasks, maturity 65% → 92%)
> Target: **97%+ maturity** after Wave 2
> Source: [Senior+ Audit 2026-02](./review-senior-audit-2026-02.md), existing [backlog](./backlog.md)
>
> **⚠ Supersedes** Iter 12 ("Frontend Resilience") and Iter 13 ("CI/CD Hardening")
> from the original roadmap in [`mvp-vs-roadmap.md`](./mvp-vs-roadmap.md).
> Those definitions are replaced by this plan.
>
> **v6** — added TypeScript migration, Pino structured logging, Biome linter to Iter 15.
> Iter 15 renamed "TypeScript, CI/CD & Infrastructure" (9 → 14 tasks, effort M → L).
> Total tasks: 71 → 76. v5 changelog preserved below.

---

## Dependency Graph

```
                  ┌──→ Iter 12 (Backend hardening) ──┐
                  │                                    │
Iter 10 ──────────┼──→ Iter 11 (LightRAG) ────────────┼──┐
  (KAG cleanup)   │                                    │  │
                  └──→ Iter 13 (Frontend) ──→ Iter 14 ─┘  ├──→ Iter 16 (QA & Release)
                          (resilience)       (design)     │
                                                          │
Iter 15 (TS + CI/CD) — parallel with any iteration ──────┘
```

**Critical path:** 10 → 11 (LightRAG requires clean schema)
**Parallel after 10:** Iter 12, 13 can start immediately after 10 — no dependency on 11
**Independent:** Iter 15 (CI/CD) — anytime
**Final:** Iter 16 — after ALL other iterations (11–15)

---

## Summary

| Iter | Name | Priority | Tasks | Depends on | Est. effort |
|------|------|----------|-------|------------|-------------|
| **10** | KAG Cleanup + DB Hygiene | ✅ DONE | 9/9 | — | S |
| **11** | Full LightRAG Integration | CRITICAL | 10 | 10 | L |
| **12** | Backend Security & Reliability | ✅ DONE | 10/10 | 10 | M |
| **13** | Frontend Resilience & Auth | HIGH | 11 | 10 | M |
| **14** | Design System & Accessibility | MEDIUM | 10 | 13 | M |
| **15** | TypeScript, CI/CD & Infrastructure | MEDIUM | 14 | — | L |
| **16** | QA & Release Readiness | HIGH | 12 | 11–15 | L |
| | **Total** | | **76** | | |

Effort: S = 1–2 days, M = 3–5 days, L = 5–8 days

---

## Iter 10 — KAG Cleanup + DB Hygiene ✅ COMPLETE

**Priority:** CRITICAL
**Status:** DONE — commit `7914a5b` (2026-02-19)
**Result:** Removed 4,932 lines (net −4,865), 26 files changed. All 9 tasks completed.

| # | Task | Source | Status | Notes |
|---|------|--------|--------|-------|
| 10.1 | Delete dead KAG modules | backlog | ✅ | Removed `kag.js` (544 LOC), `kag/` directory (5 files). Moved `kag/templates/` → `services/templates/`. |
| 10.2 | Rename `kag_event_log` → `connector_events` | backlog | ✅ | Migration 0022 + 4 service SQL refs updated. |
| 10.3 | Delete `/kag/*` API routes | backlog | ✅ | Removed 20 route handlers (~387 LOC) + 23 unused imports from `index.js`. |
| 10.4 | Clear scheduler of KAG jobs | backlog | ✅ | Removed KAG cascades, handlers, defaults, pause query, `lightRagOnly` gating. |
| 10.5 | DROP unused KAG DB tables | DB-03 | ✅ | Migration 0022 DROPs 10 tables. Kept `kag_templates` (used by recommendations-v2). |
| 10.6 | Remove KAG tests and documentation | backlog | ✅ | Deleted 7 test files. Renamed `kag-process-log.js` → `process-log.js` (5 importers). Removed 2 unused schemas. |
| 10.7 | Fix duplicate migration numbering (0017) | DB-01 | ✅ | Renamed to `0017b_production_indexes_and_pool.sql`. |
| 10.8 | Add partial index for pending embeddings | DB-04 | ✅ | `idx_rag_chunks_pending` in migration 0022. |
| 10.9 | Resolve `audit_events_partitioned` | DB-06 | ✅ | DROPped table + function in migration 0022. |

**Exit criteria check:**
- ✅ No `kag` references in `server/src/` import paths
- ✅ Remaining `kag` in source: only DB table names (`kag_signals`, `kag_scores`, `kag_risk_forecasts`) in dead-code services (forecasting.js, snapshots.js, recommendations-v2.js — no callers after route/scheduler removal), and `KAG_TEMPLATE_KEYS` constant in templates/
- ✅ All 0017 numbering resolved
- ⚠ Tests: no test runner configured yet (Iter 15)

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

## Iter 12 — Backend Security & Reliability ✅ COMPLETE

**Priority:** HIGH
**Status:** DONE — commit `963dc33` (2026-02-19)
**Result:** 10 fixes across 10 files, +205 / −52 lines. Migration 0023 added.

| # | Task | Source | Status | Notes |
|---|------|--------|--------|-------|
| 12.1 | Harden embedding lifecycle | BE-01 | ✅ | Added max-retry ceiling (5 attempts) to `recoverStaleProcessingRows`; rows exceeding cap are permanently failed. |
| ~~12.2~~ | ~~Login rate limit~~ | ~~BE-02~~ | ✅ | Already implemented (verified v3). |
| 12.3 | Sanitize error messages | BE-03 | ✅ | Removed raw error from connector sync (line 1410) + 3 source binding `reason:` leaks. All 500s now return generic messages. |
| 12.4 | Idempotency keys | BE-04 | ✅ | Migration 0023, `lib/idempotency.js`. Applied to `POST /crm/accounts`, `/offers`, `/outbound/draft`. 24h TTL. |
| 12.5 | Escape LIKE patterns | BE-05 | ✅ | `sanitizeLike()` strips `%` and `\` from search tokens. `ILIKE ANY()` doesn't support ESCAPE clause so stripping is correct approach. |
| 12.6 | Consolidate outbox upsert | BE-06 | ✅ | Merged INSERT + SELECT into `INSERT...ON CONFLICT DO UPDATE RETURNING`. |
| 12.7 | SSE broadcaster reaper | BE-07 | ✅ | 60s interval sweep, removes entries where `reply.raw.destroyed === true`. Exposes `shutdown()` for cleanup. |
| 12.8 | FOR UPDATE SKIP LOCKED | BE-08 | ✅ | CTE-based claim in `runSchedulerTick`. Safe for concurrent workers. |
| 12.9 | Pool error handler | BE-13 | ✅ | `pool.on('error')` logs via Pino. `createDbPool` accepts optional logger (defaults to console). |
| 12.10 | Shutdown timeout | BE-14 | ✅ | 30s default (configurable via `SHUTDOWN_TIMEOUT_MS`). Applied to index.js + worker-loop.js. |
| 12.11 | Optimize hydrateSessionScope | B-1 | ✅ | Cache `_resolvedProjectIds` on request; skip DB call when body matches URL params. |

**Exit criteria check:**
- ✅ All 10 fixes applied (12.2 was already done)
- ✅ No raw error messages in API responses (verified: `sendError` never receives raw `error.message`)
- ✅ Scheduler uses `FOR UPDATE SKIP LOCKED` — safe for concurrent workers

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
| ~~13.10~~ | ~~Consistent loading skeletons~~ | ~~backlog~~ | **Already done.** `PageLoadingSkeleton` exists + used in all dashboard sections. Skeleton pattern is consistent. |
| 13.10-new | Clean dead KAG refs in frontend hooks | backlog | Remove stale `kag_recommendations`, `kag_v2_recommendations` job type references from `web/hooks/use-realtime-refresh.js`. These job types no longer exist after Iter 10. |
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

## Iter 15 — TypeScript, CI/CD & Infrastructure

**Priority:** MEDIUM
**Goal:** Full TypeScript migration, structured logging, linting. Harden build/deploy pipeline.
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
| 15.7 | Add code coverage with threshold | new | Configure `c8` (built-in V8 coverage) for `node --test`. Add `npm run test:coverage` script. Enforce 70% line coverage minimum in CI. Fail build on regression. |
| 15.8 | Multi-stage Docker builds | new | Refactor `server/Dockerfile` and `web/Dockerfile` to multi-stage: build stage (full deps) → production stage (runtime only). Reduce image size ~30-40%. |
| 15.9 | Bundle size check in CI | new | Add `@next/bundle-analyzer` or `size-limit` to web build. Report bundle size in CI. Warn if total JS exceeds 500KB gzipped. |
| 15.10 | TypeScript foundation | new | Add `tsconfig.json` for server (`"module": "nodenext"`, `"strict": true`, `"allowJs": true`) and web (`"strict": true`, extend Next.js defaults). Install `typescript` + `tsx` (dev deps). Configure `npm run typecheck` → `tsc --noEmit`. Incremental adoption via `allowJs`. |
| 15.11 | Server TypeScript migration | new | Rename all `server/src/**/*.js` → `.ts` (38 files, ~17K LOC). Add function signatures, interface/type definitions for all exported functions. Fix all type errors. Update test imports. Zod schemas auto-infer types (`z.infer<typeof Schema>`). Run `tsc --noEmit` clean. |
| 15.12 | Web TypeScript migration | new | Rename all `web/**/*.jsx` → `.tsx` (63 components). Type all hooks (`useAutoRefresh`, `useProjectPortfolio`, etc.), contexts, and API response types. Type props for all components. Next.js 16 has native TS support — no config changes needed. Run `tsc --noEmit` clean. |
| 15.13 | Pino structured logging in workers | new | Fastify already includes Pino (`app.log`). Create shared Pino instance for `worker.js` and `worker-loop.js`. Replace all `console.log(JSON.stringify(...))` calls (11 occurrences) with `logger.info()`. Add request-scoped child loggers (`logger.child({ jobType, projectId })`). JSON output to stdout for Loki ingestion. |
| 15.14 | Biome linter & formatter | new | Install `@biomejs/biome`. Configure: TypeScript strict rules, import sorting, consistent formatting (tabs/spaces, semicolons). Add `npm run lint` to server (currently none). Add `biome check` to CI pipeline (`ci-quality.yml`). Autofix pass on all files. |

**Exit criteria:** CI blocks on `npm audit` high. Deploy creates backup before apply. Rollback tested at least once. docker-compose.yml env duplication eliminated. Code coverage ≥70%. Docker images use multi-stage builds. Bundle size tracked in CI. `tsc --noEmit` passes clean for server and web. All server/web files are `.ts`/`.tsx`. Zero `console.log` in production code. Biome lint passes in CI.

---

## Iter 16 — QA & Release Readiness

**Priority:** HIGH
**Goal:** Final iteration. After completion the product is fully tested, optimized, and production-ready.
**Blocked by:** Iter 11, 12, 13, 14, 15
**Blocks:** nothing — this is the last iteration of Wave 2

| # | Task | Source | Details |
|---|------|--------|---------|
| 16.1 | Audit ON DELETE behavior across all FKs | DB-02 | Review all FK constraints. Add `ON DELETE CASCADE` where missing (risk_pattern_events, case_signatures). Document reasoning for `ON DELETE RESTRICT` cases. |
| ~~16.2~~ | ~~Fix stale embedding recovery max retries~~ | ~~BE-09~~ | **Fixed in 12.1.** `recoverStaleProcessingRows` now has `maxAttempts = 5` ceiling; rows exceeding cap are permanently failed. |
| 16.3 | Fix cache invalidation gap | BE-10 | Invalidate `lightrag:*` cache prefix after `embeddings_run` completion, not just on connector sync. |
| ~~16.4~~ | ~~Apply sourceLimit at DB level~~ | ~~BE-11~~ | **Already implemented.** `queryLightRag()` (lightrag.js:222) uses `LIMIT $4` with sourceLimit. Verified 2026-02-19. |
| 16.5 | Remove PageLoadingSkeleton infinite loop | DS-05 | Replace `loop: true` with single iteration or 2-cycle fade. Align with MOTION_GUIDELINES. |
| 16.6 | E2E tests for critical paths | new | Playwright specs: login → dashboard, LightRAG search → results with citations, SSE event delivery, CRM account create (idempotency), job trigger → status polling. Target: 5+ specs covering all major user flows. |
| 16.7 | Rate limiting on expensive endpoints | new | Add rate limits to: `POST /lightrag/query` (30 req/min per session), `POST /jobs/embeddings/run` (5/min), `POST /jobs/*/sync` (10/min). Use existing `@fastify/rate-limit` or Redis-backed counter. |
| 16.8 | Env validation at startup | new | Validate all required env vars on boot: `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `OPENAI_API_KEY` (if LightRAG enabled). Fail fast with clear error message listing missing vars. Use Zod schema for env parsing. |
| 16.9 | OpenAPI spec with @fastify/swagger | new | Register `@fastify/swagger` + `@fastify/swagger-ui`. Auto-generate OpenAPI 3.0 spec from existing Zod schemas and route definitions. Serve at `/api-docs`. Include auth, pagination, error response schemas. |
| 16.10 | Clean-DB migration test | new | CI step: spin up empty PostgreSQL, run all migrations 0001–002x, verify `schema_migrations` has all entries, run basic INSERT/SELECT on key tables. Catches migration ordering bugs and missing `IF NOT EXISTS` guards. |
| 16.11 | Final regression suite | new | Run full CI pipeline (unit tests + E2E + smoke test + coverage check + bundle size) on a clean checkout. Document any flaky tests. All checks must pass green. |
| 16.12 | Query execution time metrics | new | Add `app_query_duration_seconds` histogram to `/metrics`. Instrument top-5 slowest queries (lightrag search, CRM list, analytics aggregates, embeddings batch, scheduler tick). Alert if p95 > 500ms. |
| 16.13 | Machine-to-machine auth (API keys) | new | Add `api_keys` table (`id`, `project_id`, `key_hash`, `name`, `scopes`, `expires_at`, `created_at`). New middleware: if `X-API-Key` header present, authenticate via hashed key lookup instead of session cookie. Scoped permissions (`read`, `write`, `admin`). This enables other products (TMA, telegram-assistant-bot, calls, future services) to consume the API without session cookies. Key management via dashboard UI (Iter 14+) or admin CLI. |
| 16.14 | Extract route handlers from index.js | new | Split `index.js` (~1700 LOC) into route modules: `routes/auth.js`, `routes/crm.js`, `routes/lightrag.js`, `routes/connectors.js`, `routes/jobs.js`, `routes/outbound.js`, `routes/analytics.js`. Each module exports a Fastify plugin `(app, { pool, cache, ... })`. `index.js` becomes thin orchestrator (~200 LOC): bootstrap, middleware, plugin registration. No behavior change — pure refactor. This is the prerequisite for future Core API extraction if the platform scales to multiple products. |

**Exit criteria:**
- All 28 audit issues resolved (24 remaining + 4 already done: BE-02, BE-09, BE-11, 16.4)
- No known HIGH+ issues in backlog
- E2E tests cover all critical user flows (login, search, SSE, CRM, jobs)
- Rate limiting active on all expensive endpoints
- Server fails fast on missing required env vars
- OpenAPI spec available at `/api-docs`
- All migrations pass on clean PostgreSQL
- CI pipeline fully green (unit + E2E + coverage ≥70% + bundle size)
- Query p95 < 500ms for top-5 queries
- API keys work for machine clients (`X-API-Key` header)
- `index.js` is ≤200 LOC; all route handlers in `routes/*.js` modules

---

## Timeline (suggested)

```
✅ Done       ┃ Iter 10 — KAG Cleanup    ║ Iter 12 — Backend Security
             ┃                           ║
Next         ┃ Iter 11 — LightRAG    ║ Iter 13 — Frontend    ║ Iter 15 — CI/CD
             ┃  (sequential)          ║  (parallel)           ║  (parallel)
             ┃                        ║                       ║
Then         ┃ Iter 14 — Design       ║                       ║
             ┃                        ║                       ║
Finally      ┃ Iter 16 — QA & Release ║                       ║
             ┃                        ║                       ║
             ┗━━━ Target: 97%+ maturity ━━━━━━━━━━━━━━━━━━━━━━┛
```

**Key insight:** Iter 10 and 12 completed in parallel, saving ~1 week.
Remaining: 11 + 13 can start now (parallel), then 14, then 16.

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
| ~~**TypeScript migration**~~ | ~~Deferred~~ → **Moved to Iter 15** (15.10–15.12). Full migration: server + web. |
| **B-3: computeClientValueScore → SQL** | LOW priority. Works correctly in JS. Move to matview when performance justifies. |
| **B-4: use-project-portfolio.js split** | Evaluated — splitting not justified. 335 lines is acceptable for a context hook. |
| **B-6: Grafana dashboards** | Datasources provisioned. Pre-built dashboards are nice-to-have, not blocking. |
| **Core API extraction** | If 3+ products consume the dashboard API, extract shared business logic into a standalone Core API service. Prerequisites done in Wave 2: OpenAPI spec (16.9), API-key auth (16.13), route modules (16.14). Trigger: when dashboard deploys break other products, or API needs independent scaling. |
| **Event bus / webhooks** | For cross-product coordination (e.g., bot creates deal → dashboard syncs immediately). Not needed while eventual consistency via 15-min sync is acceptable. Consider Redis Streams or webhook contracts when real-time coordination required. |

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
| BE-01 | Embedding claim→mark lifecycle | 12 | 12.1 |
| ~~BE-02~~ | ~~Login rate limit bypass~~ | — | **Already done** (`loginAttemptKey` uses `ip:username`) |
| BE-03 | Error messages leak internals | 12 | 12.3 |
| BE-04 | No idempotency keys | 12 | 12.4 |
| BE-05 | LIKE pattern not escaped | 12 | 12.5 |
| BE-06 | Outbox policy upsert consolidation | 12 | 12.6 |
| BE-07 | SSE broadcaster memory leak | 12 | 12.7 |
| BE-08 | Missing job locking | 12 | 12.8 |
| ~~BE-09~~ | ~~Stale embedding no max retries~~ | ~~16~~ | **Fixed in 12.1** |
| BE-10 | Cache invalidation gap | 16 | 16.3 |
| ~~BE-11~~ | ~~N+1 over-fetching in search~~ | — | **Already done** (`LIMIT $4` at DB level in `queryLightRag`) |
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
| B-1 | hydrateSessionScope redundant DB call | 12 | 12.11 |
| B-2 | 80+ env vars duplicated | 15 | 15.6 |
| B-5 | Vector index tuning | 11 | *(resolved by HKUDS LightRAG)* |
| B-7 | Custom RAG quality score | 11 | *(replaced by HKUDS metrics)* |

---

## Changes v5 → v6

| Change | Reason |
|--------|--------|
| Iter 15: added 15.10 (TypeScript foundation) | 17K LOC server + 63 web components without static types. Zod provides runtime validation but no compile-time safety. |
| Iter 15: added 15.11 (Server TypeScript migration) | Rename 38 .js → .ts, type all function signatures. Eliminates entire class of runtime type bugs. |
| Iter 15: added 15.12 (Web TypeScript migration) | Rename 63 .jsx → .tsx, type hooks/components/props. Next.js 16 has native TS support. |
| Iter 15: added 15.13 (Pino structured logging) | Workers use `console.log(JSON.stringify(...))` — manual JSON formatting. Fastify already includes Pino. Unify. |
| Iter 15: added 15.14 (Biome linter & formatter) | Server has **no linter**. 17K LOC without code style enforcement. Biome (Rust-based) replaces ESLint + Prettier. |
| Iter 15: renamed "CI/CD & Infrastructure" → "TypeScript, CI/CD & Infrastructure" | Reflects expanded scope. |
| Iter 15: effort M → L | 9 → 14 tasks. TypeScript migration is the largest single task. |
| Deferred: TypeScript migration → moved to Iter 15 | No longer deferred — full migration within Wave 2. |
| Total tasks: 71 → 76 | +5 new tasks in Iter 15. |

---

## Changes v4 → v5

| Change | Reason |
|--------|--------|
| Iter 15: added 15.7 (code coverage with c8) | No coverage enforcement existed. Added 70% threshold. |
| Iter 15: added 15.8 (multi-stage Docker builds) | Both Dockerfiles are single-stage; images include dev deps unnecessarily. |
| Iter 15: added 15.9 (bundle size check) | No tracking of frontend bundle size in CI. |
| Iter 15: effort S → M | 6 → 9 tasks. |
| Iter 16: renamed "Polish & Technical Debt" → "QA & Release Readiness" | Previous Iter 16 was too thin (3 tasks) for a final iteration. Product must be fully tested and production-ready after last iteration. |
| Iter 16: added 16.6 (E2E tests for critical paths) | Only 2 Playwright specs existed. No coverage of login, search, SSE, CRM, jobs. |
| Iter 16: added 16.7 (rate limiting on expensive endpoints) | `/lightrag/query`, `/jobs/embeddings/run`, `/jobs/*/sync` had no rate limits. Only login was protected. |
| Iter 16: added 16.8 (env validation at startup) | Server crashes with unclear errors on missing `DATABASE_URL`, `REDIS_URL`, etc. No fail-fast validation. |
| Iter 16: added 16.9 (OpenAPI spec) | Only markdown API docs. No machine-readable spec, no auto-generated client SDK. |
| Iter 16: added 16.10 (clean-DB migration test) | No CI step to verify all migrations run cleanly on empty PostgreSQL. |
| Iter 16: added 16.11 (final regression suite) | No explicit "all green" gate before release. |
| Iter 16: added 16.12 (query execution time metrics) | No query performance visibility in `/metrics`. Can't detect slow queries in production. |
| Iter 16: added 16.13 (machine-to-machine auth / API keys) | Session cookies don't work for service-to-service. Other products (TMA, bot, calls) need API-key auth to consume the API. |
| Iter 16: added 16.14 (extract route handlers from index.js) | 1700-LOC index.js is the #1 blocker for future Core API extraction. Split into `routes/*.js` modules — pure refactor, no behavior change. |
| Iter 16: priority LOW → HIGH, effort M → L, depends on 11–15 | Final iteration must run after everything else. 12 tasks now (was 3). |
| Total tasks: 59 → 71 | +12 new tasks (3 in Iter 15, 9 in Iter 16). |

---

## Changes v3 → v4

| Change | Reason |
|--------|--------|
| Struck through task 13.10 (loading skeletons) | **Already done.** `PageLoadingSkeleton` exists and is used across all dashboard sections. |
| Added task 13.10-new (clean dead KAG refs in frontend hooks) | `use-realtime-refresh.js` still references `kag_recommendations` and `kag_v2_recommendations` job types removed in Iter 10. |
| Struck through task 16.2 (stale embedding max retries) | **Fixed in 12.1.** `recoverStaleProcessingRows` now has `maxAttempts = 5` with permanent failure for rows exceeding cap. |
| Struck through BE-09 in cross-reference | Same as 16.2 — resolved in Iter 12.1. |
| Total tasks: 60 → 59 | -2 resolved (13.10, 16.2), +1 added (13.10-new). Iter 11, 14, 15 verified unchanged. |

---

## Changes vs v2 of this document

| Change | Reason |
|--------|--------|
| Removed task 12.2 (login rate limit) | **Already implemented.** `loginAttemptKey()` (index.js:517) uses compound `ip:username` key. Verified by reading code. |
| Removed task 16.4 (sourceLimit at DB level) | **Already implemented.** `queryLightRag()` uses `LIMIT $4` with sourceLimit param. Verified by reading code. |
| Corrected 12.1 description | `markReadyRows` is a single atomic UPDATE — wrapping in `withTransaction` is unnecessary. Real issue is crash-recovery lifecycle: claim→embed→mark has no guaranteed cleanup on crash. Reframed as "harden lifecycle". |
| Corrected 12.6 description | Code already uses `INSERT...ON CONFLICT DO NOTHING`, not plain INSERT. Downgraded severity to LOW. Reframed as "consolidate to single query" optimization. |
| Corrected 12.11 description | Guard already exists at index.js:709 (`if (active_project_id && account_scope_id) return`). Two-phase hydration is intentional. Reframed as "optimize redundant DB call" with LOW severity. |
| Total tasks: 62 → 60 | -2 resolved (12.2, 16.4), 3 corrected (12.1, 12.6, 12.11). |

---

## Changes v1 → v2

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
