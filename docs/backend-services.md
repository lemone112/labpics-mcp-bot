# Backend Services — полная спецификация (v2.0, 2026-02-17)

> Документ описывает каждый сервис бэкенда: назначение, экспортируемые функции,
> зависимости, таблицы БД и API endpoints. Является частью базиса продукта.

---

## 1) Архитектура бэкенда

```
server/src/
├── index.js                    # Fastify app, routes, middleware (main entry)
├── worker.js                   # Single-run worker (one scheduler tick)
├── worker-loop.js              # Continuous worker loop
├── lib/
│   ├── db.js                   # PostgreSQL pool + transactions
│   ├── redis.js                # Redis client factory (ioredis)
│   ├── redis-pubsub.js         # Redis Pub/Sub wrapper (publish + subscribe)
│   ├── sse-broadcaster.js      # SSE client manager (per project_id)
│   ├── http.js                 # fetchWithRetry
│   ├── api-contract.js         # ApiError, sendOk, sendError
│   ├── scope.js                # getRequestScope, requireProjectScope
│   ├── chunking.js             # Text chunking for RAG
│   └── utils.js                # toIsoTime, toPositiveInt, parseProjectIdsInput
├── services/
│   ├── chatwoot.js             # Chatwoot connector
│   ├── linear.js               # Linear connector
│   ├── attio.js                # Attio connector
│   ├── connector-state.js      # Sync state & error tracking
│   ├── connector-sync.js       # Orchestration layer
│   ├── reconciliation.js       # Data consistency checks
│   ├── sources.js              # Project source bindings
│   ├── embeddings.js           # OpenAI embeddings
│   ├── openai.js               # OpenAI API client
│   ├── process-log.js           # Process run logging
│   ├── event-log.js             # Event logging (connector_events)
│   ├── forecasting.js          # Risk forecasting
│   ├── recommendations-v2.js   # Enhanced recommendations
│   ├── recommendation-actions.js # Action execution
│   ├── similarity.js           # Case signature & search
│   ├── snapshots.js            # Project snapshots
│   ├── intelligence.js         # Risk, analytics, digests
│   ├── signals.js              # Signal extraction
│   ├── identity-graph.js       # Entity resolution
│   ├── portfolio.js            # Portfolio overview
│   ├── continuity.js           # Continuity actions
│   ├── outbox.js               # Outbound messaging
│   ├── upsell.js               # Upsell detection
│   ├── loops.js                # Loops email sync
│   ├── scheduler.js            # Job scheduling
│   ├── jobs.js                 # Job status tracking
│   ├── audit.js                # Audit trail
│   └── ...
```

---

## 2) Main Entry Point

**File:** `server/src/index.js`

