# Архитектура системы — Definitive Reference (v2.0, 2026-02-17)

> Этот документ является **базисом продукта**. Все архитектурные решения зафиксированы
> после глубокого аудита кодовой базы, анализа технологий и верификации каждого компонента.
> Любые отклонения от этого документа должны быть обоснованы и задокументированы.

---

## 1) Архитектурные принципы (необсуждаемые)

| # | Принцип | Обоснование |
|---|---------|-------------|
| 1 | **Project-scope first** | Все данные привязаны к `project_id` + `account_scope_id`. Trigger `enforce_project_scope_match` на 79 таблицах. |
| 2 | **Evidence-first** | Ни одна производная сущность не публикуется без `evidence_refs`. Без доказательств = `publishable: false`. |
| 3 | **Deterministic intelligence** | Signals/scores/forecasts/recommendations вычисляются rules + stats. LLM только для extraction и templates. |
| 4 | **Event-sourced processing** | Intelligence pipeline работает через поток событий (`kag_events`), а не через обход графа. |
| 5 | **Idempotent everything** | Все операции — `ON CONFLICT ... DO UPDATE`, `dedupe_key`, bounded windows. |
| 6 | **PostgreSQL-native** | Вся система в одном PostgreSQL (+ pgvector). Никаких внешних графовых БД. |

---

## 2) Технологический стек

| Слой | Технология | Версия / Детали |
|------|-----------|-----------------|
| **Backend** | Node.js + Fastify v5 | `server/src/` — REST API, workers, services |
| **Frontend** | Next.js + React | `web/` — dashboard, portfolio, рекомендации |
| **База данных** | PostgreSQL 16 | pgvector, pgcrypto |
| **Миграции** | SQL migrations | `server/db/migrations/0001..0017` (17 миграций) |
| **Embeddings** | OpenAI | vector(1536), IVFFlat + HNSW индексы |
| **Интеграции** | Chatwoot, Linear, Attio | HTTP connectors, MCP-ready абстракция |
| **UI** | Tailwind CSS, Radix UI, Recharts | Responsive dashboard с дизайн-системой |

### Connection Pool (production)

```
max: 25 (конфигурируется через PG_POOL_MAX)
idleTimeoutMillis: 30_000
connectionTimeoutMillis: 10_000
statement_timeout: 30_000 (конфигурируется через PG_STATEMENT_TIMEOUT_MS)
application_name: labpics-dashboard (конфигурируется через PG_APP_NAME)
```

---

## 3) Архитектура — высокоуровневая схема

```
                    ┌─────────────────────────────────────────┐
                    │              FRONTEND (Next.js)          │
                    │  Dashboard · Portfolio · Recommendations │
                    │  Signals · Forecasts · CRM · Settings    │
                    └────────────────┬────────────────────────┘
                                     │ REST API
                    ┌────────────────▼────────────────────────┐
                    │              BACKEND (Fastify v5)           │
                    │                                          │
                    │  ┌─── Routes ──┐  ┌── Middleware ─────┐  │
                    │  │ /api/*      │  │ auth · csrf · req │  │
                    │  │ /kag/*      │  │ scope · error     │  │  ← legacy prefix
                    │  │ /connectors │  └───────────────────┘  │
                    │  └─────────────┘                         │
                    │                                          │
                    │  ┌─── Services ──────────────────────┐   │
                    │  │ kag · forecasting · recommendations│   │
                    │  │ portfolio · identity · campaigns   │   │
                    │  │ connectors · rag · offers · crm    │   │
                    │  └───────────────────────────────────┘   │
                    │                                          │
                    │  ┌─── Intelligence Engine ────────────┐   │
                    │  │ ingest · graph · signals · scoring  │   │
                    │  │ recommendations · templates         │   │
                    │  └────────────────────────────────────┘   │
                    │                                          │
                    │  ┌─── Scheduler ─────────────────────┐   │
                    │  │ 15min sync · 5min retry · daily    │   │
                    │  │ pipeline · weekly signatures       │   │
                    │  └───────────────────────────────────┘   │
                    └────────────────┬────────────────────────┘
                                     │
                    ┌────────────────▼────────────────────────┐
                    │         PostgreSQL 16 + pgvector          │
                    │  79 tables · 17 migrations · triggers    │
                    │  IVFFlat/HNSW · GIN · scope guards       │
                    └──────────┬──────────┬──────────┬────────┘
                               │          │          │
                    ┌──────────▼┐  ┌──────▼──┐  ┌───▼───────┐
                    │  Chatwoot  │  │  Linear  │  │   Attio   │
                    │ messages   │  │  issues  │  │   deals   │
                    │ contacts   │  │  cycles  │  │  accounts │
                    └────────────┘  └─────────┘  └───────────┘
```

