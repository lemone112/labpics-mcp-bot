# Documentation style guide

This repository has two documentation layers:

- `docs/` — **operator+builder docs** for the current MVP: how to run, deploy, operate, and understand the system.
- `docs/specs/` — **behavior specs** (semantic requirements): what must be true, what users experience, invariants, and acceptance criteria.

## Writing principles

1. **Evidence-first**: any derived statement must link to its source (message, conversation, job run, DB row id, etc.).
2. **Safe-by-default**: ambiguous actions must not be auto-executed. Prefer explicit user choice.
3. **Project/account scope clarity**: always state scope behavior explicitly. Platform defaults to strict `(project_id, account_scope_id)` isolation unless a page explicitly describes cross-scope admin behavior.
4. **Idempotency**: repeated runs must not create duplicates.

## Language

- Prefer short sentences.
- Use the terms from the glossary: [`docs/glossary.md`](./glossary.md).
- If a term is introduced in a page, link to the glossary entry on first use.

## Page structure (recommended)

- **Purpose** (1–2 paragraphs)
- **How it works** (bullets)
- **Operational notes** (what breaks, where to look)
- **Links** (to specs / runbooks / code)
