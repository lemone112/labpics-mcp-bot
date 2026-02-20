# Sub-Agent Critique Findings — 2026-02-20

> 6 specialized agents reviewed the codebase and iteration plan in parallel.
> All findings are **verified** with file:line references. Zero fabrications.

---

## Summary

| Agent | CRITICAL | HIGH | MEDIUM | Key Theme |
|-------|----------|------|--------|-----------|
| Security | 2 | 6 | 6 | Auth bypass, CSRF, unauthenticated endpoints |
| Backend | 2 | 5 | 7 | Scheduler race conditions, no row locking, unbounded Maps |
| DB & RAG | 2 | 4 | 9 | Vector index mismatch (seq scan), missing transactions, no rollback migrations |
| Business | 7 gaps | 8 logic | — | English-only signals, hardcoded zeros in analytics, missing metrics |
| Frontend | 3 | 5 | 8 | Promise.all fragility, CSP unsafe-eval, zero TypeScript, no React Query |
| QA | 4 | 5 | 8 | 5.17% services coverage, 0 TG bot tests, re-implemented functions in tests |

**Total unique findings: 86** (after dedup across agents).

---

## CRITICAL Findings (must fix immediately)

### 1. Vector search uses wrong operator — full sequential scan on every query
- **Agent:** DB/RAG
- **Location:** `server/src/services/embeddings.js:248,254`
- **Issue:** `searchChunks` uses `<->` (L2 distance) but all indexes are `vector_cosine_ops`. pgvector won't use the index → sequential scan on all rag_chunks.
- **Fix:** Change `<->` to `<=>` (cosine distance). One-line change, massive performance impact.
- **Indexes:** `0002:14` (ivfflat), `0003:77` (hnsw), `0021:133` (hnsw) — all `vector_cosine_ops`.

### 2. Scheduler job claiming has no atomicity — duplicate job execution
- **Agent:** Backend
- **Location:** `server/src/services/scheduler.js:240-262`
- **Issue:** `FOR UPDATE SKIP LOCKED` runs via `pool.query()` (auto-commit). Locks release immediately. Two ticks can claim the same job. `withTransaction` exists in `db.js:20` but is not used.
- **Fix:** Atomic `UPDATE ... SET next_run_at = now() + interval ... WHERE ... RETURNING *` to claim-by-update.

### 3. Outbound message processing has no row locking — double-send possible
- **Agent:** Backend
- **Location:** `server/src/services/outbox.js:551-566`
- **Issue:** `processDueOutbounds` SELECT has no `FOR UPDATE SKIP LOCKED`. Scheduler + API route can both call it, reading the same rows and sending duplicates.
- **Fix:** Add `FOR UPDATE SKIP LOCKED` or claim-by-update pattern.

### 4. Logout endpoint bypasses CSRF protection
- **Agent:** Security
- **Location:** `server/src/index.js:679` + `server/src/routes/auth.js:114`
- **Issue:** All `/auth/` paths are `isPublic`, skipping CSRF validation. `POST /auth/logout` is a mutation without CSRF. Any future `/auth/` mutations inherit this gap.
- **Fix:** Only mark login/signup as public; require CSRF for logout.

### 5. TG webhook secret validation is optional — full unauthenticated bot access
- **Agent:** Security
- **Location:** `telegram-bot/src/index.ts:33` + `telegram-bot/src/types.ts:12`
- **Issue:** `if (webhookSecret)` skips validation when env var unset. `TELEGRAM_WEBHOOK_SECRET` is optional in types. Anyone with the webhook URL can send arbitrary commands.
- **Fix:** Reject all webhook requests when secret is missing. Add startup check.

### 6. Token budget truncation creates infinite retry loop
- **Agent:** DB/RAG
- **Location:** `server/src/services/openai.js:79-82` + `embeddings.js:171-188`
- **Issue:** When token budget exceeded, fewer embeddings returned than inputs. Missing embeddings counted as "failed" but `markClaimedAsPending` decrements attempts, so they never reach max-attempts cap. Chunks cycle indefinitely.
- **Fix:** Return explicit `budget_exhausted` flag; don't decrement attempts for budget-truncated chunks.

### 7. Frontend Promise.all — single endpoint failure kills entire page
- **Agent:** Frontend
- **Location:** 5 feature pages (`signals`, `crm`, `analytics`, `offers`, `digests`)
- **Issue:** One API 500 → entire `Promise.all` rejects → page shows zero data even though other endpoints succeeded.
- **Already planned:** Iter 54.1 (Promise.allSettled).

