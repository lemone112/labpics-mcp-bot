# API reference (LightRAG-only)

Базовый backend URL: `http://localhost:8080`  
UI обычно ходит через `NEXT_PUBLIC_API_BASE_URL` (например `/api`).

Каждый ответ содержит:

- `request_id` в теле
- `x-request-id` в заголовке

## 1) Auth/session

Public:

- `GET /health` — service health check
- `GET /metrics` — Prometheus-формат метрики:
  - `app_requests_total`, `app_responses_total`, `app_errors_total`
  - `app_status_2xx`, `app_status_4xx`, `app_status_5xx`
  - `app_sse_connections_total`, `app_sse_projects_subscribed`
- `POST /auth/login` — вход (rate-limited: макс. попытки по IP + username с окном сброса)
- `POST /auth/logout`
- `GET /auth/me`

Protected routes требуют:

- session cookie (`lp_session`, httpOnly, SameSite=lax, maxAge 14 дней)
- CSRF header (`x-csrf-token`) для mutating методов (timing-safe сравнение)

Конфиг auth: `AUTH_CREDENTIALS` (user:pass) или отдельно `AUTH_USERNAME` + `AUTH_PASSWORD`.

## 2) Projects [PROTECTED]

- `GET /projects` [PROTECTED]
- `POST /projects` [PROTECTED]
- `POST /projects/:id/select` [PROTECTED]

## 3) LightRAG [PROTECTED]

- `POST /lightrag/query` [PROTECTED]
  - body: `{ query: string, topK?: number, sourceLimit?: number }`
  - response: `answer`, `chunks`, `evidence`, `entities`, `stats`
  - Внутренняя логика:
    - Токенизация запроса: split по не-alphanumeric символам (включая кириллицу), фильтр по длине ≥ 3, дедуп, max 6 токенов
    - Параллельный поиск: vector similarity по `rag_chunks` + ILIKE по `cw_messages`, `linear_issues_raw`, `attio_opportunities_raw`
    - Evidence: до 50 элементов из всех источников, объединённых с metadata
    - Limits: query max 4000 chars, topK 1-50 (default 10), sourceLimit 1-25 (default 8)
    - Каждый запрос логируется в `lightrag_query_runs` (observability)
- `POST /lightrag/refresh` [PROTECTED]
  - запускает embeddings refresh + возвращает статус
- `GET /lightrag/status` [PROTECTED]
  - показывает состояния embeddings (`pending/processing/ready/failed` counts) и объёмы source-данных

Legacy compatibility:

- `POST /search` [PROTECTED] работает как alias к LightRAG query (`mode: "lightrag"` в ответе).

## 4) Connectors / reliability [PROTECTED]

- `GET /connectors/state` [PROTECTED]
- `GET /connectors/errors` [PROTECTED]
- `GET /connectors/reconciliation` [PROTECTED]
- `POST /connectors/reconciliation/run` [PROTECTED]
- `POST /connectors/sync` [PROTECTED]
- `POST /connectors/:name/sync` [PROTECTED]
- `POST /connectors/errors/retry` [PROTECTED]

## 5) Jobs / scheduler [PROTECTED]

- `POST /jobs/chatwoot/sync` [PROTECTED]
- `POST /jobs/attio/sync` [PROTECTED]
- `POST /jobs/linear/sync` [PROTECTED]
- `POST /jobs/embeddings/run` [PROTECTED]
- `GET /jobs/status` [PROTECTED] — агрегированный ответ:
  - `jobs` — последний run по каждому job_name
  - `rag_counts` — количество chunks по статусам (pending/processing/ready/failed)
  - `entities` — counts по contacts, conversations, messages, rag_chunks
  - `storage` — database_bytes, scoped_logical_bytes, budget_bytes (`STORAGE_BUDGET_GB`, default 20), usage_percent
  - `watermarks` — последние 5 sync watermarks
- `GET /jobs/scheduler` [PROTECTED]
- `POST /jobs/scheduler/tick` [PROTECTED]

### Real-time (SSE)

- `GET /events/stream` [PROTECTED] — Server-Sent Events stream (требует session cookie)
  - Event type: `connected` (при установке соединения)
  - Event type: `job_completed` (при завершении любой scheduler задачи)
  - Heartbeat: каждые 30 сек (`: heartbeat\n\n`)
  - Scope: project_id из активной сессии
  - Не требует CSRF (GET запрос)

## 6) Control Tower / product surfaces [PROTECTED]

- Portfolio: `/portfolio/overview` [PROTECTED], `/portfolio/messages` [PROTECTED]
- CRM: `/crm/accounts` [PROTECTED], `/crm/opportunities` [PROTECTED], `/crm/overview` [PROTECTED]
- Offers: `/offers` [PROTECTED], `/offers/:id/approve-*` [PROTECTED]
- Digests: `/digests/daily*` [PROTECTED], `/digests/weekly*` [PROTECTED]
- Analytics: `/analytics/*` [PROTECTED], `/risk/*` [PROTECTED]

## 7) Удалённые legacy маршруты

Маршруты `/kag/*` были полностью удалены из кодовой базы (Iter 10).
Код, роуты и связанные scheduler jobs удалены. Любые новые интеграции
используют только LightRAG и operational endpoints.

См. также:

- [`docs/pipelines.md`](./pipelines.md)
- [`docs/runbooks.md`](./runbooks.md)
