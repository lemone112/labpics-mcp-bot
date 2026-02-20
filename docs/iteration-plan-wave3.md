# Unified Iteration Plan — All Open Work (276 issues)

> Обновлено: 2026-02-20 (v6 — monorepo restructure)
> Source of truth: [GitHub Milestones](https://github.com/lemone112/labpics-dashboard/milestones)
>
> **Контекст:** Design studio lab.pics, 2–5 PM + Owner, 5–10 активных проектов,
> $5–20K avg, 1–3 месяца, стартапы/IT. Deploy: VPS + Docker Compose.
>
> **Источники:** 5 research reports (infra audit Feb 2026) + 6-round Q&A session.
> **NEW:** 6-agent parallel critique (2026-02-20) — see `docs/critique-findings-2026-02-20.md`.
> Closed Iter 27–43 — superseded (roadmap placeholders).
> ✅ **Iter 55 — DONE** (committed as `27200c0`, all 306 tests pass).
> ✅ **Iter 61-63, 52-54 — DONE** (Phase 0 critical fixes + TS migration of lib/).

---

## Execution Phases (post-critique re-prioritization)

```
Phase 0 — Critical Fixes ★★★ (data integrity + security, start NOW)
  Iter 61  Security Hardening ────────────── 8 tasks  P0  ← CSRF, webhook, auth rate limit    NEW
  Iter 62  Business Logic Accuracy ──────── 8 tasks  P0  ← Russian signals, real metrics      NEW
  Iter 63  DB & Vector Optimization ─────── 8 tasks  P0  ← vector operator fix, indexes       NEW
  Iter 52  Critical Data Safety & Auth ──── 7 tasks  P0  ← watermark, TG bot auth
  Iter 53  Scheduler & Worker Hardening ── 8 tasks  P0  ← timeouts, backoff, 429

Phase 1 — Foundation (after critical fixes)
  Iter 44  Scheduler & Connectors ─────── 7 tasks  P0
  Iter 11  LightRAG Integration ──────── 10 tasks  P1  ← LOWERED from CRITICAL (not revenue-critical)

Phase 2 — Core Business Features
  Iter 49  Multi-User & Access Control ── 8 tasks  P0
  Iter 48  Automated Reporting ────────── 6 tasks  P0  ← RAISED from P1 (revenue protection)
  Iter 45  Search UX & Intelligence ───── 8 tasks  P0
  Iter 20  UX Logic & IA ────────────── 11 tasks  P0

Phase 3 — UX/UI Deep Work ★★ (only after data layer is accurate)
  Iter 54  Frontend Resilience ──────────── 8 tasks  P0  ← RAISED from P1 (CSP, hooks, Promise.all)
  Iter 21    Page-Level Redesign ──────── 12 tasks  P1  ← LOWERED from P0 (fix data first)
  Iter 20.5  Charts & Visualization ──── 12 tasks  P1  ← LOWERED from P0 (charts show zeros)
  Iter 23    Accessibility & Polish ──── 10 tasks  P1

Phase 4 — Platform & Monitoring
  Iter 46  System Monitoring UI ────────── 7 tasks  P1
  Iter 47  Infrastructure Hardening ────── 6 tasks  P1
  Iter 17  Analytics Instrumentation ───── 8 tasks  P1  ← RAISED from P2 (no usage data)

Phase 5 — Telegram Bot (lowered: convenience, not necessity)
  Iter 50  Telegram Bot MVP ───────────── 8 tasks  P2  ← LOWERED from P0
  Iter 51  Telegram Bot Advanced ──────── 7 tasks  P2  ← LOWERED from P1

Phase 6 — Mobile & Responsive
  Iter 22  Mobile & Responsive ─────────── 8 tasks  P1

Phase 7 — Quality & Tech Debt
  Iter 64  Monorepo Restructure & Docs ── 14 tasks  P1  ← apps/ layout, docs cleanup        NEW
  Iter 16  QA & Release Readiness ──────── 3 tasks  HIGH
  Iter 24  Design Validation & QA ──────── 9 tasks  P1
  Iter 25  Performance & Caching ────────── 9 tasks  P2
  Iter 26  API Architecture & DX ────────── 8 tasks  P2
  Iter 15  TypeScript Migration ──────────── 2 tasks  P2

Phase 8 — Remaining Audit Fixes
  Iter 55  Observability & Audit Trail ──── 8 tasks  ✅ DONE
  Iter 56  Config & Infra Hardening ─────── 6 tasks  P2

Phase 9 — Comprehensive Testing ★★★ (incremental, not final-phase-only)
  Iter 57  Backend Unit Test Expansion ──── 8 tasks  P0  ← start alongside Phase 0
  Iter 58  E2E Test Suite ─────────────── 8 tasks  P0
  Iter 59  Integration & Contract Testing ── 8 tasks  P1
  Iter 60  TG Bot & Performance Testing ── 8 tasks  P1
```

**Total: 276 issues across 33 iterations in 10 phases.**

### Key changes from v4 → v5 (critique-driven):
- **NEW Phase 0** — 3 new iterations (61-63) for critique findings not in any existing plan
- **Iter 11 (LightRAG)** lowered CRITICAL → P1: not revenue-critical, web dashboard is primary
- **Iter 48 (Reporting)** raised P1 → P0: most direct revenue-protection mechanism
- **Iter 54 (Frontend)** raised P1 → P0: CSP unsafe-eval, hooks violation affect production
- **Iter 21, 20.5** lowered P0 → P1: redesigning pages showing fabricated data is wasted effort
- **Iter 50, 51 (TG Bot)** lowered P0/P1 → P2: convenience for 2-5 person studio
- **Iter 17 (Analytics)** raised P2 → P1: no usage data means blind product decisions
- **Phase 9** now starts alongside Phase 0 (testing should accompany features, not follow them)
- **Iter 55** marked ✅ DONE

---

## Dependency Graph (post-critique)

```
Phase 0 (START HERE):
  Iter 61 (Security) ──────── no deps, start immediately
  Iter 62 (Biz Logic) ─────── no deps, start immediately
  Iter 63 (DB/Vector) ─────── no deps, start immediately
  Iter 52 (Data Safety) ───── no deps
  Iter 53 (Scheduler) ─────── no deps
  Iter 57 (Backend Tests) ──← start alongside, test as we fix

Phase 1:
  Iter 44 (Scheduler) ──┐
  Iter 11 (LightRAG) ───┼──────────────────────────────────┐
                        │                                  │
Phase 2:                ▼                                  │
  Iter 49 (Multi-user) ←┘                                  │
  Iter 48 (Reporting) ← requires 44, 62 (accurate data)   │
  Iter 45 (Search UX)                                      │
  Iter 20 (UX Logic) ───────────┐                          │
                                │                          │
Phase 3 (after data layer is accurate):                    │
  Iter 54 (Frontend) ───────── no deps, can run early      │
  Iter 21 (Page Redesign) ← requires 20, 62               │
  Iter 20.5 (Charts) ← requires 20, 62 (real metric data) │
  Iter 23 (A11y/Polish) ← requires 21                     │
                                                           │
Phase 4:                                                   │
  Iter 46 (Monitoring) ← enhanced by 44                    │
  Iter 47 (Infrastructure)                                 │
  Iter 17 (Analytics) ←── no deps, raised to P1            │
                                                           │
Phase 5 (lowered priority):                                ▼
  Iter 50 (TG Bot MVP) ← requires 11 (LightRAG) ─────────┘
  Iter 51 (TG Bot Advanced) ← requires 50

Phase 6: Iter 22 (Mobile) ← requires 21
Phase 7: Iter 64 (Monorepo) — no deps, best done early
         Iter 16, 24, 25, 26, 15 — parallel, independent
Phase 8: Iter 55 ✅ DONE, Iter 56 (Config) — P2

Phase 9 (incremental, not sequential):
  Iter 57 (Backend Tests) ← start with Phase 0
  Iter 58 (E2E Tests) ← start when Phase 2-3 pages exist
  Iter 59 (Integration Tests) ← requires 44, 49, 11
  Iter 60 (TG Bot + Perf) ← requires 50-51
```

---

## Phase 1 — Foundation (17 tasks)

### Iter 11 — HKUDS LightRAG Integration (P1 ↓, 10 tasks) ★ LOWERED from CRITICAL

> Issues: [#46–#55](https://github.com/lemone112/labpics-dashboard/milestone/1)
> **LOWERED** by critique: LightRAG not revenue-critical; Owner/PMs use web dashboard, not TG bot.

Миграция с custom hybrid RAG на HKUDS LightRAG. Knowledge graph + dual-level retrieval.
**Блокирует:** Iter 50 (TG Bot search через LightRAG MCP).

| # | Task | Priority |
|---|------|----------|
| 11.1 | Apply migration 0021 (LightRAG full schema) | CRITICAL |
| 11.2 | Build ingestion pipeline: raw → source_documents | CRITICAL |
| 11.3 | Build entity extraction: source_documents → entities | CRITICAL |
| 11.4 | Deploy HKUDS LightRAG Server | CRITICAL |
| 11.5 | Data ingestion → LightRAG /documents API | HIGH |
| 11.6 | Proxy LightRAG query endpoints | HIGH |
| 11.7 | Implement ACL filtering | HIGH |
| 11.8 | Implement structured citations | HIGH |
| 11.9 | MCP Server for Telegram bot (daniel-lightrag-mcp) | HIGH |
| 11.10 | LightRAG integration tests | MEDIUM |

### Iter 44 — Scheduler & Connector Reliability (P0, 7 tasks)

> Issues: [#349–#355](https://github.com/lemone112/labpics-dashboard/milestone/34)

Fix 3x connector bottleneck (sequential → parallel). Quick wins.

| # | Task | Priority |
|---|------|----------|
| 44.1 | Parallel connector sync (Promise.all) | P0 |
| 44.2 | Job duration metrics (prom-client histogram) | P0 |
| 44.3 | Dead job detection and auto-cleanup | P1 |
| 44.4 | Job retry with configurable backoff | P1 |
| 44.5 | Connector sync progress events via SSE | P1 |
| 44.6 | Job execution concurrency limit | P2 |
| 44.7 | Scheduler health endpoint | P2 |

---

## Phase 2 — Core Business Features (27 tasks)

### Iter 49 — Multi-User & Access Control (P0, 8 tasks)

> Issues: [#383–#390](https://github.com/lemone112/labpics-dashboard/milestone/39)

2–5 PM + Owner. Owner видит всё, PM — свои проекты.

| # | Task | Priority |
|---|------|----------|
| 49.1 | DB schema: users table | P0 |
| 49.2 | Auth upgrade: multi-user login | P0 |
| 49.3 | Session upgrade: user_id + multi-session | P0 |
| 49.4 | Permission middleware: role-based protection | P0 |
| 49.5 | Project-user assignment API | P0 |
| 49.6 | Team management UI | P1 |
| 49.7 | User profile page | P2 |
| 49.8 | Audit trail: user_id in events | P1 |

### Iter 45 — Search UX & Intelligence (P0, 8 tasks)

> Issues: [#356–#363](https://github.com/lemone112/labpics-dashboard/milestone/35)

Поиск — ключевая функция продукта. Elasticsearch НЕ нужен.

| # | Task | Priority |
|---|------|----------|
| 45.1 | Search debounce (300ms) + loading | P0 |
| 45.2 | Pagination (offset/limit + UI) | P0 |
| 45.3 | Date range filter | P0 |
| 45.4 | Source type filter chips | P1 |
| 45.5 | Search query analytics | P1 |
| 45.6 | Fuzzy matching (pg_trgm) | P1 |
| 45.7 | Autocomplete suggestions | P2 |
| 45.8 | Reduce timeout 25s→10s + progressive load | P2 |

### Iter 20 — UX Logic & Information Architecture (P0, 11 tasks)

> Issues: [#138–#171](https://github.com/lemone112/labpics-dashboard/milestone/7)

Фундамент UX: Action Queue, dashboard hierarchy, client-centric view, navigation.
**Блокирует:** Iter 21 (page redesign) и Iter 20.5 (charts).

| # | Task | Priority |
|---|------|----------|
| 20.1 | Design Action Queue data model | P0 |
| 20.2 | Implement Action Queue API | P0 |
| 20.3 | Design single guided setup flow | P0 |
| 20.4 | Design navigation badge system | P1 |
| 20.5 | Design client-centric view | P1 |
| 20.6 | Define Insight Tile spec | P1 |
| 20.7 | Define dashboard hierarchy | P0 |
| 20.8 | Design cross-section search | P1 |
| 20.9 | Define notification/alert system | P1 |
| 20.10 | Design table interaction patterns | P1 |
| 20.11 | Design error/recovery flows | P1 |

---

## Phase 3 — UX/UI Deep Work (34 tasks) ★★

> **Пристальное внимание к UX/UI.** Pixel-perfect, edge-cases, empty states,
> responsive breakpoints, loading skeletons, error states. Clean & modern SaaS design.
> Все правила: `DESIGN_SYSTEM_2026.md`, `QUALITY_GATES_UI.md`, `COMPONENT_SELECTION.md`.

### Iter 21 — Page-Level Redesign (P0, 12 tasks)

> Issues: [#158–#200](https://github.com/lemone112/labpics-dashboard/milestone/8)

Секция за секцией: каждая страница проходит redesign по стандартам Design System.

| # | Task | Priority |
|---|------|----------|
| 21.1 | Break section-page.jsx monolith | P0 |
| 21.2 | Implement Action Queue page | P0 |
| 21.3 | Implement guided setup flow | P0 |
| 21.4 | Redesign Dashboard section | P0 |
| 21.5 | Redesign Messages section | P0 |
| 21.6 | Redesign Agreements section | P1 |
| 21.7 | Redesign Risks section | P1 |
| 21.8 | Redesign Finance section | P1 |
| 21.9 | Redesign Offers section | P1 |
| 21.10 | Implement navigation badges | P1 |
| 21.11 | Implement client-centric view | P1 |
| 21.12 | Implement Cmd+K command palette | P2 |

### Iter 20.5 — Charts & Data Visualization (P0, 12 tasks) ★ DEEP CHART WORK

> Issues: [#152–#196](https://github.com/lemone112/labpics-dashboard/milestone/6)

**Выделенная итерация под глубокую работу с графиками:** аудит всех chart usages,
система типов, dimension system, композиция карточек, цветовая палитра, тултипы,
пустые состояния, оптимизация. Recharts + semantic chart tokens.

| # | Task | Priority | Фокус |
|---|------|----------|-------|
| 20.5.1 | Audit all current chart usages | P0 | Инвентаризация: какие графики где, что работает, что нет |
| 20.5.2 | Define chart type selection matrix | P0 | Какой тип графика для каких данных (bar/line/area/pie/funnel) |
| 20.5.3 | Define chart card composition spec | P0 | Стандартная карточка: заголовок-вопрос, legend, tooltip, no-data |
| 20.5.4 | Define chart dimension system | P0 | Responsive sizes: compact/standard/detailed + breakpoints |
| 20.5.5 | Fix chart internal spacing | P0 | Padding, margins, label alignment внутри chart containers |
| 20.5.6 | Implement chart type migrations | P1 | Заменить неподходящие типы (по матрице из 20.5.2) |
| 20.5.7 | Implement compact chart cards | P1 | Мини-версии для dashboard overview (sparklines, KPI tiles) |
| 20.5.8 | Implement detailed chart cards | P1 | Полноэкранные версии с drill-down и фильтрами |
| 20.5.9 | Implement empty chart state (compact) | P1 | ChartNoData с CTA (не пустой прямоугольник) |
| 20.5.10 | Chart color palette enforcement | P1 | chart-1..chart-5 semantic tokens, no raw colors |
| 20.5.11 | Chart tooltip standardization | P1 | Единый формат: значение, %, тренд, период |
| 20.5.12 | Chart performance optimization | P2 | Dynamic imports, memoization, reduce re-renders |

**Правила визуализации:**
- Один вопрос на график (заголовок = вопрос или утверждение)
- No-data state: компактный `ChartNoData` с CTA внутри карточки
- Цвета: `chart-1`..`chart-5` для серий, `StatusChip` для статусов
- Адаптивность: compact (mobile/sidebar) → standard (desktop) → detailed (full-width)
- Варианты отображения: sparkline / mini card / full card / fullscreen modal

### Iter 23 — Accessibility, Polish & Dark Mode (P1, 10 tasks)

> Issues: [#202–#211](https://github.com/lemone112/labpics-dashboard/milestone/10)

Финальная полировка: контрасты, клавиатура, screen reader, анимации, dark mode.

| # | Task | Priority |
|---|------|----------|
| 23.1 | WCAG AA contrast audit (light mode) | P0 |
| 23.2 | WCAG AA contrast audit (dark mode) | P0 |
| 23.3 | Keyboard navigation full audit | P0 |
| 23.4 | Screen reader audit | P1 |
| 23.5 | Add axe-core to e2e tests | P1 |
| 23.6 | Visual regression testing | P1 |
| 23.7 | Animation polish pass | P1 |
| 23.8 | Typography polish pass | P1 |
| 23.9 | Spacing polish pass | P1 |
| 23.10 | Dark mode visual polish | P1 |

---

## Phase 4 — Platform & Monitoring (19 tasks)

### Iter 46 — System Monitoring UI (P1, 7 tasks)

> Issues: [#364–#370](https://github.com/lemone112/labpics-dashboard/milestone/36)

Мониторинг встроен в UI (не Grafana отдельно).

| # | Task | Priority |
|---|------|----------|
| 46.1 | System Health page (service status cards) | P0 |
| 46.2 | Job dashboard (runs table + sparklines) | P0 |
| 46.3 | Connector sync timeline + success rate | P1 |
| 46.4 | Resource usage indicators (DB, Redis, disk) | P1 |
| 46.5 | Alert history feed | P1 |
| 46.6 | Log viewer (recent errors) | P2 |
| 46.7 | System health SSE events | P2 |

### Iter 47 — Infrastructure Hardening (P1, 6 tasks)

> Issues: [#371–#376](https://github.com/lemone112/labpics-dashboard/milestone/37)

| # | Task | Priority |
|---|------|----------|
| 47.1 | Automated PostgreSQL backup (cron + retention) | P0 |
| 47.2 | Caddy: HTTP/2 + HTTP/3 verification | P1 |
| 47.3 | Static asset CDN headers | P1 |
| 47.4 | fail2ban (SSH + API brute force) | P1 |
| 47.5 | Docker healthcheck improvements | P2 |
| 47.6 | Deployment automation (zero-downtime) | P2 |

### Iter 48 — Automated Reporting (P1, 6 tasks)

> Issues: [#377–#382](https://github.com/lemone112/labpics-dashboard/milestone/38)

| # | Task | Priority |
|---|------|----------|
| 48.1 | Report data model (templates + runs + snapshots) | P0 |
| 48.2 | Project status report (weekly, automated) | P0 |
| 48.3 | Financial overview report (monthly) | P1 |
| 48.4 | Team KPI dashboard | P1 |
| 48.5 | Report scheduling (cron) | P1 |
| 48.6 | Report viewer UI | P1 |

---

## Phase 5 — Telegram Bot (15 tasks)

### Iter 50 — Telegram Bot MVP (P0, 8 tasks)

> Issues: [#391–#398](https://github.com/lemone112/labpics-dashboard/milestone/40)
> **Depends on:** Iter 11 (LightRAG для поиска)

| # | Task | Priority |
|---|------|----------|
| 50.1 | Bot auth: link TG user to dashboard user | P0 |
| 50.2 | CryptoBot-style button navigation | P0 |
| 50.3 | Status command (project summary card) | P0 |
| 50.4 | Search via LightRAG (free text → results) | P0 |
| 50.5 | Linear task list (with status buttons) | P1 |
| 50.6 | Attio CRM quick view | P1 |
| 50.7 | Push: risks + approaching deadlines | P0 |
| 50.8 | Push: new client messages (Chatwoot) | P1 |

### Iter 51 — Telegram Bot Advanced (P1, 7 tasks)

> Issues: [#399–#405](https://github.com/lemone112/labpics-dashboard/milestone/41)
> **Depends on:** Iter 50

| # | Task | Priority |
|---|------|----------|
| 51.1 | Composio MCP: Linear actions | P0 |
| 51.2 | Composio MCP: Attio actions | P0 |
| 51.3 | Free text NLU (intent → action) | P1 |
| 51.4 | Whisper voice input | P0 |
| 51.5 | Daily digest (morning summary) | P1 |
| 51.6 | Weekly digest (Monday wrap-up) | P1 |
| 51.7 | Voice command shortcuts | P2 |

---

## Phase 6 — Mobile & Responsive (8 tasks)

### Iter 22 — Mobile & Responsive (P1, 8 tasks)

> Issues: [#175–#201](https://github.com/lemone112/labpics-dashboard/milestone/9)
> **Depends on:** Iter 21 (page redesign — адаптировать что уже redesigned)

| # | Task | Priority |
|---|------|----------|
| 22.1 | Define mobile IA | P0 |
| 22.2 | Optimize bottom tabbar | P0 |
| 22.3 | Mobile Action Queue | P1 |
| 22.4 | Mobile table responsive | P1 |
| 22.5 | Mobile charts (compact variants) | P1 |
| 22.6 | Mobile Sheet/Drawer | P1 |
| 22.7 | Safe area handling | P2 |
| 22.8 | Touch target audit | P1 |

---

## Phase 7 — Quality & Tech Debt (39 tasks)

### Iter 64 — Monorepo Restructure & Documentation Cleanup (P1, 14 tasks) ★ NEW

> **Задача:** Привести репозиторий к идеальной `apps/` структуре и навести порядок в документации.
> Нет зависимостей — можно делать в любой момент (но лучше до масштабных UI изменений).
> **Приоритет P1** — не блокирует фичи, но критично для developer velocity и onboarding.

**Целевая структура:**
```
labpics-dashboard/
├── apps/
│   ├── api/                    # ← server/ (Fastify API + worker)
│   │   ├── src/
│   │   │   ├── domains/        # ← services/ → группировка по доменам
│   │   │   │   ├── connectors/ #   connector-sync, connector-state
│   │   │   │   ├── crm/        #   accounts, opportunities, offers
│   │   │   │   ├── analytics/  #   intelligence, analytics, upsell, signals
│   │   │   │   ├── rag/        #   embeddings, lightrag, search, chunking
│   │   │   │   ├── outbound/   #   outbox, campaigns, opt-out
│   │   │   │   └── identity/   #   identity-graph, recommendations
│   │   │   ├── infra/          # ← lib/ (db, redis, http, cache, sse, etc.)
│   │   │   ├── routes/         #   HTTP route handlers
│   │   │   └── types/          #   shared TypeScript types
│   │   ├── migrations/         #   SQL migrations
│   │   ├── test/               #   unit + integration tests
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── web/                    # ← web/ (Next.js frontend)
│   │   └── src/                #   app/, features/, hooks/, components/
│   └── telegram-bot/           # ← telegram-bot/ (TG assistant)
├── packages/
│   └── shared-types/           # cross-service TypeScript types
├── docs/
│   ├── architecture/           #   system diagrams, data model, API
│   ├── product/                #   decisions, glossary, overview, scenarios
│   ├── specs/                  #   feature specifications (0001-0017)
│   ├── design/                 #   design system, motion, components (from web/*.md)
│   ├── operations/             #   deployment, runbooks, rollback
│   ├── iterations/             #   iteration plans, logs, backlog
│   └── audits/                 #   audit reports, critique findings
├── infra/
│   ├── caddy/
│   └── scripts/                # ← scripts/ (smoke tests, utilities)
├── docker-compose.yml
├── package.json                #   npm workspaces root
└── CLAUDE.md
```

| # | Task | Priority | Описание |
|---|------|----------|----------|
| 64.1 | Create `apps/` directory, move `server/` → `apps/api/` | P0 | Переименование, обновление docker-compose.yml build context |
| 64.2 | Move `web/` → `apps/web/` | P0 | Обновление docker-compose.yml, Caddyfile paths |
| 64.3 | Move `telegram-bot/` → `apps/telegram-bot/` | P0 | Обновление docker-compose.yml profile |
| 64.4 | Reorganize `services/` → `domains/` (6 domain groups) | P1 | connectors, crm, analytics, rag, outbound, identity |
| 64.5 | Rename `lib/` → `infra/` with internal grouping | P1 | db, redis, http, cache, sse, rate-limit, etc. |
| 64.6 | Add npm workspaces to root `package.json` | P0 | `"workspaces": ["apps/*", "packages/*"]` |
| 64.7 | Create `packages/shared-types/` scaffold | P1 | Cross-service types (ProjectScope, AuthPayload, Logger) |
| 64.8 | Reorganize `docs/` into category subfolders | P1 | architecture/, product/, specs/, design/, operations/, iterations/, audits/ |
| 64.9 | Move `web/*.md` design docs → `docs/design/` | P1 | DESIGN_SYSTEM_2026, MOTION_GUIDELINES, COMPONENT_SELECTION, QUALITY_GATES |
| 64.10 | Clean up obsolete/duplicate docs | P1 | Remove stale audit drafts, merge overlapping files, update cross-references |
| 64.11 | Move `scripts/` → `infra/scripts/` | P2 | Smoke tests, utilities consolidated under infra |
| 64.12 | Update all Dockerfiles for new paths | P0 | Build contexts, COPY paths, WORKDIR |
| 64.13 | Update CI/CD workflows for new paths | P1 | If any GitHub Actions exist |
| 64.14 | Update CLAUDE.md and README.md for new structure | P0 | Monorepo structure section, path references |

**Правила рефакторинга:**
- Каждый шаг — отдельный коммит (откат без потерь)
- Все import paths обновляются автоматически (IDE refactor или скрипт)
- Docker build проверяется после каждого перемещения
- `npm test` и `npm run lint` проходят после каждого шага
- Документация обновляется in-place (не создаём новые файлы, пока не перенесём старые)

---

### Iter 16 — QA & Release Readiness (3 open tasks)

> Issues: [#94, #98, #99](https://github.com/lemone112/labpics-dashboard/milestone/5)

| # | Task | Priority |
|---|------|----------|
| 16.6 | E2E tests for critical user paths | HIGH |
| 16.10 | Clean-DB migration test in CI | HIGH |
| 16.11 | Final regression suite (all green gate) | HIGH |

### Iter 24 — Design Validation & QA (9 tasks)

> Issues: [#212–#220](https://github.com/lemone112/labpics-dashboard/milestone/11)

| # | Task | Priority |
|---|------|----------|
| 24.1 | Compare analytics: before vs after | P1 |
| 24.2 | Run 5 user interviews | P1 |
| 24.3 | 3-second test on all pages | P0 |
| 24.4 | Full e2e test pass | P0 |
| 24.5 | Design audit script: 0 violations | P0 |
| 24.6 | Performance audit | P1 |
| 24.7 | Cross-browser verification | P1 |
| 24.8 | DoD checklist for every page | P1 |
| 24.9 | Design system documentation update | P1 |

### Iter 17 — Analytics Instrumentation (8 tasks)

> Issues: [#125–#134](https://github.com/lemone112/labpics-dashboard/milestone/12)

| # | Task | Priority |
|---|------|----------|
| 17.1 | Integrate PostHog/Mixpanel SDK | P1 |
| 17.2 | Track section navigation events | P1 |
| 17.3 | Track interaction events | P1 |
| 17.4 | Track activation funnel | P2 |
| 17.5 | Track empty state encounters | P2 |
| 17.6 | Track feature adoption | P2 |
| 17.7 | Session recording setup | P2 |
| 17.8 | Create baseline metrics dashboard | P2 |

### Iter 25 — Performance & Caching (9 tasks)

> Issues: [#221–#231](https://github.com/lemone112/labpics-dashboard/milestone/13)

| # | Task | Priority |
|---|------|----------|
| 25.1 | RSC + Streaming: portfolio overview | P1 |
| 25.2 | RSC + Streaming: control-tower pages | P1 |
| 25.3 | RSC: projects и login pages | P2 |
| 25.4 | HTTP Cache-Control + stale-while-revalidate | P1 |
| 25.5 | Redis cache: all read-heavy endpoints | P1 |
| 25.6 | Scheduler: materialized view auto-refresh | P2 |
| 25.7 | Dynamic imports для Recharts | P2 |
| 25.8 | Bundle size budget в CI | P2 |
| 25.9 | Dead code elimination | P2 |

### Iter 26 — API Architecture & DX (8 tasks)

> Issues: [#228–#240](https://github.com/lemone112/labpics-dashboard/milestone/14)

| # | Task | Priority |
|---|------|----------|
| 26.1 | Extract routes из index.js → routes/*.js | P0 |
| 26.2 | API versioning (/v1/ prefix) | P1 |
| 26.3 | Per-endpoint rate limiting | P1 |
| 26.4 | OpenAPI spec from Zod schemas | P1 |
| 26.5 | Feature flags: DB + API + frontend hook | P2 |
| 26.6 | Feature flags: admin UI | P2 |
| 26.7 | Structured request/response logging | P2 |
| 26.8 | API contract testing | P2 |

### Iter 15 — TypeScript Migration (2 open tasks)

> Issues: [#87, #88](https://github.com/lemone112/labpics-dashboard/milestone/4)

| # | Task | Priority |
|---|------|----------|
| 15.11 | Server TypeScript migration (38 files) | P2 |
| 15.12 | Web TypeScript migration (63 components) | P2 |

---

## Phase 0 — Critical Fixes ★★★ (start NOW, 31 tasks)

> Источник: 6-agent parallel critique 2026-02-20. Все findings верифицированы file:line ссылками.
> Полный отчёт: `docs/critique-findings-2026-02-20.md`
> **Нет зависимостей** — начинать немедленно, параллельно с любой другой работой.

### Iter 61 — Security Hardening (P0, 8 tasks) ★ NEW

> Issues: [#507–#514](https://github.com/lemone112/labpics-dashboard/milestone/51)
> Источник: Security agent critique. Findings не покрытые Iter 52-56.

| # | Task | Priority | Finding |
|---|------|----------|---------|
| 61.1 | Fix logout CSRF bypass: require CSRF for POST /auth/logout | P0 | `index.js:679` all /auth/ paths skip CSRF |
| 61.2 | Enforce TG webhook secret: reject when env var unset + startup check | P0 | `index.ts:33` + `types.ts:12` optional |
| 61.3 | Fix CSRF cookie httpOnly → false (enable double-submit pattern) | P0 | `index.js:507-513` JS can't read cookie |
| 61.4 | Gate Swagger UI behind NODE_ENV !== production | P0 | `index.js:395-397,679` unauthenticated |
| 61.5 | Use crypto.timingSafeEqual for TG webhook secret comparison | P1 | `index.ts:35` uses `!==` |
| 61.6 | Sanitize x-request-id header (format, length, charset) | P1 | `index.js:356` log injection |
| 61.7 | Add rate limiting to /auth/me, /auth/signup/* endpoints | P1 | `index.js:689` exits before rate limit |
| 61.8 | Authenticate /metrics endpoint (or gate behind isProd) | P1 | `index.js:679,755` exposes internals |

### Iter 62 — Business Logic Accuracy (P0, 8 tasks) ★ NEW

> Issues: [#515–#522](https://github.com/lemone112/labpics-dashboard/milestone/52)
> Источник: Business agent critique. Сигналы, метрики, revenue — всё показывает пустые/нулевые данные.
> **Impact:** Без этих исправлений дашборд отображает фейковые данные (0% margin, 0 response time, 0 signals).

| # | Task | Priority | Finding |
|---|------|----------|---------|
| 62.1 | Add Russian keyword patterns to signal detection | P0 | `signals.js:28-72` English-only → 0 signals for RU clients |
| 62.2 | Add Russian keyword patterns to upsell radar | P0 | `upsell.js:16` English-only → 0 upsell signals |
| 62.3 | Compute actual avg_response_minutes (pair messages) | P0 | `intelligence.js:89` hardcoded 0 |
| 62.4 | Feed outbound_messages count into analytics snapshots | P0 | `intelligence.js:89` hardcoded 0 |
| 62.5 | Add client communication gap detection (N days silence) | P0 | No query for `last_message_at < now() - interval` |
| 62.6 | Separate failedJobPressure from client health score | P1 | `intelligence.js:276` technical metric ≠ business health |
| 62.7 | Calibrate upsell thresholds for $5-20K deal range | P1 | `upsell.js:37-58` $50K threshold too high |
| 62.8 | Add project lifecycle phase field (kickoff→completed) | P1 | No phase concept → missed upsell window |

### Iter 63 — DB & Vector Optimization (P0, 8 tasks) ★ NEW

> Issues: [#523–#530](https://github.com/lemone112/labpics-dashboard/milestone/53)
> Источник: DB/RAG agent critique. Vector search делает seq scan, индексы не используются.

| # | Task | Priority | Finding |
|---|------|----------|---------|
| 63.1 | Fix vector search operator: `<->` → `<=>` (cosine distance) | P0 | `embeddings.js:248,254` index mismatch → full seq scan |
| 63.2 | Fix token budget truncation: add budget_exhausted flag | P0 | `openai.js:79-82` infinite retry loop |
| 63.3 | Add expression indexes for COALESCE(updated_at, created_at) | P0 | 4 queries in `event-log.js` can't use indexes |
| 63.4 | Wrap connector-sync success path in withTransaction | P1 | `connector-sync.js:74-170` partial-write risk |
| 63.5 | Rename stale kag_event_log indexes → connector_events | P1 | `0022:15-16` 3 of 5 not renamed |
| 63.6 | Drop redundant IVFFlat index (HNSW is preferred) | P1 | `0002:13-15` unused, slows inserts |
| 63.7 | Add pool saturation warning (queue length monitoring) | P2 | `db.js:8` max:25, no exhaustion alert |
| 63.8 | Move dimension validation before API calls (save tokens) | P2 | `openai.js:96-99` checks after all calls |

### Iter 52 — Critical Data Safety & Auth (P0, 7 tasks)

> Issues: [#406–#415](https://github.com/lemone112/labpics-dashboard/milestone/42)

Исправления с риском потери данных и security-уязвимостями.

| # | Task | Priority |
|---|------|----------|
| 52.1 | Fix: watermark advances despite partial Chatwoot sync | P0 |
| 52.2 | Fix: watermark advances despite partial Linear sync | P0 |
| 52.3 | Fix: watermark advances despite partial Attio sync | P0 |
| 52.4 | Fix: Linear pagination infinite loop (no cursor dedup) | P0 |
| 52.5 | Fix: TG bot draft ownership not verified (privilege escalation) | P0 |
| 52.6 | Fix: TG bot Supabase has no RLS policies | P0 |
| 52.7 | Fix: embedding batch failure rolls back ALL chunks | P0 |

### Iter 53 — Scheduler & Worker Hardening (P0, 12 tasks) ★ EXPANDED by critique

> Issues: [#410–#420](https://github.com/lemone112/labpics-dashboard/milestone/43)

Таймауты, backoff, конкурентность, устойчивость к внешним API.

| # | Task | Priority | Note |
|---|------|----------|------|
| 53.1 | Add per-handler timeout for scheduler jobs (10min) | P0 | |
| 53.2 | Implement exponential backoff for failed jobs | P0 | |
| 53.3 | Parse Retry-After headers, 429-specific backoff | P0 | |
| 53.4 | Fix scheduler job claim: atomic UPDATE...RETURNING (not FOR UPDATE) | P0 | NEW: `scheduler.js:240` locks release immediately |
| 53.5 | Fix processDueOutbounds: add FOR UPDATE SKIP LOCKED | P0 | NEW: `outbox.js:551` double-send possible |
| 53.6 | Fix ensureDefaultScheduledJobs: run once at startup, not every tick | P1 | NEW: `scheduler.js:238` 13*N queries/min |
| 53.7 | Fix circuit breaker half-open: allow single probe only | P1 | NEW: `http.js:48-58` unlimited probes |
| 53.8 | Fix metrics cb.failureCount → cb.failures property name | P1 | NEW: `health.js:77` undefined in Prometheus |
| 53.9 | Add SSE connection limit per project | P1 | NEW: `sse-broadcaster.js` unbounded |
| 53.10 | Make OpenAI embeddings endpoint URL configurable | P1 | |
| 53.11 | Add SSE heartbeat + fix dead connection cleanup | P1 | |
| 53.12 | Improve Redis reconnection strategy (maxRetriesPerRequest:1) | P1 | `redis.js:20` 3 retries = seconds of blocking |

### Iter 54 — Frontend Resilience (P0 ↑, 10 tasks) ★ RAISED from P1

> Issues: [#421–#429](https://github.com/lemone112/labpics-dashboard/milestone/44)
> **RAISED** by critique: CSP unsafe-eval, hooks violation, Promise.all all affect production.

Устойчивость UI к частичным ошибкам, безопасность, производительность.

| # | Task | Priority | Note |
|---|------|----------|------|
| 54.1 | Replace Promise.all with Promise.allSettled (6 pages) | P0 | CRITICAL: single API failure kills page |
| 54.2 | Split use-project-portfolio hook (335 LOC → 3 hooks) | P0 | 6 useEffects, 20 context props |
| 54.3 | Migrate feature pages to React Query (useQuery) | P1 | 7 pages with manual useState/useEffect |
| 54.4 | Add granular error boundaries per section | P1 | 4 pages missing error.jsx |
| 54.5 | Replace inline empty states with EmptyState component | P1 | 14 violations across 6 pages |
| 54.6 | Remove CSP unsafe-eval (use nonce-based CSP) | P0 | NEW: `next.config.mjs:28-29` negates XSS protection |
| 54.7 | Fix useState called conditionally in section-page.jsx | P0 | NEW: line 136, hooks violation |
| 54.8 | Replace local toast state with global useToast() | P1 | NEW: 8 pages duplicate pattern |
| 54.9 | Add dynamic imports for feature pages (code splitting) | P2 | |
| 54.10 | Add chart config prop to finance-section ChartContainers | P1 | NEW: 7 instances without labels |

### Iter 55 — Observability & Audit Trail (✅ DONE, 8 tasks)

> Issues: [#428–#439](https://github.com/lemone112/labpics-dashboard/milestone/45)
> ✅ **Completed:** commit `27200c0`, 306 tests pass, TG bot typecheck clean.

| # | Task | Status |
|---|------|--------|
| 55.1 | Add outbound_messages retention policy (90-day cleanup) | ✅ Done |
| 55.2 | Add audit events for outbox policy enforcement failures | ✅ Done |
| 55.3 | Replace silent catch blocks in TG bot with logging | ✅ Done |
| 55.4 | Log failures in fire-and-forget auth audit events | ✅ Done |
| 55.5 | Fix event-log dedup key collision (SHA-256 + null byte) | ✅ Done |
| 55.6 | Add size cap to in-memory rate limit Maps (50K + eviction) | ✅ Done |
| 55.7 | Implement distributed rate limiting via Redis (INCR+EXPIRE) | ✅ Done |
| 55.8 | Fix connector sync event log failure silently ignored | ✅ Done |

### Iter 56 — Config & Infrastructure Hardening (P2, 6 tasks)

> Issues: [#431–#442](https://github.com/lemone112/labpics-dashboard/milestone/46)

Конфигурируемость, валидация, Docker.

| # | Task | Priority |
|---|------|----------|
| 56.1 | Externalize hardcoded session/scheduler/cascade values | P2 |
| 56.2 | Require explicit PostgreSQL credentials in docker-compose | P2 |
| 56.3 | Add UUID format validation for project_id | P2 |
| 56.4 | Add non-root user to TG bot Dockerfile | P2 |
| 56.5 | Wrap localStorage access in try-catch | P2 |
| 56.6 | Randomize dummy bcrypt hash per server instance | P2 |

---

## Phase 9 — Comprehensive Testing (32 tasks)

> Финальная фаза: валидация всего продукта перед production release.
> Зависит от завершения Phase 1-8 (код должен существовать для тестирования).
> Все итерации Phase 9 можно начинать инкрементально по мере готовности фич.

### Iter 57 — Backend Unit Test Expansion (P0, 8 tasks)

> Issues: [#475–#482](https://github.com/lemone112/labpics-dashboard/milestone/47)

Покрытие всех критических сервисов unit-тестами. Цель: 80% line coverage.

| # | Task | Priority |
|---|------|----------|
| 57.1 | Unit tests: identity-graph.js (similarityScore, Unicode, dedupeKey) | P0 |
| 57.2 | Unit tests: sources.js (resolveProjectSourceBinding, 23505 handling) | P0 |
| 57.3 | Unit tests: connector-state.js (scope protection, mark* functions) | P0 |
| 57.4 | Unit tests: connector-sync.js (full sync flow, error handling) | P0 |
| 57.5 | Unit tests: embeddings.js (batch processing, partial failure) | P1 |
| 57.6 | Unit tests: scheduler.js (cascade triggers, timeout logic) | P1 |
| 57.7 | Unit tests: event-log.js (dedup, sync logic) | P1 |
| 57.8 | Enforce 80% line coverage gate in CI (c8 --check-coverage) | P0 |

### Iter 58 — E2E Test Suite (P0, 8 tasks)

> Issues: [#483–#490](https://github.com/lemone112/labpics-dashboard/milestone/48)

Полный Playwright E2E для всех страниц: desktop + mobile, данные + empty states.

| # | Task | Priority |
|---|------|----------|
| 58.1 | E2E: login flow (valid/invalid, session persistence, logout) | P0 |
| 58.2 | E2E: project creation, selection, scope isolation | P0 |
| 58.3 | E2E: Control Tower — все 6 секций + empty states (wizard) | P0 |
| 58.4 | E2E: Search/LightRAG (query, results, evidence, empty) | P0 |
| 58.5 | E2E: Jobs & Connectors pages (status, errors, retry) | P1 |
| 58.6 | E2E: CRM page (accounts, opportunities kanban) | P1 |
| 58.7 | E2E: Signals, Analytics, Digests, Offers pages | P1 |
| 58.8 | E2E: mobile responsive (375/768/1440, touch targets, charts) | P1 |

### Iter 59 — Integration & Contract Testing (P1, 8 tasks)

> Issues: [#491–#498](https://github.com/lemone112/labpics-dashboard/milestone/49)

Full-stack интеграционные тесты с реальной PostgreSQL + Redis.

| # | Task | Priority |
|---|------|----------|
| 59.1 | Integration: full connector sync cycle (Chatwoot/Linear/Attio → DB) | P0 |
| 59.2 | Integration: Identity Graph end-to-end (generate → review → apply) | P0 |
| 59.3 | Integration: scheduler cascade chain execution | P1 |
| 59.4 | Integration: SSE event delivery (Redis → browser, scoping) | P1 |
| 59.5 | Integration: Auth + RBAC enforcement (Owner vs PM) | P1 |
| 59.6 | API contract tests: all endpoints against Zod schemas | P1 |
| 59.7 | Database migration idempotency test | P2 |
| 59.8 | Integration: reconciliation pipeline with synthetic data | P2 |

### Iter 60 — TG Bot & Performance Testing (P1, 8 tasks)

> Issues: [#499–#506](https://github.com/lemone112/labpics-dashboard/milestone/50)

Тестирование Telegram-бота + нагрузочное + визуальная регрессия.

| # | Task | Priority |
|---|------|----------|
| 60.1 | TG bot: unit tests for intent detection and routing | P0 |
| 60.2 | TG bot: unit tests for draft management and ownership | P0 |
| 60.3 | TG bot: integration test with mock Supabase | P1 |
| 60.4 | API load testing with autocannon (5 key endpoints) | P1 |
| 60.5 | Lighthouse CI gate (>90 performance, >90 a11y) | P1 |
| 60.6 | Database query performance benchmarks (EXPLAIN ANALYZE) | P2 |
| 60.7 | Visual regression baseline for all pages + mobile | P2 |
| 60.8 | TG bot: TypeScript strict mode + Biome lint rules | P2 |

---

## UX/UI Quality Standards (обязательно для Phase 3+)

Все UI-изменения обязаны проходить:

1. **3-second test:** Где я? Что важно? Что делать? — должно быть очевидно
2. **1 primary CTA** per page (не 0, не 2+)
3. **Empty state = wizard** (title + reason + steps + CTA, НИКОГДА bare "Не найдено")
4. **Control Tower structure:** HeroPanel → StatTiles → Primary CTA → TrustBar → Work Surface
5. **Component selection:** Boolean→Switch, Actions→DropdownMenu, Status→StatusChip, Context→Sheet
6. **Charts:** один вопрос на график, ChartNoData с CTA, chart-1..chart-5 палитра
7. **Motion:** anime.js only, `prefers-reduced-motion` respected, max 420ms
8. **npm run lint** passes (design:audit + ui:consistency, 0 violations)
9. **Touch targets ≥ 44px**, WCAG AA contrast
10. **Responsive:** compact (mobile) → standard (desktop) → detailed (full-width)

Полные правила: `web/DESIGN_SYSTEM_2026.md`, `web/QUALITY_GATES_UI.md`, `web/COMPONENT_SELECTION.md`

---

## Backlog (post all phases)

| Область | Элемент |
|---------|---------|
| Integrations | Email connector (Gmail/Outlook), File attachments (S3/R2), Google Calendar, GitHub |
| Finance | Invoicing (Stripe), Budget tracking per project |
| Platform | Client portal (read-only), SaaS multi-tenancy, PDF/XLSX export |
| Platform | BullMQ job queue (if scaling beyond 10 projects) |
| AI | Sentiment analysis, Predictive churn, Cross-sell/upsell engine |

---

## Changelog

- **v6** (2026-02-20): **Monorepo restructure iteration** — added Iter 64 (14 tasks) for full `apps/` layout
  migration + documentation cleanup. Placed in Phase 7 (Quality & Tech Debt) with P1 priority.
  Target: ideal `apps/api/`, `apps/web/`, `apps/telegram-bot/` structure with domain-grouped services,
  `packages/shared-types/`, and categorized `docs/` subfolders. 276 total issues across 33 iterations.
- **v5** (2026-02-20): **6-agent parallel critique** — 86 verified findings across Security, Backend,
  DB/RAG, Business, Frontend, QA agents. Added Phase 0 with 3 new iterations (Iter 61-63, 24 tasks).
  Expanded Iter 53 (+4 tasks), Iter 54 (+2 tasks, raised P1→P0). Reprioritized: LightRAG CRITICAL→P1,
  Reporting P1→P0, TG Bot P0→P2, Page Redesign P0→P1, Charts P0→P1, Analytics P2→P1.
  Marked Iter 55 ✅ DONE. 262 total issues across 32 iterations in 10 phases.
  Full findings: `docs/critique-findings-2026-02-20.md`.
- **v4** (2026-02-20): Comprehensive testing — added Phase 9 (Iter 57–60) with 32 testing tasks.
  228 total issues across 29 iterations in 9 phases. Coverage: backend unit tests (identity-graph,
  connectors, scheduler, embeddings), full E2E suite (all pages + mobile), integration tests
  (sync cycle, RBAC, cascade, API contracts), TG bot tests, load testing, Lighthouse CI, visual regression.
  Coverage gate: 80% line coverage enforced in CI.
- **v3** (2026-02-20): Code audit — added Phase 8 (Iter 52–56) with 37 audit findings.
  196 total issues across 25 iterations in 8 phases. Critical: watermark data loss, TG bot auth,
  scheduler timeouts, frontend resilience, observability gaps.
- **v2** (2026-02-20): Unified master plan — integrated all 159 open issues from Iter 11–51
  into 7 execution phases. Added dedicated chart iteration (Iter 20.5) with deep visualization work.
  Added UX/UI quality standards section. Architecture diagrams updated (Composio + LightRAG MCP + Whisper).
- **v1** (2026-02-20): Initial Wave 3 plan (57 tasks, Iter 44–51 only).
