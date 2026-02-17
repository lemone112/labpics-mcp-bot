# Platform architecture (Scope, Audit, Outbox, Worker)

This document defines platform-level constraints that all domains must follow.

## Scope (non-negotiable)

- All reads/writes are scoped by `project_id`.
- When applicable, also scope by `account_scope_id`.
- API routes require `active_project_id` in the session for protected domains.

## Audit trail

- Critical actions must write an `audit_event`.
- Audit events must include `request_id` and evidence references.

## Evidence-first

- Derived entities must link back to source evidence.
- Evidence is shown in UI wherever decisions/actions are taken.

## Outbox + approvals

Outbound actions must go through a controlled state machine:

- `draft → approved → sent`
- guardrails: opt-out, frequency caps, stop-on-reply
- idempotency: dedupe/idempotency keys per project

## Worker & scheduler

- Jobs can be triggered manually via API.
- Scheduler tick claims due jobs and records `worker_runs`.
- Jobs must be idempotent and safe to retry.

## Observability baseline

- Every response includes `request_id`.
- Job runs expose status + error payload.

> Implementation details (tables, schemas) are documented in `docs/data-model.md`.
