# Wave 6 — Advanced Analytics & Visualization (Iter 36–43)

> Status: **Planning**
> Depends on: Wave 5 partially (Iter 31 minimum for health data)
> Target: Transform dashboard into multi-scope analytics platform with advanced visualizations
>
> Research: [Charts Analysis](./research/advanced-charts-analysis.md),
> [Dashboard Scopes](./research/scoped-dashboard-tabs.md),
> [DB Storage](./research/db-storage-optimization.md),
> [BigQuery & Integrations](./research/bigquery-and-integrations.md)

---

## Architecture

```
Iter 36 (DB Foundation) ── enables all analytics ──────────────────────┐
    │                                                                   │
    ├── Iter 37 (Chart Infra) ── libraries + components ───────────────│
    │       │                                                           │
    │       ├── Iter 38 (Funnel) ── uses Recharts FunnelChart ─────────│
    │       │                                                           │
    │       ├── Iter 39 (Graph) ── uses Sigma.js + React Flow ─────────│
    │       │                                                           │
    │       └── Iter 40 (Viz) ── 26 charts using all libraries ────────│
    │               │                                                   │
    │               └── Iter 41 (Scoped Tabs) ── organizes ALL charts ─┘
    │
    ├── Iter 42 (DB Optimization) ── parallel, independent
    │
    └── Iter 43 (Integrations) ── parallel, feeds data to charts
```

**Critical path:** 36 → 37 → 38/39/40 (parallel) → 41
**Parallel:** 42 (independent), 43 (feeds data)

---

## Key Decisions

| Decision | Choice | Rejected | Why |
|----------|--------|----------|-----|
| Primary chart library | **Recharts** (keep) | D3.js, ECharts, Nivo | Already installed, React 19 compatible, native funnel |
| Node diagrams | **React Flow** @xyflow/react | D3-force manual | React 19 + Tailwind 4, shadcn-based, best maintenance |
| Network graphs | **Sigma.js** + graphology | Cytoscape.js | Better React integration, WebGL, ForceAtlas2 |
| Obsidian graph | **Ego-graph** (2-hop) | Full global graph | Research: global graph = "cool but useless" |
| Project deps | **Gantt + arrows** | React Flow nodes | Industry standard (Linear, Asana, Monday.com) |
| Dashboard scopes | **6 fixed tabs** | User-created dashboards | Miller's Law, HubSpot pattern, strong defaults |
| BigQuery | **NO** | — | 1-5 GB data, PostgreSQL sufficient, DuckDB if needed |
| Top integration | **Toggl** (time tracking) | — | Blocks P&L, utilization, scope creep detection |

---

## Summary