**Framework:** Fastify v5 (не Express)
- Port: `PORT` (default 8080)
- Host: `HOST` (default 0.0.0.0)
- Body limit: 64KB
- CORS: `CORS_ORIGIN` (default http://localhost:3000)
- Cookies: SameSite=lax, secure (production), httpOnly, maxAge 14 days

**Middleware hooks:**
1. `onRequest` — Session validation, CSRF enforcement for mutations
2. `preValidation` — Scope hydration (resolves active project)
3. `onResponse` — Response metrics

**SSE endpoint:**
- `GET /events/stream` — Server-Sent Events, real-time job completion push (Redis Pub/Sub → browser)

**Public routes (no auth):**
- `GET /health` — Service health check
- `GET /metrics` — Prometheus-format metrics (includes SSE connection counts)

---

## 3) Service Catalog

### 3.1 Connectors

#### chatwoot.js
| | |
|-|-|
| **Назначение** | Синхронизация данных из Chatwoot |
| **Exported** | `runChatwootSync(pool, scope, logger)` |
| **Tables write** | cw_conversations, cw_messages, cw_contacts, cw_inboxes_raw, cw_attachments_raw, rag_chunks, sync_watermarks |
| **External API** | Chatwoot REST API |
| **Cadence** | ~15 min (connectors_sync_cycle) |

#### linear.js
| | |
|-|-|
| **Назначение** | Синхронизация данных из Linear |
| **Exported** | `runLinearSync(pool, scope, logger)` |
| **Tables write** | linear_projects_raw, linear_issues_raw, linear_states_raw, linear_cycles_raw, sync_watermarks |
| **External API** | Linear GraphQL API |
| **Cadence** | ~15 min (connectors_sync_cycle) |

#### attio.js
| | |
|-|-|
| **Назначение** | Синхронизация данных из Attio + CRM mirror |
| **Exported** | `runAttioSync(pool, scope, logger)` |
| **Tables write** | attio_accounts_raw, attio_opportunities_raw, attio_people_raw, attio_activities_raw, crm_accounts, crm_opportunities, sync_watermarks |
| **External API** | Attio REST API v2 |
| **Cadence** | ~15 min (connectors_sync_cycle) |

#### connector-state.js
| | |
|-|-|
| **Назначение** | Управление состоянием коннекторов и DLQ |
| **Exported** | `getConnectorSyncState`, `markConnectorSyncRunning`, `markConnectorSyncSuccess`, `markConnectorSyncFailure`, `registerConnectorError`, `listDueConnectorErrors`, `resolveConnectorErrors`, `retryConnectorError` |
| **Tables** | connector_sync_state, connector_errors |

#### connector-sync.js
| | |
|-|-|
| **Назначение** | Оркестрация всех коннекторов |
| **Exported** | `runConnectorSync(pool, scope, connectorName)`, `runAllConnectorsSync(pool, scope)` |
| **Зависимости** | chatwoot.js, linear.js, attio.js, connector-state.js, process-log.js |

#### sources.js
| | |
|-|-|
| **Назначение** | Привязка внешних источников к проектам |
| **Exported** | `resolveProjectSourceBinding(pool, scope, sourceKind, externalId, meta)` |
| **Tables** | project_sources |

### 3.2 Intelligence Pipeline

> KAG pipeline (kag.js + kag/ directory) полностью удалён в Iter 10.

#### ~~forecasting.js~~ — удалён (Iter 10, [#117](https://github.com/lemone112/labpics-dashboard/issues/117))

Прогнозирование рисков. Файл удалён вместе с KAG pipeline. Функциональность заменена `intelligence.js` (risk/health refresh).

#### ~~recommendations-v2.js~~ — удалён (Iter 10, [#117](https://github.com/lemone112/labpics-dashboard/issues/117))

Enhanced рекомендации с evidence gating. Файл удалён вместе с KAG pipeline.

#### recommendation-actions.js (orphaned — не импортируется)
| | |
|-|-|
| **Назначение** | Исполнение действий по рекомендациям |
| **Exported** | `runRecommendationAction`, `listRecommendationActionRuns`, `retryRecommendationActionRun` |
| **Tables** | recommendation_action_runs, recommendations_v2 |
| **Статус** | Файл существует, но **не импортируется** ни в routes, ни в scheduler. Кандидат на удаление. |

#### ~~similarity.js~~ — удалён

Case-based reasoning. Файл удалён вместе с KAG pipeline.

#### ~~snapshots.js~~ — удалён (Iter 10, [#117](https://github.com/lemone112/labpics-dashboard/issues/117))

Дневные снимки состояния проектов. Файл удалён вместе с KAG pipeline.

### 3.3 RAG & LightRAG

#### lightrag.js
| | |
|-|-|
| **Назначение** | Основной интеллект-контур продукта: запросы, evidence, observability |
| **Exported** | `getLightRagStatus(pool, scope)`, `refreshLightRag(pool, scope, logger)`, `queryLightRag(pool, scope, options, logger)` |
| **Tables read** | rag_chunks, cw_messages, linear_issues_raw, attio_opportunities_raw |
| **Tables write** | lightrag_query_runs |
| **Зависимости** | embeddings.js (runEmbeddings, searchChunks) |

**Внутренняя логика `queryLightRag`:**
1. Токенизация: split по `[^a-zA-Zа-яА-Я0-9_]+`, фильтр длины ≥ 3, дедуп, max 6 токенов
2. Параллельный поиск: vector similarity (pgvector) + ILIKE patterns по source-таблицам
3. Evidence building: нормализация результатов из всех источников (source_type, source_pk, snippet, metadata)
4. Persist: логирование запроса в `lightrag_query_runs`
5. Limits: query max 4000 chars, answer max 10,000 chars, evidence max 50 items, topK 1-50, sourceLimit 1-25

#### embeddings.js
| | |
|-|-|
| **Назначение** | Генерация и управление embeddings |
| **Exported** | `runEmbeddings(pool, scope, logger)`, `searchChunks(pool, scope, query, limit)` |
| **Tables** | rag_chunks |
| **External API** | OpenAI Embeddings API |
| **Cadence** | ~20 min (embeddings_run) |

#### openai.js
| | |
|-|-|
| **Назначение** | OpenAI API клиент |
| **Exported** | `createEmbeddings(inputs, logger)` |
| **Config** | `EMBEDDING_MODEL` (text-embedding-3-small), `EMBEDDING_DIM` (1536), `OPENAI_EMBED_MAX_INPUTS` (100) |

### 3.4 Intelligence & Analytics

#### intelligence.js
| | |
|-|-|
| **Назначение** | Risk, analytics, digests |
| **Exported** | `refreshRiskAndHealth`, `refreshAnalytics`, `getRiskOverview`, `getAnalyticsOverview`, `getControlTower`, `generateDailyDigest`, `generateWeeklyDigest` |
| **Tables** | analytics_revenue_snapshots, analytics_delivery_snapshots, analytics_comms_snapshots, daily_digests, weekly_digests, health_scores, risk_radar_items |

#### signals.js
| | |
|-|-|
| **Назначение** | Детекция сигналов из переписок и CRM |
| **Exported** | `extractSignalsAndNba`, `listSignals`, `updateSignalStatus`, `listNba`, `updateNbaStatus` |
| **Tables** | signals, next_best_actions |

### 3.5 CRM & Operations

#### identity-graph.js
| | |
|-|-|
| **Назначение** | Entity resolution между системами |
| **Exported** | `previewIdentitySuggestions`, `listIdentitySuggestions`, `applyIdentitySuggestions`, `listIdentityLinks` |
| **Tables** | identity_link_suggestions, identity_links |

#### portfolio.js
| | |
|-|-|
| **Назначение** | Portfolio overview для менеджера |
| **Exported** | `getPortfolioOverview(pool, scope)`, `getPortfolioMessages(pool, scope)` |
| **Tables** | projects, cw_messages, cw_contacts, linear_issues_raw, crm_accounts, crm_opportunities, signals, health_scores |

#### outbox.js
| | |
|-|-|
| **Назначение** | Outbound messaging с compliance |
| **Exported** | `createOutboundDraft`, `approveOutbound`, `sendOutbound`, `setOptOut`, `processDueOutbounds` |
| **Tables** | outbound_messages, outbound_attempts, contact_channel_policies |

#### upsell.js
| | |
|-|-|
| **Назначение** | Детекция upsell возможностей |
| **Exported** | `refreshUpsellRadar`, `listUpsellRadar`, `updateUpsellStatus` |
| **Tables** | upsell_opportunities |

#### continuity.js
| | |
|-|-|
| **Назначение** | Continuity actions (Attio/Chatwoot) |
| **Exported** | `buildContinuityPreview`, `listContinuityActions`, `applyContinuityActions` |
| **Tables** | continuity_actions |

### 3.6 Infrastructure

#### scheduler.js
| | |
|-|-|
| **Назначение** | Job scheduling engine |
| **Exported** | `ensureDefaultScheduledJobs`, `listScheduledJobs`, `runSchedulerTick` |
| **Tables** | scheduled_jobs, worker_runs |
| **Default jobs** | 18 job types с cadences от 5 мин до 1 недели |

#### jobs.js
| | |
|-|-|
| **Назначение** | Job status tracking |
| **Exported** | `startJob`, `finishJob`, `getJobsStatus` |
| **Tables** | job_runs |

#### audit.js
| | |
|-|-|
| **Назначение** | Audit trail |
| **Exported** | `writeAuditEvent`, `listAuditEvents`, `indexEvidenceRefs`, `normalizeEvidenceRefs` |
| **Tables** | audit_events, evidence_items |

#### process-log.js
| | |
|-|-|
| **Назначение** | Логирование pipeline процессов |
| **Exported** | `startProcessRun`, `finishProcessRun`, `failProcessRun`, `warnProcess` |
| **Tables** | connector_events |

#### loops.js
| | |
|-|-|
| **Назначение** | Email marketing sync |
| **Exported** | `syncLoopsContacts(pool, scope, options)` |
| **External API** | Loops.so REST API |

---

## 4) API Endpoints — полный реестр

> Каноническая reference: [`docs/api.md`](./api.md) (87 endpoints, 80 protected, 7 public).
> Ниже — сводка по доменам для быстрой навигации.

### Auth & Session
| Method | Path | Handler | Auth |
|--------|------|---------|------|
| POST | `/auth/login` | Login with credentials | No |
| GET | `/auth/me` | Current user info + CSRF | Yes |
| POST | `/auth/logout` | Destroy session | Yes |
| GET | `/auth/signup/status` | Signup status (410) | No |
| POST | `/auth/signup/start` | Start signup (410) | No |
| POST | `/auth/signup/confirm` | Confirm signup (410) | No |
| POST | `/auth/telegram/webhook` | Telegram webhook (410) | No |
| GET | `/health` | Health check | No |
| GET | `/metrics` | Prometheus metrics | No |

### Projects
| Method | Path | Handler |
|--------|------|---------|
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| POST | `/projects/:id/select` | Set active project |

### Connectors
| Method | Path | Handler |
|--------|------|---------|
| GET | `/connectors/state` | Sync state per connector |
| GET | `/connectors/errors` | List connector errors |
| POST | `/connectors/sync` | Sync all connectors |
| POST | `/connectors/:name/sync` | Sync specific connector |
| POST | `/connectors/errors/retry` | Retry due errors |
| GET | `/connectors/reconciliation` | Reconciliation status |
| POST | `/connectors/reconciliation/run` | Run reconciliation |

### Jobs
| Method | Path | Handler |
|--------|------|---------|
| POST | `/jobs/chatwoot/sync` | Manual Chatwoot sync |
| POST | `/jobs/linear/sync` | Manual Linear sync |
| POST | `/jobs/attio/sync` | Manual Attio sync |
| POST | `/jobs/embeddings/run` | Run embeddings generation |
| GET | `/jobs/status` | Job status overview |
| GET | `/jobs/scheduler` | Scheduler configuration |
| POST | `/jobs/scheduler/tick` | Manual scheduler tick |

### Connectors (продолжение)
| Method | Path | Handler |
|--------|------|---------|
| GET | `/connectors/reconciliation/diff` | Reconciliation diff |
| GET | `/connectors/errors/dead-letter` | Dead-letter errors |
| POST | `/connectors/errors/dead-letter/:id/retry` | Retry dead-letter |

### LightRAG & Search
| Method | Path | Handler |
|--------|------|---------|
| POST | `/lightrag/query` | LightRAG query |
| POST | `/lightrag/refresh` | Refresh embeddings |
| GET | `/lightrag/status` | Embeddings status |
| POST | `/lightrag/feedback` | Query feedback |
| POST | `/search` | Legacy alias → LightRAG query |

### SSE (Real-time)
| Method | Path | Handler |
|--------|------|---------|
| GET | `/events/stream` | Server-Sent Events stream |

### Data (raw)
| Method | Path | Handler |
|--------|------|---------|
| GET | `/contacts` | Contacts (search) |
| GET | `/conversations` | Conversations |
| GET | `/messages` | Messages (filter by conversation) |

### Signals & NBA
| Method | Path | Handler |
|--------|------|---------|
| POST | `/signals/extract` | Extract signals |
| GET | `/signals` | List signals |
| POST | `/signals/:id/status` | Update signal status |
| GET | `/nba` | List next best actions |
| POST | `/nba/:id/status` | Update NBA status |

### Identity
| Method | Path | Handler |
|--------|------|---------|
| POST | `/identity/suggestions/preview` | Preview suggestions |
| GET | `/identity/suggestions` | List suggestions |
| POST | `/identity/suggestions/apply` | Apply suggestions |
| GET | `/identity/links` | List links |

### CRM
| Method | Path | Handler |
|--------|------|---------|
| GET | `/crm/accounts` | List CRM accounts |
| POST | `/crm/accounts` | Create CRM account |
| GET | `/crm/opportunities` | List opportunities |
| POST | `/crm/opportunities` | Create opportunity |
| POST | `/crm/opportunities/:id/stage` | Update stage |
| GET | `/crm/overview` | CRM summary |

### Risk & Analytics
| Method | Path | Handler |
|--------|------|---------|
| POST | `/risk/refresh` | Refresh risk |
| GET | `/risk/overview` | Risk overview |
| POST | `/analytics/refresh` | Refresh analytics |
| GET | `/analytics/overview` | Analytics summary |
| GET | `/analytics/drilldown` | Detailed analytics |

### Digests & Portfolio
| Method | Path | Handler |
|--------|------|---------|
| POST | `/digests/daily/generate` | Generate daily digest |
| GET | `/digests/daily` | Latest daily digest |
| POST | `/digests/weekly/generate` | Generate weekly digest |
| GET | `/digests/weekly` | Latest weekly digest |
| GET | `/portfolio/overview` | Portfolio overview |
| GET | `/portfolio/messages` | Portfolio messages |
| GET | `/control-tower` | Executive dashboard |

### Outbound & Campaigns
| Method | Path | Handler |
|--------|------|---------|
| GET | `/offers` | List offers |
| POST | `/offers` | Create offer |
| POST | `/offers/:id/approve-discount` | Approve discount |
| POST | `/offers/:id/approve-send` | Approve send |
| POST | `/outbound/draft` | Create draft |
| POST | `/outbound/:id/approve` | Approve outbound |
| POST | `/outbound/:id/send` | Send outbound |
| POST | `/outbound/opt-out` | Set opt-out |
| POST | `/outbound/process` | Process due outbounds |
| GET | `/outbound` | List outbound messages |

### Email Marketing
| Method | Path | Handler |
|--------|------|---------|
| POST | `/loops/sync` | Sync contacts to Loops.so |

### Upsell & Continuity
| Method | Path | Handler |
|--------|------|---------|
| POST | `/upsell/radar/refresh` | Refresh upsell radar |
| GET | `/upsell/radar` | List upsell opportunities |
| POST | `/upsell/:id/status` | Update status |
| POST | `/continuity/preview` | Preview continuity |
| GET | `/continuity/actions` | List actions |
| POST | `/continuity/apply` | Apply actions |

### Audit & Evidence
| Method | Path | Handler |
|--------|------|---------|
| GET | `/audit` | Audit events |
| GET | `/evidence/search` | Full-text evidence search |

### API Keys
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api-keys` | List project API keys |
| POST | `/api-keys` | Create API key |
| POST | `/api-keys/revoke` | Revoke API key |

---

## 5) Worker Architecture

### worker.js (single run)
- Выполняет один tick scheduler для всех проектов
- `WORKER_TICK_LIMIT` (default 25) — макс jobs за tick
- Завершается после выполнения

### worker-loop.js (continuous)
- Бесконечный цикл с интервалом `WORKER_INTERVAL_SECONDS` (default 60)
- На каждой итерации: `runSchedulerTick()` для всех проектов
- Graceful error handling (продолжает при ошибке)

---

## 6) Shared Libraries

### lib/http.js — fetchWithRetry
```
fetchWithRetry(url, { retries: 2, timeoutMs: 15000, backoffMs: 500 })
  → Retry on: 408, 425, 429, 5xx
  → Backoff: exponential (500ms × attempt)
  → AbortController timeout per request
```

### lib/api-contract.js — API response format
```json
{ "ok": true, "request_id": "...", "data": {...} }
{ "ok": false, "error": "code", "message": "...", "details": {...} }
```

### lib/scope.js — Scope enforcement
```
getRequestScope(request)     → { projectId, accountScopeId }
requireProjectScope(request) → throws 409 if missing
```

---

## 7) Dependency Graph (simplified)

```
index.js (routes)
  └── services/*
       ├── connector-sync.js
       │    ├── chatwoot.js → Chatwoot API
       │    ├── linear.js → Linear API
       │    ├── attio.js → Attio API
       │    └── connector-state.js → connector_sync_state, connector_errors
       │
       ├── lightrag.js → embeddings.js → rag_chunks → openai.js → OpenAI API
       │
       ├── intelligence.js → analytics_*, health_scores, risk_radar_items
       │
       ├── outbox.js → outbound_messages, contact_channel_policies
       │
       └── scheduler.js → scheduled_jobs, worker_runs
            └── triggers all jobs above on cadence

       (удалены: forecasting.js, recommendations-v2.js, similarity.js, snapshots.js — #117)
```

---

## 8) Смежные документы

- **Архитектура:** [`docs/architecture.md`](./architecture.md)
- **Модель данных:** [`docs/data-model.md`](./data-model.md)
- **Интеграции:** [`docs/integrations.md`](./integrations.md)
- **Pipelines:** [`docs/pipelines.md`](./pipelines.md)
- **API:** [`docs/api.md`](./api.md)
