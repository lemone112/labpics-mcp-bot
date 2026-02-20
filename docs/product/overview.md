# Обзор продукта Labpics Dashboard

Обновлено: 2026-02-20

Labpics Dashboard — операционная панель для PM/Owner, где единый слой **LightRAG** связывает:

1. коммуникации (Chatwoot),
2. delivery-данные (Linear),
3. коммерческие данные (Attio + CRM),
4. retrieval-контекст для принятия решений.

## 1) Кому полезен продукт

- PM, ведущим несколько проектов.
- Head of Delivery / Operations.
- Owner/Founder, которому нужен общий срез по проектам и выручке.
- В Wave 3 добавляется multi-user режим (2-5 PM + Owner) с ролевой моделью доступа (role-based access control).

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
- **Planned (Iter 11):** миграция на HKUDS LightRAG с knowledge graph и dual-level retrieval (low-level chunk search + high-level graph traversal).

### 3.3 UI-слой

- Control Tower: `dashboard/messages/agreements/risks/finance/offers`.
- Отдельные рабочие поверхности: `projects/jobs/search/crm/offers/digests/analytics`.
- Мобильный режим: projects-sheet + нижний tabbar на 6 business-разделов.

### 3.4 Multi-User & Access Control (planned, Iter 49)

- Ролевая модель: Owner видит все проекты и данные, PM -- только свои проекты.
- Поддержка 2-5 PM + Owner в рамках одной студии.
- Назначение PM на проекты через интерфейс Owner.

### 3.5 System Monitoring (planned, Iter 46)

- Встроенный мониторинг здоровья сервисов прямо в UI (без внешних инструментов вроде Grafana).
- System page: статусы коннекторов, sync-циклов, очередей, ошибок.
- Алерты и индикаторы деградации в реальном времени.

### 3.6 Automated Reporting (planned, Iter 48)

- Шаблоны отчётов (weekly, monthly) с автоматической генерацией.
- Автогенерация на основе данных из LightRAG, Linear, Attio.
- Возможность просмотра и экспорта отчётов из UI.

### 3.7 Telegram Bot (planned, Iter 50-51)

- CryptoBot-style навигация: inline-кнопки, структурированные меню.
- Интеграция через Composio MCP (Linear + Attio).
- Whisper voice: голосовые сообщения распознаются и обрабатываются как текстовые запросы.
- Push-уведомления: алерты по проектам, риски, статусы sync.

## 4) Ключевые пользовательские сценарии

1. Найти договорённости с клиентом по срокам через LightRAG.
2. Проверить, почему в дашборде падает полнота sync (reconciliation).
3. Перейти из контекста в действие: обновить opportunity/offer или запустить jobs.
4. Сопоставить delivery-риски с сообщениями клиента в рамках одного project scope.
5. Получить утренний статус проектов через Telegram бот.
6. Просмотреть автоматический еженедельный отчёт по проекту.
7. Мониторинг здоровья системы через встроенную System page.
8. Управление доступом команды (Owner назначает PM на проекты).

## 5) Гарантии качества

- Строгий scope-контур (`project_id`, `account_scope_id`) на API и БД.
- Идемпотентные background-циклы и управляемые retries.
- Единая трассировка `request_id` + `audit_events`.
- LightRAG-only архитектура (KAG pipeline удалён в Iter 10).

## 6) Что не входит в текущий релиз

- Автономные action-рекомендации без подтверждения человека.
- SaaS multi-tenancy (продукт для одной студии).
- Client-facing portal (только внутренние пользователи).

## 7) Связанные документы

- Архитектура: [`docs/architecture.md`](../architecture.md)
- Модель данных: [`docs/data-model.md`](../data-model.md)
- Frontend и дизайн: [`docs/frontend-design.md`](../frontend-design.md)
- API: [`docs/api.md`](../api.md)
- Roadmap: [`docs/mvp-vs-roadmap.md`](../mvp-vs-roadmap.md)
- Единый план: [`docs/iteration-plan-wave3.md`](../iteration-plan-wave3.md)
- Telegram Bot: [`telegram-bot/docs/`](../../telegram-bot/docs/)
