# Glossary

Canonical terms used across `docs/` and `docs/specs/`.

## Project

Operational boundary selected per session (`active_project_id`). All reads/writes must be scoped to the active project.

## Account scope

An additional scoping dimension (`account_scope_id`) attached to a project. Prevents cross-client mixing when multiple accounts exist.

## Evidence

A stable reference to a source item (message, conversation, chunk, external object). Derived entities must link back to evidence.

## RAG

Retrieval-Augmented Generation. In this repo it means: ingest → chunk → embed → vector search → show evidence-backed results.

## Chunk

A text fragment produced from a conversation/message stream and stored as `rag_chunks` with an embedding status.

## Watermark

A per-source progress cursor used by sync jobs to avoid full re-scans (`sync_watermarks`).

## Job

A repeatable automation step (sync, embeddings, scheduler tick). Jobs must be idempotent.

## Outbox

A controlled outbound pipeline (draft → approved → sent) with guardrails (opt-out, frequency caps, stop-on-reply).

## Preview / Apply

A safety pattern for integrations and writebacks: first generate a preview, then explicitly apply selected actions.

## Control Tower

A scoped project snapshot view: integration health, watermarks, top metrics, NBA/risk overview, and recent evidence.

## Recommendation (v2)

Next-best-action entity in `recommendations_v2` with deterministic rationale, priority, status lifecycle, and mandatory evidence links.

## Evidence gating

Publication rule for recommendations based on evidence sufficiency and quality (`evidence_count`, `evidence_quality_score`, `evidence_gate_status`).

## Recommendation shown

Server-side audit event (`recommendation_shown`) written when a recommendation was displayed in UI.

## Recommendation action

Explicit operator action started from a recommendation card (`create_or_update_task`, `send_message`, `set_reminder`).

## Recommendation action run

Execution log row in `recommendation_action_runs` with status, retries, error/result payload and timestamps.
