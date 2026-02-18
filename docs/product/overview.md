# Обзор продукта Labpics Dashboard

Labpics Dashboard — операционная панель для PM/Owner, где единый слой **LightRAG** связывает:

1. коммуникации (Chatwoot),
2. delivery-данные (Linear),
3. коммерческие данные (Attio + CRM),
4. retrieval-контекст для принятия решений.

## 1) Кому полезен продукт

- PM, ведущим несколько проектов.
- Head of Delivery / Operations.
- Owner/Founder, которому нужен общий срез по проектам и выручке.

## 2) Главное продуктовое обещание

Короткий цикл пользователя:

**Логин -> выбор проекта -> обзор dashboard -> запрос в LightRAG -> действие в CRM/Jobs/Offers.**

Что это даёт:

- быстрый time-to-context без ручного просмотра десятков систем;
- прозрачный источник каждого факта (messages/issues/deals/chunks);
- устойчивую операционную работу за счёт retry/scheduler/reconciliation.

## 3) Как устроен продукт сейчас

### 3.1 Интеграционный слой

- Инкрементальный sync Chatwoot / Linear / Attio.
- Идемпотентные upsert-операции и дедупликация по `external_ref`.
- Ошибки фиксируются в `connector_errors`, есть backoff-ретраи.

### 3.2 LightRAG слой (единственный интеллект-контур)

- `rag_chunks` + embeddings (`pgvector`).
- API: `POST /lightrag/query` (унифицированный запрос).
- Ответ содержит:
  - chunk-попадания,
  - evidence из source-таблиц,
  - краткий summary.

### 3.3 UI-слой

- Control Tower: `dashboard/messages/agreements/risks/finance/offers`.
- Отдельные рабочие поверхности: `projects/jobs/search/crm/offers/digests/analytics`.
- Мобильный режим: projects-sheet + нижний tabbar на 6 business-разделов.

## 4) Ключевые пользовательские сценарии

1. Найти договорённости с клиентом по срокам через LightRAG.
2. Проверить, почему в дашборде падает полнота sync (reconciliation).
3. Перейти из контекста в действие: обновить opportunity/offer или запустить jobs.
4. Сопоставить delivery-риски с сообщениями клиента в рамках одного project scope.

## 5) Гарантии качества

- Строгий scope-контур (`project_id`, `account_scope_id`) на API и БД.
- Идемпотентные background-циклы и управляемые retries.
- Единая трассировка `request_id` + `audit_events`.
- LightRAG-only режим (`LIGHTRAG_ONLY=1`) для предсказуемой архитектуры.

## 6) Что не входит в текущий релиз

- Автономные action-рекомендации без подтверждения человека.
- Любые решения и интеграции, завязанные на `/kag/*`.
- Дорогие LLM-решения в критических операционных циклах.

## 7) Связанные документы

- Архитектура: [`docs/architecture.md`](../architecture.md)
- Модель данных: [`docs/data-model.md`](../data-model.md)
- Frontend и дизайн: [`docs/frontend-design.md`](../frontend-design.md)
- API: [`docs/api.md`](../api.md)
- Roadmap: [`docs/mvp-vs-roadmap.md`](../mvp-vs-roadmap.md)
