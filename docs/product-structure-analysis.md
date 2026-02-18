# Глубокий анализ структуры продукта Labpics Dashboard

> Дата анализа: 2026-02-18
> Метод: 3-цикловый ресёрч (structure → hotpaths → self-criticism)
> Scope: backend, frontend, infrastructure, data model, Redis, production readiness

---

## Оглавление

1. [Шесть ключевых зон продукта — разбор](#1-шесть-ключевых-зон-продукта)
2. [Карта узких мест](#2-карта-узких-мест)
3. [Анализ Redis: текущее состояние и расширение](#3-анализ-redis)
4. [Итерационный план production-ready](#4-итерационный-план)
5. [Список модификаций Redis](#5-список-модификаций-redis)
6. [Цикл самокритики](#6-цикл-самокритики)

---

## 1. Шесть ключевых зон продукта

Продукт имеет шесть фундаментальных зон, каждая со своим уровнем зрелости.

### 1.1 Платформенный слой (Scope, Auth, Audit)

**Текущее состояние:** Зрелое ядро. Session auth + CSRF + request_id, жёсткий project/account scope, audit trail.

**Проблемы найдены при глубоком анализе:**

| Проблема | Файл | Строки | Критичность |
|----------|------|--------|-------------|
| Session SELECT + UPDATE на **каждый** HTTP-запрос | `index.js` | 498, 507 | HIGH |
| `last_seen_at` UPDATE при каждом запросе — лишняя write-нагрузка | `index.js` | 507 | HIGH |
| `hydrateSessionScope()` может вызваться дважды (onRequest + preValidation) | `index.js` | 506, 527 | MEDIUM |
| Plaintext credentials в `AUTH_CREDENTIALS` env var | `docker-compose.yml` | 43-45 | CRITICAL |
| Нет API rate limiting кроме login endpoint | `index.js` | 604-635 | CRITICAL |
| Нет bcrypt/argon2 — пароли не хешируются | `index.js` | ~605 | CRITICAL |

**Вердикт:** Scope-модель и audit trail — production grade. Auth и session management — нужна доработка перед production.

---

### 1.2 Интеграционный слой (Connectors)

**Текущее состояние:** Хорошая архитектура. Инкрементальный sync, DLQ с backoff, reconciliation, два режима (HTTP/MCP).

**Проблемы:**

| Проблема | Файл | Критичность |
|----------|------|-------------|
| Нет circuit breaker — при падении внешнего API sync зависает до timeout | `chatwoot.js`, `linear.js`, `attio.js` | HIGH |
| `connector_errors` — нет индекса по (project_id, status, error_kind) | migrations | MEDIUM |
| Нет алертов на падение `completeness_pct` (запланировано в R1, не реализовано) | — | MEDIUM |
| 80+ env vars дублируются между server и worker в docker-compose | `docker-compose.yml` | LOW |

**Вердикт:** Надёжная основа. Нужен circuit breaker и мониторинг SLA.

---

### 1.3 Intelligence слой (LightRAG)

**Текущее состояние:** Рабочий MVP. Vector search + ILIKE, evidence building, query observability.

**Проблемы:**

| Проблема | Файл | Строки | Критичность |
|----------|------|--------|-------------|
| 4 параллельных полнотабличных сканирования при каждом запросе | `lightrag.js` | 174-251 | HIGH |
| ILIKE ANY() — sequential scan без index | `lightrag.js` | 176-224 | HIGH |
| Нет кеширования повторных запросов (один и тот же вопрос = полный цикл) | `lightrag.js` | — | HIGH |
| Нет quality score / feedback loop (запланировано, не реализовано) | — | MEDIUM |
| Vector index tuning (IVFFlat probes / HNSW ef_search) только через env vars | — | LOW |

**Вердикт:** Функционально работает. Под нагрузкой будет деградировать из-за отсутствия кеширования и fullscan ILIKE.

---

### 1.4 Dashboard / Portfolio слой

**Текущее состояние:** Самый тяжёлый endpoint в системе. 18-20 параллельных SQL запросов на каждый load.

**Проблемы:**

| Проблема | Файл | Строки | Критичность |
|----------|------|--------|-------------|
| **11 LATERAL subqueries** на каждый проект в portfolio | `portfolio.js` | 113-177 | CRITICAL |
| 18 параллельных pool.query в одном Promise.all | `portfolio.js` | 112-620 | HIGH |
| Health scores, analytics snapshots запрашиваются повторно в trends | `portfolio.js` | 431, 441, 457 | HIGH |
| evidence_items сканируется дважды с ~70% одинаковой фильтрацией | `portfolio.js` | 216, 488 | MEDIUM |
| `computeClientValueScore()` считается в JS вместо SQL | `portfolio.js` | 16-28 | LOW |

**Количественная оценка:** При 10 проектах в scope один запрос `/portfolio/overview` генерирует ~20 SQL-запросов, каждый из которых содержит множественные LATERAL/subquery. Это ~100-150 "логических" сканирований таблиц. При 25 connection pool и 5 параллельных пользователях — pool exhaustion.

**Вердикт:** Работает для 1-3 пользователей. Не выдержит 10+ concurrent users без кеширования.

---

### 1.5 Frontend слой

**Текущее состояние:** Современный стек (Next.js 16 + React 19 + shadcn/ui). Хорошая компонентная система.

**Проблемы:**

| Проблема | Файл | Критичность |
|----------|------|-------------|
| 11 data transforms без `useMemo` в render path | `section-page.jsx` | CRITICAL |
| `compactUniqueRisks()` O(n log n) sort в каждом render | `section-page.jsx:145-167` | HIGH |
| 1-секундный ticker в `useAutoRefresh` — continuous re-renders | `use-auto-refresh.js:57-62` | HIGH |
| 3 concurrent polling timers (20s + 30s + 60s) | multiple hooks | MEDIUM |
| Нет code splitting — все dashboard sections в одном bundle | `next.config.mjs` | MEDIUM |
| Нет React.memo на 10+ chart-компонентах | `section-page.jsx` | MEDIUM |
| `use-project-portfolio.js` — 335 строк, 23 values в context | hook | MEDIUM |

**Вердикт:** Визуально готов. Performance под вопросом при активном использовании.

---

### 1.6 Инфраструктура (Docker, CI/CD, Security)

**Текущее состояние:** Базовый Docker Compose + GitHub Actions. Работает для dev/staging.

**Проблемы:**

| Проблема | Файл | Критичность |
|----------|------|-------------|
| Контейнеры запускаются от root (нет USER в Dockerfile) | Оба Dockerfile | CRITICAL |
| Нет resource limits (memory, CPU) | `docker-compose.yml` | CRITICAL |
| PostgreSQL и Redis порты открыты на хосте | `docker-compose.yml:7,24,83` | HIGH |
| Нет backup strategy для PostgreSQL | — | CRITICAL |
| Нет healthcheck для server и worker containers | `docker-compose.yml:33,90` | HIGH |
| Нет graceful shutdown (SIGTERM handler) | `index.js`, `worker-loop.js` | HIGH |
| Нет structured logging (JSON с correlation IDs) | — | MEDIUM |
| Default credentials `admin:admin` | `docker-compose.yml:43` | CRITICAL |

**Вердикт:** Не готово для production. Нужна серьёзная доработка security и ops.

---

## 2. Карта узких мест

### Приоритизированный список по impact:

```
CRITICAL (блокеры production):
  1. Auth: plaintext пароли, default admin:admin, нет rate limiting API
  2. Docker: root user, открытые порты DB/Redis, нет resource limits
  3. Нет backup strategy для PostgreSQL
  4. Portfolio endpoint: 18-20 запросов без кеширования → pool exhaustion

HIGH (деградация при нагрузке):
  5. Session UPDATE last_seen_at на каждый запрос
  6. LightRAG: fullscan ILIKE без кеша результатов
  7. Frontend: 11 transforms без useMemo + 1s ticker
  8. Нет circuit breaker на коннекторах
  9. Нет healthcheck на server/worker
  10. Нет graceful shutdown

MEDIUM (качество и масштабируемость):
  11. Повторные запросы одних данных в portfolio
  12. Frontend: нет code splitting, 3 polling таймера
  13. Нет structured logging
  14. Нет input validation schemas (zod/ajv)
  15. evidence_items двойное сканирование
```

---

## 3. Анализ Redis

### 3.1 Текущее использование Redis

Redis **уже подключён** к системе. Текущее использование:

| Что | Где | Файл |
|-----|-----|------|
| Pub/Sub: канал `job_completed` | worker → server | `redis-pubsub.js` |
| SSE broadcasting по project_id | server → browser | `sse-broadcaster.js` |
| Health check (PING) | server startup | `redis.js` |

**Текущая конфигурация:** 128MB maxmemory, allkeys-lru eviction, два соединения (pub + sub).

**Ключевой факт:** Redis используется только для event signaling. Весь потенциал кеширования **не задействован**.

### 3.2 Вердикт: нужен ли Redis-кеш?

**Однозначно ДА.** Обоснование:

#### Аргумент 1: Session cache (немедленный эффект)

Сейчас каждый HTTP-запрос выполняет:
```
1. SELECT ... FROM sessions ... WHERE session_id = $1  (read)
2. hydrateSessionScope()                               (1-2 reads)
3. UPDATE sessions SET last_seen_at = now() ...        (write)
```

При 50 req/s это 50 SELECT + 50 UPDATE + 50-100 дополнительных SELECT = **150-200 queries/s** только на session handling.

**С Redis:** Session данные кешируются на 60 секунд. `last_seen_at` обновляется батчем раз в 30 секунд.
- **Экономия:** ~95% session-запросов к PostgreSQL
- **Латентность:** 0.1ms (Redis) vs 2-5ms (PostgreSQL)

#### Аргумент 2: Portfolio overview cache (максимальный эффект)

`/portfolio/overview` — 18-20 SQL-запросов. Данные обновляются раз в 15 минут (sync cycle).

**С Redis:** Кеш результата на 60-120 секунд с инвалидацией по `job_completed` event.
- **Экономия:** 17-19 SQL-запросов из 20 при повторном обращении
- **Tail latency:** с 800-1500ms до 2-5ms при cache hit

#### Аргумент 3: LightRAG query cache (UX эффект)

Одинаковые запросы к LightRAG (типичный сценарий — рефреш страницы, повторный поиск) выполняют полный цикл: embedding → vector search → ILIKE → evidence building.

**С Redis:** Hash от (query, project_id, topK) → cached result на 5 минут.
- **Экономия:** 4 SQL-запроса + 1 OpenAI API call
- **UX:** мгновенный ответ при повторном запросе

#### Аргумент 4: Sync watermarks и connector state (ops эффект)

Control Tower запрашивает watermarks на каждый load. Watermarks обновляются раз в 15 минут.

**С Redis:** Кеш на 5 минут с invalidation при sync completion.
- **Экономия:** ~30 queries/min на dashboard-рефрешах

### 3.3 Количественная оценка

| Метрика | Без Redis cache | С Redis cache | Δ |
|---------|----------------|---------------|---|
| Queries/req на `/portfolio/overview` | 20 | 1 (cache hit) | -95% |
| Queries/req на session validation | 2-4 | 0 | -100% |
| Queries/req на `/lightrag/query` | 4-5 | 0-1 (cache hit) | -80% |
| p95 latency `/portfolio/overview` | 800-1500ms | 2-10ms (hit) | -99% |
| p95 latency session validation | 5-15ms | 0.1ms | -97% |
| DB connection usage при 10 users | ~20/25 pool | ~5/25 pool | -75% |
| Redis memory (добавочный) | 0 | ~20-40MB | +30MB |

### 3.4 Риски расширения Redis

| Риск | Митигация |
|------|-----------|
| Cache invalidation consistency | Event-driven invalidation через существующий Pub/Sub |
| Redis downtime | Уже есть graceful degradation (fallback to DB) |
| Memory pressure | 128MB достаточно; при необходимости поднять до 256MB |
| Stale data | TTL 60-120s + явная инвалидация при job_completed |
| Complexity overhead | Минимальный: один модуль `lib/cache.js`, ~100 строк |

**Финальный вердикт:** Redis-кеширование даёт **кратное** (не процентное) улучшение производительности при минимальных рисках. Инфраструктура уже на месте.

---

## 4. Итерационный план production-ready

### Iteration 0: Security Hardening (блокер для production)

**Scope:** Устранение CRITICAL security issues.

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 0.1 | Убрать default credentials `admin:admin` из docker-compose | `docker-compose.yml` | Удалить default values для `AUTH_CREDENTIALS`, `AUTH_PASSWORD` |
| 0.2 | Добавить bcrypt hashing для паролей | `server/src/index.js`, `server/package.json` | Добавить `bcrypt`, хешировать при login verify |
| 0.3 | Добавить `USER node` в оба Dockerfile | `server/Dockerfile`, `web/Dockerfile` | `RUN addgroup -g 1001 app && adduser ...` + `USER app` |
| 0.4 | Убрать expose портов DB/Redis на хост | `docker-compose.yml` | Удалить `ports` для db и redis; оставить internal networking |
| 0.5 | Добавить API rate limiting middleware | `server/src/index.js` | In-memory rate limiter: 100 req/min per session, 30 req/min per IP для auth |
| 0.6 | Добавить resource limits в docker-compose | `docker-compose.yml` | `deploy.resources.limits.memory`, `cpus` для каждого сервиса |
| 0.7 | Добавить healthcheck для server и worker | `docker-compose.yml` | `healthcheck: curl -f http://localhost:8080/health` |

**Критерий завершения:** Все CRITICAL issues из раздела 2 закрыты.

---

### Iteration 1: Redis Caching Layer

**Scope:** Внедрение кеширования для устранения performance bottlenecks.

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 1.1 | Создать `lib/cache.js` — единый cache-модуль | `server/src/lib/cache.js` (новый) | `get`, `set`, `del`, `invalidatePattern`, TTL management |
| 1.2 | Session cache (Redis → fallback DB) | `server/src/index.js` | Кешировать session lookup, батч `last_seen_at` |
| 1.3 | Portfolio overview cache | `server/src/services/portfolio.js` | Cache key: `portfolio:{accountScopeId}:{projectIds hash}`, TTL 90s |
| 1.4 | LightRAG query cache | `server/src/services/lightrag.js` | Cache key: `lightrag:{projectId}:{queryHash}:{topK}`, TTL 300s |
| 1.5 | Control Tower / watermarks cache | `server/src/services/intelligence.js` | Cache key: `ct:{projectId}`, TTL 120s |
| 1.6 | Event-driven invalidation | `server/src/index.js`, `lib/cache.js` | При `job_completed` → invalidate related cache keys |
| 1.7 | Cache metrics в `/metrics` | `server/src/index.js` | `cache_hits_total`, `cache_misses_total`, `cache_invalidations_total` |

**Критерий завершения:** p95 latency `/portfolio/overview` < 50ms при cache hit. DB queries снижены на 70%+.

---

### Iteration 2: Backend Reliability

**Scope:** Circuit breaker, graceful shutdown, structured logging.

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 2.1 | Circuit breaker для внешних API | `server/src/lib/http.js` | Добавить state machine: closed → open → half-open. Threshold: 5 failures / 60s |
| 2.2 | Graceful shutdown handler | `server/src/index.js`, `worker-loop.js` | SIGTERM → drain connections → close Redis → close DB pool |
| 2.3 | Structured JSON logging | `server/src/index.js` | Fastify logger с pino: JSON формат, correlation IDs, log levels |
| 2.4 | Input validation schemas | `server/src/index.js` | Zod schemas для POST endpoints (CRM, offers, outbound) |
| 2.5 | PostgreSQL backup strategy | `docker-compose.yml`, `scripts/backup.sh` | pg_dump cron + retention policy |
| 2.6 | Alerting на completeness_pct падение | `server/src/services/reconciliation.js` | При completeness < threshold → audit event + SSE alert |

**Критерий завершения:** Внешние API падения не каскадируются. Graceful restart без потери запросов.

---

### Iteration 3: Frontend Performance

**Scope:** Устранение frontend bottlenecks.

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 3.1 | useMemo для 11 chart transforms | `web/features/control-tower/section-page.jsx` | Обернуть все `.map()` в `useMemo` |
| 3.2 | React.memo для chart card components | `web/features/control-tower/section-page.jsx` | Извлечь `<DashboardChartCard />`, обернуть в `memo` |
| 3.3 | Поднять ticker interval с 1s до 5s | `web/hooks/use-auto-refresh.js` | `secondsAgo` update раз в 5 секунд |
| 3.4 | Отключить polling при активном SSE | `web/hooks/use-auto-refresh.js` | `if (sseConnected) return` вместо `intervalMs * 3` |
| 3.5 | Code splitting для dashboard sections | `web/app/control-tower/[section]/page.jsx` | `dynamic(() => import(...))` |
| 3.6 | Рефактор use-project-portfolio.js | `web/hooks/use-project-portfolio.js` | Разделить на `useProjectSelection`, `useProjectRefresh`, `useProjectState` |

**Критерий завершения:** Lighthouse Performance score > 85. Нет jank при навигации.

---

### Iteration 4: Database Optimization

**Scope:** Индексы, materialized views, cleanup.

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 4.1 | Добавить strategic indexes | Новая миграция | `(project_id, account_id)` на crm_account_contacts; `(opportunity_id)` на stage_events; `(account_scope_id, created_at)` на ключевые таблицы |
| 4.2 | Materialized view для portfolio dashboard | Новая миграция | `CREATE MATERIALIZED VIEW mv_portfolio_dashboard` с агрегатами |
| 4.3 | Оптимизация LATERAL → batch query | `server/src/services/portfolio.js` | Заменить 11 LATERAL subqueries на отдельные batch-запросы с hash join |
| 4.4 | Cleanup orphaned tables | Новая миграция | Drop `app_users`, `signup_requests`, `app_settings` (если не используются) |
| 4.5 | GIN index для ILIKE patterns в lightrag | Новая миграция | `CREATE INDEX ... ON cw_messages USING gin(content gin_trgm_ops)` |
| 4.6 | Partitioning для audit_events и job_runs | Новая миграция | Range partitioning по created_at (monthly) |

**Критерий завершения:** Portfolio overview < 200ms при 10 проектах без кеша. LightRAG ILIKE использует index.

---

### Iteration 5: Observability & Ops

**Scope:** Мониторинг, backup verification, runbook automation.

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 5.1 | Prometheus exporter с полным набором метрик | `server/src/index.js` | DB pool stats, cache stats, SSE stats, connector lag, error rates |
| 5.2 | Alerting rules (файл или интеграция) | `infra/alerts/` | Connector lag > 30min, error rate > 5%, pool usage > 80% |
| 5.3 | Backup verification job | `scripts/verify-backup.sh` | Еженедельная проверка восстановления из backup |
| 5.4 | Log aggregation setup | `docker-compose.yml` | Loki/Grafana stack или managed solution |
| 5.5 | Runbook: incident response | `docs/runbooks/` | Инструкции по основным failure modes |
| 5.6 | E2E smoke tests в CI | `.github/workflows/ci-quality.yml` | Smoke: /health, /login, /portfolio/overview, /lightrag/query |

**Критерий завершения:** Mean time to detect (MTTD) < 5 минут для критических инцидентов.

---

### Iteration 6: Data Quality & LightRAG UX

**Scope:** Quality score, feedback loop, dedup.

| # | Задача | Файлы | Изменения |
|---|--------|-------|-----------|
| 6.1 | Quality score proxy для LightRAG | `server/src/services/lightrag.js` | precision/coverage метрики на основе evidence count и diversity |
| 6.2 | Feedback loop endpoint | `server/src/index.js` | `POST /lightrag/feedback` — thumb up/down с persist |
| 6.3 | Evidence фильтры по типу источника | `server/src/services/lightrag.js` | Параметр `sourceFilter: ["messages", "issues", "deals"]` |
| 6.4 | Identity graph improvements | `server/src/services/identity-graph.js` | Авто-preview при sync completion |
| 6.5 | Diff-report полноты данных | `server/src/services/reconciliation.js` | Сравнение completeness_pct между sync-циклами |

**Критерий завершения:** LightRAG feedback собирается. Quality trend наблюдаем.

---

## 5. Список модификаций Redis

### 5.1 Новый модуль: `server/src/lib/cache.js`

```javascript
// Архитектура:
// - Использует существующий Redis client (не pub/sub connections)
// - Graceful degradation: при отсутствии Redis — пропускает кеш
// - JSON serialization для values
// - Pattern-based invalidation через SCAN

export function createCacheLayer({ redisClient, logger, defaultTtl = 90 })

// API:
async get(key)                           // → parsed value | null
async set(key, value, ttlSeconds?)       // → void
async del(key)                           // → void
async invalidateByPrefix(prefix)         // → count deleted
function getStats()                      // → { hits, misses, sets, invalidations }
```

### 5.2 Конкретные изменения по файлам

#### `server/src/lib/redis.js`
```diff
+ // Третье соединение для cache (отдельное от pub/sub)
+ export function createRedisCacheClient(options) {
+   return createRedisClient({ ...options, name: "redis-cache" });
+ }
```

#### `server/src/index.js`

**Session caching (строки ~498-507):**
```diff
- const sessionRow = await loadSessionWithProjectScope(sid);
+ const cacheKey = `session:${sid}`;
+ let sessionRow = await cache.get(cacheKey);
+ if (!sessionRow) {
+   sessionRow = await loadSessionWithProjectScope(sid);
+   if (sessionRow) await cache.set(cacheKey, sessionRow, 60);
+ }

- await pool.query("UPDATE sessions SET last_seen_at = now() WHERE session_id = $1", [sid]);
+ // Батч-обновление last_seen_at раз в 30 секунд
+ sessionTouchBuffer.add(sid);
```

**Cache invalidation при job_completed (строка ~356):**
```diff
  await redisPubSub.subscribe("job_completed", (payload) => {
    const projectId = payload?.project_id;
+   const accountScopeId = payload?.account_scope_id;
    if (!projectId) return;
    sseBroadcaster.broadcast(projectId, "job_completed", {...});
+   // Invalidate cached data for this project
+   cache.invalidateByPrefix(`portfolio:${accountScopeId}`);
+   cache.invalidateByPrefix(`ct:${projectId}`);
+   cache.invalidateByPrefix(`lightrag:${projectId}`);
  });
```

#### `server/src/services/portfolio.js`

**Portfolio overview caching (строка ~67):**
```diff
  export async function getPortfolioOverview(pool, options = {}) {
+   const cacheKey = `portfolio:${options.accountScopeId}:${hashProjectIds(options.projectIds)}`;
+   const cached = await cache.get(cacheKey);
+   if (cached) return cached;
+
    // ... existing 18 queries ...
    const result = { projects, dashboard, messages, ... };
+
+   await cache.set(cacheKey, result, 90); // 90 seconds TTL
    return result;
  }
```

#### `server/src/services/lightrag.js`

**LightRAG query caching (строка ~147):**
```diff
  export async function queryLightRag(pool, scope, options, logger) {
+   const queryHash = hashQuery(options.query, scope.projectId, options.topK);
+   const cacheKey = `lightrag:${scope.projectId}:${queryHash}`;
+   const cached = await cache.get(cacheKey);
+   if (cached) {
+     // Всё равно логируем запрос для observability
+     await persistQueryRun(pool, scope, options, cached, true);
+     return cached;
+   }
+
    // ... existing search logic ...
+   await cache.set(cacheKey, result, 300); // 5 minutes TTL
    return result;
  }
```

#### `server/src/services/intelligence.js`

**Control Tower caching (строка ~573):**
```diff
  export async function getControlTower(pool, scope) {
+   const cacheKey = `ct:${scope.projectId}`;
+   const cached = await cache.get(cacheKey);
+   if (cached) return cached;
+
    // ... existing 7+ queries ...
+   await cache.set(cacheKey, result, 120); // 2 minutes TTL
    return result;
  }
```

### 5.3 Redis memory budget

| Cache | Avg entry size | Max entries | TTL | Est. memory |
|-------|---------------|-------------|-----|-------------|
| Sessions | ~500B | 100 | 60s | ~50KB |
| Portfolio overview | ~50KB | 20 | 90s | ~1MB |
| LightRAG queries | ~10KB | 200 | 300s | ~2MB |
| Control Tower | ~20KB | 50 | 120s | ~1MB |
| Watermarks | ~1KB | 50 | 300s | ~50KB |

**Итого:** ~4-5MB дополнительной памяти. Текущий лимит 128MB — более чем достаточно.

### 5.4 Стратегия инвалидации

```
job_completed (connectors_sync_cycle):
  → invalidate portfolio:*
  → invalidate ct:{projectId}
  → invalidate lightrag:{projectId}:*

job_completed (embeddings_run):
  → invalidate lightrag:{projectId}:*

job_completed (signals_extraction | health_scoring):
  → invalidate portfolio:*
  → invalidate ct:{projectId}

session UPDATE (login/logout/project switch):
  → invalidate session:{sessionId}
```

---

## 6. Цикл самокритики

### Раунд 1: Проверка полноты анализа

| Вопрос | Ответ | Достаточно? |
|--------|-------|-------------|
| Покрыты ли все 6 зон? | Да: Platform, Connectors, Intelligence, Dashboard, Frontend, Infrastructure | OK |
| Проверен ли каждый critical finding в коде? | Да: строки указаны, код прочитан | OK |
| Есть ли пропущенные bottlenecks? | Возможно: worker-loop.js при большом числе проектов. Проверено — OK, tick limit 25 | OK |
| Учтён ли KAG legacy code? | Да: явно отмечен как out of scope, таблицы предложены к cleanup | OK |

### Раунд 2: Проверка Redis-решения

| Вопрос | Ответ | Достаточно? |
|--------|-------|-------------|
| Оправдана ли сложность? | ~100 строк нового кода для 10x improvement — оправдана | OK |
| Есть ли альтернативы без Redis? | In-memory LRU cache (node-lru-cache) — вариант, но не работает в multi-process (server + worker). Redis уже подключён — дополнительной сложности минимум | OK |
| Не создаёт ли cache consistency проблем? | TTL 60-300s + event-driven invalidation. Worst case: 60-300s stale data. Для dashboard metrics это допустимо | OK |
| Достаточно ли 128MB? | 4-5MB cache + pub/sub overhead. 128MB с запасом в 25x | OK |

### Раунд 3: Проверка iteration plan

| Вопрос | Ответ | Достаточно? |
|--------|-------|-------------|
| Правильный ли порядок? | Security (Iter 0) → Performance (Iter 1-3) → Optimization (Iter 4) → Ops (Iter 5) → Features (Iter 6). Да, security first | OK |
| Есть ли зависимости между итерациями? | Iter 1 (Redis cache) зависит от существующего Redis. Iter 4 (DB optimization) ортогонален Iter 1. Можно параллелить Iter 2 + Iter 3. | OK |
| Реалистичен ли scope каждой итерации? | Iter 0: 6-8 задач (security). Iter 1: 7 задач (cache). Каждая итерация — cohesive и deliverable. | OK |
| Что упущено? | Нет пункта про RBAC / multi-user auth. Добавлено в roadmap "Later" как осознанное решение — для MVP single-user auth + scope достаточен. | OK |

### Раунд 4: Self-challenge — что может пойти не так?

**Возражение 1:** "Redis cache добавит complexity и bug surface."
**Контраргумент:** Redis уже подключён и работает. Добавляется один модуль (~100 строк) с graceful degradation. Fallback: если Redis cache недоступен — запросы идут в PostgreSQL напрямую (текущее поведение). Нет breaking change.

**Возражение 2:** "Materialized views (Iter 4.2) проще, чем Redis cache."
**Контраргумент:** MV решает другую проблему (aggregate computation). Redis cache решает повторные запросы. Нужны оба: MV для первого запроса (cold), Redis для повторных (warm). MV без REFRESH CONCURRENTLY блокирует reads.

**Возражение 3:** "Frontend optimization (Iter 3) имеет больший видимый impact, чем Redis."
**Контраргумент:** Frontend fixes снижают rendering cost, но не снижают network latency. При 800ms API response useMemo не поможет. Redis cache снижает response time в 100x при cache hit. Правильный порядок: сначала backend (Iter 1), потом frontend (Iter 3).

**Возражение 4:** "Iter 0 (security) можно сделать параллельно с Iter 1 (Redis)."
**Контраргумент:** Верно. Security fixes (Dockerfile USER, rate limiting) ортогональны кеширующему слою. Можно параллелить, но security должен быть **merged first** — это gate для production deploy.

---

## Приложение: Сводная таблица итераций

| Iter | Название | Задачи | Зависимости | Параллелизм |
|------|----------|--------|-------------|-------------|
| 0 | Security Hardening | 7 | Нет | Gate для production |
| 1 | Redis Caching Layer | 7 | Redis running (уже есть) | Можно с Iter 2 |
| 2 | Backend Reliability | 6 | Iter 0 (security) | Можно с Iter 1, 3 |
| 3 | Frontend Performance | 6 | Нет | Можно с Iter 1, 2 |
| 4 | Database Optimization | 6 | Iter 1 (cache layer для A/B) | После Iter 1 |
| 5 | Observability & Ops | 6 | Iter 0, 2 (logging, health) | После Iter 2 |
| 6 | Data Quality & UX | 5 | Iter 1 (cache), Iter 4 (indexes) | Последняя |

**Рекомендуемый порядок выполнения:**
```
Iter 0 (security) ─────────────────────────┐
                                            ├── Gate: merge to production branch
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
