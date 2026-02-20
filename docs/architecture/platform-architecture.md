# Платформенная архитектура и инварианты

Обновлено: 2026-02-20

Этот документ фиксирует правила, которые нельзя нарушать при разработке.

## 1) Scope — обязательный контракт

- Любая доменная операция выполняется внутри `project_id`.
- Для портфельных операций дополнительно обязателен `account_scope_id`.
- API требует активный проект в сессии.
- На уровне БД действует `enforce_project_scope_match`.

**Multi-user ACL (Iter 49):**
- Owner-роль: полный доступ ко всем проектам и данным (portfolio scope).
- PM-роль: доступ только к назначенным проектам.
- ACL enforcement: middleware `rbac` на уровне API, НЕ frontend-only.
- `user_id` обязателен в `audit_events` после Iter 49.

## 2) LightRAG-only режим

- Продуктовый интеллект-контур = custom hybrid RAG (`/lightrag/*` endpoints).
- KAG pipeline полностью удалён (Iter 10): код, routes, scheduler jobs, DB-таблицы.
- Миграция на HKUDS LightRAG запланирована в Iter 11. Контракт миграции: [`docs/lightrag-contract.md`](./lightrag-contract.md).

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

## 8) Real-time event streaming

При завершении задач worker публикует событие в Redis канал `job_completed`:

- Server подписан на канал → транслирует событие через SSE в браузеры по project_id.
- При недоступности Redis — fallback на `pg_notify`.
- Frontend: auto-polling (Level 1) работает всегда, SSE (Level 3) ускоряет доставку до ~1-2 сек.

Детали: [`docs/redis-sse.md`](./redis-sse.md)

## 9) Cascade triggers

Scheduler поддерживает cascade chains — автоматический запуск downstream задач после completion upstream:

```
connectors_sync_cycle → signals_extraction, embeddings_run
signals_extraction → health_scoring
health_scoring → analytics_aggregates
```

Механизм: `UPDATE scheduled_jobs SET next_run_at = now()` для downstream.
Устраняет задержку в 15-30 минут между синхронизацией и обновлением аналитики.

## 10) Multi-user инварианты (Iter 49)

- Авторизация: role-based (Owner / PM).
- Каждый API-запрос проходит через `rbac` middleware.
- Owner: CRUD всех проектов + team management + system settings.
- PM: CRUD только назначенных проектов, read-only для portfolio.
- Session: `user_id` + `role` + `project_ids[]` в session data.

## 11) Monitoring инварианты (Iter 46)

- Мониторинг встроен в UI (System page), НЕ выносится в Grafana.
- Источники данных: `GET /metrics`, `GET /jobs/status`, `GET /connectors/state`.
- Alert history хранится в БД, не в external service.
- Доступ к System page: только Owner (или PM с расширенными правами).

---

Ссылки:

- Data model: [`docs/data-model.md`](./data-model.md)
- Pipelines: [`docs/pipelines.md`](./pipelines.md)
- Real-time архитектура: [`docs/redis-sse.md`](./redis-sse.md)
- Единый план: [`docs/iteration-plan-wave3.md`](./iteration-plan-wave3.md)
- LightRAG контракт: [`docs/lightrag-contract.md`](./lightrag-contract.md)
