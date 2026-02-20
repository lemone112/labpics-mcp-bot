# Архитектура системы

Обновлено: 2026-02-20

## 1) Архитектурная цель

Система строится вокруг одного интеллектуального контура:

- **HKUDS LightRAG** для knowledge graph + dual-level retrieval (low-level entity extraction + high-level semantic search) по сообщениям, задачам и сделкам. Миграция на HKUDS LightRAG Server с PostgreSQL-бэкендом (Iter 11).
- **Multi-user** поддержка: RBAC, scope-изоляция данных по пользователям и ролям (Iter 49).
- **Встроенный мониторинг**: embedded UI для метрик, здоровья коннекторов и системного состояния — без внешних инструментов типа Grafana (Iter 46).

## 2) Технологический стек

- Backend: `Node.js + Fastify` (`server/`)
- Frontend: `Next.js 16 + React 19` (`web/`)
- Хранилище: `PostgreSQL + pgvector`
- Интеграции: `Chatwoot`, `Linear`, `Attio`
- UI-система: `shadcn/ui + Radix + Tailwind tokens + anime.js`
- Cache / Pub-Sub: `Redis 7` — Pub/Sub для real-time SSE, cascade events
- Real-time: SSE (Server-Sent Events) — `GET /events/stream` — push обновлений в браузер
- Telegram Bot: `TypeScript + Supabase + Composio MCP + Docker` (`telegram-bot/`)
- LightRAG Server (planned): `Python, HKUDS LightRAG, PostgreSQL backend` (Iter 11)
- MCP: `daniel-lightrag-mcp` (22 tools) + Composio MCP (Linear + Attio)

## 3) Компоненты

### Backend

- Session/auth + scope guard + login rate limiting (по IP + username с exponential backoff).
- Connectors: два режима — **HTTP** (нативный sync) и **MCP** (Composio runner). Задаётся через `CONNECTOR_<NAME>_MODE` или `CONNECTOR_MODE`.
- Connector reliability: sync state tracking, DLQ с exponential backoff (base 30s, cap 6h), reconciliation metrics.
- Embeddings/semantic retrieval (`rag_chunks`) с configurable batch (`EMBED_BATCH_SIZE`), stale recovery, IVFFlat/HNSW tuning.
- LightRAG endpoints (основной сервис — `lightrag.js`):
  - `POST /lightrag/query` — tokenized vector + ILIKE поиск, evidence building, query observability
  - `POST /lightrag/refresh` — embeddings + status
  - `GET /lightrag/status` — embedding counts + source counts
- Scheduler/worker с cascade triggers.
- Storage budget monitoring (`STORAGE_BUDGET_GB`) в `/jobs/status`.
- Prometheus-формат метрики: `GET /metrics`.

### Frontend

- Control Tower (6 секций), Jobs, Search(LightRAG), CRM, Offers, Digests, Analytics.
- Единая компонентная система без page-specific кастомных UI-слоёв.
- Real-time auto-refresh через SSE (Redis Pub/Sub → `GET /events/stream`).

### Архитектурная диаграмма

```
                    ┌─────────────────────────────────────────┐
                    │              FRONTEND (Next.js 16)       │
                    │  Control Tower · Portfolio · Search · CRM │
                    │  Signals · Analytics · Offers · System   │
                    │  Reports · Team · Settings                │
                    └────────────────┬────────────────────────┘
                                     │ REST API + SSE
                    ┌────────────────▼────────────────────────┐
                    │              BACKEND (Fastify v5)        │
                    │                                          │
                    │  ┌─── Routes ──┐  ┌── Middleware ─────┐  │
                    │  │ /api/*      │  │ auth · csrf · req │  │
                    │  │ /connectors │  │ scope · rbac      │  │
                    │  │ /lightrag   │  └───────────────────┘  │
                    │  │ /system     │                         │
                    │  └─────────────┘                         │
                    │                                          │
                    │  ┌─── Services ──────────────────────┐   │
                    │  │ lightrag · embeddings · signals    │   │
                    │  │ portfolio · identity · intelligence│   │
                    │  │ connectors · offers · crm · outbox │   │
                    │  │ redis-pubsub · sse-broadcaster     │   │
                    │  │ monitoring · reporting · users      │   │
                    │  └───────────────────────────────────┘   │
                    │                                          │
                    │  ┌─── Scheduler ─────────────────────┐   │
                    │  │ 15min sync · 5min retry · daily    │   │
                    │  │ pipeline · weekly digest · reports  │   │
                    │  │ cascade triggers · Redis PUBLISH   │   │
                    │  └───────────────────────────────────┘   │
                    └───────┬───────────────┬────────────────┘
                            │               │
               ┌────────────▼──┐    ┌───────▼──────┐
               │  PostgreSQL 16 │    │   Redis 7    │
               │  + pgvector    │    │  Pub/Sub +   │
               │  + pg_trgm     │    │  cache       │
               └──────┬────────┘    └──────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
  ┌──────▼──┐  ┌──────▼──┐  ┌─────▼────┐
  │ Chatwoot │  │  Linear  │  │  Attio   │
  └─────────┘  └─────────┘  └──────────┘

  ┌───────────────────────────────────────┐
  │           TELEGRAM BOT                 │
  │  TypeScript · Supabase · Docker        │
  │  ┌──────────┐  ┌──────────────────┐   │
  │  │ Composio  │  │ LightRAG MCP     │   │
  │  │ MCP       │  │ (daniel-lightrag)│   │
  │  └──────────┘  └──────────────────┘   │
  │  + Whisper voice (planned)             │
  └───────────────────────────────────────┘
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

### 4.4 Telegram Bot

1. Пользователь отправляет сообщение боту.
2. Intent detection определяет тип запроса.
3. Маршрутизация:
   - Composio MCP — операции с Linear (задачи, циклы) и Attio (сделки, контакты).
   - LightRAG MCP (`daniel-lightrag-mcp`) — семантический поиск по базе знаний.
4. Формирование ответа и отправка пользователю.

### 4.5 Monitoring

1. Scheduler собирает метрики: время выполнения задач, статусы коннекторов, ошибки.
2. Connector health: статус синхронизации, DLQ размер, latency.
3. Отображение на странице System UI (embedded, без Grafana).

### 4.6 Reporting

1. Scheduled report generation по расписанию (daily, weekly).
2. Шаблоны отчётов (templates) применяются к текущим данным.
3. Результат сохраняется как snapshot.
4. Просмотр через viewer UI на фронтенде (Reports).

## 5) Связанные документы

- Platform invariants: [`docs/platform-architecture.md`](./platform-architecture.md)
- Data model: [`docs/data-model.md`](./data-model.md)
- Pipelines: [`docs/pipelines.md`](./pipelines.md)
- API: [`docs/api.md`](./api.md)
- Единый план: [`docs/iteration-plan-wave3.md`](./iteration-plan-wave3.md)
- Telegram Bot: [`telegram-bot/docs/`](../telegram-bot/docs/)
