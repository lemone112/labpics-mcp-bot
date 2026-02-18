# Документация Labpics Dashboard (LightRAG-only)

Этот каталог описывает актуальную модель продукта: **только LightRAG** + интеграции + UI + эксплуатация.

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
7. Эксплуатация:
   - [`docs/runbooks.md`](./runbooks.md)
   - [`docs/deployment.md`](./deployment.md)
8. Продуктовые сценарии:
   - [`docs/scenarios.md`](./scenarios.md)
9. План развития:
   - [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)
10. Спеки:
   - [`docs/specs/README.md`](./specs/README.md)
11. Термины:
   - [`docs/glossary.md`](./glossary.md)

## Жёсткий контракт для разработки

- По умолчанию включен режим `LIGHTRAG_ONLY=1`.
- В разработке и продуктовых задачах используется только LightRAG API.
- Роуты `/kag/*` считаются legacy и не входят в dev-contract (`410 kag_disabled`).
- UI обязан опираться на LightRAG + operational charts.
