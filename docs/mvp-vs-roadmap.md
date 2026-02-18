# Статус продукта и roadmap (Production-Ready Plan)

> Обновлено: 2026-02-18 (post Iter 0-4)
> Детальный анализ: [`docs/product-structure-analysis.md`](./product-structure-analysis.md)

---

## 1) Текущее состояние — что сделано

### Платформа (зрелость: 80% → 92%)

**Было:** Session auth + CSRF, plaintext пароли, нет rate limiting, session UPDATE на каждый запрос.

**Сделано (Iter 0 + 1 + 2):**
- ✅ Bcrypt password hashing с автодетектом формата (`isBcryptHash()`)
- ✅ `AUTH_CREDENTIALS` без default values — startup fail если не задано
- ✅ API rate limiting: 200 req/min per session, 60 req/min per IP
- ✅ Session cache в Redis (TTL 60s) + batched `last_seen_at` (раз в 30s)
- ✅ Structured JSON logging (Pino с serializers, request_id, correlation)
- ✅ Graceful shutdown (SIGTERM → 10s drain → close Redis → close DB pool)

**Оставшиеся gaps:**
- Нет Zod/schema validation на POST endpoints (ручная проверка body)
- `hydrateSessionScope()` может вызываться дважды (onRequest + preValidation)

### Интеграции / Connectors (зрелость: 85% → **95%**)

**Было:** Инкрементальный sync, DLQ, reconciliation — но нет circuit breaker, нет alerting.

**Сделано (Iter 2 + 4):**
- ✅ Circuit breaker в `fetchWithRetry()` — per-host, 5 failures threshold, 30s reset
- ✅ Completeness alerting: при `completeness_pct < threshold` → audit event + SSE
- ✅ Strategic indexes: `connector_errors(project_id, error_kind, status)`, `crm_account_contacts(project_id, account_id)`

**Оставшиеся gaps:**
- Circuit breaker states не экспортируются в `/metrics` (функция `getCircuitBreakerStates()` есть, но не вызывается)

### Intelligence / LightRAG (зрелость: 65% → **82%**)

**Было:** Рабочий vector search + ILIKE, но fullscan, нет кеша, нет quality score.

**Сделано (Iter 1 + 4):**
- ✅ LightRAG query cache: `lightrag:{projectId}:{hash(query,topK)}`, TTL 300s
- ✅ Event-driven invalidation при embeddings_run и sync completion
- ✅ pg_trgm GIN indexes: `cw_messages(content)`, `linear_issues_raw(title)`, `attio_opportunities_raw(title)` — ILIKE → index scan

**Оставшиеся gaps:**
- Нет quality score / feedback loop
- Нет фильтрации по типу источника

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

### Инфраструктура (зрелость: 40% → 78%)

**Было:** Root user, открытые порты, нет backup, нет healthcheck, нет logging.

**Сделано (Iter 0 + 2):**
- ✅ Non-root Docker user (app:1001) в обоих Dockerfiles
- ✅ DB/Redis порты закрыты от хоста
- ✅ Resource limits для всех контейнеров (Redis 256m, DB 1g, Server/Worker/Web 512m)
- ✅ Healthchecks: server (wget /health), worker (pgrep), web (wget /)
- ✅ PostgreSQL backup script (`scripts/backup.sh`) с retention policy
- ✅ Structured JSON logging (Pino)
- ✅ 3 CI workflows (ci-quality, deploy-dev, deploy-prod)

**Оставшиеся gaps:**
- Circuit breaker states не в `/metrics`
- Нет alert rules (Prometheus/Alertmanager)
- Нет backup verification (restore test)
- Нет log aggregation (Loki/Grafana)
- Нет runbooks

---

## 2) Сводка завершённых итераций

| Iter | Название | Статус | Задач | Ключевые результаты |
|------|----------|--------|-------|---------------------|
| 0 | Security Hardening | ✅ Done | 7/7 | Bcrypt, non-root Docker, closed ports, rate limiting, resource limits, healthchecks |
| 1 | Redis Caching Layer | ✅ Done | 8/8 | `lib/cache.js`, session/portfolio/lightrag/CT cache, event invalidation, metrics |
| 2 | Backend Reliability | ✅ Done | 5/6 | Circuit breaker, graceful shutdown, Pino logging, backup script, completeness alerting. Zod validation отложена |
| 3 | Frontend Performance | ✅ Done | 5/6 | React.memo + useMemo для charts, ticker 5s, SSE polling off, code splitting. Portfolio hook — оставлен as-is |
| 4 | Database Optimization | ✅ Done | 6/6 | pg_trgm + 6 GIN indexes, matview `mv_portfolio_dashboard`, 10 LATERAL → batch, strategic indexes, orphaned tables dropped, audit partitioning infra |

---

## 3) Оставшиеся итерации

### Iter 5 — Observability & Ops

> MTTD < 5 минут для критических инцидентов.

**Приоритет: MEDIUM** — CI уже есть, метрики частично есть. Не блокирует production, но critical для operations.

