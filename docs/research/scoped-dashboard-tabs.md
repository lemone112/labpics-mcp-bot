# Scoped Dashboard Tabs — Design & Architecture

> Date: 2026-02-19
> Status: Research complete, awaiting design review
> Based on: Attio, HubSpot, Salesforce, Linear, Monday.com, Productive.io analysis

---

## Concept

Горизонтальная tab-bar в верхней части dashboard area. Каждый tab = scope
(контекст метрик). Внутри каждого scope — segmented controls для переключения
между view modes (chart / list / board / timeline).

**UX референс:** HubSpot Sales Workspace (tabs) + Linear (segmented controls) +
Productive.io (module-based dashboard widgets).

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Overview]  [Sales]  [Projects]  [Finance]  [Team]  [Clients]        │
├─────────────────────────────────────────────────────────────────────────┤
│  Period: [30d ▾]  Client: [All ▾]  Team: [All ▾]     📊 | 📋 | 📌   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│   │ KPI Card │  │ KPI Card │  │ KPI Card │  │ KPI Card │             │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘             │
│                                                                         │
│   ┌─────────────────────────────┐  ┌─────────────────────┐           │
│   │                             │  │                     │           │
│   │        Chart (h-lg)         │  │     Chart (h-lg)    │           │
│   │                             │  │                     │           │
│   └─────────────────────────────┘  └─────────────────────┘           │
│                                                                         │
│   ┌───────────────────────────────────────────────────────┐           │
│   │                  Chart (h-xl)                          │           │
│   │                                                       │           │
│   └───────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Why 6 Scopes

Miller's Law: 7±2 items in working memory. 5-7 tabs optimal. 6 scopes:

| # | Scope | Persona | Key Question |
|---|-------|---------|-------------|
| 1 | **Overview** | CEO / Owner | "Как дела в целом?" |
| 2 | **Sales** | Sales Manager | "Сколько в pipeline и что закрывается?" |
| 3 | **Projects** | Project Manager | "Где горит и что задерживается?" |
| 4 | **Finance** | CFO / Owner | "Сколько зарабатываем и тратим?" |
| 5 | **Team** | Operations / HR | "Кто перегружен, кто свободен?" |
| 6 | **Clients** | Account Manager | "Кто доволен, кто уходит?" |

---

## Scope 1: Overview

**Persona:** CEO, Owner
**Вопрос:** "Как идёт бизнес прямо сейчас?"
**Философия:** One-screen health check. Никаких drill-down — только KPI + sparklines.

### View Modes

| Mode | Icon | Description |
|------|------|-------------|
| **Dashboard** (default) | 📊 | KPI cards + charts |
| **Feed** | 📋 | Chronological activity feed (signals, alerts, events) |

### KPI Cards (top row, 4-6 cards)

| KPI | Source | Sparkline |
|-----|--------|-----------|
| MRR / ARR | `contracts.mrr` | 12-month trend |
| Active Projects | `linear_projects_raw` WHERE active | 4-week trend |
| Team Utilization | Toggl (future) / Linear hours | 4-week trend |
| Pipeline (weighted) | `crm_opportunities` × probability | 4-week trend |
| Client Health (avg) | `health_scores` avg | 4-week trend |
| Open Risks | `risk_radar_items` WHERE status=open | 4-week trend |

### Charts

| Chart | Type | Size | Data Source |
|-------|------|------|------------|
| Revenue actual vs target | Line + target line | h-md | `analytics_revenue_snapshots` |
| Project status breakdown | Horizontal stacked bar | h-md | `linear_issues_raw` grouped |
| Health score distribution | Histogram (green/yellow/red zones) | h-md | `health_scores.score` |
| Activity timeline (last 7d) | Mini timeline | h-sm | `connector_events` |

---

## Scope 2: Sales

**Persona:** Sales Manager, Business Development
**Вопрос:** "Что в pipeline, что закрывается, где застряло?"
**Философия:** Funnel + velocity + win rate. Action-oriented.

