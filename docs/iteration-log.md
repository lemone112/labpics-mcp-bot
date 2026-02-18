# Iteration Log

> Хронологический журнал всех завершённых итераций.
> Текущий roadmap: [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)

---

## Iteration: LightRAG Migration (закрыта)

### Что изменено

1. Введён режим `LIGHTRAG_ONLY=1` как дефолт.
2. Добавлены API:
   - `POST /lightrag/query`
   - `POST /lightrag/refresh`
   - `GET /lightrag/status`
3. `/search` переведён на LightRAG alias-модель.
4. В scheduler legacy jobs, связанные с `/kag/*`, переводятся в `paused` в LightRAG-only режиме.
5. Dashboard/UI очищены от зависимостей на `/kag/*` и опираются на LightRAG.
6. Добавлена таблица `lightrag_query_runs` для observability запросов.

### Самокритика

- В репозитории остаются legacy-артефакты, что увеличивает стоимость поддержки.
- Часть исторических таблиц теперь не используется в активном пользовательском контуре.
- Нужно усилить e2e-кейсы именно для LightRAG релиз-критериев.

---

## Iteration: Deep Product Analysis (закрыта — 2026-02-18)

### Что изменено

1. 3-цикловый deep analysis всей структуры продукта (structure → hotpaths → self-criticism).
2. Идентифицированы 6 ключевых зон с оценкой зрелости: Platform (80%), Connectors (85%), Intelligence (65%), Dashboard (50%), Frontend (70%), Infrastructure (40%).
3. Обнаружено 15 критических/high bottlenecks.
4. Проведён количественный анализ Redis-кеширования: экономия 70-95% DB queries.
5. Составлен 7-итерационный production-ready план (43 задачи с acceptance criteria).

### Артефакты

- [`docs/product-structure-analysis.md`](./product-structure-analysis.md)
- [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)

---

## Iter 0 — Security Hardening (закрыта — 2026-02-18)

> Gate для production deploy. Все CRITICAL security issues закрыты.

### Что изменено

| # | Задача | Файлы | Результат |
|---|--------|-------|-----------|
| 0.1 | Убрать default credentials | `docker-compose.yml` | `AUTH_CREDENTIALS` использует `:?` синтаксис — startup fail если не задано. Default `admin:admin` удалён |
| 0.2 | Bcrypt hashing для паролей | `server/src/index.js`, `server/package.json` | Добавлен `bcrypt@^6.0.0`. `isBcryptHash()` авто-детектирует формат. Login использует `bcrypt.compare()`. Warning при plaintext |
| 0.3 | Non-root Docker user | `server/Dockerfile`, `web/Dockerfile` | `addgroup -g 1001 -S app && adduser -S -u 1001 -G app app`. `USER app`. `chown -R app:app .next` в web |
| 0.4 | Закрыть DB/Redis порты | `docker-compose.yml` | `ports:` закомментированы для db и redis. Доступ только через internal Docker network |
| 0.5 | API rate limiting | `server/src/index.js` | In-memory `apiRateBuckets` Map. 200 req/min per session, 60 req/min per IP. 429 при превышении |
| 0.6 | Resource limits | `docker-compose.yml` | `deploy.resources.limits`: Redis 256m, DB 1g/1cpu, Server 512m/1cpu, Worker 512m/0.5cpu, Web 512m/1cpu |
| 0.7 | Container healthchecks | `docker-compose.yml` | Server: `wget -qO- http://localhost:8080/health`. Worker: `pgrep -f 'node src/worker-loop'`. Web: `wget -qO- http://localhost:3000/`. Worker depends_on server healthy |

### Самокритика

- Rate limiting in-memory — при перезапуске сервера лимиты сбрасываются. Для MVP достаточно, для production с несколькими инстансами нужен Redis-backed limiter.
- `isBcryptHash()` проверяет regex `$2b$` — если формат хеша изменится, нужно обновить.

---

## Iter 1 — Redis Caching Layer (закрыта — 2026-02-18)

> p95 `/portfolio/overview` при cache hit: 800-1500ms → <50ms. DB load снижен на 70-95%.

### Что изменено

| # | Задача | Файлы | Результат |
|---|--------|-------|-----------|
| 1.1 | Cache-модуль | `server/src/lib/cache.js` (новый, 117 строк) | `createCacheLayer()` с `get/set/del/invalidateByPrefix/getStats/close`. Graceful degradation — без Redis все операции no-op |
| 1.2 | Отдельное Redis-соединение | `server/src/lib/redis.js` | `createRedisClient({ name: "redis-cache" })` — третье соединение отдельно от pub/sub |
| 1.3 | Session cache | `server/src/index.js` | Redis lookup перед DB. TTL 60s. `sessionTouchBuffer` Set — batch UPDATE `last_seen_at` каждые 30s. Invalidation при logout |
| 1.4 | Portfolio overview cache | `server/src/index.js` | Key: `portfolio:{accountScopeId}:{cacheKeyHash(...projectIds.sort())}`. TTL 90s |
| 1.5 | LightRAG query cache | `server/src/index.js` | Key: `lightrag:{projectId}:{cacheKeyHash(query, String(topK))}`. TTL 300s |
| 1.6 | Control Tower cache | `server/src/index.js` | Key: `ct:{projectId}`. TTL 120s |
| 1.7 | Event-driven invalidation | `server/src/index.js` | В `job_completed` subscriber: invalidate `portfolio:`, `ct:`, `lightrag:` по project_id |
| 1.8 | Cache metrics | `server/src/index.js` `/metrics` | `cache_hits`, `cache_misses`, `cache_sets`, `cache_invalidations`, `cache_enabled` в JSON |

