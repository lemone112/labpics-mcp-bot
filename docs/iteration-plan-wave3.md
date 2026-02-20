# Unified Iteration Plan — All Open Work (196 issues)

> Обновлено: 2026-02-20
> Source of truth: [GitHub Milestones](https://github.com/lemone112/labpics-dashboard/milestones)
>
> **Контекст:** Design studio lab.pics, 2–5 PM + Owner, 5–10 активных проектов,
> $5–20K avg, 1–3 месяца, стартапы/IT. Deploy: VPS + Docker Compose.
>
> **Источники:** 5 research reports (infra audit Feb 2026) + 6-round Q&A session.
> Closed Iter 27–43 — superseded (roadmap placeholders).

---

## Execution Phases

```
Phase 1 — Foundation ★ (unblocks everything)
  Iter 11  LightRAG Integration ──────── 10 tasks  CRITICAL
  Iter 44  Scheduler & Connectors ─────── 7 tasks  P0

Phase 2 — Core Business Features
  Iter 49  Multi-User & Access Control ── 8 tasks  P0
  Iter 45  Search UX & Intelligence ───── 8 tasks  P0
  Iter 20  UX Logic & IA ────────────── 11 tasks  P0

Phase 3 — UX/UI Deep Work ★★ (пристальное внимание)
  Iter 21    Page-Level Redesign ──────── 12 tasks  P0
  Iter 20.5  Charts & Visualization ──── 12 tasks  P0  ← deep chart work
  Iter 23    Accessibility & Polish ──── 10 tasks  P1

Phase 4 — Platform & Monitoring
  Iter 46  System Monitoring UI ────────── 7 tasks  P1
  Iter 47  Infrastructure Hardening ────── 6 tasks  P1
  Iter 48  Automated Reporting ────────── 6 tasks  P1

Phase 5 — Telegram Bot
  Iter 50  Telegram Bot MVP ───────────── 8 tasks  P0
  Iter 51  Telegram Bot Advanced ──────── 7 tasks  P1

Phase 6 — Mobile & Responsive
  Iter 22  Mobile & Responsive ─────────── 8 tasks  P1

Phase 7 — Quality & Tech Debt
  Iter 16  QA & Release Readiness ──────── 3 tasks  HIGH
  Iter 24  Design Validation & QA ──────── 9 tasks  P1
  Iter 17  Analytics Instrumentation ───── 8 tasks  P2
  Iter 25  Performance & Caching ────────── 9 tasks  P2
  Iter 26  API Architecture & DX ────────── 8 tasks  P2
  Iter 15  TypeScript Migration ──────────── 2 tasks  P2

Phase 8 — Code Audit Fixes ★ (2026-02-20 audit)
  Iter 52  Critical Data Safety & Auth ──── 7 tasks  P0  ← watermark, TG bot auth
  Iter 53  Scheduler & Worker Hardening ── 8 tasks  P0  ← timeouts, backoff, 429
  Iter 54  Frontend Resilience ──────────── 8 tasks  P1  ← Promise.allSettled, hooks
  Iter 55  Observability & Audit Trail ──── 8 tasks  P1  ← logging, retention, rate limit
  Iter 56  Config & Infra Hardening ─────── 6 tasks  P2  ← env vars, Docker, validation
```

**Total: 196 issues across 25 iterations in 8 phases.**

---

## Dependency Graph

```
Phase 1:
  Iter 11 (LightRAG) ─────────────────────────────────────┐
  Iter 44 (Scheduler) ──┐                                  │
                        │                                  │
Phase 2:                ▼                                  │
  Iter 49 (Multi-user) ←┘                                  │
  Iter 45 (Search UX)                                      │
  Iter 20 (UX Logic) ───────────┐                          │
                                │                          │
Phase 3:                        ▼                          │
  Iter 21 (Page Redesign) ← requires 20                    │
  Iter 20.5 (Charts) ← requires 20                        │
  Iter 23 (A11y/Polish) ← requires 21                     │
                                                           │
Phase 4:                                                   │
  Iter 46 (Monitoring) ← enhanced by 44                    │
  Iter 47 (Infrastructure)                                 │
  Iter 48 (Reporting) ← requires 44, 46                   │
                                                           │
Phase 5:                                                   ▼
  Iter 50 (TG Bot MVP) ← requires Iter 11 (LightRAG) ────┘
  Iter 51 (TG Bot Advanced) ← requires 50

Phase 6: Iter 22 (Mobile) ← requires 21
Phase 7: Iter 16, 24, 17, 25, 26, 15 — parallel, independent
Phase 8: Iter 52-56 — independent, can start immediately (audit fixes)
  Iter 52 (Data Safety) — no dependencies, P0
  Iter 53 (Scheduler) — no dependencies, P0
  Iter 54 (Frontend) — no dependencies, P1
  Iter 55 (Observability) — no dependencies, P1
  Iter 56 (Config) — no dependencies, P2
```

---

## Phase 1 — Foundation (17 tasks)

### Iter 11 — HKUDS LightRAG Integration (CRITICAL, 10 tasks)

> Issues: [#46–#55](https://github.com/lemone112/labpics-dashboard/milestone/1)

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

## Phase 8 — Code Audit Fixes (37 tasks)

> Источник: полный code audit 2026-02-20 (backend, frontend, integrations, TG bot).
> Все итерации Phase 8 **не имеют зависимостей** — можно начинать параллельно с Phase 1-7.

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

### Iter 53 — Scheduler & Worker Hardening (P0, 8 tasks)

> Issues: [#410–#420](https://github.com/lemone112/labpics-dashboard/milestone/43)

Таймауты, backoff, устойчивость к внешним API.

| # | Task | Priority |
|---|------|----------|
| 53.1 | Add per-handler timeout for scheduler jobs (10min) | P0 |
| 53.2 | Implement exponential backoff for failed jobs | P0 |
| 53.3 | Parse Retry-After headers, 429-specific backoff | P0 |
| 53.4 | Make OpenAI embeddings endpoint URL configurable | P1 |
| 53.5 | Add OpenAI embeddings cost tracking | P1 |
| 53.6 | Enforce token budget for evidence building | P1 |
| 53.7 | Add SSE heartbeat + fix dead connection cleanup | P1 |
| 53.8 | Improve Redis reconnection strategy | P1 |

### Iter 54 — Frontend Resilience (P1, 8 tasks)

> Issues: [#421–#429](https://github.com/lemone112/labpics-dashboard/milestone/44)

Устойчивость UI к частичным ошибкам, производительность.

| # | Task | Priority |
|---|------|----------|
| 54.1 | Replace Promise.all with Promise.allSettled (6 pages) | P1 |
| 54.2 | Split use-project-portfolio hook (335 LOC → 3 hooks) | P1 |
| 54.3 | Migrate feature pages to React Query (useQuery) | P1 |
| 54.4 | Add granular error boundaries per section | P1 |
| 54.5 | Replace inline empty states with EmptyState component | P1 |
| 54.6 | Add dynamic imports for feature pages (code splitting) | P2 |
| 54.7 | Add virtualization for project list in sidebar | P2 |
| 54.8 | Persist sidebar collapse state across navigations | P2 |

### Iter 55 — Observability & Audit Trail (P1, 8 tasks)

> Issues: [#428–#439](https://github.com/lemone112/labpics-dashboard/milestone/45)

Логирование, retention, rate limiting.

| # | Task | Priority |
|---|------|----------|
| 55.1 | Add outbound_messages retention policy (90-day cleanup) | P1 |
| 55.2 | Add audit events for outbox policy enforcement failures | P1 |
| 55.3 | Replace silent catch blocks in TG bot with logging | P1 |
| 55.4 | Log failures in fire-and-forget auth audit events | P1 |
| 55.5 | Fix event-log dedup key collision on same timestamps | P1 |
| 55.6 | Add size cap to in-memory rate limit Maps | P1 |
| 55.7 | Implement distributed rate limiting via Redis | P1 |
| 55.8 | Fix connector sync event log failure silently ignored | P1 |

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

- **v3** (2026-02-20): Code audit — added Phase 8 (Iter 52–56) with 37 audit findings.
  196 total issues across 25 iterations in 8 phases. Critical: watermark data loss, TG bot auth,
  scheduler timeouts, frontend resilience, observability gaps.
- **v2** (2026-02-20): Unified master plan — integrated all 159 open issues from Iter 11–51
  into 7 execution phases. Added dedicated chart iteration (Iter 20.5) with deep visualization work.
  Added UX/UI quality standards section. Architecture diagrams updated (Composio + LightRAG MCP + Whisper).
- **v1** (2026-02-20): Initial Wave 3 plan (57 tasks, Iter 44–51 only).
