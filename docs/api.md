# API reference (LightRAG-only)

Базовый backend URL: `http://localhost:8080`  
UI обычно ходит через `NEXT_PUBLIC_API_BASE_URL` (например `/api`).

Каждый ответ содержит:

- `request_id` в теле
- `x-request-id` в заголовке

## 1) Auth/session

Public:

- `GET /health`
- `GET /metrics`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Protected routes требуют:

- session cookie
- CSRF header (`x-csrf-token`) для mutating методов

## 2) Projects

- `GET /projects`
- `POST /projects`
- `POST /projects/:id/select`

## 3) LightRAG

- `POST /lightrag/query`
  - body: `{ query: string, topK?: number, sourceLimit?: number }`
  - response: `answer`, `chunks`, `evidence`, `stats`
- `POST /lightrag/refresh`
  - запускает embeddings refresh + возвращает статус
- `GET /lightrag/status`
  - показывает состояния embeddings и объёмы source-данных

Legacy compatibility:

- `POST /search` работает как alias к LightRAG query (`mode: "lightrag"` в ответе).

## 4) Connectors / reliability

- `GET /connectors/state`
- `GET /connectors/errors`
- `GET /connectors/reconciliation`
- `POST /connectors/reconciliation/run`
- `POST /connectors/sync`
- `POST /connectors/:name/sync`
- `POST /connectors/errors/retry`

## 5) Jobs / scheduler

- `POST /jobs/chatwoot/sync`
- `POST /jobs/attio/sync`
- `POST /jobs/linear/sync`
- `POST /jobs/embeddings/run`
- `GET /jobs/status`
- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`

### Real-time (SSE)

- `GET /events/stream` — Server-Sent Events stream (требует session cookie)
  - Event type: `connected` (при установке соединения)
  - Event type: `job_completed` (при завершении любой scheduler задачи)
  - Heartbeat: каждые 30 сек (`: heartbeat\n\n`)
  - Scope: project_id из активной сессии
  - Не требует CSRF (GET запрос)

## 6) Control Tower / product surfaces

- Portfolio: `/portfolio/overview`, `/portfolio/messages`
- CRM: `/crm/accounts`, `/crm/opportunities`, `/crm/overview`
- Offers: `/offers`, `/offers/:id/approve-*`
- Digests: `/digests/daily*`, `/digests/weekly*`
- Analytics: `/analytics/*`, `/risk/*`

## 7) Запрещённые legacy маршруты

- `/kag/*` не входят в текущий API-контракт для разработки.
- В runtime они возвращают `410 kag_disabled`.
- Любые новые интеграции должны использовать только LightRAG и operational endpoints.

См. также:

- [`docs/pipelines.md`](./pipelines.md)
- [`docs/runbooks.md`](./runbooks.md)
