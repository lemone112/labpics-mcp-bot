# Architectural Audit — Post Monorepo Migration (2026-02-19)

## Summary

Full-stack audit after migrating `telegram-assistant-bot` into `labpics-dashboard` monorepo.
280+ open issues across 30 milestones reviewed. 4 codebases audited: server, web, telegram-bot, docs.

---

## 1) Codebase State (verified)

| Area | Language | Files | LoC | TypeScript | Tests |
|------|----------|-------|-----|------------|-------|
| server/ | JavaScript | 46 | ~17K | None (pure JS) | node:test |
| web/ | JSX | ~99 | ~12K | None (pure JSX) | Playwright e2e |
| telegram-bot/ | TypeScript | 18 | ~1.2K | strict mode | typecheck only |

### Key findings

**server/** — solid architecture, significant code duplication:
- 11 utility functions duplicated 2–11 times across files (asText, clampInt, clamp, toIso, toDate, requiredEnv, toBoolean)
- 2,656-line monolithic `index.js` with 60+ routes
- Zero static typing (no tsconfig.json)
- SQL injection risk in `lib/idempotency.js:34` (string-interpolated interval)
- 245 parameterized SQL queries (good)

**web/** — strong design system discipline, needs TypeScript:
- 33 shadcn/ui components + 8 custom
- 5 normative design docs + 2 automated linters
- `section-page.jsx` monolith: ~2000 lines (needs splitting — Issue #103)
- SSE + React Query + offline detection implemented
- Zero TypeScript files

**telegram-bot/** (post-refactor) — clean modular structure:
- Monolithic `index.ts` (757 → 63 lines) broken into 18 modules
- Types extracted to `types.ts` with callback enum validation
- Handlers, services, UI, DB layers separated
- Typecheck passes with zero errors

---

## 2) GitHub Issues Audit

### Milestones overview (30 milestones, 280+ open issues)

| Milestone | Open | Status | Assessment |
|-----------|------|--------|------------|
| Iter 11 — Full LightRAG | 10 | BLOCKED (needs HKUDS deploy) | Valid, critical path |
| Iter 13 — Frontend Resilience | 13 | Ready | Valid |
| Iter 14 — Design System | 17 | In progress (5 closed) | Valid |
| Iter 15 — TypeScript/CI | 14 | Ready | Valid, high priority |
| Iter 16 — QA & Release | 15 | Ready | Valid |
| Iter 17 — Analytics | 8 | Ready | Valid |
| Iter 18–24 — Design overhaul | ~78 | Ready | Valid but granular |
| Iter 25 — Performance | 9 | Depends on 15/16 | Valid |
| Iter 26 — API Architecture | 8 | Depends on 15 | Valid |
| Iter 27 — Multi-user RBAC | 9 | Far future | Speculative |
| Iter 28 — Notifications | 9 | Far future | Speculative |
| Iter 29 — Platform/Integrations | 8 | Far future | Speculative |
| Iter 30 — Offline/Enterprise | 8 | Far future | Premature |
| Iter 31–35 — AI/Intelligence | 15 | Far future | Premature |
| Iter 36–43 — Analytics/Charts/Integrations | ~51 | Far future | Premature |

### Critical problems with Issues

**1. Duplicate issues in Iter 37 (Chart Infrastructure):**
- #293 ≡ #298 (React Flow install)
- #294 ≡ #300 (Sigma.js install)
- #295 ≡ #302 (dimension system)
- #296 ≡ #304 (FunnelChart wrapper)
- #297 ≡ #306 (theme integration)
Action: close #293–#297 as duplicates of #298–#306.

**2. No telegram-bot milestone:**
Bot iterations (Iter 3–7 from migration plan) have no GitHub Issues.
Action: create Milestone "Iter Bot — Telegram Bot Iterations" with issues for:
- Bot Iter 3: Refactor + reports (done in this PR)
- Bot Iter 4: Voice STT + real Composio mutations
- Bot Iter 5: Redis push notifications
- Bot Iter 6: Entity Graph Navigator
- Bot Iter 7: Admin ops + hardening

**3. Premature planning (Iter 27–43):**
115 issues for features that depend on completing Iter 11–16 first.
No code exists for most of them.
Action: close milestones 27–43, move valid ideas to a `backlog` label.

**4. Missing issues for discovered bugs:**
- SQL injection in `server/lib/idempotency.js:34` — no issue
- Duplicate utilities (11 categories) — no issue
- `section-page.jsx` split — exists (#103, #158) but blocked

---

## 3) Documentation Audit

### Removed (redundant)
- `docs/rag.md` — subset of `lightrag-contract.md`
- `docs/specs/0018-lightrag-only-mode.md` — merged into `lightrag-contract.md` section 5
- `docs/roadmap-outbound.md` — 6-line pointer to `business-outbound-system.md`

### Updated
- `docs/lightrag-contract.md` — added API Schema section (from 0018)
- `docs/specs/README.md` — updated index (0018 merged note)
- `CLAUDE.md` — added critical analysis rule, monorepo structure, bot section

### Kept (current & accurate)
- Core: architecture.md, platform-architecture.md, data-model.md, api.md
- Operations: pipelines.md, redis-sse.md, backend-services.md, runbooks.md
- Roadmap: mvp-vs-roadmap.md, iteration-plan-wave2.md, iteration-log.md
- Design: all web/DESIGN_SYSTEM*.md, COMPONENT_SELECTION.md, QUALITY_GATES_UI.md, MOTION_GUIDELINES.md
- Bot: all telegram-bot/docs/ (32 files)

### Gaps
- No error boundary documentation for frontend
- No observability/Grafana dashboard definitions
- No MCP/Composio contract doc for bot planner
- bot `docs/ux.md` and `docs/ux-flows.md` need review for currency

---

## 4) Refactoring Done in This PR

### telegram-bot/ modular refactoring

**Before:** 1 file (index.ts, 757 lines) + 4 small support files = 5 files
**After:** 18 files, clean separation:

```
telegram-bot/src/
├── index.ts              # Entry point (63 lines)
├── types.ts              # All types + callback enum
├── telegram.ts           # Telegram API client
├── errors.ts             # Error normalization + formatting
├── db/
│   └── client.ts         # Supabase client + settings helpers
├── handlers/
│   ├── callback.ts       # Main callback dispatcher with enum validation
│   ├── message.ts        # Text message handler
│   ├── system.ts         # SYS (Menu/Cancel) callbacks
│   ├── menu.ts           # Menu action callbacks
│   ├── profile-cb.ts     # Profile management callbacks
│   ├── picker-cb.ts      # Picker navigation callbacks
│   └── draft-cb.ts       # Draft Apply/Cancel callbacks
├── services/
│   ├── auth.ts           # Allowlist authentication
│   ├── audit.ts          # Best-effort audit logging
│   ├── draft.ts          # Draft CRUD operations
│   ├── idempotency.ts    # Idempotency key management
│   ├── picker.ts         # Picker state machine
│   ├── profile.ts        # Profile load/save
│   └── telegram-user.ts  # User upsert
├── ui/
│   ├── keyboards.ts      # All InlineKeyboardMarkup builders
│   └── templates.ts      # Message text renderers
├── composio.ts           # Composio API client (unchanged)
├── linear_kickoff_template.ts  # Kickoff template (unchanged)
└── safety/types.ts       # Error category types (unchanged)
```

### Key improvements:
- Callback routing uses `CallbackOp` enum instead of raw strings
- Types centralized (no more `as any` for core types)
- Each handler is independently testable
- UI separated from business logic
- DB layer isolated from handlers

---

## 5) Recommended Next Steps (priority order)

1. **Fix SQL injection** in `server/lib/idempotency.js:34` (30 min, critical)
2. **Extract server utilities** — deduplicate 11 function categories (2–3 hours)
3. **TypeScript foundation** — Issue #86, start with server/ tsconfig.json (depends on Iter 15)
4. **Create bot milestone + issues** in GitHub
5. **Close duplicate Iter 37 issues** (#293–#297)
6. **Close/archive premature milestones** (Iter 27–43)
7. **Split section-page.jsx** — Issue #103/#158 (frontend priority)
