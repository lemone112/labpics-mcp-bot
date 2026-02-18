# Архитектура системы (LightRAG-only)

## 1) Архитектурная цель

Система строится вокруг одного интеллектуального контура:

- **LightRAG** для retrieval-контекста по сообщениям, задачам и сделкам.

Любые маршруты и фичи, завязанные на `/kag/*`, не являются частью текущего контракта разработки.

## 2) Технологический стек

- Backend: `Node.js + Fastify` (`server/`)
- Frontend: `Next.js 16 + React 19` (`web/`)
- Хранилище: `PostgreSQL + pgvector`
- Интеграции: `Chatwoot`, `Linear`, `Attio`
- UI-система: `shadcn/ui + Radix + Tailwind tokens + anime.js`
- Cache / Pub-Sub: `Redis 7` — Pub/Sub для real-time SSE, cascade events
- Real-time: SSE (Server-Sent Events) — `GET /events/stream` — push обновлений в браузер

## 3) Компоненты

### Backend

- Session/auth + scope guard.
- Connectors sync + retry + reconciliation.
- Embeddings/semantic retrieval (`rag_chunks`).
- LightRAG endpoints:
  - `POST /lightrag/query`
  - `POST /lightrag/refresh`
  - `GET /lightrag/status`
- Scheduler/worker.

### Frontend

- Control Tower (6 секций), Jobs, Search(LightRAG), CRM, Offers, Digests, Analytics.
- Единая компонентная система без page-specific кастомных UI-слоёв.
- Real-time auto-refresh через SSE (Redis Pub/Sub → `GET /events/stream`).

### Архитектурная диаграмма

```
                    ┌─────────────────────────────────────────┐
                    │              FRONTEND (Next.js)          │
                    │  Dashboard · Portfolio · Recommendations │
                    │  Signals · Forecasts · CRM · Settings    │
                    └────────────────┬────────────────────────┘
                                     │ REST API
                    ┌────────────────▼────────────────────────┐
                    │              BACKEND (Fastify v5)           │
                    │                                          │
                    │  ┌─── Routes ──┐  ┌── Middleware ─────┐  │
                    │  │ /api/*      │  │ auth · csrf · req │  │
                    │  │ /kag/*      │  │ scope · error     │  │  ← legacy prefix
                    │  │ /connectors │  └───────────────────┘  │
                    │  └─────────────┘                         │
                    │                                          │
                    │  ┌─── Services ──────────────────────┐   │
                    │  │ kag · forecasting · recommendations│   │
                    │  │ portfolio · identity · campaigns   │   │
                    │  │ connectors · rag · offers · crm    │   │
                    │  │ redis-pubsub · sse-broadcaster     │   │
                    │  └───────────────────────────────────┘   │
                    │                                          │
                    │  ┌─── Intelligence Engine ────────────┐   │
                    │  │ ingest · graph · signals · scoring  │   │
                    │  │ recommendations · templates         │   │
                    │  └────────────────────────────────────┘   │
                    │                                          │
                    │  ┌─── Scheduler ─────────────────────┐   │
                    │  │ 15min sync · 5min retry · daily    │   │
                    │  │ pipeline · weekly signatures       │   │
                    │  │ cascade triggers · Redis PUBLISH   │   │
                    │  └───────────────────────────────────┘   │
                    └────────────────┬────────────────────────┘
                                     │
                    ┌────────────────▼────────────────────────┐
                    │         PostgreSQL 16 + pgvector          │
                    │  79 tables · 17 migrations · triggers    │
                    │  IVFFlat/HNSW · GIN · scope guards       │
                    └──────────┬──────────┬──────────┬────────┘
                               │          │          │
                    ┌──────────▼┐  ┌──────▼──┐  ┌───▼───────┐
                    │  Chatwoot  │  │  Linear  │  │   Attio   │
                    │ messages   │  │  issues  │  │   deals   │
                    │ contacts   │  │  cycles  │  │  accounts │
                    └────────────┘  └─────────┘  └───────────┘
```

### База данных

- Единый scope-контур (`project_id`, `account_scope_id`).
- Raw-таблицы источников + CRM mirror + RAG tables.
- Audit/operational telemetry.

## 4) Основные потоки

### 4.1 Ingest

1. `connectors_sync_cycle` (15 мин): ingest + upsert + cursor state.
2. `connector_errors_retry` (5 мин): точечные ретраи по due ошибкам.

### 4.2 LightRAG

1. Source data -> `rag_chunks` (pending).
2. `embeddings_run` -> `embedding_status=ready`.
3. `POST /lightrag/query`:
   - vector retrieval из `rag_chunks`,
   - source lookup в `cw_messages`, `linear_issues_raw`, `attio_opportunities_raw`,
   - ответ + evidence.

### 4.3 UI observability

- Dashboard показывает operational metrics + sync completeness.
- Jobs/Connectors дают диагностику пайплайна.

## 5) LightRAG-only guardrails

- При `LIGHTRAG_ONLY=1` маршруты `/kag/*` отключены (`410 kag_disabled`).
- Legacy scheduler jobs, связанные с `/kag/*`, автоматически переводятся в `paused`.
- Frontend не использует `/kag/*`.

## 6) Связанные документы

- Platform invariants: [`docs/platform-architecture.md`](./platform-architecture.md)
- Data model: [`docs/data-model.md`](./data-model.md)
- Pipelines: [`docs/pipelines.md`](./pipelines.md)
- API: [`docs/api.md`](./api.md)
