# Документация Labpics Dashboard (LightRAG-only)

Этот каталог описывает актуальную модель продукта: **только LightRAG** + интеграции + UI + эксплуатация.

Покрывает: RAG-контур, интеграции (Chatwoot / Linear / Attio), автоматизации и фоновые циклы, модель данных в Postgres, Redis caching и real-time event streaming (SSE), API и эксплуатационные практики.

## Структура документации

```
docs/
├── architecture/   — системные диаграммы, модель данных, API, платформа
├── product/        — обзор продукта, глоссарий, сценарии, решения
├── design/         — дизайн-система, motion guidelines, компоненты
├── specs/          — спецификации фич (ADR-формат)
├── operations/     — деплой, runbooks, откат, тестирование
├── iterations/     — планы итераций, лог, бэклог
└── audits/         — аудиты, ревью, критика
```

## Быстрый порядок чтения

1. **Продукт:**
   - [`product/overview.md`](./product/overview.md) — обзор продукта
   - [`product/glossary.md`](./product/glossary.md) — термины
   - [`product/scenarios.md`](./product/scenarios.md) — продуктовые сценарии
   - [`product/decisions.md`](./product/decisions.md) — продуктовые решения
   - [`product/mvp-vs-roadmap.md`](./product/mvp-vs-roadmap.md) — MVP vs Roadmap
   - [`product/business-outbound-system.md`](./product/business-outbound-system.md) — бизнес-outbound
   - [`product/product-structure-analysis.md`](./product/product-structure-analysis.md) — анализ структуры

2. **Архитектура:**
   - [`architecture/architecture.md`](./architecture/architecture.md) — общая архитектура
   - [`architecture/platform-architecture.md`](./architecture/platform-architecture.md) — платформа
   - [`architecture/lightrag-contract.md`](./architecture/lightrag-contract.md) — контракт LightRAG
   - [`architecture/data-model.md`](./architecture/data-model.md) — модель данных
   - [`architecture/api.md`](./architecture/api.md) — API
   - [`architecture/backend-services.md`](./architecture/backend-services.md) — бэкенд-сервисы
   - [`architecture/integrations.md`](./architecture/integrations.md) — интеграции
   - [`architecture/redis-sse.md`](./architecture/redis-sse.md) — Redis, SSE, real-time
   - [`architecture/pipelines.md`](./architecture/pipelines.md) — автоматизации
   - [`architecture/frontend-design.md`](./architecture/frontend-design.md) — фронтенд-дизайн

3. **Дизайн-система:**
   - [`design/DESIGN_SYSTEM_2026.md`](./design/DESIGN_SYSTEM_2026.md) — дизайн-система 2026
   - [`design/DESIGN_SYSTEM_CONTROL_TOWER.md`](./design/DESIGN_SYSTEM_CONTROL_TOWER.md) — контрольная башня
   - [`design/MOTION_GUIDELINES.md`](./design/MOTION_GUIDELINES.md) — гайдлайны анимаций
   - [`design/COMPONENT_SELECTION.md`](./design/COMPONENT_SELECTION.md) — выбор компонентов
   - [`design/QUALITY_GATES_UI.md`](./design/QUALITY_GATES_UI.md) — качественные ворота UI

4. **Спеки:**
   - [`specs/README.md`](./specs/README.md) — индекс спецификаций

5. **Эксплуатация:**
   - [`operations/deployment.md`](./operations/deployment.md) — деплой
   - [`operations/runbooks.md`](./operations/runbooks.md) — runbooks
   - [`operations/runbooks/incident-response.md`](./operations/runbooks/incident-response.md) — инцидент-ответ
   - [`operations/rollback-strategy.md`](./operations/rollback-strategy.md) — стратегия отката
   - [`operations/testing.md`](./operations/testing.md) — тестирование
   - [`operations/style-guide.md`](./operations/style-guide.md) — стиль документации

6. **Итерации:**
   - [`iterations/iteration-plan-wave2.md`](./iterations/iteration-plan-wave2.md) — Wave 2 (Iter 10–16)
   - [`iterations/iteration-plan-wave3.md`](./iterations/iteration-plan-wave3.md) — Wave 3 (Iter 44–51)
   - [`iterations/iteration-now-priorities.md`](./iterations/iteration-now-priorities.md) — текущий фокус (что берём в работу сейчас)
   - [`iterations/iteration-log.md`](./iterations/iteration-log.md) — лог итераций
   - [`iterations/backlog.md`](./iterations/backlog.md) — бэклог

7. **Аудиты:**
   - [`audits/audit-2026-02-19-monorepo.md`](./audits/audit-2026-02-19-monorepo.md) — аудит монорепо
   - [`audits/critique-findings-2026-02-20.md`](./audits/critique-findings-2026-02-20.md) — критика
   - [`audits/review-senior-audit-2026-02.md`](./audits/review-senior-audit-2026-02.md) — senior ревью
   - [`audits/final-prompt-monorepo-migration.md`](./audits/final-prompt-monorepo-migration.md) — финальный промпт миграции

## Жёсткий контракт для разработки

- Intelligence layer = custom hybrid RAG (`/lightrag/*` endpoints). KAG pipeline удалён (Iter 10).
- UI обязан опираться на LightRAG + operational charts.
- **Real-time**: Redis Pub/Sub для event propagation, SSE для auto-refresh в браузере, cascade triggers между задачами.
