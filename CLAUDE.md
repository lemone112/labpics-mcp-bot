# CLAUDE.md — Project Instructions

## Team context

- The project owner is a **designer with 10+ years of experience**.
- All visual/UI decisions (components, layouts, animations, colors, spacing, typography) must be **consulted with the user before implementation**.
- Do not make autonomous design choices — ask first, implement after approval.

## Tech stack

- **Backend:** Node.js, Fastify, PostgreSQL, pgvector, LightRAG
- **Frontend:** React 19, Next.js 16 (App Router), shadcn/ui, Radix, Tailwind CSS v4, anime.js
- **Testing:** node:test (backend unit), Playwright (e2e)
- **Docs language:** Russian (code & comments in English)

## Design system

- Source of truth: `web/DESIGN_SYSTEM_2026.md`, `web/DESIGN_SYSTEM_CONTROL_TOWER.md`
- Motion: `web/MOTION_GUIDELINES.md`
- Component selection: `web/COMPONENT_SELECTION.md`
- Quality gates: `web/QUALITY_GATES_UI.md`
- Automated checks: `web/scripts/design-audit.mjs`, `web/scripts/ui-consistency-check.mjs`

## Task tracking

- All tasks tracked as GitHub Issues with Milestones (Iter 11–16).
- `docs/iteration-plan-wave2.md` is the architectural reference; Issues are source of truth.

## Git conventions

- Commit messages: English, concise, prefixed (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`)
- PRs: target `labpics_dashboard` branch
