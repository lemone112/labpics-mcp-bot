# Спека 0018 — LightRAG-only режим и API-контракт

Статус: **implemented (MVP, mandatory)**

## Цель

Зафиксировать, что продукт работает в едином контуре LightRAG без активных `/kag/*` API.

## Инварианты

1. Маршруты `/kag/*` не входят в контракт разработки.
2. При `LIGHTRAG_ONLY=1` они недоступны (`410 kag_disabled`).
3. Frontend не должен использовать `/kag/*`.
4. Поисковая поверхность работает через:
   - `POST /lightrag/query`
   - alias `POST /search` (совместимость).
5. Scheduler не выполняет legacy jobs, связанные с `/kag/*`, в LightRAG-only режиме.

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
- UI не показывает ошибок `kag_disabled` в штатных пользовательских сценариях.
