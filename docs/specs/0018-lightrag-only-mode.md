# Спека 0018 — Intelligence Layer: RAG-only режим

> Обновлено: 2026-02-18 (post Architecture Audit)

Статус: **implemented (MVP, mandatory)**. KAG cleanup запланирован в Iter 10.

## Архитектурный контекст

Продукт использует custom hybrid RAG (vector search + keyword search):
- `server/src/services/lightrag.js` — основной query engine
- `server/src/services/embeddings.js` — OpenAI embeddings → pgvector
- Внутреннее имя "LightRAG" — custom реализация, НЕ HKUDS LightRAG

## Цель

Зафиксировать, что продукт работает в едином контуре RAG без активных `/kag/*` API.

## Инварианты

1. Маршруты `/kag/*` **удаляются** в Iter 10 (legacy cleanup).
2. Frontend не должен использовать `/kag/*`.
3. Поисковая поверхность работает через:
   - `POST /lightrag/query`
   - alias `POST /search` (совместимость).
4. Scheduler не выполняет KAG-related jobs.
5. Таблица `kag_event_log` переименовывается в `connector_events` (Iter 10).

## API-контракт RAG query

### Request

```json
{
  "query": "string, required",
  "topK": 10,
  "sourceLimit": 8,
  "sourceFilter": ["messages", "issues", "deals", "chunks"]
}
```

### Response (минимум)

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

## Acceptance criteria

- Search page возвращает answer + chunks + evidence.
- После запроса создаётся запись в `lightrag_query_runs`.
- UI не показывает ошибок `kag_disabled` в штатных пользовательских сценариях.
- Quality score и source_diversity включены в response.
- Feedback endpoint (`POST /lightrag/feedback`) принимает rating и comment.
