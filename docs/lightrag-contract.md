# Intelligence Layer Contract (нормативный документ)

> Обновлено: 2026-02-18 (post Architecture Audit)

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
2. KAG legacy code **удаляется** в Iter 10. `/kag/*` routes, kag.js, kag/ modules — deprecated.
3. Frontend **MUST** использовать только:
   - `POST /lightrag/query`
   - `POST /search` (только как compatibility alias).
4. Таблица `kag_event_log` **будет переименована** в `connector_events` (Iter 10).
5. Любой PR, который добавляет зависимость от удалённого KAG кода, считается нарушением контракта.

## 4) API Endpoints (intelligence layer)

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/lightrag/query` | POST | Основной поисковый запрос (vector + keyword) |
| `/lightrag/status` | GET | Статус embeddings и источников |
| `/lightrag/refresh` | POST | Trigger embedding refresh |
| `/lightrag/feedback` | POST | Feedback на результаты (rating + comment) |
| `/search` | POST | Compatibility alias для /lightrag/query |
| `/lightrag/ingest` | POST | **Planned (Iter 11)** — добавить текст в RAG базу |

## 5) Проверка соответствия

Перед merge необходимо подтвердить:

1. В UI нет вызовов `/kag/*`.
2. В docs нет формулировок, допускающих активное использование KAG.
3. API reference и runbooks соответствуют RAG-only.
4. Новые intelligence features используют `/lightrag/*` endpoints.

## 6) Что делать при конфликте требований

Если бизнес-задача требует функциональность вне текущего контракта:

1. Оформляется отдельный RFC.
2. RFC должен явно изменить этот контракт.
3. До утверждения RFC реализация блокируется.

## 7) Будущее: Knowledge Graph upgrade

При необходимости graph-based retrieval (для AI agent use cases, Telegram bot):
- Рассмотреть интеграцию с [HKUDS LightRAG](https://github.com/HKUDS/LightRAG) (Python, pgvector + AGE)
- Или расширить текущую систему entity extraction layer
- Требуется отдельный RFC с оценкой стоимости/пользы
