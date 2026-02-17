# KAG Forecasting + Recommendations v2

## Overview

Итерация 2 расширяет базовый KAG-движок до:

- прогнозов рисков (7/14/30 дней),
- поиска похожих кейсов (case-based reasoning),
- explainable recommendations с lifecycle/feedback,
- устойчивого ingestion из Chatwoot/Linear/Attio с traceability.

Слой работает **параллельно** текущему RAG и не ломает существующие API.

---

## Data model

### Graph / base

- `kag_nodes`
- `kag_edges`
- `kag_events` (legacy KAG signals pipeline)

### Event-first model (v2)

- `kag_event_log`
  - `id`, `project_id`, `event_type`, `occurred_at`, `actor`, `source`, `source_ref`, `payload_json`, `created_at`
  - source trace fields: `source_message_id`, `source_linear_issue_id`, `source_attio_record_id`, `source_url`
  - idempotency: `dedupe_key`, unique `(project_id, dedupe_key)`

### Snapshots / outcomes

- `project_snapshots`
  - `snapshot_date`, `signals_json`, `normalized_signals_json`, `scores_json`, `key_aggregates_json`
- `past_case_outcomes`
  - `outcome_type`, `occurred_at`, `severity`, `notes`, `evidence_refs`, `source_event_id`

### Pattern store

- `case_signatures`
  - `window_days` (7/14/30)
  - `signature_vector`
  - `signature_hash`
  - `features_json`
  - `context_json`

### Forecast / recommendations v2

- `kag_risk_forecasts`
  - risk_type + probability_7d/14d/30d + expected_time_to_risk + confidence + drivers + similar cases + evidence
- `recommendations_v2`
  - category, priority, due_date, owner_role
  - rationale, why_now, expected_impact
  - evidence_refs, links, template
  - lifecycle status + helpful_feedback

### Connector reliability

- `connector_sync_state` (cursor/status/retry/meta)
- `connector_errors` (DLQ with backoff + dead-letter)

---

## Connectors (Chatwoot / Linear / Attio)

### Abstraction

`runConnectorSync(...)` выбирает режим:

- HTTP (по умолчанию),
- MCP (через composio bridge, если подключён; иначе controlled error `*_mcp_not_configured`).

Переключение:

- `CONNECTOR_MODE=http|mcp`
- `CONNECTOR_CHATWOOT_MODE`, `CONNECTOR_LINEAR_MODE`, `CONNECTOR_ATTIO_MODE`

### Source coverage

1. **Chatwoot**
   - conversations, messages, contacts, inboxes, attachments metadata
2. **Linear**
   - issues, projects, workflow states, cycles/sprints, labels, blocked flags, updated_at
3. **Attio**
   - companies, deals/stages, people, activities/notes (best-effort по endpoint availability)

### Auth/env

- Chatwoot: `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`
- Linear: `LINEAR_BASE_URL`, `LINEAR_API_TOKEN`, `LINEAR_WORKSPACE_ID`
- Attio: `ATTIO_BASE_URL`, `ATTIO_API_TOKEN`, `ATTIO_WORKSPACE_ID`

### Rate limits / retry policy

- HTTP requests: `fetchWithRetry(...)` (+retry statuses 408/425/429/5xx)
- Connector-level retry metadata:
  - `CONNECTOR_MAX_RETRIES` (default 5)
  - `CONNECTOR_RETRY_BASE_SECONDS` (default 30)
- Ошибки пишутся в `connector_errors`, статус:
  - `pending` → `retrying` → `dead_letter` / `resolved`

---

## Incremental sync

Cursor state:

- `sync_watermarks` (legacy source cursor)
- `connector_sync_state` (connector-level cursor/status/meta)

Идемпотентность:

- upsert по source id (`ON CONFLICT ... DO UPDATE`)
- dedupe для event log и outcomes/recommendations через `dedupe_key`

Incremental window для event log:

- `since_ts` берётся из `connector_sync_state.cursor_ts`
- `until_ts` берётся из результата текущего sync

---

## Signals / Scores / Forecast

### Signals (deterministic)