### Вспомогательные утилиты

- `cacheKeyHash(...parts)` — SHA-256 → первые 12 hex символов. Детерминистический short hash для cache keys.
- Graceful shutdown: cache close добавлен в cleanup chain (sessionTouchTimer → cache → redisPubSub → pool).

### Самокритика

- Cache — JSON в Redis, не Protobuf/MessagePack. Для текущих объёмов (4-5MB) overhead минимален.
- `invalidateByPrefix` использует SCAN stream — при большом количестве ключей может быть медленным. Для текущего масштаба (<200 ключей) — OK.

---

## Iter 2 — Backend Reliability (закрыта — 2026-02-18)

> Внешние API падения не каскадируются. Graceful restart без потери запросов.

### Что изменено

| # | Задача | Файлы | Результат |
|---|--------|-------|-----------|
| 2.1 | Circuit breaker | `server/src/lib/http.js` | `createCircuitBreaker(name, opts)` — state machine: closed → open (5 failures) → half-open (probe через 30s). Per-host breaker в `fetchWithRetry()`. `getCircuitBreakerStates()` для debugging. `resetCircuitBreakers()` для тестов |
| 2.2 | Graceful shutdown | `server/src/index.js`, `worker-loop.js` | Server: SIGTERM/SIGINT → `fastify.close()` с 10s timeout → cleanup chain. Worker: `running` flag → interruptible sleep (check каждую секунду) → clean exit |
| 2.3 | Structured logging | `server/src/index.js` | Pino logger: `requestIdHeader: "x-request-id"`, `genReqId` через `crypto.randomUUID()`, serializers для req/res, JSON формат |
| 2.4 | Input validation | — | **Отложена** → вынесена в Iter 7. Текущая ручная валидация достаточна для MVP |
| 2.5 | PostgreSQL backup | `scripts/backup.sh` (новый, 38 строк) | `pg_dump | gzip`. Env-configurable (POSTGRES_USER, DB, HOST, BACKUP_DIR, RETENTION_DAYS). JSON-structured logs. `find -mtime` cleanup |
| 2.6 | Completeness alerting | `server/src/services/reconciliation.js` | После persist metrics: проверка каждого connector по `CONNECTOR_RECONCILIATION_MIN_COMPLETENESS_PCT` (default 70%). Below threshold → audit event `reconciliation.completeness_drop` |

### Тест-фикс

Circuit breaker вызвал failure в `http.unit.test.js` — global state (`circuitBreakers` Map) накапливался между тестами. Fix: добавлен `resetCircuitBreakers()` export + вызов в `beforeEach()`.

### Самокритика

- Zod validation отложена — это осознанное решение. Текущие ручные проверки покрывают основные кейсы, но при росте API нужна системная валидация.
- Circuit breaker states не экспортируются в `/metrics` — TODO для Iter 5.1.
- Backup script не автоматизирован (нет cron в docker-compose) — нужно добавить в Iter 5.

---

## Iteration: Documentation Recalibration (закрыта — 2026-02-18)

### Что изменено

1. Полная верификация кодовой базы после Iter 0-2:
   - Frontend: 3 `useMemo` для форматтеров (не chart transforms), ticker 1s, polling ×3 при SSE
   - Database: 18 миграций, ~120 indexes, production migration 0017
   - Observability: 3 CI workflows, `/metrics` с cache stats, но без circuit breaker states
   - Zod/input validation: не используется, ручная проверка body
   - Code splitting: не используется в control-tower

2. Обновлена матрица зрелости:
   - Platform: 80% → **92%**
   - Connectors: 85% → **92%**
   - Intelligence: 65% → **75%**
   - Dashboard: 50% → **70%**
   - Frontend: 70% → **70%** (без изменений)
   - Infrastructure: 40% → **78%**
   - Среднее: 65% → **80%**

3. Рекалиброван roadmap:
   - Iter 0-2 помечены как Done
   - Iter 3 (Frontend) → HIGH priority (единственная нетронутая зона)
   - Iter 4 (DB) → HIGH priority (cold path 800-1500ms)
   - Iter 5 (Observability) → MEDIUM
   - Iter 6 (Quality) → LOW
   - Добавлен Iter 7 (Input Validation) — вынесен из Iter 2.4

4. Итого: 3 итерации завершены (20/21 задач), 4 итерации осталось (26 задач).

### Артефакты

- [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md) — обновлённый roadmap
- [`docs/product-structure-analysis.md`](./product-structure-analysis.md) — обновлён
