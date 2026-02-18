# Модель данных (PostgreSQL) — LightRAG-only

Источник истины: миграции в `server/db/migrations/*.sql`.

## 1) Базовые принципы

1. Все ключевые таблицы project-scoped (`project_id`, `account_scope_id`).
2. Scope-защита обеспечивается и API-слоем, и DB-триггерами.
3. Интеграции и jobs пишут идемпотентно (upsert + dedupe-ключи).
4. LightRAG выдача всегда привязана к source data (evidence/snippets).

## 2) Основные группы таблиц

### 2.1 Platform core

- `projects`, `account_scopes`
- `sessions`
- `scheduled_jobs`, `worker_runs`, `job_runs`
- `schema_migrations`

### 2.2 Connectors raw

**Chatwoot:**
- `cw_contacts`, `cw_conversations`, `cw_messages`
- `cw_inboxes_raw`, `cw_attachments_raw`

**Linear:**
- `linear_projects_raw`, `linear_issues_raw`
- `linear_states_raw`, `linear_cycles_raw`

**Attio:**
- `attio_accounts_raw`, `attio_opportunities_raw`
- `attio_people_raw`, `attio_activities_raw`

### 2.3 Reliability / ingestion ops

- `connector_sync_state`
- `connector_errors`
- `sync_reconciliation_metrics`

### 2.4 LightRAG слой

- `rag_chunks` (текст, embedding, lifecycle статусы)
- `lightrag_query_runs` (история запросов LightRAG, hit counts, evidence snapshot, answer)

### 2.5 CRM / offers / operations

- `crm_accounts`, `crm_account_contacts`
- `crm_opportunities`, `crm_opportunity_stage_events`
- `offers`, `offer_items`, `offer_approvals`
- `daily_digests`, `weekly_digests`
- `identity_link_suggestions`, `identity_links`
- `upsell_opportunities`, `continuity_actions`

### 2.6 Audit / outbound

- `audit_events`
- `evidence_items`
- `outbound_messages`, `outbound_attempts`
- `contact_channel_policies`

## 3) Legacy таблицы

KAG-таблицы и KAG-derived таблицы сохранены в схеме для rollback и исторической совместимости, но **не являются активным контуром** при `LIGHTRAG_ONLY=1`.

## 4) Важные индексы и производительность

- `rag_chunks(project_id, account_scope_id, embedding_status)` + vector index.
- `connector_errors(next_retry_at, status)` для retry-цикла.
- `sync_reconciliation_metrics(project_id, captured_at)` для dashboard трендов.
- `lightrag_query_runs(project_id, created_at desc)` для анализа запросов.

## 5) Где смотреть детали

- Миграции: `server/db/migrations/*.sql`
- Pipelines: [`docs/pipelines.md`](./pipelines.md)
- API: [`docs/api.md`](./api.md)