| Iter | Name | Tasks | Milestone | Effort |
|------|------|-------|-----------|--------|
| **36** | Database Analytics Foundation | 6 | [26](https://github.com/lemone112/labpics-dashboard/milestone/26) | M |
| **37** | Chart Infrastructure & Foundations | 5 | [27](https://github.com/lemone112/labpics-dashboard/milestone/27) | M |
| **38** | Full Lifecycle Funnel | 6 | [28](https://github.com/lemone112/labpics-dashboard/milestone/28) | XL |
| **39** | Entity Graph & Network Viz | 4 | [29](https://github.com/lemone112/labpics-dashboard/milestone/29) | L |
| **40** | Advanced Business Visualizations | 5 | [30](https://github.com/lemone112/labpics-dashboard/milestone/30) | XL |
| **41** | Scoped Dashboard Tabs | 8 | [32](https://github.com/lemone112/labpics-dashboard/milestone/32) | XL |
| **42** | DB Storage Optimization | 4 | [31](https://github.com/lemone112/labpics-dashboard/milestone/31) | L |
| **43** | Strategic Integrations | 5 | [33](https://github.com/lemone112/labpics-dashboard/milestone/33) | XL |
| | **Total** | **43** | | |

---

## Iter 36 — Database Analytics Foundation

| # | Issue | Title | Priority |
|---|-------|-------|----------|
| 36.1 | [#287](https://github.com/lemone112/labpics-dashboard/issues/287) | Contracts & Contract Line Items tables | critical |
| 36.2 | [#288](https://github.com/lemone112/labpics-dashboard/issues/288) | Lifecycle stage + lost deal tracking | critical |
| 36.3 | [#289](https://github.com/lemone112/labpics-dashboard/issues/289) | Stage velocity matview + analytics indexes | high |
| 36.4 | [#290](https://github.com/lemone112/labpics-dashboard/issues/290) | Product offerings + campaign attribution | high |
| 36.5 | [#291](https://github.com/lemone112/labpics-dashboard/issues/291) | Health score components time-series | high |
| 36.6 | [#292](https://github.com/lemone112/labpics-dashboard/issues/292) | Customer feedback table (NPS/CSAT/CES) | medium |

## Iter 37 — Chart Infrastructure & Foundations

| # | Issue | Title | Priority |
|---|-------|-------|----------|
| 37.1 | [#298](https://github.com/lemone112/labpics-dashboard/issues/298) | Install & configure React Flow | high |
| 37.2 | [#300](https://github.com/lemone112/labpics-dashboard/issues/300) | Install & configure Sigma.js + graphology | high |
| 37.3 | [#302](https://github.com/lemone112/labpics-dashboard/issues/302) | Chart dimension system + responsive wrappers | high |
| 37.4 | [#304](https://github.com/lemone112/labpics-dashboard/issues/304) | Recharts FunnelChart + SankeyChart wrappers | high |
| 37.5 | [#306](https://github.com/lemone112/labpics-dashboard/issues/306) | Unified chart theme + dark mode + anime.js | medium |

## Iter 38 — Full Lifecycle Funnel

| # | Issue | Title | Priority |
|---|-------|-------|----------|
| 38.1 | [#299](https://github.com/lemone112/labpics-dashboard/issues/299) | Backend funnel aggregation API | critical |
| 38.2 | [#301](https://github.com/lemone112/labpics-dashboard/issues/301) | 3-zone horizontal segmented bar | critical |
| 38.3 | [#303](https://github.com/lemone112/labpics-dashboard/issues/303) | Sales zone drill-down | high |
| 38.4 | [#305](https://github.com/lemone112/labpics-dashboard/issues/305) | Delivery zone drill-down | high |
| 38.5 | [#307](https://github.com/lemone112/labpics-dashboard/issues/307) | Sankey flow analysis | high |
| 38.6 | [#308](https://github.com/lemone112/labpics-dashboard/issues/308) | Cohort & segment comparison | medium |

## Iter 39 — Entity Graph & Network Visualization

| # | Issue | Title | Priority |
|---|-------|-------|----------|
| 39.1 | [#309](https://github.com/lemone112/labpics-dashboard/issues/309) | Ego-graph API endpoint | high |
| 39.2 | [#310](https://github.com/lemone112/labpics-dashboard/issues/310) | Sigma.js entity graph explorer | high |
| 39.3 | [#311](https://github.com/lemone112/labpics-dashboard/issues/311) | React Flow stakeholder map | high |
| 39.4 | [#312](https://github.com/lemone112/labpics-dashboard/issues/312) | React Flow playbook builder | medium |

## Iter 40 — Advanced Business Visualizations

| # | Issue | Title | Priority |
|---|-------|-------|----------|
| 40.1 | [#313](https://github.com/lemone112/labpics-dashboard/issues/313) | Revenue & Pipeline (7 charts) | high |
| 40.2 | [#314](https://github.com/lemone112/labpics-dashboard/issues/314) | Delivery & Operations (6 charts) | high |
| 40.3 | [#315](https://github.com/lemone112/labpics-dashboard/issues/315) | Communications & Engagement (5 charts) | medium |
| 40.4 | [#316](https://github.com/lemone112/labpics-dashboard/issues/316) | Health & Risk Intelligence (5 charts) | high |
| 40.5 | [#317](https://github.com/lemone112/labpics-dashboard/issues/317) | Cross-domain correlations (3 charts) | medium |

## Iter 41 — Scoped Dashboard Tabs

| # | Issue | Title | Priority |
|---|-------|-------|----------|
| 41.1 | [#318](https://github.com/lemone112/labpics-dashboard/issues/318) | Tab infrastructure + routing + filters | critical |
| 41.2 | [#320](https://github.com/lemone112/labpics-dashboard/issues/320) | Overview scope | critical |
| 41.3 | [#321](https://github.com/lemone112/labpics-dashboard/issues/321) | Sales scope | high |
| 41.4 | [#323](https://github.com/lemone112/labpics-dashboard/issues/323) | Projects scope | high |
| 41.5 | [#325](https://github.com/lemone112/labpics-dashboard/issues/325) | Finance scope | high |
| 41.6 | [#326](https://github.com/lemone112/labpics-dashboard/issues/326) | Team scope | high |
| 41.7 | [#328](https://github.com/lemone112/labpics-dashboard/issues/328) | Clients scope | high |
| 41.8 | [#331](https://github.com/lemone112/labpics-dashboard/issues/331) | Backend aggregation (all 6 scopes) | critical |

## Iter 42 — DB Storage Optimization

| # | Issue | Title | Priority |
|---|-------|-------|----------|
| 42.1 | [#319](https://github.com/lemone112/labpics-dashboard/issues/319) | Embedding dim reduction 1536→512 + drop IVFFlat | critical |
| 42.2 | [#322](https://github.com/lemone112/labpics-dashboard/issues/322) | Retention policies for append-only tables | high |
| 42.3 | [#324](https://github.com/lemone112/labpics-dashboard/issues/324) | JSONB stripping + LZ4 compression | high |
| 42.4 | [#327](https://github.com/lemone112/labpics-dashboard/issues/327) | Archive pipeline (export + rehydration) | high |

## Iter 43 — Strategic Integrations

| # | Issue | Title | Priority |
|---|-------|-------|----------|
| 43.1 | [#329](https://github.com/lemone112/labpics-dashboard/issues/329) | Time Tracking (Toggl/Clockify) | critical |
| 43.2 | [#330](https://github.com/lemone112/labpics-dashboard/issues/330) | Stripe (billing & payments) | critical |
| 43.3 | [#332](https://github.com/lemone112/labpics-dashboard/issues/332) | Telegram Bot notifications | high |
| 43.4 | [#333](https://github.com/lemone112/labpics-dashboard/issues/333) | Google Calendar | medium |
| 43.5 | [#334](https://github.com/lemone112/labpics-dashboard/issues/334) | GitHub (development metrics) | medium |

---

## Chart Library Stack

```
Recharts 3.7.0 (existing)     ~70 KB gzip   Standard charts + funnel
+ @xyflow/react 12.x (new)    ~50 KB gzip   Node diagrams, stakeholder maps
+ @react-sigma/core (new)     ~60 KB gzip   Network graphs, entity explorer
= Total additional: ~110 KB gzip
```

## 6 Dashboard Scopes

| Scope | Persona | View Modes | Charts | KPIs |
|-------|---------|-----------|--------|------|
| **Overview** | CEO/Owner | Dashboard, Feed | 4 | 6 |
| **Sales** | Sales Manager | Dashboard, Board, List, Funnel | 6 | 6 |
| **Projects** | PM/Delivery | Dashboard, Board, List, Timeline | 6 | 6 |
| **Finance** | CFO/Owner | Dashboard, Table | 6 | 6 |
| **Team** | Ops/HR | Dashboard, Schedule, List | 5 | 6 |
| **Clients** | Account Mgr | Dashboard, Board, List, Graph | 6 | 6 |

## Storage Optimization Impact

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Embedding dims | 1536 | 512 | -67% |
| Vector storage/chunk | ~17 KB | ~3.5 KB | -80% |
| DB size (2 years) | ~5.6 GB | ~1.4 GB | -75% |
| DB size (5 years) | ~14 GB | ~3.5 GB | -75% |
