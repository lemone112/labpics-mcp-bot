# Модель данных (Postgres) — полная спецификация (v2.0, 2026-02-17)

> Источник истины: PostgreSQL, схема управляется SQL-миграциями в `server/db/migrations` (0001–0017).
> Этот документ описывает каждую таблицу, её назначение, ключевые колонки, индексы и связи.

---

## 1) Базовые принципы схемы

| # | Принцип | Реализация |
|---|---------|-----------|
| 1 | **Project scope first** | Все бизнес-таблицы содержат `project_id` + `account_scope_id` |
| 2 | **Scope consistency** | Trigger `enforce_project_scope_match` на 40+ таблицах (BEFORE INSERT OR UPDATE) |
| 3 | **Idempotent ingest** | `ON CONFLICT ... DO UPDATE`, `dedupe_key` на событиях/рекомендациях/исходах |
| 4 | **Evidence-first** | Производные сущности хранят `evidence_refs`; без evidence = `publishable: false` |
| 5 | **Retention-friendly** | History таблицы индексированы по `computed_at ASC` для эффективной очистки |

## 2) PostgreSQL Extensions

- `pgcrypto` — `gen_random_uuid()`, crypto функции
- `vector` (pgvector) — `vector(1536)`, cosine distance, IVFFlat + HNSW индексы

---

## 3) Полная карта таблиц

### 3.1 Core Platform

| Таблица | PK | Ключевые колонки | Индексы | Ограничения |
|---------|----|-----------------|---------|-------------|
| `account_scopes` | `id` (uuid) | `scope_key`, `name` | PK | `scope_key` UNIQUE |
| `projects` | `id` (uuid) | `name`, `account_scope_id` | `projects_account_scope_idx` | FK → account_scopes ON DELETE RESTRICT |
| `sessions` | `session_id` (text) | `username`, `active_project_id`, `csrf_token` | PK | FK → projects ON DELETE SET NULL |
| `app_users` | `id` (uuid) | `username`, `password_hash` | PK | `username` UNIQUE |
| `signup_requests` | `id` (uuid) | `username`, `pin_hash`, `expires_at`, `attempt_count` | username+created, expires | TTL-based |
| `app_settings` | `key` (text) | `value` | PK | — |
| `schema_migrations` | `filename` (text) | `applied_at` | PK | — |
| `project_sources` | `id` (uuid) | `project_id`, `source_kind`, `external_id` | — | UNIQUE (source_kind, external_id), UNIQUE (project_id, source_kind) |

### 3.2 Chatwoot Raw (5 таблиц)

| Таблица | PK | Объём | Ключевые индексы | Особенности |
|---------|----|-------|-----------------|-------------|
| `cw_messages` | `id` (text) | **Очень высокий** | project, conversation, created_at, contact_global, account+created | Autovacuum tuned (0.05/0.02) |
| `cw_conversations` | `id` (text) | Высокий | project, project+scope | Scope guard trigger |
| `cw_contacts` | `id` (text) | Средний | account+contact UNIQUE, updated_at, project | — |
| `cw_inboxes_raw` | `id` (text) | Низкий | project+updated | — |
| `cw_attachments_raw` | `id` (text) | Средний | project+message | FK → cw_messages |

### 3.3 Linear Raw (4 таблицы)

| Таблица | PK | Ключевые колонки | Индексы |
|---------|----|-----------------|---------|
| `linear_issues_raw` | `id` (text) | `state`, `state_type`, `priority`, `due_date`, `blocked`, `labels[]` | project+state, project+blocked |
| `linear_projects_raw` | `id` (text) | `name`, `state`, `lead_name` | project+updated |
| `linear_states_raw` | `id` (text) | `name`, `type`, `position` | project+updated |
| `linear_cycles_raw` | `id` (text) | `starts_at`, `ends_at`, `progress` | project+updated |

Все: UNIQUE (project_id, external_id).

### 3.4 Attio Raw (4 таблицы)