### View Modes

| Mode | Icon | Description |
|------|------|-------------|
| **Dashboard** (default) | 📊 | Sales-specific charts |
| **Board** | 📌 | Kanban by deal stage (drag to advance) |
| **List** | 📋 | Table of all deals, sortable |
| **Funnel** | 🔽 | Lifecycle funnel (Iter 38) |

### KPI Cards

| KPI | Source |
|-----|--------|
| Pipeline Total (weighted) | `SUM(amount_estimate * probability)` |
| Deals Won (this month) | `crm_opportunity_stage_events` → won |
| Win Rate (rolling 90d) | Won / (Won + Lost) |
| Avg Deal Size | `AVG(amount_estimate)` WHERE won |
| Avg Sales Cycle (days) | `mv_opportunity_stage_durations` |
| New Leads (this month) | `crm_accounts` created this month |

### Charts

| Chart | Type | Size | Segmented Control |
|-------|------|------|-------------------|
| Pipeline by stage | Horizontal bar + conversion % | h-lg | `[Amount \| Count]` |
| Win rate trend | Line chart | h-md | `[Monthly \| Quarterly]` |
| Sales cycle by stage | Stacked horizontal bar | h-lg | `[Avg \| Median \| P90]` |
| Deal size distribution | Histogram | h-md | — |
| Revenue forecast vs actual | Dual line | h-md | `[30d \| 90d \| 1y]` |
| Top deals | Table widget | h-md | `[Open \| Won \| Lost]` |

---

## Scope 3: Projects

**Persona:** Project Manager, Delivery Lead
**Вопрос:** "Где горит, что задерживается, какой прогресс?"
**Философия:** Operational control. Status-at-a-glance.

### View Modes

| Mode | Icon | Description |
|------|------|-------------|
| **Dashboard** (default) | 📊 | Delivery charts |
| **Board** | 📌 | Kanban by project status |
| **List** | 📋 | Project table with inline indicators |
| **Timeline** | 📅 | Gantt-style with dependency arrows |

### KPI Cards

| KPI | Source |
|-----|--------|
| Active Projects | `linear_projects_raw` WHERE active |
| On-Time Rate (%) | Delivered on/before due date |
| Overdue Tasks | `linear_issues_raw` WHERE due < now() AND !completed |
| Avg Lead Time (days) | `completed_at - created_at` |
| Sprint Velocity (this cycle) | Issues completed in current cycle |
| Blocked Tasks | `linear_issues_raw` WHERE blocked |

### Charts

| Chart | Type | Size | Segmented Control |
|-------|------|------|-------------------|
| Project status distribution | Stacked horizontal bar | h-lg | `[By Status \| By Client \| By Team]` |
| Sprint burndown | Area chart (descending) | h-lg | `[Current \| Previous \| Compare]` |
| Overdue trend | Area chart (red shading) | h-md | `[7d \| 30d \| 90d]` |
| Priority distribution | Stacked bar by project | h-md | — |
| Lead time distribution | Histogram + p50/p90 | h-md | `[All \| By Priority]` |
| Blockers impact | Horizontal bar (sorted) | h-md | — |

---

## Scope 4: Finance

**Persona:** CFO, Owner, Finance Manager
**Вопрос:** "Сколько зарабатываем, какая маржа, где расходы?"
**Философия:** P&L clarity. Revenue vs cost vs margin per dimension.

### View Modes

| Mode | Icon | Description |
|------|------|-------------|
| **Dashboard** (default) | 📊 | Financial charts |
| **Table** | 📋 | Detailed P&L table (expandable rows) |

### KPI Cards

| KPI | Source |
|-----|--------|
| Revenue (MTD) | `analytics_revenue_snapshots` |
| Gross Margin (%) | (Revenue - Cost) / Revenue |
| ARR | `contracts.arr` SUM |
| Outstanding Invoices | Stripe (future) |
| Avg Billable Rate | Revenue / Billable Hours |
| Discount Given (MTD) | `offers.discount_pct` avg |