---

## 4) Группы таблиц (24 группы, 79 таблиц)

### 4.1 Core Platform (7 таблиц)

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `account_scopes` | Мультитенантная зона доступа | `scope_key` UNIQUE |
| `projects` | Проекты | FK → account_scopes |
| `sessions` | Web-сессии | `active_project_id`, CSRF |
| `app_users` | Учётные записи | `username` UNIQUE |
| `signup_requests` | Регистрация с PIN | TTL + attempts |
| `app_settings` | Системные настройки | key-value |
| `schema_migrations` | Контроль миграций | `filename` PK |

### 4.2 Ingestion Raw (14 таблиц)

**Chatwoot** (5): `cw_contacts`, `cw_conversations`, `cw_messages`, `cw_inboxes_raw`, `cw_attachments_raw`

**Linear** (4): `linear_projects_raw`, `linear_issues_raw`, `linear_states_raw`, `linear_cycles_raw`

**Attio** (4): `attio_accounts_raw`, `attio_opportunities_raw`, `attio_people_raw`, `attio_activities_raw`

**Sync** (1): `project_sources` — конфигурация подключений

### 4.3 Connector Reliability (2 таблицы)

| Таблица | Назначение |
|---------|-----------|
| `connector_sync_state` | Cursor + status + retry per connector |
| `connector_errors` | DLQ с backoff и dead-letter статусами |

### 4.4 RAG (2 таблицы)

| Таблица | Назначение | Ключевые детали |
|---------|-----------|----------------|
| `rag_chunks` | Текстовые чанки + embeddings | vector(1536), IVFFlat + HNSW, autovacuum tuned |
| `sync_watermarks` | Legacy source cursors | Composite PK (project_id, source) |

### 4.5 Intelligence v1 — Graph + Signals (11 таблиц)

> **Naming note:** Таблицы и код используют prefix `kag_` (legacy, от "Knowledge-Augmented Graph").
> Концептуально система называется **Project Intelligence Pipeline** — правила + статистика, без graph traversal.

| Таблица | Назначение | Объём |
|---------|-----------|-------|
| `kag_nodes` | Узлы графа (15 типов) | 1K–10K per project |
| `kag_edges` | Рёбра графа (21 тип связей) | 10K–100K per project |
| `kag_events` | Поток событий (15 типов) | 10K–100K per project |
| `kag_provenance_refs` | Провенанс: объект → источник | Пропорционально nodes+edges |
| `kag_signal_state` | Состояние сигнального автомата | 1 per project |
| `kag_signals` | Текущие значения 10 сигналов | 10 per project |
| `kag_signal_history` | История значений сигналов | Растёт со временем |
| `kag_scores` | Текущие 4 скора | 4 per project |
| `kag_score_history` | История скоров | Растёт со временем |
| `kag_recommendations` | Рекомендации v1 (5 категорий) | 0–50 per project |
| `kag_templates` | Шаблоны коммуникаций | Десятки per project |

### 4.6 Intelligence v2 — Forecasting + Recommendations Lifecycle (8 таблиц)

| Таблица | Назначение |
|---------|-----------|
| `kag_event_log` | Единая temporal-модель (domain + process events) |
| `project_snapshots` | Дневные срезы (signals + scores + aggregates) |
| `past_case_outcomes` | Исторические исходы для similarity |
| `case_signatures` | Сигнатуры проектов (окна 7/14/30) |
| `kag_risk_forecasts` | Прогнозы рисков (7/14/30 дней, 4 типа) |
| `recommendations_v2` | Рекомендации с lifecycle + evidence gating |
| `recommendation_action_runs` | Исполнение действий по рекомендациям |
| `kag_signals` (shared) | Shared with v1 |

### 4.7 CRM / Operations (12 таблиц)

`crm_accounts`, `crm_account_contacts`, `crm_opportunities`, `crm_opportunity_stage_events`,
`offers`, `offer_items`, `offer_approvals`,
`campaigns`, `campaign_segments`, `campaign_members`, `campaign_events`,
`signals` (legacy), `next_best_actions` (legacy)

