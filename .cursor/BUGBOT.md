# Labpics Bugbot rules

This file gives Cursor Bugbot project-specific review context.

## Priority focus (blockers)

1. **Scope isolation is mandatory**
   - Any data read/write must preserve `project_id` and `account_scope_id` isolation.
   - Flag any query path that can mix records across project/account scope.

2. **Auth contract must stay secret-based**
   - Login must use server-side credentials from `AUTH_CREDENTIALS` (`login:password`).
   - Flag regressions that reintroduce Telegram signup/confirmation flows.

3. **Outbound safety controls are required**
   - Outbound flows must preserve `draft -> approved -> sent/failed`.
   - Flag missing idempotency keys, missing opt-out checks, or missing frequency/stop-on-reply checks.

4. **Security baseline cannot regress**
   - Flag changes that weaken CSRF checks, secure cookie settings, or session protections.
   - Flag endpoints that bypass authorization for project-scoped data.

5. **Evidence and audit integrity**
   - Critical actions must remain auditable with evidence references.
   - Flag code that skips audit writes for critical state transitions.

## High-value quality checks

- API and docs consistency: endpoints/status codes in docs should match server behavior.
- Background jobs: no duplicate processing or missing watermark/idempotency safeguards.
- UI states: pages should keep explicit loading/empty/error states for data views.

