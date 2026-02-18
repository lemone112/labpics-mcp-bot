# Real-time архитектура: Redis Pub/Sub + SSE + Auto-Refresh

> Документ описывает архитектуру автоматического обновления данных в продукте.
> Три уровня: frontend polling, cascade triggers, Redis Pub/Sub → SSE push.

---

## 1) Обзор

Система обеспечивает автоматическое обновление данных на трёх уровнях:

| Уровень | Механизм | Задержка | Fallback |
|---------|----------|----------|----------|
| **Level 1** | Frontend auto-polling | 15–60 сек | Работает всегда |
| **Level 2** | Cascade triggers в scheduler | ~60 сек (следующий tick) | Независимые таймеры |
| **Level 3** | Redis Pub/Sub → SSE push | ~1-2 сек | Polling (Level 1) |

### Поток данных

```
Worker Loop                  Redis                  Fastify API Server        Browser
    │                          │                          │                     │
    │── job completes ────────>│                          │                     │
    │   PUBLISH job_completed  │                          │                     │
    │                          │── message ──────────────>│                     │
    │                          │   (subscriber conn)      │                     │
    │                          │                          │── SSE push ────────>│
    │                          │                          │   GET /events/stream│
    │                          │                          │                     │
    │── cascade: UPDATE ──────>│ (PostgreSQL)             │              (reload hook)
    │   scheduled_jobs         │                          │                     │
    │   next_run_at = now()    │                          │                     │
```

---

## 2) Level 1: Frontend Auto-Polling

### Хук `useAutoRefresh`

**Файл:** `web/hooks/use-auto-refresh.js`

Обёртка над любой функцией `reload()` с интервальным таймером:

- Принимает `fetchFn`, `intervalMs`, `{ enabled }` опции
- Пропускает fetch, если вкладка скрыта (Page Visibility API)
- При возврате на вкладку — мгновенный refetch, если данные устарели
- Защита от конкурентных запросов через `fetchingRef`

### Интервалы по хукам

| Хук | Интервал | Обоснование |
|-----|----------|-------------|
| `usePortfolioOverview` | 30 сек | Дашборд — основной экран |
| `usePortfolioMessages` | 20 сек | Сообщения — критичны к свежести |
| `useRecommendationsV2` | 45 сек | Рекомендации меняются реже |
| `useProjectPortfolio` | 60 сек | Список проектов стабилен |
| Jobs page (`loadStatus`) | 15 сек | Мониторинг задач |

### Индикатор `LastUpdatedIndicator`

**Файл:** `web/components/ui/last-updated-indicator.jsx`

Показывает "Обновлено: X сек/мин назад" + кнопка "Обновить".
Интегрирован в Control Tower и страницу Jobs.

---

## 3) Level 2: Cascade Triggers

### Конфигурация цепочек

**Файл:** `server/src/services/scheduler.js`

```js
const CASCADE_CHAINS = {
  connectors_sync_cycle: ["signals_extraction", "embeddings_run"],
  signals_extraction:    ["health_scoring", "kag_recommendations_refresh"],
  health_scoring:        ["analytics_aggregates"],
  kag_recommendations_refresh: ["kag_v2_recommendations_refresh"],
};
```

### Как работает

1. Job `connectors_sync_cycle` завершается успешно
2. `triggerCascade()` делает `UPDATE scheduled_jobs SET next_run_at = now()` для downstream jobs
3. На следующем worker tick (≤60 сек) downstream jobs подхватываются
4. Каждый downstream job при завершении тоже запускает свои cascade

### Полная цепочка

```
connectors_sync_cycle
  ├── signals_extraction
  │     ├── health_scoring
  │     │     └── analytics_aggregates
  │     └── kag_recommendations_refresh
  │           └── kag_v2_recommendations_refresh
  └── embeddings_run
```

### Наблюдаемость

Каждый cascade-triggered job получает в `payload.cascade_triggered_by`:
```json
{ "job_type": "connectors_sync_cycle", "at": "2026-02-18T12:00:00Z" }
```

---

