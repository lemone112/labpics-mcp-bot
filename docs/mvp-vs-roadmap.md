# Статус продукта и roadmap (Production-Ready Plan)

> Обновлено: 2026-02-18 (на основе 3-циклового deep analysis)
> Детальный анализ: [`docs/product-structure-analysis.md`](./product-structure-analysis.md)

---

## 1) Что уже в MVP

### Платформа (зрелость: 80%)
- Session auth + CSRF + request_id.
- Жёсткий project/account scope.
- Scheduler/worker и audit trail.
- **Известные gaps:** plaintext credentials, нет API rate limiting, session UPDATE на каждый запрос.

### Интеграции (зрелость: 85%)
- Инкрементальный sync Chatwoot/Linear/Attio.
- Retry/DLQ через `connector_errors`.
- Reconciliation метрики полноты.
- **Известные gaps:** нет circuit breaker, нет alerting на completeness drop.

### Intelligence (зрелость: 65%)
- LightRAG query API (`/lightrag/query`).
- Vector retrieval + source evidence в одном ответе.
- Query observability (`lightrag_query_runs`).
- **Известные gaps:** fullscan ILIKE, нет кеширования, нет quality score.

### Frontend (зрелость: 70%)
- Control Tower (6 sections) + единая shadcn дизайн-система.
- Mobile: project sheet + bottom tabbar.
- Search страница переведена на LightRAG.
- **Известные gaps:** 11 transforms без useMemo, 1s ticker, нет code splitting.

### Инфраструктура (зрелость: 40%)
- Docker Compose + GitHub Actions CI.
- Redis Pub/Sub + SSE для real-time.
- **Известные gaps:** root user в Docker, открытые DB порты, нет backup, нет healthcheck.

---

## 2) Production-Ready Iteration Plan

### Iter 0 — Security Hardening (GATE для production)

> Без этой итерации деплой в production невозможен.

| # | Задача | Файлы | Acceptance criteria |
|---|--------|-------|---------------------|
| 0.1 | Убрать default credentials | `docker-compose.yml` | `AUTH_CREDENTIALS` и `AUTH_PASSWORD` без default values. Startup fail если не заданы |
| 0.2 | Bcrypt hashing для паролей | `server/src/index.js`, `server/package.json` | Login verify через `bcrypt.compare()`. Plaintext пароли не хранятся |
| 0.3 | Non-root Docker user | `server/Dockerfile`, `web/Dockerfile` | `USER node` (или кастомный). `docker exec whoami` != root |
| 0.4 | Закрыть DB/Redis порты | `docker-compose.yml` | Удалить `ports:` у db и redis. Доступ только из internal network |
| 0.5 | API rate limiting | `server/src/index.js` | 100 req/min per session для GET, 30 req/min per IP для POST. 429 при превышении |
| 0.6 | Resource limits | `docker-compose.yml` | `deploy.resources.limits` для каждого сервиса. OOM-kill при превышении |
| 0.7 | Container healthchecks | `docker-compose.yml` | `healthcheck` для server (curl /health) и worker (process check) |

**Зависимости:** нет
**Параллелизм:** gate — мержить первым

---

### Iter 1 — Redis Caching Layer

> p95 `/portfolio/overview` с 800-1500ms до <50ms. Снижение DB load на 70-95%.

| # | Задача | Файлы | Acceptance criteria |
|---|--------|-------|---------------------|
| 1.1 | Создать cache-модуль | `server/src/lib/cache.js` (новый) | `get(key)`, `set(key, value, ttl)`, `del(key)`, `invalidateByPrefix(prefix)`, `getStats()`. Graceful degradation при недоступности Redis |
| 1.2 | Третье Redis-соединение для cache | `server/src/lib/redis.js` | `createRedisCacheClient()` — отдельное от pub/sub. Fallback → null |
| 1.3 | Session cache | `server/src/index.js:498-507` | Session data кешируется на 60s. `last_seen_at` обновляется батчем раз в 30s. DB queries на session: 0 при cache hit |
| 1.4 | Portfolio overview cache | `server/src/services/portfolio.js:67` | Cache key: `portfolio:{accountScopeId}:{hash(projectIds)}`. TTL 90s. Invalidation при `job_completed` |
| 1.5 | LightRAG query cache | `server/src/services/lightrag.js:147` | Cache key: `lightrag:{projectId}:{hash(query,topK)}`. TTL 300s. Observability: `cached: true` в `lightrag_query_runs` |
| 1.6 | Control Tower cache | `server/src/services/intelligence.js:573` | Cache key: `ct:{projectId}`. TTL 120s |
| 1.7 | Event-driven invalidation | `server/src/index.js:356` | `job_completed` → invalidate `portfolio:*`, `ct:{projectId}`, `lightrag:{projectId}:*` по job_type |
| 1.8 | Cache metrics | `server/src/index.js` `/metrics` | `cache_hits_total`, `cache_misses_total`, `cache_sets_total`, `cache_invalidations_total` в Prometheus-формате |

