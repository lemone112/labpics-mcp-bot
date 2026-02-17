# Архитектура системы (актуальная, web-first + data-first)

## 1) Цели архитектуры

Система строится вокруг двух контуров:

1. **RAG-контур** — быстрый retrieval по коммуникациям/докам с evidence.
2. **KAG-контур** — граф знаний, события, сигналы, скоринги, similarity, прогнозы и рекомендации.

Ключевой принцип: все выводы должны быть объяснимы и привязаны к источникам.

---

## 2) Технологический стек

- **Backend**: Node.js + Fastify (`server/`)
- **Frontend**: Next.js (`web/`)
- **База данных**: PostgreSQL + `pgvector`
- **Миграции**: SQL миграции в `server/db/migrations`
- **Интеграции**: Chatwoot / Linear / Attio
  - режимы connector: HTTP (текущий) и MCP-ready абстракция
- **LLM/OpenAI**:
  - embeddings для RAG
  - ограниченное применение в KAG (extraction/templates)

---

## 3) Высокоуровневые компоненты

### Backend (`server/`)

- REST API (авторизация, CRUD, jobs, KAG endpoints)
- Scheduler/worker loop
- Sync services для внешних источников
- RAG services (chunking/embeddings/search)
- KAG services:
  - graph/events/signals/scores
  - snapshots/outcomes
  - similarity
  - forecasting
  - recommendations v2

### Frontend (`web/`)

- Контрольная панель, portfolio, сигналы, риски, рекомендации.

### Data layer (Postgres)

- scoped data-модель (`project_id`, `account_scope_id`)
- row-level consistency через trigger `enforce_project_scope_match`
- event/log/history таблицы для explainability.

---

## 4) Основные data-flows

### 4.1 Ingest (Connector cycle)

1. `connectors_sync_cycle` (каждые ~15 мин):
   - синхронизирует Chatwoot/Linear/Attio инкрементально
   - обновляет `connector_sync_state`
   - пишет ошибки в `connector_errors` (retry/backoff)
2. `connector_errors_retry` (каждые ~5 мин):
   - перезапускает только due-ошибки по конкретному connector

### 4.2 RAG flow

1. сообщения/документы -> `rag_chunks`
2. embeddings job -> `embedding_status=ready`
3. search endpoint возвращает evidence-backed результаты

### 4.3 KAG operational flow

1. source facts -> `kag_event_log`
2. signals/scores обновляются детерминированно
3. daily snapshot -> `project_snapshots` + outcomes
4. weekly signatures -> `case_signatures`
5. forecast -> `kag_risk_forecasts`
6. recommendations v2 -> `recommendations_v2`

---

## 5) Автоматизации и scheduling

Рекомендуемая частота:

- 15 минут: общий sync коннекторов
- 5 минут: retry по connector errors
- 1 раз в сутки: daily KAG pipeline (snapshot -> forecast -> recommendations)
- 1 раз в неделю: пересборка similarity signatures

Все этапы логируются в `kag_event_log` (`process_started/process_finished/process_failed/process_warning`) с длительностями и счётчиками.

---

## 6) Scope и безопасность данных

Для всех доменных записей соблюдается strict scoping:

- `project_id` обязателен
- `account_scope_id` обязателен
- cross-scope write запрещён триггером

На API уровне:

- для protected endpoints нужна сессия
- активный проект резолвится через session
- mutating requests требуют CSRF.

---

## 7) Explainability и quality gates

- Любые производные сущности должны содержать `evidence_refs`.
- Snapshot/forecast/recommendation без evidence:
  - помечаются `publishable=false` или отфильтровываются из primary выдачи,
  - фиксируется warning в `kag_event_log`.
- Рекомендации принимаются deterministic rules + stats, не LLM-решениями.

---

## 8) Смежные документы

- Платформенные инварианты: [`docs/platform-architecture.md`](./platform-architecture.md)
- Модель БД: [`docs/data-model.md`](./data-model.md)
- Пайплайны/расписание: [`docs/pipelines.md`](./pipelines.md)
- KAG v2: [`docs/kag_forecasting_recommendations.md`](./kag_forecasting_recommendations.md)