### Charts

| Chart | Type | Size | Segmented Control |
|-------|------|------|-------------------|
| Revenue / Cost / Margin (monthly) | Grouped bar + margin line | h-lg | `[Monthly \| Quarterly \| YTD]` |
| Profit margin by client | Horizontal bar (sorted) | h-lg | `[By Client \| By Service \| By Project]` |
| Billable vs non-billable hours | Stacked bar | h-md | `[By Person \| By Team \| Trend]` |
| Revenue forecast vs actual | Dual line + variance shading | h-md | — |
| Discount utilization | Bar chart | h-md | `[By Client \| By Period]` |
| ARR trend | Area chart | h-md | — |

---

## Scope 5: Team

**Persona:** Operations Manager, HR, Team Lead
**Вопрос:** "Кто перегружен, кто свободен, хватает ли ресурсов?"
**Философия:** Capacity planning. Balance and sustainability.

### View Modes

| Mode | Icon | Description |
|------|------|-------------|
| **Dashboard** (default) | 📊 | Utilization charts |
| **Schedule** | 📅 | Resource calendar (person × week) |
| **List** | 📋 | Team members table with utilization columns |

### KPI Cards

| KPI | Source |
|-----|--------|
| Team Utilization (avg) | Billable / Available hours |
| Overloaded (>90%) | Count of team members |
| Underloaded (<50%) | Count of team members |
| Open Positions | Manual / HR data |
| Avg Billable Hours/Week | Toggl (future) |
| Capacity Next 4 Weeks | Available - Allocated |

### Charts

| Chart | Type | Size | Segmented Control |
|-------|------|------|-------------------|
| Utilization by person | Horizontal bar + target zone (75-85%) | h-xl | `[Current \| 4-week avg \| Trend]` |
| Capacity vs demand (next 4 weeks) | Stacked area | h-lg | `[By Team \| By Skill \| Total]` |
| Billable hours trend (team) | Line chart | h-md | `[Weekly \| Monthly]` |
| Workload heatmap | Heatmap (person × week) | h-lg | — |
| Time allocation by category | Donut | h-md | `[This Week \| This Month]` |

---

## Scope 6: Clients

**Persona:** Account Manager, Customer Success
**Вопрос:** "Кто доволен, кто рискует уйти, где возможности?"
**Философия:** Relationship health. Proactive retention.

### View Modes

| Mode | Icon | Description |
|------|------|-------------|
| **Dashboard** (default) | 📊 | Client health charts |
| **Board** | 📌 | Kanban by lifecycle stage |
| **List** | 📋 | Client table with health indicators |
| **Graph** | 🔗 | Entity relationship graph (Sigma.js) |

### KPI Cards

| KPI | Source |
|-----|--------|
| Active Clients | `crm_accounts` WHERE lifecycle_stage = active |
| Avg Health Score | `health_scores` avg |
| At-Risk Clients | Health score < 60 |
| NPS Score | `customer_feedback` WHERE type = nps |
| Retention Rate (rolling 12m) | Renewed / (Renewed + Churned) |
| Expansion Revenue (MTD) | `upsell_opportunities` closed |

### Charts

| Chart | Type | Size | Segmented Control |
|-------|------|------|-------------------|
| Health score distribution | Histogram + quartile markers | h-lg | `[All \| By Tier \| By Lifecycle]` |
| Health trend per client | Sparkline grid (mini lines) | h-xl | `[Worst First \| Best First \| Alphabetical]` |
| Lifecycle stage distribution | Horizontal bar | h-md | — |
| Client revenue concentration | Treemap | h-lg | `[By Revenue \| By Hours \| By Health]` |
| Risk radar | Scatter (severity × probability) | h-lg | — |
| NPS trend | Line with promoter/detractor bands | h-md | `[Monthly \| Quarterly]` |

---

## Segmented Controls — Design Principles

### Where They Live

