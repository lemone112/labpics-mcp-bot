# Развёртывание и окружения

## 1) Базовая схема

Стек:

- `db` (Postgres + pgvector)
- `redis` (Redis 7) — Pub/Sub для real-time событий (SSE), cache layer
- `server` (Fastify API + scheduler/connectors/lightRAG + SSE endpoint)
- `worker` — фоновый scheduler loop + Redis PUBLISH после завершения задач
- `web` (Next.js с auto-refresh и SSE-подпиской)

## 2) Ключевые env-переменные

### Platform

- `DATABASE_URL`
- `AUTH_CREDENTIALS`
- `CORS_ORIGIN`
- `LIGHTRAG_ONLY=1`

### Integrations

- `CHATWOOT_*`
- `LINEAR_*`
- `ATTIO_*`

### Automation

- `CONNECTOR_MODE`
- `CONNECTOR_MAX_RETRIES`
- `CONNECTOR_RETRY_BASE_SECONDS`
- `CONNECTOR_RECONCILIATION_MIN_COMPLETENESS_PCT`

### Redis и real-time

- `REDIS_URL` — connection string (по умолчанию `redis://redis:6379`)
- `REDIS_PORT` — порт для Docker expose (по умолчанию `6379`)

Redis используется для Pub/Sub (уведомления о завершении задач → SSE push в браузер).
При отсутствии Redis система деградирует к pg_notify + frontend polling.

### Embeddings

- `OPENAI_API_KEY`
- `EMBEDDING_MODEL`
- `EMBED_BATCH_SIZE`

## 3) Миграции

Перед запуском:

1. `cd server`
2. `npm run migrate`

Для LightRAG особенно важны:

- `0009` (connectors state/errors + raw расширения)
- `0014` (external refs для dedupe)
- `0016` (reconciliation metrics)
- `0017` (`lightrag_query_runs`)

## 4) Post-deploy checks

1. `GET /health`
2. `GET /jobs/scheduler`
3. `GET /connectors/state`
4. `GET /lightrag/status`
5. UI login + проектный выбор + `/search` (LightRAG)

6. Redis: `redis-cli -u $REDIS_URL ping` — отвечает PONG.
7. SSE: Browser DevTools → Network → EventStream → `/api/events/stream` — соединение установлено.

## 5) Примечание по legacy routes

В production режиме `LIGHTRAG_ONLY=1`:

- `/kag/*` отключены;
- legacy scheduler jobs, связанные с `/kag/*`, ставятся в `paused`.
