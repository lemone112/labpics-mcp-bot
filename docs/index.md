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
2. Продуктовый обзор (ценность, сценарии, контуры):
   - [`docs/product/overview.md`](./product/overview.md)
3. Архитектура и техстек:
   - [`docs/architecture.md`](./architecture.md)
4. Платформенные инварианты (scope / audit / evidence / deterministic):
   - [`docs/platform-architecture.md`](./platform-architecture.md)
5. Модель данных (основной фокус по БД):
   - [`docs/data-model.md`](./data-model.md)
6. Frontend + дизайн (shadcn/ui, anime.js, UI-логика):
   - [`docs/frontend-design.md`](./frontend-design.md)
7. Пайплайны и расписание автоматизаций:
   - [`docs/pipelines.md`](./pipelines.md)
8. API (актуальные группы эндпоинтов):
   - [`docs/api.md`](./api.md)
9. KAG-слои:
   - Базовый recommendations: [`docs/kag_recommendations.md`](./kag_recommendations.md)
   - Forecasting + recommendations v2: [`docs/kag_forecasting_recommendations.md`](./kag_forecasting_recommendations.md)
10. Операционная эксплуатация:
   - [`docs/runbooks.md`](./runbooks.md)
   - [`docs/deployment.md`](./deployment.md)
11. Ручные e2e-сценарии:
   - [`docs/scenarios.md`](./scenarios.md)
12. Лог итераций и самоанализ:
   - [`docs/iteration-log.md`](./iteration-log.md)

## Где что используется

- **RAG**: поиск по evidence и chunk-данным (`rag_chunks`, embeddings).
- **KAG v1**: graph/signals/scores/NBA для PM.
- **KAG v2**: event-log, snapshots, similarity, forecasting, recommendations v2 lifecycle.
- **Connectors**: инкрементальный sync + retry/backoff + DLQ по интеграциям.

## Дополнительно

- Product roadmap: [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)
- Продуктовые спеки: [`docs/specs/README.md`](./specs/README.md)
- Термины: [`docs/glossary.md`](./glossary.md)
- Стиль документации: [`docs/style-guide.md`](./style-guide.md)
