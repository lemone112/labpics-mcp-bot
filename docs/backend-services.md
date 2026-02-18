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
│   ├── kag.js                  # KAG pipeline orchestration
│   ├── kag-process-log.js      # Process run logging
│   ├── forecasting.js          # Risk forecasting
│   ├── recommendations-v2.js   # Enhanced recommendations
│   ├── recommendation-actions.js # Action execution
│   ├── similarity.js           # Case signature & search
│   ├── snapshots.js            # Project snapshots
│   ├── intelligence.js         # Risk, analytics, digests
│   ├── signals.js              # Legacy signal extraction
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
└── kag/
    ├── ingest/index.js         # Data → graph artifacts
    ├── graph/index.js          # Graph persistence
    ├── signals/index.js        # Signal computation
    ├── scoring/index.js        # Score computation
    ├── recommendations/index.js # Recommendation rules
    └── templates/index.js      # Template generation
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
| **Зависимости** | chatwoot.js, linear.js, attio.js, connector-state.js, kag-process-log.js |

#### sources.js
| | |
|-|-|
| **Назначение** | Привязка внешних источников к проектам |
| **Exported** | `resolveProjectSourceBinding(pool, scope, sourceKind, externalId, meta)` |
| **Tables** | project_sources |

### 3.2 Intelligence Pipeline

> Код и таблицы используют prefix `kag_` (legacy). Концептуально — **Project Intelligence Pipeline**.

#### kag.js (orchestrator)
| | |
|-|-|
| **Назначение** | Оркестрация полного intelligence pipeline |
| **Exported** | `runKagRecommendationRefresh`, `listKagSignals`, `listKagScores`, `listKagRecommendations`, `listProjectEvents` |
| **Tables** | kag_events, kag_signal_state, kag_signals, kag_signal_history, kag_scores, kag_score_history, kag_recommendations, recommendations_v2, kag_risk_forecasts |
| **Зависимости** | kag/ingest, kag/graph, kag/signals, kag/scoring, kag/recommendations, kag/templates, forecasting.js, recommendations-v2.js, snapshots.js |
| **Cadence** | ~15 min (kag_recommendations_refresh) |

#### forecasting.js
| | |
|-|-|
| **Назначение** | Прогнозирование рисков 7/14/30 дней |
| **Exported** | `refreshRiskForecasts(pool, scope, options)`, `computeRiskForecastsFromInputs(inputs)`, `listRiskForecasts(pool, scope, options)` |
| **Tables** | kag_risk_forecasts, kag_signals, kag_scores, case_signatures, past_case_outcomes |

#### recommendations-v2.js
| | |
|-|-|
| **Назначение** | Enhanced рекомендации с evidence gating |
| **Exported** | `refreshRecommendationsV2`, `listRecommendationsV2`, `updateRecommendationV2Status`, `updateRecommendationV2Feedback`, `markRecommendationsV2Shown`, `generateRecommendationsV2FromInputs` |
| **Tables** | recommendations_v2, kag_signals, kag_scores, kag_risk_forecasts |

#### recommendation-actions.js
| | |
|-|-|
| **Назначение** | Исполнение действий по рекомендациям |
| **Exported** | `runRecommendationAction`, `listRecommendationActionRuns`, `retryRecommendationActionRun` |
| **Tables** | recommendation_action_runs, recommendations_v2 |
| **Action types** | create_or_update_task, send_message, set_reminder |

#### similarity.js
| | |
|-|-|
| **Назначение** | Case-based reasoning |
| **Exported** | `rebuildCaseSignatures(pool, scope)`, `findSimilarCases(pool, scope, query, limit)` |
| **Tables** | case_signatures, project_snapshots, past_case_outcomes |
| **Cadence** | 1/week (case_signatures_refresh) |

#### snapshots.js
| | |
|-|-|
| **Назначение** | Дневные снимки состояния проектов |
| **Exported** | `buildProjectSnapshot(pool, scope)`, `listProjectSnapshots`, `listPastCaseOutcomes` |
| **Tables** | project_snapshots, past_case_outcomes |
| **Cadence** | 1/day (kag_daily_pipeline) |

### 3.3 RAG

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

### 3.4 Intelligence (Legacy)

#### intelligence.js
| | |
|-|-|
| **Назначение** | Risk, analytics, digests |
| **Exported** | `refreshRiskAndHealth`, `refreshAnalytics`, `getRiskOverview`, `getAnalyticsOverview`, `getControlTower`, `generateDailyDigest`, `generateWeeklyDigest` |
| **Tables** | analytics_revenue_snapshots, analytics_delivery_snapshots, analytics_comms_snapshots, daily_digests, weekly_digests, health_scores, risk_radar_items |

