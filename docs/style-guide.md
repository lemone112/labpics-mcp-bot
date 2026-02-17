# Documentation style guide

This repository uses two documentation layers:

- `docs/` — operator/builder docs for the current MVP (how it works, how to run it)
- `docs/specs/` — behavioral requirements (invariants + acceptance criteria)

## Language

- Prefer **English** for `docs/` so the repo stays readable for tooling and future contributors.
- Specs may be bilingual, but the **status line** must be consistent.

## Status markers

In specs, include a status line near the top:

- `Статус: **draft**`
- `Статус: **ready**`
- `Статус: **implemented**`

If a spec is mostly roadmap, keep it as `draft`.

## Links

- Use relative links inside the repo.
- Prefer linking to canonical docs instead of duplicating content.

## What belongs where

- Put *how-to-run* and *what exists today* into `docs/`.
- Put *what must be true* into `docs/specs/`.

## Required invariants vocabulary

When writing requirements, explicitly call out:

- scope: `project_id`, `account_scope_id`, `active_project_id`
- evidence-first: a derived thing must reference sources
- idempotency: safe retries, dedupe keys
- safe-by-default: preview→apply, approvals for outbound
