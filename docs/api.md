# API reference

Обновлено: 2026-02-20


Базовый backend URL: `http://localhost:8080`
UI обычно ходит через `NEXT_PUBLIC_API_BASE_URL` (например `/api`).

Каждый ответ содержит:

- `request_id` в теле
- `x-request-id` в заголовке

## 1) Auth / session

Public:

- `GET /health` — service health check
- `GET /metrics` — Prometheus-формат метрики:
  - `app_requests_total`, `app_responses_total`, `app_errors_total`
  - `app_status_2xx`, `app_status_4xx`, `app_status_5xx`
  - `app_sse_connections_total`, `app_sse_projects_subscribed`
- `POST /auth/login` — вход (rate-limited: макс. попытки по IP + username с окном сброса)
- `POST /auth/logout` — очистка сессии и cookies
- `GET /auth/me` — текущий пользователь + CSRF токен
- `GET /auth/signup/status` — статус регистрации (disabled, возвращает 410)
- `POST /auth/signup/start` — начало регистрации (disabled, возвращает 410)
- `POST /auth/signup/confirm` — подтверждение регистрации (disabled, возвращает 410)
- `POST /auth/telegram/webhook` — Telegram webhook (disabled, возвращает 410)

Protected routes требуют:

- session cookie (`lp_session`, httpOnly, SameSite=lax, maxAge 14 дней)
- CSRF header (`x-csrf-token`) для mutating методов (timing-safe сравнение)

Конфиг auth: `AUTH_CREDENTIALS` (user:pass) или отдельно `AUTH_USERNAME` + `AUTH_PASSWORD`.

## 2) Projects [PROTECTED]

- `GET /projects` [PROTECTED] — список проектов
- `POST /projects` [PROTECTED] — создание проекта
- `POST /projects/:id/select` [PROTECTED] — переключение активного проекта сессии

## 3) LightRAG [PROTECTED]

- `POST /lightrag/query` [PROTECTED]
  - body: `{ query: string, topK?: number, sourceLimit?: number }`
  - response: `answer`, `chunks`, `evidence`, `entities`, `stats`
  - Внутренняя логика:
    - Токенизация запроса: split по не-alphanumeric символам (включая кириллицу), фильтр по длине >= 3, дедуп, max 6 токенов
    - Параллельный поиск: vector similarity по `rag_chunks` + ILIKE по `cw_messages`, `linear_issues_raw`, `attio_opportunities_raw`
    - Evidence: до 50 элементов из всех источников, объединённых с metadata
    - Limits: query max 4000 chars, topK 1-50 (default 10), sourceLimit 1-25 (default 8)
    - Каждый запрос логируется в `lightrag_query_runs` (observability)
- `POST /lightrag/refresh` [PROTECTED] — запуск embeddings refresh
- `GET /lightrag/status` [PROTECTED] — состояния embeddings (`pending/processing/ready/failed` counts) и объёмы source-данных
- `POST /lightrag/feedback` [PROTECTED] — обратная связь по результатам RAG-запроса

Legacy compatibility:

- `POST /search` [PROTECTED] — alias к LightRAG query (`mode: "lightrag"` в ответе).

## 4) Connectors / reliability [PROTECTED]

- `GET /connectors/state` [PROTECTED] — состояние sync по коннекторам
- `GET /connectors/errors` [PROTECTED] — список ошибок с фильтрацией
- `GET /connectors/reconciliation` [PROTECTED] — записи reconciliation
- `GET /connectors/reconciliation/diff` [PROTECTED] — diff полноты данных между источниками
- `POST /connectors/reconciliation/run` [PROTECTED] — запуск ручного reconciliation
- `POST /connectors/sync` [PROTECTED] — синхронизация всех коннекторов
- `POST /connectors/:name/sync` [PROTECTED] — синхронизация конкретного коннектора
- `POST /connectors/errors/retry` [PROTECTED] — повтор ошибок
- `GET /connectors/errors/dead-letter` [PROTECTED] — список dead-letter ошибок
- `POST /connectors/errors/dead-letter/:id/retry` [PROTECTED] — повтор конкретной dead-letter ошибки

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

## 6) Signals / Identity / NBA [PROTECTED]

### Identity Graph

- `POST /identity/suggestions/preview` [PROTECTED] — предпросмотр предложений по связыванию
- `GET /identity/suggestions` [PROTECTED] — список предложений identity links
- `POST /identity/suggestions/apply` [PROTECTED] — применение принятых связей
- `GET /identity/links` [PROTECTED] — установленные identity links

### Signals

- `POST /signals/extract` [PROTECTED] — извлечение сигналов и NBA из данных
- `GET /signals` [PROTECTED] — список сигналов (фильтр по status/severity)
- `POST /signals/:id/status` [PROTECTED] — обновление статуса сигнала

### Next Best Actions (NBA)

- `GET /nba` [PROTECTED] — список NBA
- `POST /nba/:id/status` [PROTECTED] — обновление статуса NBA

### Upsell Radar

- `POST /upsell/radar/refresh` [PROTECTED] — обновление детекции возможностей допродажи
- `GET /upsell/radar` [PROTECTED] — список upsell-возможностей
- `POST /upsell/:id/status` [PROTECTED] — обновление статуса upsell

### Continuity

- `POST /continuity/preview` [PROTECTED] — предпросмотр continuity-действий
- `GET /continuity/actions` [PROTECTED] — список continuity-действий
- `POST /continuity/apply` [PROTECTED] — применение continuity-действий

## 7) CRM [PROTECTED]

