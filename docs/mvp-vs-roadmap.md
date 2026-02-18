# Статус продукта и roadmap (Production-Ready Plan)

> Обновлено: 2026-02-18 (post Iter 0-7 — все итерации завершены)
> Детальный анализ: [`docs/product-structure-analysis.md`](./product-structure-analysis.md)

---

## 1) Текущее состояние — что сделано

### Платформа (зрелость: 80% → **96%**)

**Было:** Session auth + CSRF, plaintext пароли, нет rate limiting, session UPDATE на каждый запрос.

**Сделано (Iter 0 + 1 + 2 + 7):**
- ✅ Bcrypt password hashing с автодетектом формата (`isBcryptHash()`)
- ✅ `AUTH_CREDENTIALS` без default values — startup fail если не задано
- ✅ API rate limiting: 200 req/min per session, 60 req/min per IP
- ✅ Session cache в Redis (TTL 60s) + batched `last_seen_at` (раз в 30s)
- ✅ Structured JSON logging (Pino с serializers, request_id, correlation)
- ✅ Graceful shutdown (SIGTERM → 10s drain → close Redis → close DB pool)
- ✅ Zod schema validation на 14 POST endpoints (`parseBody()` + standardized error response)

**Оставшиеся gaps:**
- `hydrateSessionScope()` может вызываться дважды (onRequest + preValidation)

### Интеграции / Connectors (зрелость: 85% → **96%**)

**Было:** Инкрементальный sync, DLQ, reconciliation — но нет circuit breaker, нет alerting.

**Сделано (Iter 2 + 4 + 6):**
- ✅ Circuit breaker в `fetchWithRetry()` — per-host, 5 failures threshold, 30s reset
- ✅ Completeness alerting: при `completeness_pct < threshold` → audit event + SSE
- ✅ Strategic indexes: `connector_errors(project_id, error_kind, status)`, `crm_account_contacts(project_id, account_id)`
- ✅ Completeness diff report: delta per connector между sync-циклами (`GET /connectors/reconciliation/diff`)
- ✅ Auto identity dedup preview при sync cycle completion

**Оставшиеся gaps:**
- Нет pre-built Grafana dashboards для connector metrics

### Intelligence / LightRAG (зрелость: 65% → **90%**)

**Было:** Рабочий vector search + ILIKE, но fullscan, нет кеша, нет quality score.

**Сделано (Iter 1 + 4 + 6):**
- ✅ LightRAG query cache: `lightrag:{projectId}:{hash(query,topK,sourceFilter)}`, TTL 300s
- ✅ Event-driven invalidation при embeddings_run и sync completion
- ✅ pg_trgm GIN indexes: `cw_messages(content)`, `linear_issues_raw(title)`, `attio_opportunities_raw(title)` — ILIKE → index scan
- ✅ Quality score proxy: `computeQualityScore()` — coverage (40%) + diversity (35%) + depth (25%) = 0-100
- ✅ Feedback endpoint: `POST /lightrag/feedback` — rating (-1/0/1) + comment, persisted в `lightrag_feedback`
- ✅ Evidence source filters: `sourceFilter: ["messages", "issues", "deals", "chunks"]` — conditional query execution

**Оставшиеся gaps:**
- Quality score — proxy metric без ground truth (calibratable через feedback data)
- Vector index tuning (IVFFlat probes / HNSW ef_search) только через env vars

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

---

## 3) Все итерации завершены

Нет оставшихся итераций. План production-ready полностью выполнен.

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
```

**Итого:** 8 итераций завершены (46/48 задач). Все итерации выполнены. 2 задачи отложены by design (zod в Iter 2, portfolio hook в Iter 3).

---

## 5) Матрица зрелости

| Зона | До (Iter 0) | После (Iter 0-2) | После (Iter 0-4) | После (Iter 0-5) | После (Iter 0-6) | После (Iter 0-7) | Target |
|------|-------------|-------------------|-------------------|-------------------|-------------------|-------------------|--------|
| Платформа | 80% | 92% | 92% | 92% | 92% | **96%** | 98% |
| Connectors | 85% | 92% | 95% | 95% | 96% | **96%** | 97% |
| Intelligence | 65% | 75% | 82% | 82% | 90% | **90%** | 92% |
| Dashboard | 50% | 70% | 88% | 88% | 88% | **88%** | 90% |
| Frontend | 70% | 70% | 85% | 85% | 85% | **85%** | 90% |
| Инфраструктура | 40% | 78% | 78% | 92% | 92% | **92%** | 95% |
| **Среднее** | **65%** | **80%** | **87%** | **89%** | **91%** | **91%** | **94%** |

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