### 4.8 Identity Resolution (2 таблицы)

| Таблица | Назначение |
|---------|-----------|
| `identity_link_suggestions` | Предложения связей (confidence + reason) |
| `identity_links` | Подтверждённые связи между сущностями |

### 4.9 Audit / Evidence / Outbound (5 таблиц)

`audit_events`, `evidence_items`, `outbound_messages`, `outbound_attempts`, `contact_channel_policies`

### 4.10 Analytics / Health / Risk (8 таблиц)

`health_scores`, `risk_radar_items`, `risk_pattern_events`,
`analytics_revenue_snapshots`, `analytics_delivery_snapshots`, `analytics_comms_snapshots`,
`daily_digests`, `weekly_digests`

### 4.11 Scheduling (3 таблицы)

`scheduled_jobs`, `worker_runs`, `job_runs`

### 4.12 Reconciliation (1 таблица)

`sync_reconciliation_metrics`

### 4.13 Other

`upsell_opportunities`, `continuity_actions`, `case_library_entries`, `case_evidence_refs`

---

## 5) Project Intelligence Pipeline — полный data flow

> **Ранее в коде называлось "KAG" (Knowledge-Augmented Graph).** Prefix `kag_` сохраняется в таблицах и коде
> как legacy. Концептуально это **Project Intelligence Pipeline** — rules-based аналитика + forecasting.

Это **ядро продукта**. Pipeline работает event-sourced: данные проходят через
чётко определённые стадии, каждая из которых детерминирована и трассируема.

```
┌──────────────────────────────────────────────────────────┐
│                    EXTERNAL SOURCES                       │
│  Chatwoot (messages, contacts)                           │
│  Linear (issues, cycles, states)                         │
│  Attio (accounts, deals, people, activities)             │
└──────────┬──────────┬──────────┬─────────────────────────┘
           │          │          │
           ▼          ▼          ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 1: INGEST                                         │
│  server/src/kag/ingest/index.js                          │
│                                                          │
│  buildGraphArtifactsFromSources()                        │
│    Messages → conversation + message nodes               │
│    Issues   → task nodes + blocked edges                 │
│    Deals    → deal + finance_entry nodes                 │
│    Entity extraction (Agreement, Decision, Risk via LLM) │
│                                                          │
│  Output: { nodes[], edges[], events[] }                  │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 2: GRAPH PERSISTENCE                              │
│  server/src/kag/graph/index.js                           │
│                                                          │
│  upsertGraphNodes()  → kag_nodes                         │
│  upsertGraphEdges()  → kag_edges                         │
│  insertGraphEvents() → kag_events                        │
│  insertProvenanceRefs() → kag_provenance_refs            │
│                                                          │
│  ВАЖНО: граф служит data model и провенансом,            │
│  НЕ используется для graph traversal.                    │
│  Вся обработка идёт через event stream (stage 3).       │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 3: SIGNAL COMPUTATION (incremental)               │
│  server/src/kag/signals/index.js                         │
│                                                          │
│  1. Fetch events WHERE status='open' AND id > last_id    │
│  2. applyEventsIncrementally(state, events)              │
│  3. computeSignalsFromState(state)                       │
│                                                          │
│  10 signals:                                             │
│  ┌─────────────────────────┬────────┬──────────┐         │
│  │ Signal                  │ Warn   │ Critical │         │
│  ├─────────────────────────┼────────┼──────────┤         │
│  │ waiting_on_client_days  │ 2      │ 4        │         │
│  │ response_time_avg (min) │ 240    │ 720      │         │
│  │ blockers_age (days)     │ 3      │ 5        │         │
│  │ stage_overdue (days)    │ 1      │ 3        │         │
│  │ agreement_overdue_count │ 1      │ 2        │         │
│  │ sentiment_trend         │ -0.15  │ -0.3     │         │
│  │ scope_creep_rate        │ 0.2    │ 0.35     │         │
│  │ budget_burn_rate        │ 1.1    │ 1.2      │         │
│  │ margin_risk             │ 0.25   │ 0.4      │         │
│  │ activity_drop           │ 0.3    │ 0.5      │         │
│  └─────────────────────────┴────────┴──────────┘         │
│                                                          │
│  State: kag_signal_state (EWMA, rolling windows, queues) │
│  Output: kag_signals + kag_signal_history                │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 4: SCORING                                        │
│  server/src/kag/scoring/index.js                         │
│                                                          │
│  4 scores (0-100, weighted aggregation):                 │
│                                                          │
│  ProjectHealth = 100 - weightedAvg(risk_components)      │
│    Weights: blockers=0.15, stage=0.15, waiting=0.1,      │
│    scope=0.1, budget=0.1, agreement=0.1, response=0.08,  │
│    sentiment=0.08, margin=0.08, activity=0.06            │
│                                                          │
│  RiskScore = weightedAvg(risk_components)                │
│    Weights: blockers=0.18, stage=0.18, budget=0.16,      │
│    margin=0.16, scope=0.1, agreement=0.08, ...           │
│                                                          │
│  ClientValue = weighted(revenue, margin, engagement,     │
│    sentiment, stability)                                 │
│                                                          │
│  UpsellLikelihood = weighted(client_value, need_signal,  │
│    commercial_stability)                                 │
│                                                          │
│  Output: kag_scores + kag_score_history                  │
└──────────────────────┬───────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌─────────────┐ ┌────────────┐ ┌──────────────────┐
│ STAGE 5a:   │ │ STAGE 5b:  │ │ STAGE 5c:        │
│ RECS v1     │ │ FORECAST   │ │ RECS v2          │
│             │ │            │ │                  │
│ 5 categories│ │ 4 risk     │ │ 6 categories     │
│ rule-based  │ │ types      │ │ forecast-aware   │
│ evidence    │ │ 7/14/30d   │ │ evidence gating  │
│ gate: any   │ │ similar    │ │ quality scoring  │
│             │ │ cases      │ │ lifecycle/feedback│
│ → kag_      │ │ → kag_risk_│ │ → recommendations│
│   recommend │ │   forecasts│ │   _v2            │
│   ations    │ │            │ │                  │
└─────────────┘ └────────────┘ └──────────────────┘
```

