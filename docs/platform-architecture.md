# Платформенная архитектура и инварианты

Этот документ фиксирует правила, которые нельзя нарушать при разработке.

## 1) Scope — обязательный контракт

- Любая доменная операция выполняется внутри `project_id`.
- Для портфельных операций дополнительно обязателен `account_scope_id`.
- API требует активный проект в сессии.
- На уровне БД действует `enforce_project_scope_match`.

## 2) LightRAG-only режим

- Флаг `LIGHTRAG_ONLY=1` считается целевым режимом.
- `/kag/*` в этом режиме недоступны и не входят в контракт разработки.
- Scheduler не выполняет legacy jobs, связанные с `/kag/*` (ставит их в `paused`).
- Frontend не вызывает `/kag/*`.

## 3) Evidence-first

- Любой вывод для пользователя должен ссылаться на источники.
- `POST /lightrag/query` всегда возвращает `evidence` (source refs + snippets).
- Для диагностики есть `audit_events`, `worker_runs`, `connector_errors`.

## 4) Надёжность интеграций

- Инкрементальный sync + idempotent upsert.
- Retry по backoff без cascade failure.
- Reconciliation метрики (`sync_reconciliation_metrics`) обязательны для контроля полноты.

## 5) Scheduler/worker инварианты

- Scheduler claim’ит только due jobs.
- Любой job-run должен быть безопасен к повторному запуску.
- Длинные операции ограничиваются cadence + лимитами.

## 6) UI/Design инварианты

- Только shadcn-токены и наследуемые primitives.
- Никаких page-level “одноразовых” компонентных систем.
- Мобильный UX: project sheet + фиксированный нижний tabbar (6 business items).

## 7) Observability baseline

- `request_id` в каждом API-ответе.
- `x-request-id` в headers.
- Ключевые действия логируются в `audit_events`.
- Техническое здоровье читается через `/health`, `/metrics`, `/jobs/*`, `/connectors/*`.

Ссылки:

- Data model: [`docs/data-model.md`](./data-model.md)
- Pipelines: [`docs/pipelines.md`](./pipelines.md)