| Таблица | PK | Ключевые колонки | Индексы |
|---------|----|-----------------|---------|
| `attio_accounts_raw` | `id` (text) | `name`, `domain`, `annual_revenue`, `stage` | project+updated |
| `attio_opportunities_raw` | `id` (text) | `title`, `stage`, `amount`, `probability` | project+stage |
| `attio_people_raw` | `id` (text) | `full_name`, `email`, `role` | project+updated |
| `attio_activities_raw` | `id` (text) | `activity_type`, `note`, `occurred_at` | project+occurred |

Все: UNIQUE (project_id, external_id).

### 3.5 Connector Reliability

| Таблица | PK | Ключевые колонки | Statuses |
|---------|----|-----------------|----------|
| `connector_sync_state` | Composite (project_id, connector) | `cursor_ts`, `status`, `retry_count`, `last_error` | idle, running, ok, partial, failed |
| `connector_errors` | `id` (bigserial) | `connector`, `operation`, `error_kind`, `dedupe_key` | pending, retrying, dead_letter, resolved |

### 3.6 RAG

| Таблица | PK | Объём | Ключевые колонки |
|---------|----|-------|-----------------|
| `rag_chunks` | `id` (uuid) | **Очень высокий** (100K–1M+) | `embedding` vector(1536), `embedding_status`, `text_hash`, `content_tokens` |

Индексы:
- IVFFlat (100 lists) на `embedding`
- HNSW на `embedding` (если доступен)
- `(project_id, embedding_status, created_at DESC)`
- UNIQUE `(message_global_id, chunk_index)`

Autovacuum: `vacuum_scale_factor=0.02, analyze_scale_factor=0.01`.

### 3.7 KAG Graph (граф знаний)

#### kag_nodes (узлы)

15 типов: `project`, `client`, `person`, `stage`, `deliverable`, `conversation`, `message`, `task`, `blocker`, `deal`, `finance_entry`, `agreement`, `decision`, `risk`, `offer`

| Колонка | Тип | Описание |
|---------|-----|---------|
| `node_type` | text CHECK | Тип узла |
| `node_key` | text | Уникальный ключ в рамках типа |
| `status` | text | active, inactive, archived |
| `title` | text | Человекочитаемое название |
| `payload` | jsonb | Произвольные данные |
| `numeric_fields` | jsonb | Числовые поля (суммы, проценты) |
| `source_refs` | jsonb | Ссылки на первоисточники |
| `rag_chunk_refs` | jsonb | Ссылки на RAG chunks |

Индексы: `(project_id, node_type, node_key)` UNIQUE, `(project_id, node_type, status, updated_at DESC)`, GIN на `source_refs`.

#### kag_edges (рёбра)

20 типов связей: `project_has_*` (12), `conversation_has_message`, `message_authored_by_person`, `task_blocked_by_blocker`, `deliverable_depends_on_task`, `deal_for_client`, `agreement_for_deal`, `decision_about_stage`, `risk_impacts_deliverable`, `offer_targets_client`

| Колонка | Тип | Описание |
|---------|-----|---------|
| `from_node_id` | uuid FK | Исходный узел |
| `to_node_id` | uuid FK | Целевой узел |
| `relation_type` | text CHECK | Тип связи |
| `weight` | numeric(7,4) | Вес связи [0..1] |

Индексы:
- `(project_id, from_node_id, to_node_id, relation_type)` UNIQUE
- `(project_id, relation_type, status, updated_at DESC)`
- `(to_node_id, project_id, relation_type)` — **reverse lookup** (migration 0017)
- `(from_node_id, project_id)` — **forward lookup** (migration 0017)
- GIN на `source_refs`

> **Архитектурное решение:** Граф используется как data model и provenance store, НЕ для graph traversal. Все вычисления идут через event stream.

#### kag_events (события)

15 типов: `message_sent`, `decision_made`, `agreement_created`, `approval_approved`, `stage_started`, `stage_completed`, `task_created`, `task_blocked`, `blocker_resolved`, `deal_updated`, `finance_entry_created`, `risk_detected`, `scope_change_requested`, `need_detected`, `offer_created`

