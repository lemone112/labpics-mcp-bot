# Развёртывание и окружения

## 1) Базовая схема деплоя

Приложение разворачивается как Docker Compose стек:

- **Postgres (pgvector)** — единый storage для app + RAG + KAG.
- **server** — Fastify API, scheduler/jobs, connectors, KAG pipelines.
- **web** — Next.js интерфейс.

---

## 2) Окружения

- **dev/staging**: быстрые итерации, проверка миграций и фоновых циклов.
- **prod**: деплой через CI/CD с контролем переменных и health-check.

---

## 3) Критичные переменные окружения

### Платформа

- `DATABASE_URL`
- `SESSION_SECRET`
- `CORS_ORIGIN`

### Интеграции

- Chatwoot: `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`
- Linear: `LINEAR_BASE_URL`, `LINEAR_API_TOKEN`, `LINEAR_WORKSPACE_ID`
- Attio: `ATTIO_BASE_URL`, `ATTIO_API_TOKEN`, `ATTIO_WORKSPACE_ID`

### Connector automation

- `CONNECTOR_MODE` (`http` / `mcp`)
- `CONNECTOR_MAX_RETRIES`
- `CONNECTOR_RETRY_BASE_SECONDS`
- `KAG_EVENT_LOG_LOOKBACK_DAYS`

### KAG feature flags

- `KAG_ENABLED`
- `RECOMMENDATIONS_ENABLED` (legacy recommendations)
- `KAG_SNAPSHOTS_ENABLED`
- `KAG_FORECASTING_ENABLED`
- `KAG_RECOMMENDATIONS_V2_ENABLED`
- `RECOMMENDATIONS_V2_LLM_TOP_N`

---

## 4) Миграции

Перед запуском приложения обязательно применить миграции:

1. `cd server`
2. `npm run migrate`

Ключевые миграции для текущего продуктового контура:

- `0008` — KAG v1 graph/signals/scores/recommendations
- `0009` — connectors state/errors + event log + raw extensions
- `0010` — project snapshots + past outcomes
- `0011` — case signatures
- `0012` — forecasts + recommendations v2
- `0013` — process events + evidence gating

---

## 5) Post-deploy checks

1. `GET /health` — backend доступен.
2. `GET /jobs/scheduler` — scheduler расписание корректно загружено.
3. `GET /connectors/state` — коннекторы не в fail-loop.
4. `GET /kag/events` — process events пишутся.
5. В UI: доступен login и проектный контур.

---

## 6) Эксплуатация

- runbooks: [`docs/runbooks.md`](./runbooks.md)
- пайплайны: [`docs/pipelines.md`](./pipelines.md)
- модель данных: [`docs/data-model.md`](./data-model.md)