### Orchestration

Полный pipeline запускается через `runKagRecommendationRefresh()` в `server/src/services/kag.js`.

Cadence: каждые **15 минут** (scheduler job `kag_recommendations_refresh`).

Feature flags (env vars, default `false`):
- `KAG_ENABLED` — весь intelligence pipeline
- `RECOMMENDATIONS_ENABLED` — рекомендации v1
- `KAG_SNAPSHOTS_ENABLED` — daily snapshots
- `KAG_FORECASTING_ENABLED` — risk forecasts
- `KAG_RECOMMENDATIONS_V2_ENABLED` — рекомендации v2

> Имена feature flags начинаются с `KAG_` по историческим причинам (legacy prefix).

---

## 6) RAG Pipeline

```
Messages/Documents → chunking → rag_chunks (text, text_hash)
                                     │
                         embeddings job (OpenAI)
                                     │
                                     ▼
                         rag_chunks.embedding = vector(1536)
                         embedding_status = 'ready'
                                     │
                         search (cosine distance)
                         IVFFlat (100 lists) + HNSW
                                     │
                                     ▼
                         evidence-backed search results
```

Autovacuum tuned: `vacuum_scale_factor=0.02, analyze_scale_factor=0.01` (high write volume).

---

## 7) Connector Architecture

```
                    ┌──────────────────────────────────────┐
                    │         runConnectorSync()             │
                    │  mode: HTTP (default) | MCP            │
                    └──────────┬───────────────────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │ Chatwoot │    │  Linear  │    │  Attio   │
        │ HTTP API │    │ GraphQL  │    │ REST API │
        └────┬─────┘    └────┬─────┘    └────┬─────┘
             │               │               │
             ▼               ▼               ▼
        cw_messages     linear_issues   attio_accounts
        cw_contacts     linear_cycles   attio_opportunities
        cw_conversations linear_states  attio_people
        cw_inboxes_raw  linear_projects attio_activities
        cw_attachments                  _raw
```

**Reliability:**
- Ошибки → `connector_errors` (backoff + DLQ)
- Status tracking → `connector_sync_state`
- Retry policy: `max 5 attempts`, `base 30s`, exponential backoff
- fetchWithRetry: retries on 408/425/429/5xx

---

## 8) Multi-tenant Security Model

