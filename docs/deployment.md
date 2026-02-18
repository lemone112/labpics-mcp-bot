# Развёртывание и окружения

## 1) Базовая схема

Стек:

- `db` (Postgres + pgvector)
- `server` (Fastify API + scheduler/connectors/lightRAG)
- `web` (Next.js)

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

## 5) Примечание по KAG

В production режиме `LIGHTRAG_ONLY=1`:

- `/kag/*` отключены;
- KAG-heavy scheduler jobs ставятся в `paused`.
