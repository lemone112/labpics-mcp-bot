# Спека 0018 — LightRAG-only режим и API-контракт

Статус: **implemented (MVP)**

## Цель

Зафиксировать, что продукт работает в едином контуре LightRAG без активного KAG API.

## Инварианты

1. При `LIGHTRAG_ONLY=1` маршруты `/kag/*` недоступны (`410 kag_disabled`).
2. Frontend не должен использовать `/kag/*`.
3. Поисковая поверхность работает через:
   - `POST /lightrag/query`
   - alias `POST /search` (совместимость).
4. Scheduler не выполняет KAG-heavy jobs в LightRAG-only режиме.

## API-контракт LightRAG query

### Request

```json
{
  "query": "string, required",
  "topK": 10,
  "sourceLimit": 8
}
```

### Response (минимум)

```json
{
  "query": "string",
  "topK": 10,
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
- UI не показывает ошибок `kag_disabled`.