```
account_scopes (root)
     │
     ├── project_1 ─── все данные project_1
     ├── project_2 ─── все данные project_2
     └── project_N ─── все данные project_N
```

**Enforcement:**
- Trigger `enforce_project_scope_match` на **каждой** доменной таблице (79)
- BEFORE INSERT OR UPDATE: проверяет что `account_scope_id` записи совпадает с `account_scope_id` проекта
- Cross-scope write физически невозможен на уровне БД

**API уровень:**
- Protected endpoints требуют session
- Active project из `sessions.active_project_id`
- Mutating requests: CSRF token
- Request tracing: `x-request-id` header

---

## 9) Indexing Strategy

### Критические индексы (production audit)

**Intelligence Graph (tables: `kag_nodes`, `kag_edges`):**
```sql
-- Forward: UNIQUE (project_id, node_type, node_key)              -- implicit
-- Forward: (project_id, node_type, status, updated_at DESC)      -- 0008
-- Reverse edge: (to_node_id, project_id, relation_type)          -- 0017 NEW
-- Forward edge: (from_node_id, project_id)                       -- 0017 NEW
-- Edge relation: (project_id, relation_type, status, updated_at) -- 0008
```

**Intelligence Events (table: `kag_events`):**
```sql
-- Queue: (project_id, id ASC) WHERE status = 'open'              -- 0017 NEW (partial)
-- Timeline: (project_id, event_type, event_ts DESC)              -- 0008
-- Processing: (project_id, status, id ASC)                       -- 0008
```

**RAG:**
```sql
-- Vector: IVFFlat (100 lists) on embedding                       -- 0003
-- Vector: HNSW on embedding (if available)                       -- 0003
-- Queue: (project_id, embedding_status, created_at DESC)
-- Dedupe: (message_global_id, chunk_index) UNIQUE
```

**Recommendations v2:**
```sql
-- Dashboard: (project_id, priority DESC, created_at DESC)        -- 0017 NEW
--   WHERE evidence_gate_status = 'visible'
--     AND status IN ('new', 'acknowledged')
-- Lifecycle: (project_id, status, priority DESC, updated_at)     -- 0012
```

**Provenance:**
```sql
-- Object lookup: (project_id, object_kind, object_id)            -- 0008
-- Source trace: (project_id, message_id) WHERE NOT NULL           -- 0008
-- Source trace: (project_id, linear_issue_id) WHERE NOT NULL      -- 0008
-- Source trace: (project_id, attio_record_id) WHERE NOT NULL      -- 0008
-- Unique: composite on all source fields                          -- 0008
```

**History (retention-friendly):**
```sql
-- Signal history: (project_id, computed_at ASC)                   -- 0017 NEW
-- Score history: (project_id, computed_at ASC)                    -- 0017 NEW
```

### GIN Indexes (JSONB)

Применяются на `evidence_refs` и `source_refs` для обратного поиска:
- `kag_nodes.source_refs`
- `kag_edges.source_refs`
- `kag_events.source_refs`
- `kag_recommendations.evidence_refs`
- `recommendations_v2.evidence_refs`
- `audit_events.evidence_refs`

---

## 10) Scheduling и автоматизации

| Job | Cadence | Что делает | Таблицы |
|-----|---------|-----------|---------|
| `connectors_sync_cycle` | ~15 min | Инкрементальный sync Chatwoot/Linear/Attio | `cw_*`, `linear_*`, `attio_*`, `connector_sync_state` |
| `connector_errors_retry` | ~5 min | Retry due errors | `connector_errors` |
| `kag_recommendations_refresh` | ~15 min | Full intelligence pipeline (signals→scores→recs) | `kag_*`, `recommendations_v2` |
| `embeddings_run` | ~20 min | Генерация embeddings | `rag_chunks` |
| `kag_daily_pipeline` | 1/day | Snapshot + forecast + recs v2 | `project_snapshots`, `kag_risk_forecasts` |
| `case_signatures_refresh` | 1/week | Пересборка similarity signatures | `case_signatures` |
| `daily_digest` | 1/day | Дневной дайджест | `daily_digests` |
| `weekly_digest` | 1/week | Недельный дайджест | `weekly_digests` |

Logging: все процессы пишут в `kag_event_log` (`process_started/finished/failed/warning`).

> Job names сохраняют prefix `kag_` для backward compatibility с существующими `scheduled_jobs` записями.

---

## 11) Evidence Gating Policy (recommendations v2)

