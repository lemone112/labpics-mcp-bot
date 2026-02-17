# Glossary

Canonical terms used across `docs/` and `docs/specs/`.

This glossary is product-focused: each term explains what it means and why it exists in the system.

---

## Platform and scope

## Project

Operational boundary selected per session (`active_project_id`). Most product actions are project-scoped.

## Active project (`active_project_id`)

Project selected in session context. Used by protected API routes to resolve scope for reads/writes.

## Account scope (`account_scope_id`)

Cross-project boundary for a single account/portfolio. Prevents cross-client data mixing.

## Project scope

Combined scoping rule using `project_id` (and `account_scope_id` where applicable). Mandatory for domain data access.

## Scope guard trigger

Database safeguard (`enforce_project_scope_match`) that blocks invalid cross-scope writes.

## Session

Server-side authenticated user context that stores identity and active project information.

## CSRF token

Cross-site request forgery protection token required for mutating requests from the web app.

## Request ID (`request_id`)

Trace identifier attached to API requests/responses for observability and debugging.

---

## Evidence and trust model

## Evidence

Stable reference to source facts (message, issue, deal, chunk, URL). Derived outputs must link back to evidence.

## Evidence refs (`evidence_refs`)

Structured list of evidence links attached to snapshots/forecasts/recommendations/signals.

## Evidence gating

Quality rule: no valid evidence -> no primary publication for derived output.

## Publishable

Visibility flag (`publishable`) indicating whether derived data is eligible for primary user-facing output.

## Provenance

Traceability metadata showing origin of a fact (source object IDs, URL, and related chunk references).

## Mutual indexing

Bidirectional linking between source data and derived entities, so users can navigate source -> insight and insight -> source.

---

## Ingestion and connectors

## Connector

Integration adapter for external systems (Chatwoot, Linear, Attio). Supports sync execution and error handling.

## Connector mode

Runtime connector transport mode (`http` or `mcp`) selected via environment flags.

## Incremental sync

Sync strategy that processes only new/changed source records using cursors and idempotent upserts.

## Cursor

Progress pointer for incremental ingest (for example `cursor_ts` in connector state).

## Watermark (`sync_watermarks`)

Legacy per-source progress cursor used to avoid full table rescans.

## Connector sync state (`connector_sync_state`)

Table storing current sync status, cursor progress, retry metadata, and runtime details per connector/project.

## Connector errors (`connector_errors`)

Retry queue / dead-letter table for connector failures, including attempts and next retry time.

## Dead-letter queue (DLQ)

Set of failed operations that exceeded retry limits and require manual review or later replay.

## Backoff

Retry delay strategy where retry intervals increase after consecutive failures.

## Idempotent upsert

Insert-or-update write pattern safe for retries and duplicate deliveries (`ON CONFLICT DO UPDATE`).

## Dedupe key (`dedupe_key`)

Key used to prevent duplicate records/events for logically same operation.

---

## RAG layer

## RAG

Retrieval-Augmented Generation flow in this product: ingest -> chunk -> embed -> vector search -> evidence-backed retrieval.

## Chunk (`rag_chunks`)

Text fragment extracted from messages/documents and stored with embedding and status metadata.

## Embedding

Vector representation of chunk text used for semantic similarity search.

## pgvector

Postgres extension (`vector`) used to store and query embeddings efficiently.

## Embedding status

Chunk processing state (`pending`, `processing`, `ready`, `failed`) for retrieval readiness.

---

## KAG layer and intelligence

## KAG

Knowledge-Augmented Generation approach combining structured knowledge/events/signals with deterministic decision logic.

## KAG v1

Graph + signals + scores + recommendation layer (`kag_nodes`, `kag_edges`, `kag_events`, scoring/recommendations tables).

## KAG v2

Event-first intelligence layer with snapshots, similarity, forecasting, and recommendation lifecycle.

## KAG event log (`kag_event_log`)

Unified timeline for domain and process events, used for explainability, diagnostics, and health monitoring.

## Process event

Operational event describing background process lifecycle (`process_started`, `process_finished`, `process_failed`, `process_warning`).

## Snapshot (`project_snapshots`)

Daily project state record containing aggregated signals/scores/metrics for trend analysis and forecasting inputs.

## Past case outcome (`past_case_outcomes`)

Historical result marker (for example risk/delay/finance events) used for similarity and forecast calibration.

## Case signature (`case_signatures`)

Feature representation of project behavior over a time window (signals + event patterns) for similar-case retrieval.

## Similar case

Historical project/time-window with behavior close to the current project by defined similarity metric.

## Similarity engine

Deterministic ranking component combining vector/time-series distance, event-pattern overlap, and context filters.

## Signal

Deterministic metric derived from source events that indicates operational state or risk pressure.

## Score

Weighted deterministic aggregate of multiple signals (for example health/risk/value/upsell scores).

## Forecast (`kag_risk_forecasts`)

Deterministic risk projection on 7/14/30 day horizons with confidence, drivers, similar cases, and evidence.

## Top drivers

Most influential features/signals contributing to a forecast or recommendation rationale.

## Recommendation

Action proposal generated from deterministic logic and evidence (legacy and v2 variants exist).

## Recommendation lifecycle

State progression for recommendations (`new -> acknowledged -> done/dismissed`) plus helpfulness feedback.

## NBA (Next Best Action)

Operationally prioritized recommendation that suggests the most useful next step for PM/operator.

## All-projects mode

Portfolio mode where multiple projects are viewed together for sections that support aggregated analysis.

---

## Automation and operations

## Job

Repeatable automation step (sync, embeddings, snapshot, forecast, recommendations, scheduler tick).

## Scheduler

Cadence executor that claims due jobs from `scheduled_jobs` and records execution in `worker_runs`.

## Worker run

Single execution record for a scheduled job, with status, timestamps, details, and errors.

## Connectors sync cycle

Main periodic job (~15 min) that runs incremental sync across configured connectors.

## Connector retry cycle

Periodic job (~5 min) that retries due connector errors using backoff rules.

## Daily KAG pipeline

Daily chain: snapshot -> forecast refresh -> recommendations v2 refresh.

## Case signatures refresh

Low-frequency (typically weekly) rebuild of similarity signatures.

---

## Frontend and design system

## Control Tower

Portfolio workspace in UI with six sections: `dashboard`, `messages`, `agreements`, `risks`, `finance`, `offers`.

## Page shell

Main UI composition with left nav rail, project sidebar, and content area.

## shadcn/ui

Primary component system used in frontend, built on Radix primitives and semantic Tailwind tokens.

## Radix UI

Accessibility-focused headless UI primitives used as behavioral foundation for many components.

## Theme tokens

Semantic CSS variables (colors/radius/etc.) defined in `globals.css` and used consistently across components.

## Motion system

Standardized animation layer based on `animejs`, using shared duration/easing tokens and reduced-motion support.

## Anime.js (`animejs`)

Single animation engine used for reveal/loading/transition patterns in the UI.

## Reduced motion

Accessibility setting (`prefers-reduced-motion`) that disables or minimizes animations for affected users.

## UX state pattern

Consistent handling of loading/empty/error/success states across pages and reusable components.
