# Спека 0018 — Intelligence Layer: RAG-only режим

> Обновлено: 2026-02-19 (post Iter 10 — KAG fully removed)

Статус: **implemented (MVP, mandatory)**. KAG полностью удалён в Iter 10.

## Архитектурный контекст

Продукт использует custom hybrid RAG (vector search + keyword search):
- `server/src/services/lightrag.js` — основной query engine
- `server/src/services/embeddings.js` — OpenAI embeddings → pgvector
- Внутреннее имя "LightRAG" — custom реализация, НЕ HKUDS LightRAG
- Миграция на HKUDS LightRAG запланирована в Iter 11

## Цель

Зафиксировать, что продукт работает в едином RAG-контуре.

## Инварианты

1. Маршруты `/kag/*` удалены (Iter 10). Код, routes, scheduler jobs, DB-таблицы — не существуют.
2. Поисковая поверхность работает через:
   - `POST /lightrag/query`
   - alias `POST /search` (совместимость).
3. Scheduler не содержит KAG-related jobs.
4. Таблица `kag_event_log` переименована в `connector_events` (migration 0021).

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
- Quality score и source_diversity включены в response.
- Feedback endpoint (`POST /lightrag/feedback`) принимает rating и comment.