```
                    ┌───────────────────────────────┐
                    │  Evidence Refs Input           │
                    │  [message_id, linear_issue_id, │
                    │   attio_record_id, ...]        │
                    └──────────────┬────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │  Quality Scoring               │
                    │                                │
                    │  countScore = count / (min*2)   │
                    │  diversityScore = sources / 3   │
                    │  primaryScore = has_primary?1:0  │
                    │                                │
                    │  quality = 0.5*count            │
                    │          + 0.35*diversity       │
                    │          + 0.15*primary         │
                    └──────────────┬────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │  Gate Decision                  │
                    │                                │
                    │  count >= MIN_COUNT (def 2)     │
                    │  quality >= MIN_QUALITY (0.35)  │
                    │  has_primary_source (def true)  │
                    │                                │
                    │  → visible / hidden + reason    │
                    └────────────────────────────────┘
```

Env vars: `RECOMMENDATIONS_EVIDENCE_MIN_COUNT`, `RECOMMENDATIONS_EVIDENCE_MIN_QUALITY`, `RECOMMENDATIONS_EVIDENCE_ALLOW_SECONDARY_ONLY`.

---

## 12) Архитектурное решение: почему НЕ Apache AGE

> Зафиксировано после глубокого аудита (2026-02-17).

### Факты:
1. **Граф НЕ используется для traversal.** В коде — 0 рекурсивных запросов, 0 multi-hop queries, 0 JOIN между kag_nodes и kag_edges. Pipeline работает через event stream.
2. **Apache AGE в кризисе.** Команда разработки уволена Bitnine (Oct 2024). 19 committers, organic contributions "incredibly low". Production readiness: 4/10.
3. **AGE не даёт ничего для нашего use case.** Cypher синтаксис для traversals, которые мы не выполняем.
4. **Риск: конфликт с pgvector.** Требует кастомный Docker image, custom compile.

### Решение:
- **PostgreSQL + plain SQL** — правильная архитектура для текущих паттернов
- **Recursive CTEs** — доступны бесплатно когда/если понадобится multi-hop traversal
- **Граф (kag_nodes/edges)** — остаётся как data model и provenance, не как traversal engine
- **Naming:** Prefix `kag_` в коде — legacy от "Knowledge-Augmented Graph". Концептуально система называется **Project Intelligence Pipeline**. Имена будут нормализованы при рефакторинге.

### Пороги для пересмотра:
| Сценарий | Порог | Действие |
|----------|-------|---------|
| Event processing (текущий паттерн) | 10M+ nodes, 1M+ per project | Partition by project_id |
| Если добавить 2-3 hop traversal | До 500K edges per project | Recursive CTE + indexes |
| Если добавить 4+ hop traversal | >50K edges with high connectivity | Пересмотреть AGE/external graph DB |
| Real-time PageRank/centrality | Любой масштаб | Dedicated graph DB или offline compute |

---

## 13) Explainability Chain (полная трассируемость)

```
Recommendation
  └── evidence_refs[]
       ├── message_id ──────→ cw_messages → Chatwoot
       ├── linear_issue_id ──→ linear_issues_raw → Linear
       ├── attio_record_id ──→ attio_*_raw → Attio
       └── rag_chunk_id ────→ rag_chunks → embedding source

kag_provenance_refs (reverse index):
  object_kind (node|edge|event|signal|score|recommendation)
  object_id
  source_kind (chatwoot_message|linear_issue|attio_record|document|rag_chunk|manual|system)
  → позволяет трассировать ОТ источника К производным сущностям
```

---

## 14) Environment Variables (полный список)