**Зависимости:** Redis running (уже есть)
**Параллелизм:** можно с Iter 2, 3
**Memory budget:** ~4-5MB из 128MB доступных

---

### Iter 2 — Backend Reliability

> Внешние API падения не каскадируются. Graceful restart без потери запросов.

| # | Задача | Файлы | Acceptance criteria |
|---|--------|-------|---------------------|
| 2.1 | Circuit breaker для HTTP calls | `server/src/lib/http.js` | State machine: closed → open (при 5 failures / 60s) → half-open (probe через 30s). При open state — instant fail без HTTP call |
| 2.2 | Graceful shutdown | `server/src/index.js`, `worker-loop.js` | SIGTERM handler: drain in-flight requests (10s) → close SSE → close Redis → close DB pool → exit 0 |
| 2.3 | Structured JSON logging | `server/src/index.js` | Pino logger: JSON формат, `request_id` в каждой строке, `level`/`msg`/`time`/`pid`. Configurable через `LOG_LEVEL` |
| 2.4 | Input validation (POST endpoints) | `server/src/index.js` | Zod schemas для: `/crm/accounts`, `/crm/opportunities`, `/offers`, `/outbound/draft`. 400 при invalid body |
| 2.5 | PostgreSQL backup | `scripts/backup.sh` (новый), `docker-compose.yml` | `pg_dump` cron (daily). Retention: 7 дней. Script: backup + upload + cleanup |
| 2.6 | Completeness alerting | `server/src/services/reconciliation.js` | При `completeness_pct < CONNECTOR_RECONCILIATION_MIN_COMPLETENESS_PCT` → audit event `completeness_drop` + SSE alert |

**Зависимости:** Iter 0 (security)
**Параллелизм:** можно с Iter 1, 3

---

### Iter 3 — Frontend Performance

> Lighthouse Performance > 85. Нет jank при навигации.

| # | Задача | Файлы | Acceptance criteria |
|---|--------|-------|---------------------|
| 3.1 | Memoize chart transforms | `web/features/control-tower/section-page.jsx:246-440` | Все 11 `.map()` обёрнуты в `useMemo()` с корректными dependencies |
| 3.2 | Extract chart card component | `web/features/control-tower/section-page.jsx` | `<DashboardChartCard />` — отдельный компонент, обёрнут в `React.memo()` |
| 3.3 | Fix ticker interval | `web/hooks/use-auto-refresh.js:57-62` | `secondsAgo` обновляется раз в 5s (не 1s). State updates сокращены в 5x |
| 3.4 | Disable polling при SSE | `web/hooks/use-auto-refresh.js` | При `sseConnected === true` polling полностью отключён (не `intervalMs * 3`) |
| 3.5 | Code splitting | `web/app/control-tower/[section]/page.jsx` | `next/dynamic` для section-page.jsx. Bundle size основной страницы < 200KB JS |
| 3.6 | Refactor project-portfolio hook | `web/hooks/use-project-portfolio.js` | Разделить на 3 хука: `useProjectSelection`, `useProjectRefresh`, `useProjectState`. Каждый < 80 строк |

**Зависимости:** нет
**Параллелизм:** можно с Iter 1, 2

---

### Iter 4 — Database Optimization

> Portfolio overview < 200ms при 10 проектах (cold). LightRAG ILIKE использует index.

| # | Задача | Файлы | Acceptance criteria |
|---|--------|-------|---------------------|
| 4.1 | Strategic indexes | `server/db/migrations/0019_strategic_indexes.sql` | Indexes на: `crm_account_contacts(project_id, account_id)`, `crm_opportunity_stage_events(opportunity_id)`, `connector_errors(project_id, status, error_kind)`, `(account_scope_id, created_at)` на 5+ таблиц |
| 4.2 | pg_trgm для ILIKE search | `server/db/migrations/0020_trgm_indexes.sql` | `CREATE EXTENSION IF NOT EXISTS pg_trgm`. GIN indexes: `cw_messages(body gin_trgm_ops)`, `linear_issues_raw(title gin_trgm_ops)`, `attio_opportunities_raw(name gin_trgm_ops)` |
| 4.3 | Materialized view для portfolio | `server/db/migrations/0021_mv_portfolio.sql` | `mv_portfolio_dashboard` с REFRESH CONCURRENTLY. Refresh при `connectors_sync_cycle` completion |
| 4.4 | Оптимизация LATERAL → batch | `server/src/services/portfolio.js:113-177` | Заменить 11 LATERAL subqueries на 4-5 отдельных batch-запросов с `WHERE project_id = ANY($1)`. Hash join вместо nested loop |
| 4.5 | Cleanup orphaned tables | `server/db/migrations/0022_cleanup.sql` | `DROP TABLE IF EXISTS app_users, signup_requests` (после верификации что не используются) |
| 4.6 | Partitioning audit_events | `server/db/migrations/0023_partitioning.sql` | Range partition по `created_at` (monthly). Auto-create future partitions. Drop partitions older than 6 months |

