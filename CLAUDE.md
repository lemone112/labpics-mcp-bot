# CLAUDE.md — Project Instructions

## Critical analysis rule

After any research, analysis, or audit — always review the result from a position of **maximum criticism**:
- Every claim must be **verified** (by tests, code grep, or direct evidence).
- Every hypothesis must be **confirmed or rejected** — never stated as fact without proof.
- **Zero fabrications** — if something is unknown, say "unknown", never invent.
- Prefer outputs that are **provably true** (test passes, file exists, grep confirms) over plausible-sounding assumptions.

## Design & UX standards

- **Pixel-perfect** implementation is a top priority — every spacing, alignment, and visual detail matters.
- Pay special attention to visual **edge-cases**: empty states, overflow, truncation, responsive breakpoints, loading skeletons, error states.
- Design must be **clean and modern**, following 2026 SaaS design trends.
- UX must be **logical and intuitive** — minimal friction, clear hierarchy, predictable interactions.
- UI must match current **SaaS-standard patterns**: consistent component usage, proper density, accessible contrast, smooth transitions.

## Tech stack

- **Backend:** Node.js, Fastify, PostgreSQL, pgvector, LightRAG
- **Frontend:** React 19, Next.js 16 (App Router), shadcn/ui, Radix, Tailwind CSS v4, anime.js
- **Telegram Bot:** TypeScript, Supabase, Composio MCP, Docker (`telegram-bot/`)
- **Testing:** node:test (backend unit), Playwright (e2e)
- **Docs language:** Russian (code & comments in English)

## Design system

- Source of truth: `web/DESIGN_SYSTEM_2026.md`, `web/DESIGN_SYSTEM_CONTROL_TOWER.md`
- Motion: `web/MOTION_GUIDELINES.md`
- Component selection: `web/COMPONENT_SELECTION.md`
- Quality gates: `web/QUALITY_GATES_UI.md`
- Automated checks: `web/scripts/design-audit.mjs`, `web/scripts/ui-consistency-check.mjs`

## Task tracking

- All tasks tracked as GitHub Issues with Milestones (Iter 11–51).
- Unified execution plan: `docs/iteration-plan-wave3.md` (196 issues, 8 phases, 25 iterations).
- `docs/iteration-plan-wave2.md` is the architectural reference; Issues are source of truth.

## Monorepo structure

```
labpics-dashboard/
├── server/          # Fastify API + worker
├── web/             # Next.js frontend
├── telegram-bot/    # Telegram assistant bot (TypeScript, Docker)
├── infra/           # Caddy, deployment configs
├── scripts/         # Smoke tests, utilities
└── docs/            # Architecture, specs, iterations
```

## Telegram bot

- Source: `telegram-bot/` (migrated from `telegram-assistant-bot` repo)
- Runtime: Docker (Node.js)
- DB: Supabase (schema `bot`), migrations in `telegram-bot/supabase/migrations/`
- Local dev: `docker compose --profile telegram-bot up` or `cd telegram-bot && npx wrangler dev`
- Typecheck: `cd telegram-bot && npm run typecheck`
- Bot docs: `telegram-bot/docs/`
- Integrations: Composio MCP (Linear + Attio actions), daniel-lightrag-mcp (search/knowledge after Iter 11)
- Planned: Whisper voice input (Iter 51)

## Wave 3 scope

Wave 3 introduces: multi-user support (Owner/PM roles), system monitoring UI, automated reporting, and search UX improvements.

## Git conventions

- Commit messages: English, concise, prefixed (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`)
- PRs: target `labpics_dashboard` branch
