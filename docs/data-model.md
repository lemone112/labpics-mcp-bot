# Модель данных (Postgres) — актуальная продуктовая версия

Источник истины: PostgreSQL (`db`), схема управляется SQL-миграциями в `server/db/migrations`.

Документ описывает:

1. какие таблицы есть,
2. зачем они нужны,
3. как используются автоматизациями и аналитикой,
4. какие quality-гейты применяются.

---

## 1) Базовые принципы схемы

1. **Project scope first**:
   - практически все бизнес-таблицы содержат `project_id` и `account_scope_id`.
2. **Scope consistency**:
   - trigger `enforce_project_scope_match` предотвращает cross-scope writes.
3. **Идемпотентность ingest/job**:
   - `ON CONFLICT` upsert,
   - `dedupe_key` на события/рекомендации/исходы.
4. **Evidence-first**:
   - производные сущности хранят `evidence_refs`,
   - без evidence записи не публикуются в primary feed (через `publishable`).

---

## 2) Технологические расширения

- `pgcrypto` — UUID/crypto функции.
- `vector` (pgvector) — embedding-поиск по `rag_chunks.embedding`.

---

## 3) Группы таблиц и назначение

### 3.1 Core platform

- `projects` — проекты.
- `account_scopes` — общая зона доступа для мультипроектного портфеля.
- `sessions` — web-сессии + active project + CSRF.
- `app_users`, `signup_requests`, `app_settings` — учётные записи и системные настройки.
- `project_sources` — конфигурация подключений источников по проекту.
- `job_runs`, `scheduled_jobs`, `worker_runs` — выполнение и история фоновых задач.
- `schema_migrations` — контроль применённых миграций.

Использование: auth, scoping, API middleware.

### 3.2 Ingestion raw (источники данных)

### Chatwoot

- `cw_contacts` — контакты.
- `cw_conversations` — диалоги.
- `cw_messages` — сообщения.
- `cw_inboxes_raw` — inbox metadata.
- `cw_attachments_raw` — metadata вложений.

### Linear

- `linear_projects_raw` — проекты.
- `linear_issues_raw` — задачи + blocked flags/labels/cycle refs.
- `linear_states_raw` — workflow states.
- `linear_cycles_raw` — cycles/sprints.

### Attio

- `attio_accounts_raw` — компании/аккаунты.
- `attio_opportunities_raw` — сделки.
- `attio_people_raw` — люди/контакты.
- `attio_activities_raw` — активности/notes.

Использование: первичный ingest слой для построения событий, сигналов и CRM-представлений.

### 3.3 Connector reliability и retry

- `connector_sync_state`
  - cursor/state/status/retry/meta по каждому connector.
- `connector_errors`
  - dead-letter/retry очередь с backoff.

Использование: дешёвый и устойчивый инкрементальный sync.

### 3.4 RAG

- `rag_chunks`
  - текстовые chunk-элементы, embedding, статусы обработки.
- `sync_watermarks`
  - source cursors legacy ingestion.

Использование: search/evidence retrieval.

### 3.5 Evidence / audit / outbound

- `audit_events`
- `evidence_items`
- `outbound_messages`
- `outbound_attempts`
- `contact_channel_policies`

Использование: проверяемые действия, коммуникации и compliance.

### 3.6 CRM / operations / control tower

- `crm_accounts`
- `crm_account_contacts`
- `crm_opportunities`
- `crm_opportunity_stage_events`
- `offers`, `offer_items`, `offer_approvals`
- `campaigns`, `campaign_segments`, `campaign_members`, `campaign_events`
- `identity_link_suggestions`, `identity_links`
- `upsell_opportunities`
- `continuity_actions`
- `daily_digests`, `weekly_digests`

Использование: коммерческий контур, pipeline-управление, growth и continuity.

### 3.7 Legacy intelligence / analytics слой