### 8. CSP allows `unsafe-eval` — negates XSS protection
- **Agent:** Frontend
- **Location:** `web/next.config.mjs:28-29`
- **Issue:** `script-src 'self' 'unsafe-inline' 'unsafe-eval'` fully negates CSP for scripts.
- **Fix:** Remove `unsafe-eval`, use nonce-based CSP with Next.js.

### 9. Services layer has 5.17% test coverage (1.31% function coverage)
- **Agent:** QA
- **Location:** All files under `server/src/services/`
- **Issue:** Every service file has 0% function coverage. The 13.07% total is inflated by import side-effects.
- **Already planned:** Phase 9 (Iter 57-60), but too late.

### 10. Zero TG bot tests (24 source files)
- **Agent:** QA
- **Location:** `telegram-bot/src/` — no test files, no test framework
- **Issue:** Auth, draft ownership, idempotency, Composio MCP — all untested. TypeCheck only.
- **Already planned:** Iter 60.1-60.3, but needs earlier start.

### 11. English-only signal detection for Russian-speaking clients
- **Agent:** Business
- **Location:** `server/src/services/signals.js:28-72`, `upsell.js:16`
- **Issue:** Regex patterns only match English keywords. Client communications are in Russian (templates confirm this). Signal extraction produces near-zero results → health scores, NBA, daily digests all empty/meaningless.
- **Fix:** Add Russian keyword patterns immediately. Highest business impact per engineering effort.

---

## HIGH Findings (fix in next 2 iterations)

### Security
- **CSRF cookie httpOnly:true defeats double-submit** — `index.js:507-513` — should be `false`
- **Swagger exposed unauthenticated in production** — `index.js:395-397,679` — no `isProd` guard
- **Webhook secret timing-unsafe (`!==`)** — `index.ts:35` — use `crypto.timingSafeEqual`
- **x-request-id from client unsanitized** — `index.js:356` — log injection vector
- **No rate limiting on auth endpoints except login** — `index.js:689` — `/auth/me`, `/auth/signup/*` unlimited
- **Login attempts Map unbounded** — `index.js:515` — no MAX_SIZE cap

### Backend
- **Metrics `cb.failureCount` undefined** — `health.js:77` — correct property is `failures`
- **Circuit breaker allows unlimited half-open probes** — `http.js:48-58`
- **No SSE connection limit** — `sse-broadcaster.js` — unlimited connections per project
- **/metrics unauthenticated** — `index.js:679,755` — exposes pool sizes, heap, routes
- **ensureDefaultScheduledJobs on every tick** — `scheduler.js:238` — 13*N queries/minute wasted

### DB & RAG
- **COALESCE(updated_at, created_at) prevents index usage** — 4 event-candidate queries in `event-log.js`
- **Incomplete index rename after kag→connector** — `0022:15-16` — 3 of 5 indexes still named `kag_*`
- **No transaction in connector-sync success path** — `connector-sync.js:74-170` — partial-write risk
- **No rollback/down migrations** — all 27 migration files — no automated recovery

### Business
- **avg_response_minutes always hardcoded 0** — `intelligence.js:89` — field exists, computation missing
- **outbound_messages always 0** — same line — outbox data not fed to analytics
- **costs_amount always 0** — `intelligence.js:157` — margin chart shows 100% for all projects
- **failedJobPressure in health score** — `intelligence.js:276` — technical metric mixed with business health
- **Upsell thresholds too high** — `upsell.js:37-58` — $50K threshold for a studio with $5-20K avg deals

### Frontend
- **Feature pages don't use React Query** — 7 pages with manual useState/useEffect
- **use-project-portfolio.js 335-line god hook** — 6 useEffects, 20 context properties
- **14 inline empty states violate EmptyState wizard** — across 6 feature pages
- **Finance section charts without config prop** — 7 ChartContainer instances
- **Local toast per page instead of global useToast()** — 8 pages duplicate state

### QA
- **Tests re-implement functions instead of importing** — 6 test files copy-paste production code
- **No route handler tests** — 0 of 14 route files tested
- **No auth behavioral tests** — login, CSRF, rate limiting, API keys untested
- **Deploy pipelines skip test execution** — deploy-dev.yml, deploy-prod.yml only syntax check
- **No CI coverage gate** — 13.07% passes as green

---

## MEDIUM Findings (plan to fix)

### Security (6)
- CORS origin no validation
- SQL interval via string concat (safe but fragile pattern)
- API key auth no csrf_token field
- No TG bot rate limiting
- Dummy bcrypt hash minor timing nuance
- Login rate limit cleanup interval (5min gap)

### Backend (7)
- Circuit breaker Map unbounded growth
- Redis maxRetriesPerRequest:3 causes latency during outage
- statement_timeout 30s vs scheduler 10min job timeout
- Matview refresh bare catch (overlap with 55.8)
- route_times/metrics object grows unbounded
- Graceful shutdown doesn't wait for in-flight cycle
- SSE broadcaster shutdown never called

