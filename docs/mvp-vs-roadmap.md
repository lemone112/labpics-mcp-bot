# Статус продукта и roadmap (Production-Ready Plan)

> Обновлено: 2026-02-18 (post Iter 0-9 + Architecture Audit)
> Детальный анализ: [`docs/product-structure-analysis.md`](./product-structure-analysis.md)

---

## 1) Текущее состояние — что сделано

### Платформа (зрелость: 80% → **99%**)

**Было:** Session auth + CSRF, plaintext пароли, нет rate limiting, session UPDATE на каждый запрос.

**Сделано (Iter 0 + 1 + 2 + 7 + 8):**
- ✅ Bcrypt password hashing с автодетектом формата (`isBcryptHash()`)
- ✅ `AUTH_CREDENTIALS` без default values — startup fail если не задано
- ✅ API rate limiting: 200 req/min per session, 60 req/min per IP
- ✅ Session cache в Redis (TTL 60s) + batched `last_seen_at` (раз в 30s)
- ✅ Structured JSON logging (Pino с serializers, request_id, correlation)
- ✅ Graceful shutdown (SIGTERM → 10s drain → close Redis → close DB pool)
- ✅ Zod schema validation на **все 32 POST endpoints** (`parseBody()` + standardized error response)
- ✅ Login timing attack fix — bcrypt.compare() always called (dummy hash for wrong username)
- ✅ Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- ✅ Session cache invalidation on project switch
- ✅ Periodic loginAttempts cleanup (every 5 min)
- ✅ Session expiration cleanup (every 6h, 14-day threshold)
- ✅ CSRF cookie httpOnly=true (token via response body)
- ✅ Configurable trustProxy via TRUST_PROXY env var

**Оставшиеся gaps:**
- `hydrateSessionScope()` может вызываться дважды (onRequest + preValidation)

### Интеграции / Connectors (зрелость: 85% → **97%**)

**Было:** Инкрементальный sync, DLQ, reconciliation — но нет circuit breaker, нет alerting.

**Сделано (Iter 2 + 4 + 6 + 9):**
- ✅ Circuit breaker в `fetchWithRetry()` — per-host, 5 failures threshold, 30s reset
- ✅ Completeness alerting: при `completeness_pct < threshold` → audit event + SSE
- ✅ Strategic indexes: `connector_errors(project_id, error_kind, status)`, `crm_account_contacts(project_id, account_id)`
- ✅ Completeness diff report: delta per connector между sync-циклами (`GET /connectors/reconciliation/diff`)
- ✅ Auto identity dedup preview при sync cycle completion
- ✅ Dead letter error visibility: `GET /connectors/errors/dead-letter` + `POST .../retry`

**Оставшиеся gaps:**
- Нет pre-built Grafana dashboards для connector metrics

### Intelligence / RAG (зрелость: 65% → **90%**)