- `GET /crm/accounts` [PROTECTED] — список аккаунтов с пагинацией
- `POST /crm/accounts` [PROTECTED] — создание аккаунта
- `GET /crm/opportunities` [PROTECTED] — список возможностей (фильтр по stage)
- `POST /crm/opportunities` [PROTECTED] — создание возможности
- `POST /crm/opportunities/:id/stage` [PROTECTED] — обновление стадии + событие
- `GET /crm/overview` [PROTECTED] — обзор CRM (account count, opportunities by stage)

## 8) Offers [PROTECTED]

- `GET /offers` [PROTECTED] — список офферов с пагинацией
- `POST /offers` [PROTECTED] — создание оффера (auto-status по discount)
- `POST /offers/:id/approve-discount` [PROTECTED] — утверждение скидки
- `POST /offers/:id/approve-send` [PROTECTED] — утверждение отправки

## 9) Outbound [PROTECTED]

- `GET /outbound` [PROTECTED] — список исходящих сообщений (фильтр по status)
- `POST /outbound/draft` [PROTECTED] — создание черновика
- `POST /outbound/:id/approve` [PROTECTED] — утверждение сообщения
- `POST /outbound/:id/send` [PROTECTED] — отправка утверждённого сообщения
- `POST /outbound/opt-out` [PROTECTED] — создание/обновление opt-out политики
- `POST /outbound/process` [PROTECTED] — обработка due-сообщений
- `POST /loops/sync` [PROTECTED] — синхронизация контактов в Loops

## 10) Intelligence / Control Tower [PROTECTED]

- `GET /control-tower` [PROTECTED] — данные control tower (cached)
- `GET /portfolio/overview` [PROTECTED] — мульти-проектный портфельный обзор (cached)
- `GET /portfolio/messages` [PROTECTED] — сообщения портфеля по проекту/контакту
- `POST /digests/daily/generate` [PROTECTED] — генерация ежедневного дайджеста
- `GET /digests/daily` [PROTECTED] — список ежедневных дайджестов
- `POST /digests/weekly/generate` [PROTECTED] — генерация еженедельного дайджеста
- `GET /digests/weekly` [PROTECTED] — список еженедельных дайджестов
- `POST /risk/refresh` [PROTECTED] — обновление рисков и паттернов здоровья
- `GET /risk/overview` [PROTECTED] — обзор рисков
- `POST /analytics/refresh` [PROTECTED] — обновление аналитики за период
- `GET /analytics/overview` [PROTECTED] — обзор аналитики
- `GET /analytics/drilldown` [PROTECTED] — drill-down к evidence по источнику

## 11) Data [PROTECTED]

- `GET /contacts` [PROTECTED] — список контактов (поиск по name/email/phone)
- `GET /conversations` [PROTECTED] — список диалогов
- `GET /messages` [PROTECTED] — список сообщений (фильтр по conversation)

## 12) Audit / Evidence [PROTECTED]

- `GET /audit` [PROTECTED] — аудит-лог событий проекта
- `GET /evidence/search` [PROTECTED] — полнотекстовый поиск по evidence

## 13) API Keys [PROTECTED]

- `GET /api-keys` [PROTECTED] — список API-ключей проекта
- `POST /api-keys` [PROTECTED] — создание ключа (scopes, expires_at)
- `POST /api-keys/revoke` [PROTECTED] — отзыв ключа

## 14) Удалённые legacy маршруты

Маршруты `/kag/*` были полностью удалены из кодовой базы (Iter 10).
Код, роуты и связанные scheduler jobs удалены. Любые новые интеграции
используют только LightRAG и operational endpoints.

## 15) Planned Endpoints (Wave 3)

Следующие endpoints запланированы в Iter 44–51. Source of truth: [`docs/iteration-plan-wave3.md`](./iteration-plan-wave3.md).

### Multi-User & Auth (Iter 49)

- `GET /users` [PROTECTED, OWNER] — список пользователей
- `POST /users` [PROTECTED, OWNER] — создание пользователя
- `POST /users/:id/role` [PROTECTED, OWNER] — назначение роли
- `GET /users/:id/projects` [PROTECTED] — проекты пользователя
- `POST /projects/:id/assign` [PROTECTED, OWNER] — назначение PM на проект

### System Monitoring (Iter 46)

- `GET /system/health` [PROTECTED] — расширенный health (service status cards)
- `GET /system/jobs` [PROTECTED] — job dashboard (runs + sparklines)
- `GET /system/connectors/timeline` [PROTECTED] — connector sync timeline
- `GET /system/alerts` [PROTECTED] — alert history feed
- `GET /system/logs` [PROTECTED] — recent error logs

### Reporting (Iter 48)

- `GET /reports` [PROTECTED] — список отчётов
- `POST /reports/generate` [PROTECTED] — генерация отчёта по шаблону
- `GET /reports/:id` [PROTECTED] — конкретный отчёт (snapshot)
- `GET /reports/templates` [PROTECTED] — доступные шаблоны

### Scheduler (Iter 44)

- `GET /scheduler/metrics` [PROTECTED] — job duration metrics (histogram)
- `GET /scheduler/dead-jobs` [PROTECTED] — dead job list
- `POST /scheduler/dead-jobs/:id/cleanup` [PROTECTED] — cleanup dead job

---

Всего: **87 реализованных эндпоинтов** (80 protected, 7 public) + **16 запланированных** (Wave 3).

См. также:

- [`docs/pipelines.md`](./pipelines.md)
- [`docs/runbooks.md`](./runbooks.md)
- [`docs/iteration-plan-wave3.md`](./iteration-plan-wave3.md) — Wave 3 plan