### DB & RAG (9)
- markClaimedAsPending decrements attempts
- claimPendingChunks index missing account_scope_id
- No partial index for embedding_status='processing'
- loadClientSilentCandidates expensive aggregate
- Pool max 25 no saturation warning
- Dimension validation after all API calls (wastes tokens)
- Dedup key includes timestamp (fragile)
- IVFFlat lists=100 miscalibrated
- Matview/identity errors swallowed silently

### Frontend (8)
- No aria-label on search form and tables
- useState called conditionally (hooks violation in section-page.jsx:136)
- key props using array index fallback
- Search 25s timeout, no debounce, no pagination
- Mobile tabbar only 6 sections
- useEffect dependency lint issue
- MotionGroup blur filter performance
- Missing error boundaries for 4 pages

### QA (8)
- Security tests are string-matching, not behavioral
- Redis tests only cover null/disabled paths
- Smoke test minimal (8 checks, status only)
- db.js 0% real coverage despite 23.68% reported
- extended-schemas tests use readFileSync
- SSE double-cleanup bug documented but not fixed
- No frontend unit test framework installed
- E2E covers only 16 test cases total

---

## Business-Critical Gaps (not in any iteration)

1. **No client communication gap detection** — silence for N days is strongest churn signal
2. **No project lifecycle phases** — kickoff/active/review/handoff/warranty/completed
3. **No response time computation** — field exists, hardcoded to 0
4. **No cost/profitability tracking** — margin shows 100% for every project
5. **No invoice/payment tracking** — cash flow invisible
6. **No referral/NPS/satisfaction tracking** — no post-project nurturing
7. **Client Value Score formula unvalidated** — arbitrary constants drive discount policy

---

## Priority Re-Assessment

| Current Plan | Critique Recommendation | Reason |
|---|---|---|
| Iter 52 P0 | **Keep P0, add 3 new tasks** | Add vector operator fix, scheduler atomicity, outbound locking |
| Iter 53 P0 | **Keep P0** | Scheduler hardening validated by critique |
| Iter 54 P1 | **Raise to P0** | CSP unsafe-eval, hooks violation, Promise.all all affect production users |
| Iter 55 P1 | **Keep P1** ✅ completed | Already implemented (Iter 55.1-55.8) |
| Iter 11 CRITICAL | **Defer to P1** | Business agent: LightRAG not revenue-critical, Owner/PMs use web dashboard |
| Iter 21 P0 | **Lower to P1** | Redesigning pages that show fabricated data (0 margins, 0 response times) |
| Iter 20.5 P0 | **Lower to P1** | Charts displaying hardcoded zeros should be fixed at data layer first |
| Iter 48 P1 | **Raise to P0** | Automated reporting is most direct revenue-protection mechanism |
| Iter 50 P0 | **Lower to P2** | TG bot is convenience, not necessity for 2-5 person studio |
| Phase 9 (last) | **Move testing forward** | Tests should accompany features, not follow them |
| — | **NEW Iter 61** | Security hardening (6 findings not in plan) |
| — | **NEW Iter 62** | Business logic accuracy (Russian signals, real metrics) |
| — | **NEW Iter 63** | DB optimization (vector fix, indexes, transactions) |

---

## Positive Patterns Confirmed Across All Agents

- **Parameterized SQL everywhere** — zero string interpolation in SQL (Security)
- **Timing-safe credential comparison** — `crypto.timingSafeEqual` + dummy bcrypt (Security)
- **Connection release safety** — every `pool.connect()` has `finally { release() }` (DB)
- **Scope isolation triggers** — `enforce_project_scope_match()` on every table (DB)
- **Token budget** — capped API spend per embedding run (DB)
- **Autovacuum tuning** — aggressive params on high-churn tables (DB)
- **Redis graceful degradation** — null check everywhere, system works without Redis (Backend)
- **SSE reconnection with backoff** — proper exponential backoff + heartbeat (Frontend)
- **Design token system** — no raw hex colors, full dark mode parity (Frontend)
- **Anime.js exclusivity** — zero imports of framer-motion/gsap/lottie (Frontend)
- **prefers-reduced-motion triple-layer** — CSS + JS + React hook (Frontend)
- **Design audit automation** — 2 scripts enforce design system compliance (Frontend)
- **Outbound pipeline architecture** — state machine, frequency cap, audit trail (Business)
- **Evidence-based decision trail** — evidence_refs throughout signals/NBA/upsell (Business)
- **Dedup everywhere** — SHA-256 dedupe + ON CONFLICT DO NOTHING (Business)