```
┌─ Tab Bar ────────────────────────────────────────────────────────────┐
│  [Overview]  [Sales]  [Projects]  [Finance]  [Team]  [Clients]      │
├─ Toolbar ────────────────────────────────────────────────────────────┤
│  [Period ▾]  [Client ▾]  [Team ▾]          [📊 Dashboard | 📋 List] │
├─ Chart Card ─────────────────────────────────────────────────────────┤
│  Revenue by Period                          [Monthly | Quarterly]    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                     Chart Area                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 3 Levels of Controls

| Level | Location | What it switches | Persistence |
|-------|----------|-----------------|-------------|
| **L1: Scope tabs** | Top bar | Entire metric context | URL path segment |
| **L2: View mode** | Toolbar right | Layout (charts / list / board / timeline) | localStorage per scope |
| **L3: Chart variant** | ChartCard header right | Data dimension within one chart | localStorage per chart |

### Implementation Rules

1. **Scope tabs** — радиусные tabs (shadcn Tabs) с count badges (active items)
2. **View mode** — compact icon button group (ToggleGroup), 2-4 options max
3. **Chart variant** — small segmented control (inline ToggleGroup), 2-3 options max
4. **All controls** save state to localStorage, restore on return
5. **URL reflects scope:** `/dashboard/sales`, `/dashboard/projects`, etc.
6. **Shared filters** (period, client, team) apply across all charts in scope
7. **Mobile:** view mode collapses into dropdown, chart variants stack below chart

---

## Data Architecture

### Shared Filters (applies to all charts in scope)

| Filter | Type | Options |
|--------|------|---------|
| Period | Select | 7d, 30d, 90d, 1y, Custom |
| Client | Multi-select | All clients from `crm_accounts` |
| Team | Multi-select | All teams (future: from RBAC Iter 27) |
| Project | Multi-select | All projects |

### API Pattern

```
GET /v1/dashboard/:scope
  ?period=30d
  &client_ids=uuid1,uuid2
  &team_ids=uuid1

Response: {
  kpis: { mrr: 50000, active_projects: 12, ... },
  charts: {
    revenue_trend: { ... },
    pipeline_stages: { ... }
  }
}
```

Single endpoint per scope, pre-aggregated on backend. Charts share the same query
context — no N+1 requests.

---

## Comparison with Competitors

| Feature | Attio | HubSpot | Our Approach |
|---------|-------|---------|--------------|
| Scope mechanism | User-created dashboards | Sidebar categories + workspace tabs | **Fixed 6 tabs** (best of both) |
| View switching | Named-view dropdown | Tab bar in workspace | **Segmented control** (3 levels) |
| Chart customization | Data-first builder | Widget library | **Pre-built + configurable** |
| Filters | Per-view filters | Global + per-chart | **Shared filters** per scope |
| Mobile | Full responsive | App-based | **Responsive + view mode collapse** |

**Our advantage:** Fixed tabs reduce cognitive load vs Attio's "build your own dashboard".
Segmented controls reduce clicks vs HubSpot's deep navigation. Pre-built charts with
configurable variants = fast time-to-insight.

---

## Implementation Plan

| Phase | Scope | Issues | Effort |
|-------|-------|--------|--------|
| 1 | Tab infrastructure + routing + shared filters | 2 issues | M (3-5d) |
| 2 | Overview scope (KPI cards + 4 charts) | 1 issue | M (3-5d) |
| 3 | Sales scope (KPI + 6 charts + board/list views) | 1 issue | L (5-8d) |
| 4 | Projects scope (KPI + 6 charts + board/timeline views) | 1 issue | L (5-8d) |
| 5 | Finance scope (KPI + 6 charts + P&L table) | 1 issue | L (5-8d) |
| 6 | Team scope (KPI + 5 charts + schedule view) | 1 issue | M (3-5d) |
| 7 | Clients scope (KPI + 6 charts + board/graph views) | 1 issue | L (5-8d) |
| **Total** | | **8 issues** | **~35-47 days** |