| Колонка | Тип | Описание |
|---------|-----|---------|
| `event_type` | text CHECK | Тип события |
| `event_ts` | timestamptz | Время события |
| `actor_node_id` | uuid FK | Кто (nullable) |
| `subject_node_id` | uuid FK | Что (nullable) |
| `status` | text | open, processed, ignored |

Индексы:
- `(project_id, event_type, event_ts DESC)`
- `(project_id, status, id ASC)` — для инкрементальной обработки
- `(project_id, id ASC) WHERE status = 'open'` — **partial queue index** (migration 0017)

### 3.8 KAG Provenance

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `kag_provenance_refs` | Обратный индекс: объект → источник | `object_kind`, `object_id`, `source_kind`, `message_id`, `linear_issue_id`, `attio_record_id`, `rag_chunk_id` |

CHECK constraint: хотя бы один source field должен быть NOT NULL.

### 3.9 KAG Signals & Scores

| Таблица | Назначение | Кардинальность |
|---------|-----------|---------------|
| `kag_signal_state` | Состояние автомата | 1 per project |
| `kag_signals` | Текущие значения | 10 per project (UNIQUE project_id, signal_key) |
| `kag_signal_history` | История | Растёт (retention-индекс в 0017) |
| `kag_scores` | Текущие скоры | 4 per project (UNIQUE project_id, score_type) |
| `kag_score_history` | История | Растёт (retention-индекс в 0017) |

10 сигналов: `waiting_on_client_days`, `response_time_avg`, `blockers_age`, `stage_overdue`, `agreement_overdue_count`, `sentiment_trend`, `scope_creep_rate`, `budget_burn_rate`, `margin_risk`, `activity_drop`

4 скора: `project_health`, `risk`, `client_value`, `upsell_likelihood`

### 3.10 KAG Recommendations v1

| Таблица | Назначение | Статусы |
|---------|-----------|---------|
| `kag_recommendations` | 5 категорий рекомендаций | proposed, accepted, dismissed, done |
| `kag_templates` | Шаблоны коммуникаций | UNIQUE (project_id, template_key, language, channel, version) |

### 3.11 KAG v2 — Forecasts & Enhanced Recommendations

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `kag_event_log` | Единая temporal-модель | 16+ event_types, `dedupe_key`, source trace fields |
| `project_snapshots` | Дневные срезы | `signals_json`, `scores_json`, `publishable` |
| `past_case_outcomes` | Исторические исходы | `outcome_type`, `severity`, `evidence_refs` |
| `case_signatures` | Similarity signatures | `window_days` (7/14/30), `signature_vector`, `signature_hash` |
| `kag_risk_forecasts` | Прогнозы рисков | 4 типа risk, `probability_7d/14d/30d`, `confidence`, `publishable` |
| `recommendations_v2` | Enhanced рекомендации | 6 категорий, `why_now`, `expected_impact`, evidence gating |
| `recommendation_action_runs` | Исполнение действий | `action_type`, retry fields, `correlation_id` |
| `kag_signals` / `kag_scores` | Shared | — |

#### recommendations_v2 — детальная структура

| Колонка | Тип | Описание |
|---------|-----|---------|
| `category` | text | 6 категорий (+ winback) |
| `priority` | int 1-5 | Приоритет |
| `due_date` | date | Дедлайн |
| `owner_role` | text | pm, finance_lead, account_manager |
| `status` | text | new → acknowledged → done / dismissed |
| `why_now` | text | Объяснение на основе forecast |
| `expected_impact` | text | Ожидаемый бизнес-эффект |
| `evidence_count` | int | Количество evidence refs |
| `evidence_quality_score` | numeric | Качество evidence [0..1] |
| `evidence_gate_status` | text | visible / hidden |
| `evidence_gate_reason` | text | Причина hidden |
| `shown_count` | int | Сколько раз показана |
| `helpful_feedback` | text | unknown / helpful / not_helpful |
| `forecast_snapshot` | jsonb | Снимок прогноза |

### 3.12 CRM

