# Документация Labpics Dashboard (LightRAG-only)

Этот каталог описывает актуальную модель продукта: **только LightRAG** + интеграции + UI + эксплуатация.

Покрывает: RAG-контур, интеграции (Chatwoot / Linear / Attio), автоматизации и фоновые циклы, модель данных в Postgres, Redis caching и real-time event streaming (SSE), API и эксплуатационные практики.

## Быстрый порядок чтения

1. Продукт:
   - [`docs/product/overview.md`](./product/overview.md)
2. Архитектура:
   - [`docs/architecture.md`](./architecture.md)
   - [`docs/platform-architecture.md`](./platform-architecture.md)
   - [`docs/lightrag-contract.md`](./lightrag-contract.md)
3. База данных:
   - [`docs/data-model.md`](./data-model.md)
4. API:
   - [`docs/api.md`](./api.md)
5. Автоматизации:
   - [`docs/pipelines.md`](./pipelines.md)
6. Frontend и дизайн:
   - [`docs/frontend-design.md`](./frontend-design.md)
7. Real-time и кеширование (Redis, SSE, auto-refresh, cascade triggers):
   - [`docs/redis-sse.md`](./redis-sse.md)
8. Эксплуатация:
   - [`docs/runbooks.md`](./runbooks.md)
   - [`docs/deployment.md`](./deployment.md)
9. Продуктовые сценарии:
   - [`docs/scenarios.md`](./scenarios.md)
10. План развития:
   - [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)
11. Спеки:
   - [`docs/specs/README.md`](./specs/README.md)
12. Термины:
   - [`docs/glossary.md`](./glossary.md)

## Жёсткий контракт для разработки

- Intelligence layer = custom hybrid RAG (`/lightrag/*` endpoints). KAG pipeline удалён (Iter 10).
- UI обязан опираться на LightRAG + operational charts.
- **Real-time**: Redis Pub/Sub для event propagation, SSE для auto-refresh в браузере, cascade triggers между задачами.

## Тестирование

13. Стратегия и запуск: [`docs/testing.md`](./testing.md)

## Дополнительно

- Стиль документации: [`docs/style-guide.md`](./style-guide.md)
