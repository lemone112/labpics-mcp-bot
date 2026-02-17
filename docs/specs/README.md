# Specs (`docs/specs/`)

This folder contains **behavior specs** (semantic requirements): what must be true, what users experience, invariants, and acceptance criteria.

- Canonical terms: [`docs/glossary.md`](../glossary.md)
- Writing rules: [`docs/style-guide.md`](../style-guide.md)
- MVP vs roadmap guardrails: [`docs/mvp-vs-roadmap.md`](../mvp-vs-roadmap.md)

## Invariants (non-negotiable)

1. **No cross-project mixing.** The system must never read/write another project's data.
2. **Evidence-first.** Any valuable derived entity must reference primary sources.
3. **Safe-by-default.** If binding is ambiguous, do not auto-act.
4. **Idempotency.** Re-running jobs must not create duplicates or junk.
5. **Explainability.** Outputs/actions must show “why” + “based on what”.

## How to use specs

- One spec = one problem and one outcome.
- Prefer explicit **acceptance criteria**.
- If something is not in MVP, mark it as **Roadmap** and link to `mvp-vs-roadmap.md`.

## Recommended spec structure

- Status (Draft/Ready/Implemented)
- Goal
- Non-goals
- Definitions (link glossary entries)
- UX / behavior
- Data and scope rules (project-scoped)
- Failure modes
- Operational notes
- Acceptance criteria
