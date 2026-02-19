# Платформенная архитектура и инварианты

Этот документ фиксирует правила, которые нельзя нарушать при разработке.

## 1) Scope — обязательный контракт

- Любая доменная операция выполняется внутри `project_id`.
- Для портфельных операций дополнительно обязателен `account_scope_id`.
- API требует активный проект в сессии.
- На уровне БД действует `enforce_project_scope_match`.

## 2) LightRAG-only режим

- Продуктовый интеллект-контур = custom hybrid RAG (`/lightrag/*` endpoints).
- KAG pipeline полностью удалён (Iter 10): код, routes, scheduler jobs, DB-таблицы.
- Миграция на HKUDS LightRAG запланирована в Iter 11.

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
- Никаких page-level "одноразовых" компонентных систем.
- Мобильный UX: project sheet + фиксированный нижний tabbar (4 items: Actions, Messages, Search, Profile).
- Feature flags (`useFeatureFlag()`) для gradual rollout новых UI-компонентов (Iter 26).

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

## 10) Multi-user & RBAC (Wave 4, Iter 27)

- Роли: `owner`, `admin`, `manager`, `viewer`.
- Scope расширяется: `project_id` + `account_scope_id` + `team_id`.
- Permission middleware: `requireAuth()`, `requireRole()`, `requireProjectAccess()`.
- Viewer role: read-only access, mutations скрыты в UI.
- Audit trail: `user_id` в `audit_events` для всех мутаций.

## 11) Notification Engine (Wave 4, Iter 28)

- Event-driven: `job_completed` → проверка triggers → notification dispatch.
- Каналы: in-app, Web Push, email, Telegram.
- Подписки per-user per-event-type per-channel.
- Deduplication + batching (5-минутное окно).

## 12) Webhook Event Bus (Wave 4, Iter 29)

- HMAC-SHA256 signing для payload integrity.
- Retry с exponential backoff (1min → 12hr, max 5 attempts).
- Circuit breaker: disable webhook после 10 consecutive failures.
- Превращает продукт из closed dashboard в open platform.

## 13) Client Intelligence Engine (Wave 5, Iter 31–35)

- **Health Score (DEAR model):** Delivery + Engagement + Attio + Revenue = 0–100 score.
- **AI Sentiment Analysis:** LLM-классификация тональности сообщений из Chatwoot.
- **Predictive Churn:** Logistic regression на 15+ features, прогноз за 30 дней.
- **Scope Creep Detection:** Автоматическое сравнение baseline vs current (Linear data).
- **Automated Playbooks:** trigger → conditions → actions chain (sequential/parallel).
- **AI Copilot:** Natural language queries → structured data via LightRAG + function calling.
- **QBR Auto-Generator:** 8-section quarterly report с AI narrative → PDF.

## 14) Revenue Analytics (Wave 5, Iter 33)

- P&L per client: revenue (Attio) - cost (Linear hours × rate card) = margin.
- Resource utilization: billable vs non-billable, capacity planning alerts.
- Renewal calendar: contract lifecycle, auto-reminders at 90/60/30/14/7 days.
- Materialized views для fast reads, weekly scheduler refresh.

## 15) Visualization Stack (Wave 6, Iter 37-41)

- **Recharts 3.7** (existing): Standard charts (bar, line, area, pie, funnel, Sankey).
- **React Flow @xyflow/react 12.x** (new): Node diagrams, stakeholder maps, playbook builder.
- **Sigma.js + graphology** (new): Network graphs, entity relationship explorer (WebGL, ForceAtlas2).
- **3-level segmented controls:** scope tabs → view mode → chart variant.
- **6 dashboard scopes:** Overview, Sales, Projects, Finance, Team, Clients.
- D3.js rejected (DOM conflict with React 19). ECharts rejected (135KB+ bundle).

## 16) Storage Optimization (Wave 6, Iter 42)

- Embedding dimension reduction: 1536 → 512 (OpenAI native, -67% vector storage).
- Drop IVFFlat index (HNSW only, strictly better).
- LZ4 TOAST compression on jsonb columns (PG 16 native).
- Hot/Warm/Cold tiering: full (0-90d), stripped jsonb (90d-1y), archived (>1y).
- Monthly archive pipeline: JSONL.gz + Parquet + SHA-256 manifest.
- Rehydration SLA: < 4 hours for any archived month.
- Target: 75% storage reduction over 2 years.

## 17) Integration Architecture (Wave 6, Iter 43)

- **Toggl/Clockify** → time_entries_raw, team_rates → P&L, utilization, scope creep.
- **Stripe** → invoices_raw, payments_raw → real revenue data, cash flow.
- **Telegram Bot** → telegraf, notification delivery for Russian market.
- **Google Calendar** → calendar_events_raw → meeting frequency as engagement signal.
- **GitHub** → github_prs_raw, github_deployments_raw → DORA metrics.
- Connector framework: `createConnector()` + `connector_sync_state` CHECK constraint.
- BigQuery evaluated and rejected: ~1-5 GB data, PostgreSQL sufficient. DuckDB as future alternative.

---

Ссылки:

- Data model: [`docs/data-model.md`](./data-model.md)
- Pipelines: [`docs/pipelines.md`](./pipelines.md)
- Real-time архитектура: [`docs/redis-sse.md`](./redis-sse.md)
- Wave 2 plan: [`docs/iteration-plan-wave2.md`](./iteration-plan-wave2.md)
- Wave 3 design plan: [`docs/iteration-plan-wave3-design.md`](./iteration-plan-wave3-design.md)
- Wave 4 strategic plan: [`docs/iteration-plan-wave4-growth.md`](./iteration-plan-wave4-growth.md)
- Wave 5 intelligence plan: [`docs/iteration-plan-wave5-intelligence.md`](./iteration-plan-wave5-intelligence.md)
- Wave 6 analytics plan: [`docs/iteration-plan-wave6-analytics.md`](./iteration-plan-wave6-analytics.md)
- Research — Charts: [`docs/research/advanced-charts-analysis.md`](./research/advanced-charts-analysis.md)
- Research — Dashboard Scopes: [`docs/research/scoped-dashboard-tabs.md`](./research/scoped-dashboard-tabs.md)
- Research — DB Storage: [`docs/research/db-storage-optimization.md`](./research/db-storage-optimization.md)
- Research — BigQuery & Integrations: [`docs/research/bigquery-and-integrations.md`](./research/bigquery-and-integrations.md)