- `signals`
- `next_best_actions`
- `health_scores`
- `risk_radar_items`
- `case_library_entries`, `case_evidence_refs`
- `risk_pattern_events`
- `analytics_revenue_snapshots`
- `analytics_delivery_snapshots`
- `analytics_comms_snapshots`

Использование: исторический intelligence-контур до расширения KAG v2; сохраняется для обратной совместимости и части UI.

### 3.8 KAG v1 (graph + deterministic intelligence)

- `kag_nodes`
- `kag_edges`
- `kag_events`
- `kag_provenance_refs`
- `kag_signal_state`
- `kag_signals`
- `kag_signal_history`
- `kag_scores`
- `kag_score_history`
- `kag_recommendations`
- `kag_templates`

Использование: интерпретируемые сигналы/скоры/NBA поверх фактологических данных.

### 3.9 KAG v2 (event-first, patterns, forecasts, rec lifecycle)

- `kag_event_log`
  - единая temporal-модель + process events для мониторинга.
- `project_snapshots`
  - дневные срезы сигналов/скоров/агрегатов,
  - поля `evidence_refs`, `publishable`.
- `past_case_outcomes`
  - исторические исходы кейсов для similarity/forecast.
- `case_signatures`
  - сигнатуры проектов (окна 7/14/30).
- `kag_risk_forecasts`
  - вероятности рисков 7/14/30, drivers, similar cases, `publishable`.
- `recommendations_v2`
  - рекомендации с lifecycle (`new/acknowledged/done/dismissed`) и feedback,
  - explainability/gating поля: `evidence_count`, `evidence_quality_score`, `evidence_gate_status`, `evidence_gate_reason`,
  - product telemetry: `shown_count`, `first_shown_at`, `last_shown_at`.
- `recommendation_action_runs`
  - лог исполнения действий по рекомендациям,
  - типы действий: `create_or_update_task`, `send_message`, `set_reminder`,
  - retry-поля: `attempts`, `max_retries`, `next_retry_at`, `error_message`, `result_payload`.

---

## 4) Автоматизации и соответствующие таблицы

### 4.1 Каждые ~15 минут

- `connectors_sync_cycle`
  - пишет raw-слой,
  - обновляет `connector_sync_state`,
  - фиксирует ошибки в `connector_errors`,
  - генерирует/обновляет `kag_event_log`.

### 4.2 Каждые ~5 минут

- `connector_errors_retry`
  - обрабатывает due-записи из `connector_errors`
  - точечно ретраит connector.

### 4.3 Раз в сутки

- `kag_daily_pipeline`
  - snapshot (`project_snapshots`)
  - forecast (`kag_risk_forecasts`)
  - recommendations (`recommendations_v2`)
  - outcomes (`past_case_outcomes`).

### 4.4 Раз в неделю

- `case_signatures_refresh`
  - обновляет `case_signatures`.

---

## 5) Quality и explainability поля

Минимальные поля для explainability:

- `evidence_refs` (jsonb ссылки на message/issue/deal/doc/chunk),
- source trace поля в `kag_event_log`,
- `dedupe_key` для идемпотентности.

Публикация:

- `project_snapshots.publishable`
- `kag_risk_forecasts.publishable`

Если evidence нет:

- запись сохраняется для аудита,
- но скрывается из primary выдачи,
- в `kag_event_log` пишется warning process event.

---

## 6) Индексы и оптимизация

Ключевые индексы:

- `project_id + occurred_at` для event/time-series выборок,
- `source_ref`, `outcome_type`, `signature_hash` для диагностики/similarity,
- `snapshot_date` для trend-аналитики,
- GIN по `evidence_refs`/json полям там, где нужен обратный поиск.

---

## 7) Где смотреть детали

- Миграции (фактическая схема): `server/db/migrations/*.sql`
- KAG v1: [`docs/kag_recommendations.md`](./kag_recommendations.md)
- KAG v2: [`docs/kag_forecasting_recommendations.md`](./kag_forecasting_recommendations.md)
- Pipeline/расписание: [`docs/pipelines.md`](./pipelines.md)