#### signals.js (legacy)
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
| **Tables** | projects, cw_messages, cw_contacts, linear_issues_raw, crm_accounts, crm_opportunities, kag_signals, kag_scores |

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

#### kag-process-log.js
| | |
|-|-|
| **Назначение** | Логирование intelligence pipeline процессов |
| **Exported** | `startProcessRun`, `finishProcessRun`, `failProcessRun`, `warnProcess` |
| **Tables** | kag_event_log |

#### loops.js
| | |
|-|-|
| **Назначение** | Email marketing sync |
| **Exported** | `syncLoopsContacts(pool, scope, options)` |
| **External API** | Loops.so REST API |

---

## 4) API Endpoints — полный реестр

### Auth & Session
| Method | Path | Handler | Auth |
|--------|------|---------|------|
| POST | `/auth/login` | Login with credentials | No |
| GET | `/auth/me` | Current user info | Yes |
| POST | `/auth/logout` | Destroy session | Yes |
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

### RAG & Search
| Method | Path | Handler |
|--------|------|---------|
| POST | `/search` | Vector similarity search |

### Data (raw)
| Method | Path | Handler |
|--------|------|---------|
| GET | `/contacts` | Chatwoot contacts |
| GET | `/conversations` | Chatwoot conversations |
| GET | `/messages` | Chatwoot messages |

### Intelligence v1 (routes: `/kag/*` — legacy prefix)
| Method | Path | Handler |
|--------|------|---------|
| POST | `/kag/refresh` | Full intelligence pipeline refresh |
| GET | `/kag/signals` | Project signals |
| GET | `/kag/scores` | Project scores |
| GET | `/kag/recommendations` | Recommendations v1 |
| GET | `/kag/events` | Intelligence events |

### Intelligence v2 (routes: `/kag/v2/*` — legacy prefix)
| Method | Path | Handler |
|--------|------|---------|
| POST | `/kag/v2/forecast/refresh` | Refresh risk forecasts |
| GET | `/kag/v2/forecast` | List risk forecasts |
| POST | `/kag/v2/recommendations/refresh` | Refresh recommendations v2 |
| GET | `/kag/v2/recommendations` | List recommendations v2 |
| POST | `/kag/v2/recommendations/shown` | Mark as shown |
| POST | `/kag/v2/recommendations/:id/status` | Update status |
| POST | `/kag/v2/recommendations/:id/feedback` | Record feedback |
| GET | `/kag/v2/recommendations/:id/actions` | List actions |
| POST | `/kag/v2/recommendations/:id/actions` | Execute action |
| POST | `/kag/v2/recommendations/actions/:actionId/retry` | Retry action |

### Snapshots & Similarity
| Method | Path | Handler |
|--------|------|---------|
| POST | `/kag/snapshots/refresh` | Build snapshot |
| GET | `/kag/snapshots` | List snapshots |
| GET | `/kag/outcomes` | Past case outcomes |
| POST | `/kag/similarity/rebuild` | Rebuild signatures |
| GET | `/kag/similar-cases` | Find similar cases |

### Signals & NBA (legacy)
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

### Audit
| Method | Path | Handler |
|--------|------|---------|
| GET | `/audit` | Audit events |
| GET | `/evidence/search` | Search evidence |

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
       ├── kag.js (intelligence orchestrator)
       │    ├── kag/ingest → kag_nodes, kag_edges, kag_events
       │    ├── kag/signals → kag_signal_state, kag_signals
       │    ├── kag/scoring → kag_scores
       │    ├── kag/recommendations → kag_recommendations
       │    ├── forecasting.js → kag_risk_forecasts
       │    ├── recommendations-v2.js → recommendations_v2
       │    └── snapshots.js → project_snapshots
       │
       ├── embeddings.js → rag_chunks → openai.js → OpenAI API
       │
       ├── intelligence.js → analytics_*, health_scores, risk_radar_items
       │
       └── scheduler.js → scheduled_jobs, worker_runs
            └── triggers all jobs above on cadence
```

---

## 8) Смежные документы

- **Архитектура:** [`docs/architecture.md`](./architecture.md)
- **Модель данных:** [`docs/data-model.md`](./data-model.md)
- **Интеграции:** [`docs/integrations.md`](./integrations.md)
- **Pipelines:** [`docs/pipelines.md`](./pipelines.md)
- **API:** [`docs/api.md`](./api.md)
