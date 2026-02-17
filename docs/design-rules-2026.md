# Design rules 2026: critical review and hardening loop

This page defines practical design standards for the product shell and core flows.

Scope:

- current implemented UI: `/login`, `/projects`, `/jobs`, `/search`
- target behavior from specs: `0001`, `0007`, `0008`, `0009`
- roadmap compatibility: `0010..0016`

## 1) Non-negotiable principles

1. **Project/account scope first**
   - Every actionable screen must show current scope and block unsafe actions when scope is missing.
2. **Evidence-first**
   - Any recommendation, score, or derived entity must expose "why" and source references.
3. **Safe-by-default**
   - No automatic outbound, stage change, discount, or external apply without explicit approval.
4. **Idempotent experience**
   - Repeated clicks/retries do not create duplicates or inconsistent state in UI.
5. **Explainable state**
   - User can always answer: "what happened, why, and what should I do next?"

## 2) Critical design vulnerabilities (current)

1. **Scope invisibility**
   - Weak point: sidebar and work screens do not reliably expose active project context.
   - Risk: accidental work in wrong context, false confidence.
2. **Unsafe empty states**
   - Weak point: generic "No results yet" messages without corrective CTA.
   - Risk: user confusion, repeated failed attempts.
3. **Action ambiguity**
   - Weak point: jobs and search are triggerable without explicit scope guard in UI.
   - Risk: inconsistent behavior and trust loss.
4. **Inconsistent status semantics**
   - Weak point: status shown, but reason and next action are not always visible.
   - Risk: operator cannot quickly recover from failures.
5. **Roadmap unreadiness in IA**
   - Weak point: no stable pattern for list -> details pane -> action approval.
   - Risk: future CRM/Signals/Offers expansion becomes fragmented.

## 3) 2026 SaaS standards to enforce

## 3.1 IA and navigation

- Persistent shell with clear global sections.
- Explicit scope banner ("Active project: X") visible on every operational page.
- Predictable gating: when scope is missing, show one focused empty state with primary CTA.

## 3.2 State design and feedback

- Every action supports 4 states: `idle`, `running`, `success`, `error`.
- Every `error` must include actionable next step.
- Every `empty` must include context + one primary CTA.
- Every async list supports refresh without full-page reload.

## 3.3 Safety and guardrails

- Destructive or external-impact actions are impossible without explicit approval.
- Buttons that can be retried are idempotent from user perspective (no duplicate side effects).
- Scope-dependent actions are disabled or blocked until scope is valid.

## 3.4 Explainability

- Status cards include "what", "why", "what next".
- Derived entities always provide evidence links and timestamps.
- Future scores (health, risk, forecast) must expose factors and weights.

## 3.5 Accessibility and ergonomics

- Keyboard reachable controls in shell and lists.
- Focus states visible and consistent.
- Text hierarchy and contrast remain stable across all states.
- Reduced-motion mode respected.

## 4) Hardening loop (repeatable)

Run these cycles for every design iteration:

1. **Audit**
   - Enumerate scope, state, safety, explainability gaps for each page.
2. **Patch**
   - Implement smallest set of reusable primitives first (scope guard, empty state, status conventions).
3. **Verify**
   - Check behavior in `no data`, `error`, and `happy path` for each flow.
4. **Stress**
   - Simulate repeated triggers and missing context.
5. **Decide**
   - Keep only changes that reduce ambiguity and cognitive load.

## 5) Definition of done for UI quality

All are required:

1. User always sees active scope.
2. Scope-dependent pages cannot perform unsafe actions without scope.
3. Empty/error states always contain corrective CTA.
4. Long-running actions expose progress and final reason.
5. No page relies on hidden assumptions to proceed.
6. UX remains composable for roadmap entities (accounts/opportunities/signals/offers/campaigns).

## 6) Operational quality checks (per release)

- Check no-scope scenario across all protected pages.
- Check first-run experience: no projects, no sync, no embeddings, empty search.
- Check job failure readability and recovery path.
- Check repeated action clicks for duplicate prevention.
- Check layout resilience for long names and long IDs.
