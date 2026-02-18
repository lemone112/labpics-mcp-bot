# Статус продукта и roadmap (Production-Ready Plan)

> Обновлено: 2026-02-18 (post Iter 0-2, recalibrated на основе верификации кодовой базы)
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

### Интеграции / Connectors (зрелость: 85% → 92%)

**Было:** Инкрементальный sync, DLQ, reconciliation — но нет circuit breaker, нет alerting.

**Сделано (Iter 2):**
- ✅ Circuit breaker в `fetchWithRetry()` — per-host, 5 failures threshold, 30s reset
- ✅ Completeness alerting: при `completeness_pct < threshold` → audit event + SSE

**Оставшиеся gaps:**
- Circuit breaker states не экспортируются в `/metrics` (функция `getCircuitBreakerStates()` есть, но не вызывается)
- Нет pg_trgm индексов для ILIKE search в connectors

### Intelligence / LightRAG (зрелость: 65% → 75%)

**Было:** Рабочий vector search + ILIKE, но fullscan, нет кеша, нет quality score.

**Сделано (Iter 1):**
- ✅ LightRAG query cache: `lightrag:{projectId}:{hash(query,topK)}`, TTL 300s
- ✅ Event-driven invalidation при embeddings_run и sync completion

**Оставшиеся gaps:**
- ILIKE fullscan без pg_trgm index (4 параллельных полнотабличных скана)
- Нет quality score / feedback loop
- Нет фильтрации по типу источника

### Dashboard / Portfolio (зрелость: 50% → 70%)

**Было:** 18-20 SQL запросов на каждый load без кеширования.

**Сделано (Iter 1):**
- ✅ Portfolio overview cache: `portfolio:{accountScopeId}:{hash(projectIds)}`, TTL 90s
- ✅ Control Tower cache: `ct:{projectId}`, TTL 120s
- ✅ Event-driven invalidation при `job_completed`

**Оставшиеся gaps:**
- 11 LATERAL subqueries по-прежнему при cache miss (cold path: 800-1500ms)
- Нет materialized view для агрегатов
- `computeClientValueScore()` в JS вместо SQL

### Frontend (зрелость: 70% — без изменений)

**Текущее состояние:** Next.js 16 + React 19 + shadcn/ui. 3 `useMemo` вызова (форматтеры), но chart transforms НЕ мемоизированы.

**Верифицированные проблемы:**
- Chart data transforms (`.map()`) в render path без `useMemo`
- 1-секундный ticker в `useAutoRefresh` → continuous re-renders
- Polling при SSE: снижен (×3), но не отключён
- Нет code splitting (`next/dynamic` не используется в control-tower)
- `use-project-portfolio.js`: 335 строк, 21 value в context

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

---

## 3) Оставшиеся итерации (рекалиброваны)

### Iter 3 — Frontend Performance

> Lighthouse Performance > 85. Нет jank при навигации.

**Приоритет: HIGH** — единственная зона без улучшений.

| # | Задача | Файлы | Acceptance criteria | Статус |
|---|--------|-------|---------------------|--------|
| 3.1 | Memoize chart transforms | `section-page.jsx` | Все chart data `.map()` обёрнуты в `useMemo()` (сейчас 3 useMemo для форматтеров, transforms не мемоизированы) | Pending |
| 3.2 | Extract chart card → `React.memo` | `section-page.jsx` | `<DashboardChartCard />` — отдельный компонент в `memo()` | Pending |
| 3.3 | Ticker interval 1s → 5s | `use-auto-refresh.js` | `secondsAgo` обновляется раз в 5s. State updates ×5 меньше | Pending |
| 3.4 | Disable polling при SSE | `use-auto-refresh.js` | При `sseConnected === true` → polling полностью отключён (сейчас `intervalMs * 3`) | Pending |
| 3.5 | Code splitting | `[section]/page.jsx` | `next/dynamic` для `section-page.jsx`. Bundle < 200KB JS | Pending |
| 3.6 | Refactor portfolio hook | `use-project-portfolio.js` | 335 строк → 3 хука по <80 строк. 21 context value → 3 focused contexts | Pending |

**Зависимости:** нет
**Effort:** Medium

---

### Iter 4 — Database Optimization

> Portfolio overview < 200ms (cold, 10 проектов). LightRAG ILIKE → index scan.

**Приоритет: HIGH** — cold path по-прежнему 800-1500ms.

| # | Задача | Файлы | Acceptance criteria | Статус |
|---|--------|-------|---------------------|--------|
| 4.1 | pg_trgm для ILIKE search | Новая миграция | `CREATE EXTENSION pg_trgm`. GIN indexes на `cw_messages(body)`, `linear_issues_raw(title)`, `attio_opportunities_raw(name)` | Pending |
| 4.2 | Materialized view portfolio | Новая миграция | `mv_portfolio_dashboard` с REFRESH CONCURRENTLY при sync completion | Pending |
| 4.3 | LATERAL → batch queries | `portfolio.js` | Заменить 11 LATERAL subqueries на 4-5 batch запросов с `WHERE project_id = ANY($1)` | Pending |
| 4.4 | Strategic indexes | Новая миграция | Indexes на `connector_errors(project_id, status, error_kind)`, `crm_account_contacts(project_id, account_id)` | Pending |
| 4.5 | Cleanup orphaned tables | Новая миграция | Drop `app_users`, `signup_requests` (после верификации) | Pending |
| 4.6 | Partitioning audit_events | Новая миграция | Range partition по `created_at` (monthly). Auto-create future. Drop > 6 months | Pending |

**Примечание:** 18 миграций и ~120 indexes уже существуют (включая production migration 0017). Задачи 4.1 и 4.4 — дополнительные к существующим.

**Зависимости:** Iter 1 (для A/B сравнения with/without cache)
**Effort:** High

---

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
                                │
    Iter 3 (frontend) ─────────┤  ← NEXT (HIGH priority, единственная нетронутая зона)
                                │
    Iter 4 (DB optimization) ──┤  ← HIGH priority (cold path ещё 800-1500ms)
                                │
    Iter 5 (observability) ────┤  ← MEDIUM (operations readiness)
                                │
    Iter 6 (quality & UX) ────┤  ← LOW (feature enhancement)
                                │
    Iter 7 (validation) ──────┘  ← LOW (tech debt)
```

**Итого:** 3 итерации завершены (20/21 задач). Осталось 4 итерации (26 задач).

---

## 5) Матрица зрелости

| Зона | До (Iter 0) | После (Iter 0-2) | Target (все итерации) |
|------|-------------|-------------------|----------------------|
| Платформа | 80% | **92%** | 98% |
| Connectors | 85% | **92%** | 97% |
| Intelligence | 65% | **75%** | 92% |
| Dashboard | 50% | **70%** | 90% |
| Frontend | 70% | **70%** | 90% |
| Инфраструктура | 40% | **78%** | 95% |
| **Среднее** | **65%** | **80%** | **94%** |

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