**Зависимости:** Iter 1 (для A/B сравнения before/after)
**Параллелизм:** после Iter 1

---

### Iter 5 — Observability & Ops

> MTTD (mean time to detect) < 5 минут для критических инцидентов.

| # | Задача | Файлы | Acceptance criteria |
|---|--------|-------|---------------------|
| 5.1 | Extended Prometheus metrics | `server/src/index.js` `/metrics` | Метрики: `db_pool_total/idle/waiting`, `cache_*`, `sse_connections_total`, `connector_last_success_at`, `connector_error_rate`, `lightrag_query_duration_seconds` |
| 5.2 | Alert rules | `infra/alerts/rules.yml` (новый) | Rules: connector_lag > 30min, error_rate > 5%, pool_usage > 80%, cache_hit_ratio < 50% |
| 5.3 | Backup verification | `scripts/verify-backup.sh` (новый) | Weekly: restore backup в temporary DB → verify table counts → cleanup. Exit 1 при failure |
| 5.4 | Log aggregation | `docker-compose.yml` | Loki sidecar или managed solution. Structured logs accessible через query interface |
| 5.5 | Runbook updates | `docs/runbooks/` | Инструкции: Redis failure, DB pool exhaustion, connector timeout, OOM, disk full |
| 5.6 | CI smoke tests | `.github/workflows/ci-quality.yml` | Post-deploy: curl /health, /auth/login, /portfolio/overview, /lightrag/status. Fail deployment при non-200 |

**Зависимости:** Iter 0, 2 (logging, health)
**Параллелизм:** после Iter 2

---

### Iter 6 — Data Quality & LightRAG UX

> LightRAG feedback собирается. Quality trend наблюдаем.

| # | Задача | Файлы | Acceptance criteria |
|---|--------|-------|---------------------|
| 6.1 | Quality score proxy | `server/src/services/lightrag.js` | `quality_score` в response: f(evidence_count, source_diversity, chunk_relevance). Range 0-100 |
| 6.2 | Feedback endpoint | `server/src/index.js`, новая миграция | `POST /lightrag/feedback` — `{ query_run_id, rating: "up"|"down", comment? }`. Persist в `lightrag_feedback` |
| 6.3 | Evidence source filters | `server/src/services/lightrag.js` | Параметр `sourceFilter: ["messages", "issues", "deals"]`. Фильтрация на уровне query, не post-processing |
| 6.4 | Auto-dedup preview | `server/src/services/identity-graph.js` | При sync completion → trigger identity suggestions preview. Результат в SSE event |
| 6.5 | Completeness diff report | `server/src/services/reconciliation.js` | При каждом reconciliation run → сравнение с предыдущим. `completeness_delta` в audit_events |

**Зависимости:** Iter 1 (cache), Iter 4 (indexes)
**Параллелизм:** последняя итерация

---

## 3) Execution Order

```
Iter 0 (security) ─────────────────────────┐
                                            ├── GATE: merge to production branch
Iter 1 (Redis cache) + Iter 3 (frontend) ──┤  (параллельно)
                                            │
Iter 2 (reliability) ──────────────────────┤
                                            │
Iter 4 (DB optimization) ─────────────────┤
                                            │
Iter 5 (observability) ───────────────────┤
                                            │
Iter 6 (quality & UX) ────────────────────┘
```

**Всего задач:** 43
**Итераций:** 7 (включая Iter 0)

---

## 4) Явно вне текущего scope

- Любые интеграции и решения, завязанные на `/kag/*`.
- Black-box рекомендационные агенты без evidence.
- RBAC / multi-user auth (осознанное решение — single-user auth + scope достаточен для MVP).
- Дорогие LLM-решения в критических операционных циклах.

---

## 5) Связанные документы

- Детальный анализ: [`docs/product-structure-analysis.md`](./product-structure-analysis.md)
- Iteration log: [`docs/iteration-log.md`](./iteration-log.md)
- Платформенные инварианты: [`docs/platform-architecture.md`](./platform-architecture.md)
- Redis/SSE архитектура: [`docs/redis-sse.md`](./redis-sse.md)
