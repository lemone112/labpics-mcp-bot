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
- **MANDATORY:** Before any UI/UX work, use the `ui-ux-pro-max` skill (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py`) to get design recommendations — palette, typography, style, and anti-patterns.
- **Components: shadcn/ui only.** Use clean, unmodified shadcn/ui primitives. No custom wrappers unless absolutely necessary. Extend via Tailwind classes, not component forks.
- **Animation: anime.js only.** All motion and transitions beyond simple CSS hover/focus must use anime.js. No framer-motion, no react-spring, no GSAP. Keep animations purposeful — entrance, state change, feedback — per `docs/design/MOTION_GUIDELINES.md`.

## Tech stack

- **Backend:** Node.js, Fastify, PostgreSQL, pgvector, LightRAG
- **Frontend:** React 19, Next.js 16 (App Router), shadcn/ui, Radix, Tailwind CSS v4, anime.js
- **Telegram Bot:** TypeScript, PostgreSQL, Composio MCP, Docker (`apps/telegram-bot/`)
- **Testing:** node:test (backend unit), Playwright (e2e)
- **Docs language:** Russian (code & comments in English)

## Design system

- Source of truth: `docs/design/DESIGN_SYSTEM_2026.md`, `docs/design/DESIGN_SYSTEM_CONTROL_TOWER.md`
- Motion: `docs/design/MOTION_GUIDELINES.md`
- Component selection: `docs/design/COMPONENT_SELECTION.md`
- Quality gates: `docs/design/QUALITY_GATES_UI.md`
- Automated checks: `apps/web/scripts/design-audit.mjs`, `apps/web/scripts/ui-consistency-check.mjs`
- **Design intelligence:** `.claude/skills/ui-ux-pro-max/` — searchable DB of 67 styles, 96 palettes, 57 font pairings, 99 UX guidelines. Use `--design-system` for full recommendations, `--domain` for targeted lookups, `--stack shadcn` for shadcn-specific patterns.

## Task tracking

- All tasks tracked as GitHub Issues with Milestones (Iter 11–51).
- Unified execution plan: `docs/iterations/iteration-plan-wave3.md` (276 issues, 10 phases, 33 iterations).
- `docs/iterations/iteration-plan-wave2.md` is the architectural reference; Issues are source of truth.

## Monorepo structure

```
labpics-dashboard/
├── apps/
│   ├── api/             # Fastify API + worker (was server/)
│   │   └── src/
│   │       ├── domains/ # Business logic grouped by domain
│   │       ├── infra/   # Infrastructure (db, redis, http, cache, sse)
│   │       ├── routes/  # HTTP route handlers
│   │       └── types/   # TypeScript type definitions
│   ├── web/             # Next.js frontend (was web/)
│   └── telegram-bot/    # Telegram assistant bot (was telegram-bot/)
├── packages/
│   └── shared-types/    # Cross-service TypeScript types
├── docs/
│   ├── architecture/    # System diagrams, data model, API
│   ├── product/         # Decisions, glossary, scenarios
│   ├── specs/           # Feature specifications (0001-0017)
│   ├── design/          # Design system, motion, components
│   ├── operations/      # Deployment, runbooks, rollback
│   ├── iterations/      # Iteration plans, logs, backlog
│   └── audits/          # Audit reports, critique findings
├── infra/
│   ├── caddy/           # Reverse proxy configuration
│   └── scripts/         # Smoke tests, backup, utilities
└── docker-compose.yml
```

## Telegram bot

- Source: `apps/telegram-bot/` (migrated from `telegram-assistant-bot` repo)
- Runtime: Docker (Node.js)
- DB: PostgreSQL (shared with main API, pending migration from Supabase — see backlog)
- Local dev: `docker compose --profile telegram-bot up` or `cd apps/telegram-bot && npx wrangler dev`
- Typecheck: `cd apps/telegram-bot && npm run typecheck`
- Bot docs: `apps/telegram-bot/docs/`
- Integrations: Composio MCP (Linear + Attio actions), daniel-lightrag-mcp (search/knowledge after Iter 11)
- Planned: Whisper voice input (Iter 51)

## Wave 3 scope

Wave 3 introduces: multi-user support (Owner/PM roles), system monitoring UI, automated reporting, and search UX improvements.

## Git conventions

- Commit messages: English, concise, prefixed (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`)
- PRs: target `labpics_dashboard` branch
