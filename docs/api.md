# API reference (актуально)

Базовые URL:

- для UI: `NEXT_PUBLIC_API_BASE_URL` (обычно `/api`)
- прямой backend: `http://localhost:8080`

Ответы содержат:

- `request_id` в body,
- `x-request-id` в headers.

---

## 1) Доступ и авторизация

Public:

- `GET /health`
- `GET /metrics`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/signup/status`

Остальные маршруты:

- требуют валидную session cookie,
- mutating-запросы требуют CSRF (`x-csrf-token`).

---

## 2) Core endpoints

### Projects

- `GET /projects`
- `POST /projects`
- `POST /projects/:id/select`

### Search / RAG

- `POST /search`
- `GET /contacts`
- `GET /conversations`
- `GET /messages`

### Jobs / Scheduler

- `POST /jobs/chatwoot/sync`
- `POST /jobs/attio/sync`
- `POST /jobs/linear/sync`
- `POST /jobs/embeddings/run`
- `GET /jobs/status`
- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`

---

## 3) Connectors и reliability

- `GET /connectors/state`
- `GET /connectors/errors`
- `POST /connectors/sync`
- `POST /connectors/:name/sync`
- `POST /connectors/errors/retry`

Назначение:

- запуск и диагностика инкрементального синка,
- контроль retry/DLQ по ошибкам интеграций.

---

## 4) KAG v1 (signals/scores/nba)

- `POST /kag/refresh`
- `GET /kag/signals`
- `GET /kag/scores`
- `GET /kag/recommendations`
- `GET /kag/events`

Также доступны legacy:

- `POST /signals/extract`
- `GET /signals`
- `POST /signals/:id/status`
- `GET /nba`
- `POST /nba/:id/status`

---

## 5) KAG v2 (snapshot/similarity/forecast/recommendations lifecycle)

### Snapshots / outcomes

- `POST /kag/snapshots/refresh`
- `GET /kag/snapshots`
- `GET /kag/outcomes`

### Similarity

- `POST /kag/similarity/rebuild`
- `GET /kag/similar-cases`

### Forecasting

- `POST /kag/v2/forecast/refresh`
- `GET /kag/v2/forecast`

### Recommendations v2

- `POST /kag/v2/recommendations/refresh`
- `GET /kag/v2/recommendations`
- `POST /kag/v2/recommendations/:id/status`
- `POST /kag/v2/recommendations/:id/feedback`

---

## 6) CRM / Offers / Analytics / Control Tower

Примеры ключевых групп:

- CRM: `/crm/accounts`, `/crm/opportunities`, `/crm/overview`
- Offers: `/offers`, `/offers/:id/approve-*`
- Digests: `/digests/daily*`, `/digests/weekly*`
- Risk/analytics: `/risk/*`, `/analytics/*`
- Control tower: `/control-tower`, `/portfolio/*`

---

## 7) Замечания по контракту

- API остаётся обратносовместимым для существующих контуров.
- Feature flags могут отключать вычислительные KAG-части без падения API.
- Для production-интеграций опирайтесь на runbooks и scheduler cadence из `docs/pipelines.md`.