## 4) Level 3: Redis Pub/Sub + SSE

### Архитектура Redis

**Два соединения** на каждый процесс:
- **Publisher** (worker) — отправляет события после завершения задач
- **Subscriber** (server) — слушает события и пушит клиентам через SSE

**Конфигурация:**
- `REDIS_URL` — connection string (по умолчанию `redis://redis:6379`)
- maxmemory: 128 MB, eviction policy: allkeys-lru
- Канал: `job_completed`

### Модули

| Файл | Назначение |
|------|-----------|
| `server/src/lib/redis.js` | Фабрика Redis-клиентов (ioredis) |
| `server/src/lib/redis-pubsub.js` | Pub/Sub обёртка: publish + subscribe |
| `server/src/lib/sse-broadcaster.js` | Менеджер SSE-клиентов по project_id |

### SSE Endpoint

```
GET /events/stream
```

- Требует аутентификацию (cookie session)
- Scope привязан к активному проекту
- Heartbeat каждые 30 сек (`:heartbeat\n\n`)
- Event format: `event: job_completed\ndata: {...}\n\n`

### Payload события

```json
{
  "job_type": "signals_extraction",
  "project_id": "uuid",
  "status": "ok",
  "at": "2026-02-18T12:00:00Z"
}
```

### Graceful degradation

Если Redis недоступен:
- `createRedisClient()` возвращает `null`
- `redisPubSub.enabled === false`
- Worker использует `pg_notify('job_completed', ...)` как fallback
- SSE endpoint работает, но не получает события
- Frontend polling (Level 1) обеспечивает обновления

### Frontend хуки

| Хук | Файл | Назначение |
|-----|------|-----------|
| `useEventStream` | `web/hooks/use-event-stream.js` | Подключение к SSE |
| `useRealtimeRefresh` | `web/hooks/use-realtime-refresh.js` | Маппинг событий на reload |

### Маппинг job → данные

```js
const JOB_TO_DATA_MAP = {
  connectors_sync_cycle: ["portfolio", "messages"],
  signals_extraction: ["portfolio", "recommendations"],
  health_scoring: ["portfolio"],
  kag_recommendations_refresh: ["recommendations"],
  kag_v2_recommendations_refresh: ["recommendations"],
  analytics_aggregates: ["portfolio"],
  embeddings_run: ["portfolio"],
};
```

---

## 5) Docker Compose

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 10
```

Зависимости:
- `server` → depends_on: `redis` (healthy)
- `worker` → depends_on: `redis` (healthy)

---

## 6) Метрики

В `/metrics` (Prometheus-формат):

```
app_sse_connections_total <число>
app_sse_projects_subscribed <число>
```

---

## 7) Troubleshooting

### SSE не работает

1. Проверить `GET /health` — сервер отвечает
2. Browser DevTools → Network → фильтр EventStream → проверить соединение к `/api/events/stream`
3. Если `connected: false` в начальном event — проверить `REDIS_URL`
4. Если Redis down — перезапуск: `docker compose restart redis`
5. Polling (Level 1) продолжает работать как fallback

### Cascade не срабатывает

1. Проверить `GET /jobs/scheduler` — downstream job существует и `status = 'active'`
2. Проверить `worker_runs` — есть ли cascade_triggered_by в payload
3. Если `next_run_at` уже в прошлом, cascade не переставит его (это by design)
4. Worker tick интервал: `WORKER_INTERVAL_SECONDS` (по умолчанию 60 сек)

### Redis connection error

1. Проверить `REDIS_URL` в env
2. `docker compose logs redis` — Redis запущен?
3. `redis-cli -u $REDIS_URL ping` — connectivity
4. При полном отказе Redis — система продолжает работать на pg_notify fallback

---

## 8) Зависимости

| Пакет | Версия | Где | Назначение |
|-------|--------|-----|-----------|
| `ioredis` | ^5.x | server | Redis-клиент |
| `EventSource` | built-in | browser | SSE-подключение |

Никаких новых frontend-зависимостей. SSE — нативный API браузера.