| # | Задача | Файлы | Acceptance criteria | Статус |
|---|--------|-------|---------------------|--------|
| 5.1 | Circuit breaker states в /metrics | `index.js` | Вызвать `getCircuitBreakerStates()` в metrics handler. Экспорт: host, state, failures, lastFailureAt | Pending |
| 5.2 | Extended Prometheus metrics | `index.js` | `db_pool_total/idle/waiting`, `sse_connections_total`, `connector_last_success_at`, `lightrag_query_duration_seconds` | Pending |
| 5.3 | Alert rules | `infra/alerts/rules.yml` (новый) | connector_lag > 30min, error_rate > 5%, pool_usage > 80%, cache_hit_ratio < 50% | Pending |
| 5.4 | Backup verification | `scripts/verify-backup.sh` (новый) | Weekly: restore → verify table counts → cleanup. Exit 1 при failure | Pending |
| 5.5 | Log aggregation | `docker-compose.yml` | Loki/Grafana sidecar или managed solution | Pending |
| 5.6 | Runbooks | `docs/runbooks/` | Redis failure, DB pool exhaustion, connector timeout, OOM, disk full | Pending |

**Зависимости:** Iter 0, 2 (logging, health) — выполнены
**Effort:** Medium

---

### Iter 6 — Data Quality & LightRAG UX

> LightRAG feedback собирается. Quality trend наблюдаем.

**Приоритет: LOW** — улучшение UX, не блокирует работоспособность.

| # | Задача | Файлы | Acceptance criteria | Статус |
|---|--------|-------|---------------------|--------|
| 6.1 | Quality score proxy | `lightrag.js` | `quality_score` в response: f(evidence_count, source_diversity). Range 0-100 | Pending |
| 6.2 | Feedback endpoint | `index.js`, новая миграция | `POST /lightrag/feedback` — `{ query_run_id, rating, comment? }` | Pending |
| 6.3 | Evidence source filters | `lightrag.js` | Параметр `sourceFilter: ["messages", "issues", "deals"]` | Pending |
| 6.4 | Auto-dedup preview | `identity-graph.js` | При sync completion → identity suggestions preview в SSE | Pending |
| 6.5 | Completeness diff report | `reconciliation.js` | Delta между sync-циклами в audit_events | Pending |

**Зависимости:** Iter 1 (cache), Iter 4 (indexes)
**Effort:** Medium

---

### Iter 7 — Input Validation & API Hardening (новая)

> Все POST endpoints защищены schema validation. Нет unhandled edge cases.

**Приоритет: LOW** — текущая ручная валидация работает, но не масштабируется.

| # | Задача | Файлы | Acceptance criteria | Статус |
|---|--------|-------|---------------------|--------|
| 7.1 | Zod schemas для CRM endpoints | `index.js` | `/crm/accounts`, `/crm/opportunities` — Zod validation, 400 при invalid | Pending |
| 7.2 | Zod schemas для offers/outbound | `index.js` | `/offers`, `/outbound/draft` — Zod validation | Pending |
| 7.3 | Zod schemas для auth/admin | `index.js` | `/auth/login`, `/admin/*` — Zod validation | Pending |
| 7.4 | Error response standardization | `index.js` | Единый формат ошибок: `{ error: string, details?: ZodError[] }` | Pending |

**Зависимости:** нет
**Effort:** Low

---

## 4) Рекомендуемый порядок выполнения

```
✅ Iter 0 (security) ──────── DONE
✅ Iter 1 (Redis cache) ───── DONE
✅ Iter 2 (reliability) ───── DONE (5/6, zod → Iter 7)
✅ Iter 3 (frontend) ───────── DONE (5/6, portfolio hook → as-is)
✅ Iter 4 (DB optimization) ── DONE (6/6)
                                │
    Iter 5 (observability) ────┤  ← NEXT (MEDIUM, operations readiness)
                                │
    Iter 6 (quality & UX) ────┤  ← LOW (feature enhancement)
                                │
    Iter 7 (validation) ──────┘  ← LOW (tech debt)
```

**Итого:** 5 итераций завершены (31/33 задач). Осталось 3 итерации (15 задач).

---

## 5) Матрица зрелости

| Зона | До (Iter 0) | После (Iter 0-2) | После (Iter 0-4) | Target |
|------|-------------|-------------------|-------------------|--------|
| Платформа | 80% | 92% | **92%** | 98% |
| Connectors | 85% | 92% | **95%** | 97% |
| Intelligence | 65% | 75% | **82%** | 92% |
| Dashboard | 50% | 70% | **88%** | 90% |
| Frontend | 70% | 70% | **85%** | 90% |
| Инфраструктура | 40% | 78% | **78%** | 95% |
| **Среднее** | **65%** | **80%** | **87%** | **94%** |

---

## 6) Явно вне scope

- Интеграции и решения на `/kag/*` (legacy, paused).
- Black-box рекомендационные агенты без evidence.
- RBAC / multi-user auth (single-user auth + scope достаточен для MVP).
- Дорогие LLM-решения в критических операционных циклах.

---

## 7) Связанные документы

- Детальный анализ: [`docs/product-structure-analysis.md`](./product-structure-analysis.md)
- Iteration log: [`docs/iteration-log.md`](./iteration-log.md)
- Платформенные инварианты: [`docs/platform-architecture.md`](./platform-architecture.md)
- Redis/SSE архитектура: [`docs/redis-sse.md`](./redis-sse.md)