- WaitingOnClientDays
- ResponseTimeAvg
- BlockersAge
- StageOverdue
- AgreementOverdueCount
- SentimentTrend
- ScopeCreepRate
- BudgetBurnRate
- MarginRisk
- ActivityDrop

### Scores (deterministic)

- ProjectHealthScore
- RiskScore
- ClientValueScore
- UpsellLikelihoodScore

### Forecast (deterministic + similar case stats)

Для каждого типа риска:

- `delivery_risk`
- `finance_risk`
- `client_risk`
- `scope_risk`

вычисляются:

- `probability_7d`
- `probability_14d`
- `probability_30d`
- `expected_time_to_risk_days`
- `confidence`
- `top_drivers`

Формула MVP:

1. baseline rule-based probability из сигналов/скоров;
2. корректировка через outcomes похожих кейсов;
3. horizon scaling (7→14→30).

---

## Similarity engine

Комбинированная метрика:

1. **time-series similarity** по `signature_vector` (евклид, преобразованный в score),
2. **sequence similarity** по event n-grams (Jaccard),
3. **context filters/bonus**: project_type, budget_bucket, stage_bucket.

API:

- `GET /kag/similar-cases?project_id=...&window_days=14&top_k=5`
  - возвращает `case_project_id`, `similarity_score`, `why_similar`, `key_shared_patterns`, `outcomes_seen`
  - в forecast endpoints дополнительно отдается `top-3`.

---

## Recommendation lifecycle (v2)

Статусы:

- `new` → `acknowledged` → `done` / `dismissed`

Feedback:

- `helpful_feedback`: `unknown | helpful | not_helpful`
- `feedback_note`

API:

- refresh/list:
  - `POST /kag/v2/recommendations/refresh`
  - `GET /kag/v2/recommendations`
- lifecycle:
  - `POST /kag/v2/recommendations/:id/status`
  - `POST /kag/v2/recommendations/:id/feedback`

All-projects mode:

- `GET /kag/v2/recommendations?all_projects=true`
- выдаёт проектные поля + `project_badge_color` для UI.

---

## Evidence / citations requirements

No evidence → no recommendation.

Evidence fields:

- `message_id`
- `linear_issue_id`
- `attio_record_id`
- `doc_url`
- `rag_chunk_id`

Отображаются в:

- signals
- forecasts
- recommendations v2
- outcomes

---

## Local run

1. migrate:
   - `cd server && npm run migrate`
2. sync connectors (per project):
   - `POST /connectors/sync`
3. build KAG pipeline:
   - `POST /kag/refresh`
   - `POST /kag/snapshots/refresh`
   - `POST /kag/similarity/rebuild`
   - `POST /kag/v2/forecast/refresh`
   - `POST /kag/v2/recommendations/refresh`
4. tests:
   - `cd server && npm test`

---

## Operational cadence (recommended defaults)

- каждые **15 минут**: `connectors_sync_cycle`
  - общий инкрементальный sync Chatwoot/Linear/Attio
  - обновление `connector_sync_state`
  - запись process start/finish/error в `kag_event_log`
- каждые **5 минут**: `connector_errors_retry`
  - retry только due-записей из `connector_errors` (backoff-aware)
- раз в **сутки**: `kag_daily_pipeline`
  - snapshot -> forecast -> recommendations v2
- раз в **неделю**: `case_signatures_refresh`
  - пересборка similarity signatures

Все значимые процессы логируются в `kag_event_log` как:

- `process_started`
- `process_finished`
- `process_failed`
- `process_warning`

---

## Troubleshooting

1. **Connector API fails (401/429/5xx)**
   - проверяйте `connector_errors`, `connector_sync_state`
   - убедитесь в корректности токенов/лимитов
2. **Duplicates**
   - проверяйте `dedupe_key` для `kag_event_log`, `past_case_outcomes`, `recommendations_v2`
3. **No similar cases**
   - убедитесь, что есть `project_snapshots` и `case_signatures`
4. **Forecast too noisy**
   - откалибруйте веса baseline и thresholds сигналов
5. **Feature flags off**
   - `KAG_ENABLED=0` и/или `RECOMMENDATIONS_ENABLED=0` оставляют текущий API без изменений
