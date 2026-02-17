# Platform architecture (Scope, Audit, Outbox, Worker)

This document defines the platform-level constraints for MVP and roadmap domains.

## 1) Domain boundaries and contracts

Each domain owns its own write model and publishes references via `evidence_refs`.

- **Ingestion / RAG**
  - Inputs: Chatwoot API payloads
  - Writes: `cw_contacts`, `cw_conversations`, `cw_messages`, `rag_chunks`, `sync_watermarks`
  - Contract: strictly scoped by `(project_id, account_scope_id)`
- **Projects**
  - Writes: `projects`, `project_sources`, `sessions.active_project_id`
  - Contract: project is the operational boundary; account scope is attached to each project
- **Auth**
  - Writes: `sessions`, `app_users`, `signup_requests`, `app_settings`
  - Contract: cookie sessions + CSRF token + login rate limits
- **CRM**
  - Writes: `crm_accounts`, `crm_account_contacts`, `crm_opportunities`, `crm_opportunity_stage_events`
  - Contract: stage changes must produce audit records with evidence
- **Signals / NBA**
  - Writes: `signals`, `next_best_actions`
  - Contract: dedupe by `dedupe_key`; include severity/confidence/evidence
- **Offers**
  - Writes: `offers`, `offer_items`, `offer_approvals`
  - Contract: discount/send approvals are explicit audited actions
- **Campaigns**
  - Writes: `campaigns`, `campaign_segments`, `campaign_members`, `campaign_events`, `outbound_*`
  - Contract: state machine + opt-out + stop-on-reply + frequency caps
- **Health / Risk**
  - Writes: `health_scores`, `risk_radar_items`
  - Contract: explainable factors and mitigation action refs
- **Cases**
  - Writes: `case_library_entries`, `case_evidence_refs`
  - Contract: draft/approved lifecycle, privacy/visibility/retention
- **Analytics**
  - Writes: `analytics_revenue_snapshots`
  - Contract: forecast and margin snapshots with drill-down refs

## 2) Scope as a platform layer

Scope is enforced at 3 levels:

1. **DB schema**
   - critical tables include `project_id` and `account_scope_id`
   - trigger `enforce_project_scope_match()` rejects cross-scope writes
2. **SQL**
   - reads/writes include explicit scope filters
3. **Code**
   - protected endpoints require `active_project_id`
   - server resolves `(project_id, account_scope_id)` from session

`project_sources` blocks dangerous cross-binding:

- `UNIQUE (source_kind, external_id)` prevents one external source from being attached to multiple projects.

## 3) Audit trail (mandatory)

`audit_events` is required for critical actions:

- stage changes
- discount/price approvals
- outbound approve/send/opt-out

Required audit payload fields:

- `action`
- `entity_type` / `entity_id`
- `status`
- `payload`
- `evidence_refs` (array)
- `request_id`

## 4) Evidence format

Canonical evidence element:

```json
{
  "source": "cw_messages|cw_conversations|rag_chunks|external",
  "ref": "stable_source_id",
  "snippet": "optional excerpt",
  "meta": {}
}
```

Storage/search:

- raw refs in `audit_events.evidence_refs`, domain tables
- normalized index in `evidence_items` (+ FTS `search_text`)

## 5) Outbox + approval layer

Primary tables:

- `outbound_messages`
- `outbound_attempts`
- `contact_channel_policies`

State machine:

- `draft -> approved -> sent`
- failures: `approved -> failed -> approved` (retry path)
- terminal blocks: `blocked_opt_out`, `cancelled`

Guardrails:

- idempotency: `UNIQUE(project_id, idempotency_key)`
- dedupe: `UNIQUE(project_id, dedupe_key)`
- frequency cap / stop-on-reply / opt-out checks before send

## 6) Worker / scheduler

Scheduler tables:

- `scheduled_jobs`
- `worker_runs`

Default jobs:

- `chatwoot_sync`
- `embeddings_run`
- `signals_extraction`
- `health_scoring`
- `campaign_scheduler`
- `analytics_aggregates`

Execution model:

- API-triggered `scheduler tick` claims due jobs and records `worker_runs`
- each run updates `scheduled_jobs.last_status/last_error/next_run_at`

## 7) API contract layer

Implemented conventions:

- versioning: routes are available as both `/...` and `/v1/...`
- unified response envelope:
  - success: `{ ok: true, ..., request_id }`
  - error: `{ ok: false, error, message, request_id, details? }`
- pagination helpers for list endpoints (`limit`, `offset`)
- scope auth via active project in session

## 8) Security/compliance baseline

- cookie session (`HttpOnly`, `SameSite=Lax`, `Secure` in prod)
- CSRF token cookie + `x-csrf-token` header validation for mutating protected endpoints
- login rate limiting per `ip+username`
- outbound controls:
  - opt-out
  - frequency cap
  - stop-on-reply
- case privacy and retention fields in schema (`privacy_level`, `retention_until`)

## 9) Observability baseline

- structured request logs with `request_id`
- `/metrics` endpoint (request/response/error counters)
- job status and worker runs per project scope
- runbooks should include:
  - sync failures
  - embeddings failures
  - outbound delivery/approval failures
