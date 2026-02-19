# Статус продукта и roadmap (Production-Ready Plan)

> Обновлено: 2026-02-19 (post Iter 0-12 + Design Audit. Source of truth: [GitHub Issues](https://github.com/lemone112/labpics-dashboard/milestones))
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

### Intelligence / RAG (зрелость: 65% → **90%** → target **98%** после миграции)

**Текущая архитектура (custom hybrid RAG):** pgvector vector search + ILIKE keyword search. Нет knowledge graph. Имя "LightRAG" — внутреннее, это НЕ HKUDS LightRAG.

**Целевая архитектура (Iter 11):** Миграция на [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) из форка [`lemone112/lightrag`](https://github.com/lemone112/lightrag). Knowledge graph + dual-level retrieval + pgvector. PostgreSQL backend (PGKVStorage + PGVectorStorage + PGGraphStorage). REST API сервер + MCP для Telegram бота.

**Сделано (Iter 1 + 4 + 6):**
- ✅ Query cache: TTL 300s с event-driven invalidation
- ✅ pg_trgm GIN indexes: ILIKE → index scan
- ✅ Quality score proxy + feedback endpoint
- ✅ Evidence source filters

**Планируется (Iter 11 — HKUDS LightRAG migration):**
- ⬜ Deploy LightRAG Server (Python) рядом с нашим Fastify backend
- ⬜ Настроить PostgreSQL storage backend (shared DB)
- ⬜ Data ingestion pipeline: connector data → LightRAG documents
- ⬜ MCP server ([daniel-lightrag-mcp](https://github.com/desimpkins/daniel-lightrag-mcp)) для Telegram бота
- ⬜ Заменить custom lightrag.js на proxy к LightRAG Server API

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
| 10 | KAG Cleanup + DB Hygiene | ✅ Done | 9/9 | Removed 2,770 LOC KAG code, routes, scheduler jobs, DB tables. kag_event_log → connector_events |
| 12 | Backend Security & Reliability | ✅ Done | 10/10 | Session hardening, CORS tightening, Helmet headers, rate limit tuning, Zod strictness |

---

## 3) Оставшиеся итерации (Wave 2: Iter 11–16)

> Детальные задачи и статус: [GitHub Milestones](https://github.com/lemone112/labpics-dashboard/milestones)
> Архитектурный план: [`docs/iteration-plan-wave2.md`](./iteration-plan-wave2.md)

| Iter | Название | Issues | Приоритет | Фокус |
|------|----------|--------|-----------|-------|
| 11 | HKUDS LightRAG Integration | [#46–#55](https://github.com/lemone112/labpics-dashboard/milestone/1) | **CRITICAL** | HKUDS LightRAG + MCP + Telegram bot |
| 13 | Frontend Resilience & Auth | [#56–#66](https://github.com/lemone112/labpics-dashboard/milestone/2) | **HIGH** | Error boundaries, auth flow, SSE reconnect |
| 14 | Design System & Accessibility | [#67–#76, #103–#108](https://github.com/lemone112/labpics-dashboard/milestone/3) | MEDIUM | Компоненты, анимации, a11y |
| 15 | TypeScript, CI/CD & Infrastructure | [#77–#90](https://github.com/lemone112/labpics-dashboard/milestone/4) | MEDIUM | TS migration, Pino logging, Biome |
| 16 | QA & Release Readiness | [#91–#102, #117–#119](https://github.com/lemone112/labpics-dashboard/milestone/5) | HIGH | E2E tests, dead-code cleanup, polish |

### Iter 11 — HKUDS LightRAG Integration (CRITICAL)

Миграция с custom hybrid RAG на [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) из форка [`lemone112/lightrag`](https://github.com/lemone112/lightrag). Knowledge graph + dual-level retrieval + PostgreSQL backend + MCP для Telegram бота.

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  Telegram Bot   │────▶│ daniel-lightrag-mcp  │────▶│  LightRAG    │
│  (LLM + MCP)   │     │ (22 tools, MCP)      │     │  Server      │
└─────────────────┘     └─────────────────────┘     │  (Python)    │
                                                     └──────┬───────┘
┌─────────────────┐     ┌─────────────────────┐            │
│  Labpics Web    │────▶│  Fastify API         │────▶ LightRAG REST API
│  (Next.js)      │     │  (proxy endpoints)   │            │
└─────────────────┘     └─────────────────────┘     ┌──────▼───────┐
                                                     │  PostgreSQL  │
                        ┌─────────────────────┐     │  pgvector    │
                        │  Connector Sync      │────▶│  PGGraph     │
                        │  (worker)            │     │  (shared DB) │
                        └─────────────────────┘     └──────────────┘
```

**Критерии завершения:** LightRAG Server запущен, connector data в knowledge graph, `/lightrag/query` возвращает graph entities, Telegram бот работает через MCP, frontend без изменений (proxy)

---

## 4) Рекомендуемый порядок выполнения

```
✅ Iter 0  (security) ──────── DONE (7/7)
✅ Iter 1  (Redis cache) ───── DONE (8/8)
✅ Iter 2  (reliability) ───── DONE (5/6, zod → Iter 7)
✅ Iter 3  (frontend) ───────── DONE (5/6, portfolio hook → as-is)
✅ Iter 4  (DB optimization) ── DONE (6/6)
✅ Iter 5  (observability) ──── DONE (6/6)
✅ Iter 6  (quality & UX) ──── DONE (5/5)
✅ Iter 7  (validation) ─────── DONE (4/4)
✅ Iter 8  (security II) ────── DONE (7/7)
✅ Iter 9  (ext. validation) ── DONE (5/5)
✅ Iter 10 (KAG cleanup) ────── DONE (9/9)
⬜ Iter 11 (LightRAG + MCP) ── 10 tasks — CRITICAL ★
✅ Iter 12 (backend security) ─ DONE (10/10)
⬜ Iter 13 (frontend + auth) ── 13 tasks — HIGH
⬜ Iter 14 (design system) ──── 16 tasks — MEDIUM
⬜ Iter 15 (TS, CI/CD) ──────── 14 tasks — MEDIUM
⬜ Iter 16 (QA & release) ───── 15 tasks — HIGH
```

**Итого:** 12 итераций завершены (77/79 задач). 5 итераций открыто (68 задач, из них 5 уже закрыты). Iter 11 — ключевая: HKUDS LightRAG + MCP.

---

## 5) Матрица зрелости

| Зона | До (Iter 0) | После (Iter 0-9) | После (Iter 10-12) | Target (Iter 16) |
|------|-------------|-------------------|---------------------|-------------------|
| Платформа | 80% | **99%** | **99%** | 99% |
| Connectors | 85% | **97%** | **97%** | 99% |
| Intelligence | 65% | **90%** | **90%** | 98% |
| Dashboard | 50% | **88%** | **88%** | 96% |
| Frontend | 70% | **85%** | **85%** | 96% |
| Инфраструктура | 40% | **92%** | **92%** | 98% |
| **Среднее** | **65%** | **92%** | **92%** | **97%+** |

---

## 6) Архитектурные решения

### Custom RAG → HKUDS LightRAG (Iter 11)

**Текущее:** Custom hybrid RAG (`lightrag.js`) — pgvector + ILIKE. Нет knowledge graph. Костыльная реализация.

**Целевое:** [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) из форка [`lemone112/lightrag`](https://github.com/lemone112/lightrag):
- Knowledge graph с entity extraction и relationship mapping (LLM-based)
- Dual-level retrieval: low-level entities + high-level themes
- PostgreSQL backend (PGKVStorage + PGVectorStorage + PGGraphStorage) — shared DB с нашими таблицами
- REST API сервер с Ollama-compatible interface
- Готовые MCP серверы: [daniel-lightrag-mcp](https://github.com/desimpkins/daniel-lightrag-mcp) (22 tools)

**Миграция**: Iter 10 (cleanup) → Iter 11 (deploy LightRAG + proxy + MCP). Frontend без изменений (proxy-совместимость).

### KAG — полностью удалён (Iter 10)

KAG (custom Knowledge Augmented Graph) — удалён в Iter 10. 2,770 LOC кода, routes, scheduler jobs, DB-таблицы. `kag_event_log` переименован в `connector_events`.

### Telegram Bot Architecture

```
Telegram Bot (LLM) → daniel-lightrag-mcp (22 tools) → LightRAG Server → PostgreSQL
```

Бот получает доступ к knowledge graph через MCP: query, document management, graph operations. Данные из connectors (Chatwoot, Linear, Attio) автоматически попадают в LightRAG через ingestion pipeline.

### JS → TS — инкрементальный подход

Полная миграция (131 файлов, 17.5K LOC) неоправданна. `tsconfig.json` с `checkJs`, новые файлы на TypeScript, постепенная конвертация.

---

## 7) Явно вне scope

- KAG pipeline (удалён в Iter 10).
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
- Бэклог: [`docs/backlog.md`](./backlog.md)
