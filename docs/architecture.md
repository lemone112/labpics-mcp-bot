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
