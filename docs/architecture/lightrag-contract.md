# Intelligence Layer Contract (нормативный документ)

> Обновлено: 2026-02-20 (post Iter 10 cleanup, KAG fully removed)

Этот документ обязателен к исполнению при любой разработке в репозитории.

## 1) Архитектурный контекст

Продукт использует **custom hybrid RAG** реализацию (`server/src/services/lightrag.js`):
- **Vector search** через pgvector (OpenAI embeddings)
- **Keyword search** через ILIKE + pg_trgm GIN indexes
- **4 источника**: rag_chunks, cw_messages, linear_issues_raw, attio_opportunities_raw

**Примечание:** Внутреннее название "LightRAG" — это custom реализация, НЕ [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) (knowledge graph + dual-level retrieval).

## 2) Scope контракта

Контракт распространяется на:

- backend API;
- frontend UI;
- docs/specs;
- CI и operational workflows.

## 3) Обязательные правила (MUST)

1. Продуктовый интеллект-контур = **только custom hybrid RAG** (endpoints `/lightrag/*`).
2. KAG pipeline **полностью удалён** (Iter 10): routes, modules, scheduler jobs, DB-таблицы.
3. Frontend **MUST** использовать только:
   - `POST /lightrag/query`
   - `POST /search` (compatibility alias).
4. Таблица `kag_event_log` переименована в `connector_events` (migration 0021).
5. Любой PR, добавляющий зависимость от удалённого KAG кода, считается нарушением контракта.
6. При миграции на HKUDS LightRAG (Iter 11) **обязательна** ACL-фильтрация по `project_id` и `user_role` (Owner видит всё, PM — свои проекты).

## 4) API Endpoints (intelligence layer)

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/lightrag/query` | POST | Основной поисковый запрос (vector + keyword) |
| `/lightrag/status` | GET | Статус embeddings и источников |
| `/lightrag/refresh` | POST | Trigger embedding refresh |
| `/lightrag/feedback` | POST | Feedback на результаты (rating + comment) |
| `/search` | POST | Compatibility alias для /lightrag/query |
| `/lightrag/ingest` | POST | **Planned (Iter 11)** — будет заменён на LightRAG `/documents` API |

## 5) API Schema (Spec 0018)

### Query request

```json
{
  "query": "string, required",
  "topK": 10,
  "sourceLimit": 8,
  "sourceFilter": ["messages", "issues", "deals", "chunks"]
}
```

### Query response

```json
{
  "query": "string",
  "topK": 10,
  "query_run_id": 123,
  "quality_score": 75,
  "source_diversity": 3,
  "answer": "string",
  "chunks": [],
  "evidence": [],
  "stats": {
    "chunks": 0,
    "messages": 0,
    "issues": 0,
    "opportunities": 0
  }
}
```

### Acceptance criteria

- Search page возвращает answer + chunks + evidence.
- После запроса создаётся запись в `lightrag_query_runs`.
- Quality score и source_diversity включены в response.
- Feedback endpoint (`POST /lightrag/feedback`) принимает rating и comment.

## 6) Проверка соответствия

Перед merge необходимо подтвердить:

1. В UI нет вызовов `/kag/*`.
2. В docs нет формулировок, допускающих активное использование KAG.
3. API reference и runbooks соответствуют RAG-only.
4. Новые intelligence features используют `/lightrag/*` endpoints.

## 7) Что делать при конфликте требований

Если бизнес-задача требует функциональность вне текущего контракта:

1. Оформляется отдельный RFC.
2. RFC должен явно изменить этот контракт.
3. До утверждения RFC реализация блокируется.

## 8) Миграция на HKUDS LightRAG (Iter 11 — запланировано)

**Статус:** НЕ НАЧАТА. Текущая система — custom hybrid RAG (`server/src/services/lightrag.js`).

Решение принято: миграция на [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) из форка [`lemone112/lightrag`](https://github.com/lemone112/lightrag).

**Что даёт:**
- Knowledge graph с entity extraction и relationship mapping (LLM-based)
- Dual-level retrieval: low-level (entities) + high-level (themes)
- PostgreSQL backend (PGKVStorage + PGVectorStorage + PGGraphStorage) — shared DB
- REST API сервер + MCP для Telegram бота ([daniel-lightrag-mcp](https://github.com/desimpkins/daniel-lightrag-mcp), 22 tools)

**ACL-контракт (MUST):**
- Все запросы фильтруются по `project_id` из сессии
- Owner-роль видит данные всех проектов (portfolio scope)
- PM-роль видит только назначенные проекты
- ACL enforcement на уровне LightRAG query proxy, НЕ на уровне frontend

**План:** см. Iter 11 в [`docs/iteration-plan-wave3.md`](./iteration-plan-wave3.md)