**Архитектура:** Custom hybrid RAG (vector search via pgvector + ILIKE keyword search). **Примечание:** внутреннее название "LightRAG" — это custom реализация, НЕ [HKUDS LightRAG](https://github.com/HKUDS/LightRAG). Наша система не строит knowledge graph.

**Было:** Рабочий vector search + ILIKE, но fullscan, нет кеша, нет quality score.

**Сделано (Iter 1 + 4 + 6):**
- ✅ Query cache: `lightrag:{projectId}:{hash(query,topK,sourceFilter)}`, TTL 300s
- ✅ Event-driven invalidation при embeddings_run и sync completion
- ✅ pg_trgm GIN indexes: `cw_messages(content)`, `linear_issues_raw(title)`, `attio_opportunities_raw(title)` — ILIKE → index scan
- ✅ Quality score proxy: `computeQualityScore()` — coverage (40%) + diversity (35%) + depth (25%) = 0-100
- ✅ Feedback endpoint: `POST /lightrag/feedback` — rating (-1/0/1) + comment, persisted в `lightrag_feedback`
- ✅ Evidence source filters: `sourceFilter: ["messages", "issues", "deals", "chunks"]` — conditional query execution

**Оставшиеся gaps:**
- Quality score — proxy metric без ground truth (calibratable через feedback data)
- Vector index tuning (IVFFlat probes / HNSW ef_search) только через env vars
- Нет knowledge graph (entity extraction, relationship mapping) — для AI agent use cases может потребоваться upgrade

### Dashboard / Portfolio (зрелость: 50% → **88%**)

**Было:** 18-20 SQL запросов на каждый load без кеширования.

**Сделано (Iter 1 + 4):**
- ✅ Portfolio overview cache: `portfolio:{accountScopeId}:{hash(projectIds)}`, TTL 90s
- ✅ Control Tower cache: `ct:{projectId}`, TTL 120s
- ✅ Event-driven invalidation при `job_completed`
- ✅ Materialized view `mv_portfolio_dashboard` — dashboard metrics pre-computed
- ✅ 10 LATERAL subqueries → matview read + batch JOINed subqueries
- ✅ REFRESH CONCURRENTLY после каждого sync cycle

**Оставшиеся gaps:**
- `computeClientValueScore()` в JS вместо SQL (low priority)

### Frontend (зрелость: 70% → **85%**)

**Было:** 3 `useMemo` для форматтеров, chart transforms не мемоизированы. 1s ticker, polling при SSE.

**Сделано (Iter 3):**
- ✅ 5 render functions → React.memo components + 9 chart data useMemo
- ✅ Ticker 1s → 5s (×5 fewer re-renders)
- ✅ Polling полностью отключён при SSE (было ×3 reduction)
- ✅ `next/dynamic` code splitting для `ControlTowerSectionPage`

**Оставшиеся gaps:**
- `use-project-portfolio.js`: 335 строк, 21 values в context (оценено: разделение неоправданно)

### Инфраструктура (зрелость: 40% → **92%**)

**Было:** Root user, открытые порты, нет backup, нет healthcheck, нет logging.

**Сделано (Iter 0 + 2 + 5):**
- ✅ Non-root Docker user (app:1001) в обоих Dockerfiles
- ✅ DB/Redis порты закрыты от хоста
- ✅ Resource limits для всех контейнеров (Redis 256m, DB 1g, Server/Worker/Web 512m)
- ✅ Healthchecks: server (wget /health), worker (pgrep), web (wget /)
- ✅ PostgreSQL backup script (`scripts/backup.sh`) с retention policy
- ✅ Structured JSON logging (Pino)
- ✅ 3 CI workflows (ci-quality, deploy-dev, deploy-prod)
- ✅ Full Prometheus exporter: DB pool, cache, SSE, circuit breaker states, process metrics
- ✅ 11 alerting rules (pool exhaustion, error rate, 5xx, CB open, cache, memory, restart)
- ✅ Backup verification script (`scripts/verify-backup.sh`)
- ✅ Monitoring stack: Prometheus + Loki + Promtail + Grafana (`docker-compose.monitoring.yml`)
- ✅ Incident response runbook (8 failure modes with diagnosis + resolution)
- ✅ Smoke tests in CI (`scripts/smoke-test.sh` + `smoke` job in ci-quality)

**Оставшиеся gaps:**
- Нет pre-built Grafana dashboards (datasources provisioned)

---

## 2) Сводка завершённых итераций

| Iter | Название | Статус | Задач | Ключевые результаты |
|------|----------|--------|-------|---------------------|
| 0 | Security Hardening | ✅ Done | 7/7 | Bcrypt, non-root Docker, closed ports, rate limiting, resource limits, healthchecks |
| 1 | Redis Caching Layer | ✅ Done | 8/8 | `lib/cache.js`, session/portfolio/lightrag/CT cache, event invalidation, metrics |
| 2 | Backend Reliability | ✅ Done | 5/6 | Circuit breaker, graceful shutdown, Pino logging, backup script, completeness alerting. Zod validation отложена |
| 3 | Frontend Performance | ✅ Done | 5/6 | React.memo + useMemo для charts, ticker 5s, SSE polling off, code splitting. Portfolio hook — оставлен as-is |
| 4 | Database Optimization | ✅ Done | 6/6 | pg_trgm + 6 GIN indexes, matview `mv_portfolio_dashboard`, 10 LATERAL → batch, strategic indexes, orphaned tables dropped, audit partitioning infra |
| 5 | Observability & Ops | ✅ Done | 6/6 | Full Prometheus exporter, 11 alert rules, backup verification, Prometheus+Loki+Grafana stack, incident runbook, CI smoke tests |
| 6 | Data Quality & LightRAG UX | ✅ Done | 5/5 | Quality score proxy, feedback endpoint, source filters, identity dedup preview, completeness diff |
| 7 | Input Validation & API Hardening | ✅ Done | 4/4 | Zod schemas for CRM/offers/outbound/auth/lightrag, `parseBody()` helper, standardized validation errors with details |
| 8 | Security Hardening II | ✅ Done | 7/7 | Timing attack fix, security headers, session cache invalidation, loginAttempts cleanup, session expiration, CSRF httpOnly, trustProxy |
| 9 | Extended Input Validation | ✅ Done | 5/5 | 18 new Zod schemas for all remaining POST endpoints, dead letter visibility endpoints, allProjectsFlag reusable preprocessor |

---

## 3) Оставшиеся итерации (Wave 2: Iter 10-13 — пересмотрено post Architecture Audit)

| Iter | Название | Задач | Приоритет | Фокус |
|------|----------|-------|-----------|-------|
| 10 | KAG Legacy Cleanup | 6 | **CRITICAL** | Удаление ~2,770 LOC мёртвого KAG кода, rename kag_event_log → connector_events, очистка scheduler/routes, удаление KAG таблиц |
| 11 | MCP Server + Telegram Integration | 5 | **HIGH** | MCP Server как API-обёртка, POST /lightrag/ingest endpoint, POST /notes + таблица, service account auth, MCP tool definitions |
| 12 | Frontend Resilience | 5 | MEDIUM | Error boundaries, retry logic, SSE reconnect, loading states |
| 13 | CI/CD Hardening | 4 | MEDIUM | .dockerignore, npm audit, pre-deploy backup, rollback strategy |

### Iter 10 — KAG Legacy Cleanup (CRITICAL)

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 10.1 | Удалить dead KAG modules | `server/src/services/kag.js`, `server/src/kag/` (6 files) | Удалить 2,602 LOC мёртвого кода. Оставить `kag/templates/` (used by recommendations-v2) |
| 10.2 | Rename kag_event_log → connector_events | migration 0021 | `ALTER TABLE kag_event_log RENAME TO connector_events`. Обновить все SQL-запросы в event-log.js, snapshots.js, similarity.js, forecasting.js |
| 10.3 | Удалить /kag/* API routes | `server/src/index.js` | Удалить ~118 LOC disabled routes + `isKagRoute()` helper + LIGHTRAG_ONLY preValidation gate |
| 10.4 | Очистить scheduler от KAG jobs | `server/src/services/scheduler.js` | Удалить kag_recommendations_refresh handler, job definitions, dependency chain. Оставить активные jobs (connectors, embeddings) |
| 10.5 | Удалить неиспользуемые KAG DB таблицы | migration 0021 | DROP TABLE kag_nodes, kag_edges, kag_events, kag_provenance_refs, kag_signal_state, kag_recommendations, kag_templates (if inlined). Оставить kag_signals, kag_scores, kag_risk_forecasts (used by recommendations-v2, forecasting) |
| 10.6 | Обновить KAG тесты и документацию | test files, docs | Удалить 7 KAG test files. Обновить lightrag-contract.md, spec 0018. Убрать "KAG" из всех активных доков |

### Iter 11 — MCP Server + Telegram Integration (HIGH)

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 11.1 | Service account authentication | `server/src/index.js`, `schemas.js` | Новый auth method: API key (header `X-API-Key`) для service accounts. Env `SERVICE_API_KEYS`. Scope assignment per key |
| 11.2 | POST /lightrag/ingest endpoint | `server/src/index.js`, `lightrag.js` | Принимает free text → создаёт chunks в rag_chunks → embedding_status='pending'. Zod schema. Audit event |
| 11.3 | POST /notes endpoint + таблица | migration 0022, `server/src/services/notes.js` (new) | Таблица `manager_notes(id, project_id, account_scope_id, content, source, created_by, created_at)`. CRUD endpoints |
| 11.4 | MCP Server component | `server/src/mcp/` (new directory) | MCP server wrapping REST API: tools query_knowledge, get_portfolio, get_project_status, add_note, ingest_text. stdio transport |
| 11.5 | MCP integration tests | `server/test/mcp.unit.test.js` | Tests for MCP tool definitions, service account auth, ingest + notes endpoints |

### Iter 12 — Frontend Resilience (MEDIUM)

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 12.1 | Error boundaries | `web/components/error-boundary.jsx` (new) | React Error Boundary wrapping dashboard sections. Fallback UI с retry |
| 12.2 | API retry с exponential backoff | `web/lib/api.js` | Retry на 5xx ошибки (max 3 attempts, backoff 1s/2s/4s). Не retry на 4xx |
| 12.3 | SSE auto-reconnect | `web/hooks/use-auto-refresh.js` | При SSE disconnect: exponential reconnect (1s/2s/4s/8s, max 30s). Visual indicator |
| 12.4 | Loading states consistency | `web/features/control-tower/section-page.jsx` | Skeleton loaders для всех dashboard sections. Consistent loading pattern |
| 12.5 | Offline detection | `web/hooks/use-online-status.js` (new) | navigator.onLine + fetch probe. Banner при offline. Queue actions for replay |

### Iter 13 — CI/CD Hardening (MEDIUM)

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 13.1 | .dockerignore | `server/.dockerignore`, `web/.dockerignore` | Exclude node_modules, test, docs, .git. Reduce image size |
| 13.2 | npm audit в CI | `.github/workflows/ci-quality.yml` | `npm audit --omit=dev` step. Fail on critical/high vulnerabilities |
| 13.3 | Pre-deploy backup | `.github/workflows/deploy-prod.yml` | Run backup.sh before deployment. Verify backup before proceeding |
| 13.4 | Rollback strategy | `scripts/rollback.sh` (new) | Docker tag pinning. Quick rollback to previous version. Health check after deploy |

### Later — TypeScript Migration Phase 1

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| L.1 | tsconfig.json с checkJs | `server/tsconfig.json`, `web/tsconfig.json` | `checkJs: true, allowJs: true, strict: false`. Постепенная type-safety без rename |
| L.2 | Type definitions для core modules | `server/src/types/` (new) | Типы для scope, session, api-contract, database rows. `.d.ts` files |
| L.3 | Новые файлы на TypeScript | convention | Все новые файлы (MCP server, notes service) пишутся на .ts |

---

## 4) Рекомендуемый порядок выполнения

```
✅ Iter 0 (security) ──────── DONE (7/7)
✅ Iter 1 (Redis cache) ───── DONE (8/8)
✅ Iter 2 (reliability) ───── DONE (5/6, zod → Iter 7)
✅ Iter 3 (frontend) ───────── DONE (5/6, portfolio hook → as-is)
✅ Iter 4 (DB optimization) ── DONE (6/6)
✅ Iter 5 (observability) ──── DONE (6/6)
✅ Iter 6 (quality & UX) ──── DONE (5/5)
✅ Iter 7 (validation) ─────── DONE (4/4)
✅ Iter 8 (security II) ────── DONE (7/7)
✅ Iter 9 (ext. validation) ── DONE (5/5)
⬜ Iter 10 (KAG cleanup) ───── 6 tasks — CRITICAL
⬜ Iter 11 (MCP + Telegram) ── 5 tasks — HIGH
⬜ Iter 12 (frontend res.) ─── 5 tasks — MEDIUM
⬜ Iter 13 (CI/CD) ──────────── 4 tasks — MEDIUM
⬜ Later (TypeScript Phase 1) ─ 3 tasks — LOW
```

**Итого:** 10 итераций завершены (58/60 задач). 4 итерации + 1 deferred (23 задачи). 2 задачи отложены by design (zod в Iter 2, portfolio hook в Iter 3).

---

## 5) Матрица зрелости

| Зона | До (Iter 0) | После (Iter 0-4) | После (Iter 0-9) | Target (Iter 13) |
|------|-------------|-------------------|-------------------|-------------------|
| Платформа | 80% | 92% | **99%** | 99% |
| Connectors | 85% | 95% | **97%** | 99% |
| Intelligence | 65% | 82% | **90%** | 95% |
| Dashboard | 50% | 88% | **88%** | 95% |
| Frontend | 70% | 85% | **85%** | 95% |
| Инфраструктура | 40% | 78% | **92%** | 98% |
| **Среднее** | **65%** | **87%** | **92%** | **97%** |

---

## 6) Архитектурные решения

### Наша "LightRAG" — custom hybrid RAG

Наша реализация (`server/src/services/lightrag.js`) — это **custom hybrid RAG**: pgvector vector search + ILIKE keyword search. Это **НЕ** [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) (knowledge graph + dual-level retrieval). Имя "LightRAG" — внутреннее.

**Для текущих use cases** (поиск по CRM/messages/issues) наша реализация достаточна.
**Для AI agent use cases** (Telegram бот с контекстным пониманием) может потребоваться upgrade до graph-based retrieval.

### KAG — deprecated, cleanup в Iter 10

KAG (custom Knowledge Augmented Graph) — отключён (`LIGHTRAG_ONLY=true`). ~2,770 LOC мёртвого кода подлежит удалению. Критическая зависимость: `kag_event_log` используется connector sync → rename в `connector_events`.

### JS → TS — инкрементальный подход

Полная миграция (131 файлов, 17.5K LOC) за 4-6 недель неоправданна на текущем этапе. Рекомендуется: `tsconfig.json` с `checkJs`, новые файлы на TypeScript, постепенная конвертация.

---

## 7) Явно вне scope

- ~~Интеграции и решения на `/kag/*` (legacy, paused).~~ → Удаляется в Iter 10.
- Black-box рекомендационные агенты без evidence.
- RBAC / multi-user auth (single-user auth + scope достаточен для MVP).
- Дорогие LLM-решения в критических операционных циклах.
- Полная TypeScript миграция (только инкрементальный подход).

---

## 8) Связанные документы

- Детальный анализ: [`docs/product-structure-analysis.md`](./product-structure-analysis.md)
- Iteration log: [`docs/iteration-log.md`](./iteration-log.md)
- Платформенные инварианты: [`docs/platform-architecture.md`](./platform-architecture.md)
- Redis/SSE архитектура: [`docs/redis-sse.md`](./redis-sse.md)
- LightRAG контракт: [`docs/lightrag-contract.md`](./lightrag-contract.md)
- LightRAG-only spec: [`docs/specs/0018-lightrag-only-mode.md`](./specs/0018-lightrag-only-mode.md)