| Таблица | PK | Ключевые поля | FK |
|---------|----|---------------|-----|
| `crm_accounts` | uuid | `name`, `domain`, `stage`, `source_system` | — |
| `crm_account_contacts` | uuid | `role`, `is_primary` | FK → crm_accounts CASCADE |
| `crm_opportunities` | uuid | `stage` (6 стадий), `amount_estimate`, `probability` | FK → crm_accounts |
| `crm_opportunity_stage_events` | bigserial | `from_stage`, `to_stage`, `reason` | FK → crm_opportunities, audit_events |

### 3.13 Offers

| Таблица | Назначение | Статусы |
|---------|-----------|---------|
| `offers` | Коммерческие предложения | draft → approved → sent → signed / rejected |
| `offer_items` | Позиции в предложении | package, addon, discount |
| `offer_approvals` | Лог одобрений | approve_discount, approve_send, reject |

### 3.14 Campaigns

| Таблица | Назначение | Статусы |
|---------|-----------|---------|
| `campaigns` | Кампании рассылок | draft → approved → running → completed |
| `campaign_segments` | Сегменты аудитории | `filter_spec` (jsonb) |
| `campaign_members` | Участники | pending, active, completed, opted_out |
| `campaign_events` | Журнал событий | approved, sent, failed, reply_detected, opt_out |

### 3.15 Identity Resolution

| Таблица | Назначение |
|---------|-----------|
| `identity_link_suggestions` | Автосгенерированные предложения связей (confidence + reason) |
| `identity_links` | Подтверждённые связи (manual / suggestion) |

### 3.16 Audit & Evidence

| Таблица | Назначение |
|---------|-----------|
| `audit_events` | Полный audit trail (action, entity_type, entity_id, payload) |
| `evidence_items` | Универсальный evidence store с tsvector search |
| `outbound_messages` | Исходящие сообщения (state machine: draft → approved → sent) |
| `outbound_attempts` | Попытки отправки |
| `contact_channel_policies` | Opt-out, frequency caps, stop-on-reply |

### 3.17 Analytics Snapshots

| Таблица | Период | Ключевые метрики |
|---------|--------|-----------------|
| `analytics_revenue_snapshots` | 30/60/90 дней | pipeline, commit, won, expected, costs, margin |
| `analytics_delivery_snapshots` | per period | open_issues, overdue, completed, lead_time, throughput |
| `analytics_comms_snapshots` | per period | inbound/outbound messages, unique contacts, avg response |

### 3.18 Health & Risk (Legacy)

| Таблица | Назначение |
|---------|-----------|
| `health_scores` | Скоры здоровья аккаунтов |
| `risk_radar_items` | Элементы risk radar (severity, probability, mitigation) |
| `risk_pattern_events` | Паттерны рисков |
| `signals` (legacy) | Устаревшие сигналы (до KAG) |
| `next_best_actions` (legacy) | Устаревшие NBA (до KAG) |

### 3.19 Scheduling

| Таблица | Назначение |
|---------|-----------|
| `scheduled_jobs` | Активные job definitions (UNIQUE project_id + job_type) |
| `worker_runs` | Лог выполнения worker |
| `job_runs` | Лог выполнения background jobs |

### 3.20 Other

| Таблица | Назначение |
|---------|-----------|
| `case_library_entries` | Библиотека кейсов (draft → approved → archived) |
| `case_evidence_refs` | Evidence refs для кейсов |
| `upsell_opportunities` | Возможности upsell |
| `continuity_actions` | Continuity actions из Attio/Chatwoot |
| `daily_digests` | Дневные дайджесты (UNIQUE project_id + digest_date) |
| `weekly_digests` | Недельные дайджесты (UNIQUE project_id + week_start) |
| `sync_reconciliation_metrics` | Метрики полноты sync |

---

## 4) Diagram: основные связи между группами таблиц