### Database
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PG_POOL_MAX` | 25 | Max pool connections |
| `PG_STATEMENT_TIMEOUT_MS` | 30000 | Query timeout (ms) |
| `PG_APP_NAME` | labpics-dashboard | Application name for pg_stat |

### Feature Flags (prefix `KAG_` — legacy)
| Variable | Default | Description |
|----------|---------|-------------|
| `KAG_ENABLED` | false | Enable entire intelligence pipeline |
| `RECOMMENDATIONS_ENABLED` | false | Enable recommendations v1 |
| `KAG_SNAPSHOTS_ENABLED` | false | Enable daily project snapshots |
| `KAG_FORECASTING_ENABLED` | false | Enable risk forecasting |
| `KAG_RECOMMENDATIONS_V2_ENABLED` | false | Enable recommendations v2 |

### Evidence Gating
| Variable | Default | Description |
|----------|---------|-------------|
| `RECOMMENDATIONS_EVIDENCE_MIN_COUNT` | 2 | Min evidence refs |
| `RECOMMENDATIONS_EVIDENCE_MIN_QUALITY` | 0.35 | Min quality score [0,1] |
| `RECOMMENDATIONS_EVIDENCE_ALLOW_SECONDARY_ONLY` | false | Allow secondary sources only |
| `RECOMMENDATIONS_V2_LLM_TOP_N` | 3 | Max LLM template generations per refresh |

### Connectors
| Variable | Default | Description |
|----------|---------|-------------|
| `CHATWOOT_BASE_URL` | — | Chatwoot API URL |
| `CHATWOOT_API_TOKEN` | — | Chatwoot API token |
| `CHATWOOT_ACCOUNT_ID` | — | Chatwoot account ID |
| `LINEAR_BASE_URL` | — | Linear API URL |
| `LINEAR_API_TOKEN` | — | Linear API token |
| `ATTIO_BASE_URL` | — | Attio API URL |
| `ATTIO_API_TOKEN` | — | Attio API token |
| `CONNECTOR_MODE` | http | http or mcp |
| `CONNECTOR_MAX_RETRIES` | 5 | Max retry attempts |
| `CONNECTOR_RETRY_BASE_SECONDS` | 30 | Base retry interval |

### OpenAI
| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI API key |

---

## 15) Смежные документы

| Документ | Содержание |
|----------|-----------|
| [`docs/data-model.md`](./data-model.md) | Подробная модель данных (все таблицы) |
| [`docs/platform-architecture.md`](./platform-architecture.md) | Платформенные инварианты |
| [`docs/pipelines.md`](./pipelines.md) | Расписание и автоматизации |
| [`docs/kag_recommendations.md`](./kag_recommendations.md) | Intelligence v1 (recommendations) |
| [`docs/kag_forecasting_recommendations.md`](./kag_forecasting_recommendations.md) | Intelligence v2 (forecasting + recommendations) |
| [`docs/api.md`](./api.md) | API endpoints |
| [`docs/frontend-design.md`](./frontend-design.md) | Frontend дизайн |
| [`docs/product/overview.md`](./product/overview.md) | Продуктовый обзор |
| [`docs/runbooks.md`](./runbooks.md) | Операционные runbooks |
| [`docs/glossary.md`](./glossary.md) | Глоссарий терминов |

---

## 16) Migration History

| # | Файл | Содержание |
|---|------|-----------|
| 0001 | `0001_init.sql` | Core tables, Chatwoot raw, RAG chunks |
| 0002 | `0002_indexes.sql` | Performance indexes |
| 0003 | `0003_contacts_and_vector_optimizations.sql` | pgvector indexes, contact optimizations |
| 0004 | `0004_auth_users_signup_and_settings.sql` | Auth system |
| 0005 | `0005_platform_scope_audit_outbox_worker.sql` | Multi-tenant scoping, audit, outbox |
| 0006 | `0006_roadmap_crm_signals_offers_campaigns_health_cases_analytics.sql` | Full CRM + analytics |
| 0007 | `0007_control_tower_sync_linking_and_digests.sql` | Connectors, identity, digests |
| 0008 | `0008_kag_recommendations_mvp.sql` | Intelligence graph, signals, scores, recommendations v1 |
| 0009 | `0009_connectors_event_log_and_raw_extensions.sql` | Event log, raw table extensions |
| 0010 | `0010_project_snapshots_and_outcomes.sql` | Snapshots, outcomes |
| 0011 | `0011_case_signatures.sql` | Similarity signatures |
| 0012 | `0012_forecasts_and_recommendations_v2.sql` | Risk forecasts, recommendations v2 |
| 0013 | `0013_process_events_and_evidence_gating.sql` | Process events, publishable flags |
| 0014 | `0014_crm_external_refs_for_dedupe.sql` | CRM deduplication |
| 0015 | `0015_recommendation_actions_and_gating.sql` | Action runs, evidence gating fields |
| 0016 | `0016_reconciliation_and_action_correlation.sql` | Reconciliation metrics, correlation |
| 0017 | `0017_production_indexes_and_pool.sql` | **Production index optimizations** |
