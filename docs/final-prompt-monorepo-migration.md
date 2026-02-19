# Monorepo Migration — telegram-assistant-bot → labpics-dashboard

## Status: DONE

Migration completed on 2026-02-19.

## What was done

### Step 1 — Copy source files
All 8 source files from `telegram-assistant-bot` repo copied to `telegram-bot/`:
- `src/index.ts` — main Cloudflare Worker handler (webhook, drafts, profile, pickers)
- `src/composio.ts` — Composio MCP integration
- `src/linear_kickoff_template.ts` — Linear kickoff template builder
- `src/supabase.ts` — Supabase client and helpers
- `src/safety/types.ts` — error normalization types
- `package.json`, `tsconfig.json`, `wrangler.toml`

### Step 2 — SQL migrations (Variant A — keep as-is)
Supabase migrations kept in `telegram-bot/supabase/migrations/` (schema `bot`):
- `0001_extensions_and_schema.sql`
- `0002_core_tables.sql`
- `0003_user_state_linear_caches_bulk.sql`
- `0004_design_studio_sales_to_linear.sql`

Bot uses separate Supabase project; migrations remain self-contained.

### Step 3 — Docker Compose service
Added `telegram-bot` service to root `docker-compose.yml` with `profiles: ["telegram-bot"]`:
- Runs `wrangler dev --local` for local development
- Opt-in via `docker compose --profile telegram-bot up`
- Environment vars: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COMPOSIO_API_KEY`

### Step 4 — Removed unnecessary files
Bot `.github/workflows/` not copied (CI integrated into monorepo workflow).
Bot `docker-compose.yml` not present in source (Cloudflare Worker).

### Step 5 — CI typecheck-bot job
Added `typecheck-bot` job to `.github/workflows/ci-quality.yml`:
- Independent job (runs in parallel with `quality`)
- `npm ci` + `npm run typecheck` in `telegram-bot/`

### Step 6 — CLAUDE.md updated
Root `CLAUDE.md` updated with:
- Telegram Bot in tech stack
- Monorepo structure diagram
- Bot-specific section (runtime, DB, dev commands, docs location)

### Step 7 — Environment
- `.env.example` updated with bot variables
- `.gitignore` updated with `.wrangler/`, `.dev.vars`
- Bot docs (32 files) copied to `telegram-bot/docs/`
- Bot Dockerfile created (multi-stage: typecheck + dev)

## Next steps (post-migration iterations)

### Iteration 3 — Refactoring & Reports
- Refactor `index.ts` → modules: `handlers/`, `services/`, `ui/`
- Project scoping per Telegram user
- Reports from Dashboard DB: pipeline, linear, deal card, digest, signals
- LightRAG search integration

### Iteration 4 — Voice & Real Mutations
- Voice STT via Whisper
- Real mutations via Composio (Linear create issue, Attio update deal, deal won kickoff)

### Iteration 5 — Push Notifications
- Redis push-notifications (daily/weekly digest, high-severity signals)

### Iteration 6 — Entity Graph Navigator
- Unified entity view (person → company → deals → projects → tasks)

### Iteration 7 — Admin Ops & Hardening
- Admin operations, rate limiting, monitoring
