# Статус продукта и roadmap (LightRAG-фокус)

## 1) Что уже в MVP

### Платформа

- Session auth + CSRF + request_id.
- Жёсткий project/account scope.
- Scheduler/worker и audit trail.

### Интеграции

- Инкрементальный sync Chatwoot/Linear/Attio.
- Retry/DLQ через `connector_errors`.
- Reconciliation метрики полноты.

### Intelligence

- LightRAG query API (`/lightrag/query`).
- Vector retrieval + source evidence в одном ответе.
- Query observability (`lightrag_query_runs`).

### Frontend

- Control Tower (6 sections) + единая shadcn дизайн-система.
- Mobile: project sheet + bottom tabbar.
- Search страница переведена на LightRAG.

## 2) Next (ближайшие итерации)

### R1 — Reliability hardening

1. Авто-алерты на падение `completeness_pct`.
2. SLA на connector lag и retry success-rate.
3. Дешёвые health-виджеты по pipeline.

### R2 — LightRAG UX

1. Улучшить answer synthesis (структурированные выводы по типам источников).
2. Добавить фильтры evidence (messages/issues/deals).
3. Ввести feedback-loop по качеству ответов LightRAG.

### R3 — Data quality и dedupe

1. Автоматический отчёт о дубликатах в CRM mirror.
2. Полуавтоматические сценарии reconciliation-fix.
3. Контроль полноты при high-volume sync.

## 3) Later

- Policy-driven automation поверх LightRAG signals.
- Расширение RBAC и enterprise compliance.
- Materialized views для тяжёлой аналитики.

## 4) Явно вне текущего scope

- Любые интеграции и решения, завязанные на `/kag/*`.
- Black-box рекомендационные агенты без evidence.