```
account_scopes ──── projects ──── sessions
                       │
       ┌───────────────┼───────────────────────────────────┐
       │               │                                   │
   RAW LAYER      KAG GRAPH           CRM LAYER
   cw_messages    kag_nodes            crm_accounts
   cw_contacts    kag_edges            crm_opportunities
   linear_issues  kag_events           offers
   attio_accounts kag_provenance       campaigns
       │               │                    │
       │               ▼                    │
       │          SIGNALS/SCORES            │
       │          kag_signals               │
       │          kag_scores                │
       │               │                    │
       │          ┌────┴─────┐              │
       │          ▼          ▼              │
       │     FORECASTS   RECS v2           │
       │     kag_risk_   recommendations   │
       │     forecasts   _v2               │
       │                    │              │
       │                    ▼              │
       │          ACTION RUNS              │
       │          recommendation_          │
       │          action_runs              │
       │                                   │
       └──── RAG ────── EVIDENCE ──────────┘
             rag_chunks  audit_events
                         evidence_items
                         outbound_messages
```

---

## 5) Индексная стратегия (после аудита 0017)

### Принципы:

1. **Все business queries — project-scoped:** каждый индекс начинается с `project_id`
2. **Graph indexes — bidirectional:** forward (from_node) + reverse (to_node) для будущих traversal
3. **Queue indexes — partial:** `WHERE status = 'open'` для исключения обработанных записей
4. **History indexes — retention-friendly:** `computed_at ASC` для эффективного DELETE
5. **JSONB — GIN:** для обратного поиска по `evidence_refs` / `source_refs`
6. **Vector — двойной:** IVFFlat (recall) + HNSW (speed) на `rag_chunks.embedding`

### Полный реестр custom индексов (0017):

| Индекс | Таблица | Тип | Назначение |
|--------|---------|-----|-----------|
| `kag_edges_to_node_project_idx` | kag_edges | B-tree | Reverse edge lookup |
| `kag_edges_from_node_project_idx` | kag_edges | B-tree | Forward edge lookup |
| `kag_events_open_queue_idx` | kag_events | Partial B-tree | Unprocessed event queue |
| `kag_signal_history_retention_idx` | kag_signal_history | B-tree | Retention cleanup |
| `kag_score_history_retention_idx` | kag_score_history | B-tree | Retention cleanup |
| `kag_event_log_project_dedupe_idx` | kag_event_log | B-tree | Dedupe lookup |
| `recommendations_v2_active_visible_idx` | recommendations_v2 | Partial B-tree | Dashboard display |

---

## 6) Autovacuum Tuning

| Таблица | vacuum_scale_factor | analyze_scale_factor | Причина |
|---------|--------------------|--------------------|---------|
| `cw_messages` | 0.05 | 0.02 | High write volume (continuous sync) |
| `rag_chunks` | 0.02 | 0.01 | Very high write (embedding processing) |

---

## 7) Scope Guard Coverage

Trigger `enforce_project_scope_match` установлен на **каждую** таблицу с `project_id` + `account_scope_id`:

- Core: projects, sessions
- Raw: cw_*, linear_*, attio_*
- RAG: rag_chunks
- KAG: kag_nodes, kag_edges, kag_events, kag_provenance_refs, kag_signal_state, kag_signals, kag_signal_history, kag_scores, kag_score_history, kag_recommendations, kag_templates
- KAG v2: kag_risk_forecasts, recommendations_v2, recommendation_action_runs
- CRM: crm_accounts, crm_account_contacts, crm_opportunities, ...
- Audit: audit_events, evidence_items
- Outbound: outbound_messages, outbound_attempts
- Campaigns: campaigns, campaign_segments, campaign_members, campaign_events
- Analytics: analytics_*_snapshots
- etc.

---

## 8) Где смотреть детали

- **Фактическая схема (source of truth):** `server/db/migrations/*.sql`
- **Архитектура:** [`docs/architecture.md`](./architecture.md)
- **KAG v1:** [`docs/kag_recommendations.md`](./kag_recommendations.md)
- **KAG v2:** [`docs/kag_forecasting_recommendations.md`](./kag_forecasting_recommendations.md)
- **Pipelines:** [`docs/pipelines.md`](./pipelines.md)
- **Platform invariants:** [`docs/platform-architecture.md`](./platform-architecture.md)
