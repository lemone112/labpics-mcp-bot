# Документация продукта Labpics Dashboard

Эта папка — актуальная техническая документация по системе:

- RAG + KAG контур,
- интеграции (Chatwoot / Linear / Attio),
- автоматизации и фоновым циклам,
- модели данных в Postgres,
- API и эксплуатационным практикам.

## С чего начать

1. Общий обзор и запуск:
   - [`README.md`](../README.md)
2. Архитектура и техстек:
   - [`docs/architecture.md`](./architecture.md)
3. Платформенные инварианты (scope / audit / evidence / deterministic):
   - [`docs/platform-architecture.md`](./platform-architecture.md)
4. Модель данных (основной фокус по БД):
   - [`docs/data-model.md`](./data-model.md)
5. Пайплайны и расписание автоматизаций:
   - [`docs/pipelines.md`](./pipelines.md)
6. API (актуальные группы эндпоинтов):
   - [`docs/api.md`](./api.md)
7. KAG-слои:
   - Базовый recommendations: [`docs/kag_recommendations.md`](./kag_recommendations.md)
   - Forecasting + recommendations v2: [`docs/kag_forecasting_recommendations.md`](./kag_forecasting_recommendations.md)
8. Операционная эксплуатация:
   - [`docs/runbooks.md`](./runbooks.md)
   - [`docs/deployment.md`](./deployment.md)

## Где что используется

- **RAG**: поиск по evidence и chunk-данным (`rag_chunks`, embeddings).
- **KAG v1**: graph/signals/scores/NBA для PM.
- **KAG v2**: event-log, snapshots, similarity, forecasting, recommendations v2 lifecycle.
- **Connectors**: инкрементальный sync + retry/backoff + DLQ по интеграциям.

## Дополнительно

- Продуктовые спеки: [`docs/specs/README.md`](./specs/README.md)
- Термины: [`docs/glossary.md`](./glossary.md)
- Стиль документации: [`docs/style-guide.md`](./style-guide.md)
