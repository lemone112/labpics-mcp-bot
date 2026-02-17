# Portfolio Cockpit (dual-sidebar, multi-project, Loops)

This document is the canonical implementation reference for the **project-portfolio UI mode**:

- dual sidebar layout (left icon rail + project list sidebar),
- multi-project selection,
- six portfolio sections in `Control Tower`,
- Loops email sync from Postgres contacts.

Use this file as the primary execution guide for future iterations.

---

## 1) Why this mode exists

The product is project-oriented, but operators often need a **portfolio view** (single client owner, multiple projects).

This mode adds:

1. A minimal global navigation rail (icons + tooltip labels),
2. A second sidebar with project list and multi-select,
3. A body that aggregates data across selected projects.

---

## 2) Implemented UX layout

## 2.1 Left-most sidebar: global icon rail

- Icon-only navigation,
- Tooltip on hover for item names,
- Keeps body area focused on selected project portfolio,
- Contains **exactly six items** and no extra business menu entries.

Required item set (mapped to `#` sections on `/control-tower`):

1. `dashboard` — **Дашборд с Charts из shadcn**
2. `messages` — **Переписки (в формате ленты сообщений)**
3. `agreements` — **Договоренности (карточками, из RAG/Postgres)**
4. `risks` — **Риски (карточками, паттерны из RAG + history)**
5. `finance` — **Финансы и юнит-экономика**
6. `offers` — **Офферы и допродажи**

Notes:

- Logout is not a business nav item and is placed in the second (text) sidebar.
- The left rail should not include legacy pages (`projects`, `jobs`, `crm`, `signals`, etc.) as primary menu entries.

Implemented in:

- `web/components/nav-rail.jsx`

## 2.2 Second-level sidebar: project selection

- Text list of projects,
- Supports single and multi-select,
- Supports "select all" / "clear selection",
- Supports "set active project" for existing single-project scoped pages,
- Includes theme selector (light/dark/system).

Implemented in:

- `web/components/project-sidebar.jsx`
- `web/hooks/use-project-portfolio.js`

## 2.3 Main shell composition

- `PageShell` now composes:
  - `NavRail` (left),
  - `ProjectSidebar` (middle),
  - content body (right).
- Project sidebar can be collapsed/expanded.

Implemented in:

- `web/components/page-shell.jsx`
- provider integration in `web/app/providers.jsx`

---

## 3) Control Tower portfolio sections (body)

`/control-tower` now renders six business blocks for selected projects:

1. **Dashboard + charts** (Linear/Attio/RAG-derived signals),
2. **Messages feed**,
3. **Agreements cards** (RAG/evidence-derived),
4. **Risk cards** (risk radar + high severity signals),
5. **Finance + unit economics**,
6. **Offers + upsell + Loops status**.

Each block has a stable anchor id for left-rail navigation:

- `#dashboard`
- `#messages`
- `#agreements`
- `#risks`
- `#finance`
- `#offers`

Implemented in:

- `web/features/control-tower/page.jsx`
- chart primitives in `web/components/ui/chart.jsx`

Dependency:

- `recharts` (added in `web/package.json`)

---

## 4) Backend APIs added for portfolio mode

## 4.1 `GET /portfolio/overview`

Purpose: aggregate selected projects in one payload.

Query:

- `project_ids`: comma-separated list of project UUIDs,
- `message_limit`: optional,
- `card_limit`: optional.

Scope:

- Always constrained by `account_scope_id` from current session.

Returned domains:

- `dashboard` (totals/by_project/trend),
- `messages`,
- `agreements`,
- `risks`,
- `finances`,
- `offers`,
- `loops`.

Implementation:

- `server/src/services/portfolio.js`
- route in `server/src/index.js`

## 4.2 `POST /loops/sync`

Purpose: push contacts with email from Postgres to Loops.

Body:

- `project_ids`: optional list (if omitted, uses all projects in session account scope),
- `limit`: optional.

Behavior:

- Reads grouped emails from `cw_contacts`,
- Attempts Loops create; on duplicate, fallback to update,
- Writes audit event (`loops.contacts_sync`) for each selected project.

Implementation:

- `server/src/services/loops.js`
- route in `server/src/index.js`

---

## 5) Loops integration details

Environment:

- Required secret: `LOOPS_SECRET_KEY`
- Optional base URL override: `LOOPS_API_BASE_URL`

If `LOOPS_SECRET_KEY` is missing:

- Sync returns `enabled: false` and a reason,
- No hard failure for the rest of the product flow.

Scheduler integration:

- New scheduler job type: `loops_contacts_sync`
- Default cadence: `3600` seconds

Implemented in:

- `server/src/services/scheduler.js`

---

## 6) Data-source mapping by section

## 6.1 Dashboard

Reads and combines:

- `cw_messages` (messages in last 7 days),
- `linear_issues_raw` (open issue load),
- `attio_opportunities_raw` + `crm_opportunities` (pipeline/expected revenue),
- `health_scores`,
- `risk_radar_items`,
- `analytics_revenue_snapshots` (trend).

## 6.2 Messages feed

- `cw_messages` joined with `projects`.

## 6.3 Agreements cards

- `evidence_items` filtered by agreement-like terms in snippet/payload.

## 6.4 Risks cards

Union:

- `risk_radar_items`,
- high-severity (`>=4`) active `signals`.

## 6.5 Finance + unit economics

Combines:

- `crm_opportunities`,
- `offers`,
- latest `analytics_revenue_snapshots`.

## 6.6 Offers + upsell

- `upsell_opportunities`,
- `offers` (recent),
- derived discount policy from client value score.

---

## 7) Derived formulas (current implementation)

## 7.1 `client_value_score`

Derived from:

- expected revenue,
- health score,
- message activity,
- open risk pressure.

Bounded to `[0, 100]`.

## 7.2 `max_discount_pct`

Mapped from client value score:

- `>= 85` -> `18%`
- `>= 70` -> `14%`
- `>= 55` -> `10%`
- `>= 40` -> `7%`
- otherwise -> `5%`

These are operational defaults and can be moved to policy config later.

---

## 8) Files changed for this feature set

Backend:

- `server/src/index.js`
- `server/src/services/portfolio.js`
- `server/src/services/loops.js`
- `server/src/services/scheduler.js`

Frontend:

- `web/app/providers.jsx`
- `web/components/page-shell.jsx`
- `web/components/nav-rail.jsx`
- `web/components/project-sidebar.jsx`
- `web/components/ui/chart.jsx`
- `web/hooks/use-project-portfolio.js`
- `web/features/control-tower/page.jsx`
- `web/package.json`

---

## 9) Known limits / next hardening

1. Agreements extraction is heuristic (keyword based over evidence text),
2. Client value score is a deterministic formula (not yet ML-policy based),
3. Loops sync is request-driven + scheduler driven, without webhook reconciliation,
4. No per-user saved portfolio view presets yet.

---

## 10) Anti-shallow execution protocol (mandatory)

If there is any risk the next implementation pass becomes superficial, **return to this section first** and execute this checklist:

1. Confirm target user flow end-to-end:
   - select projects,
   - fetch portfolio,
   - inspect all six sections,
   - run Loops sync.
2. Verify data provenance for each card/chart (explicit table + query),
3. Verify scope safety:
   - no cross-account scope reads,
   - selected projects constrained by session `account_scope_id`,
4. Verify idempotency/safe retries on outbound integrations,
5. Verify UX consistency with shadcn conventions (no ad-hoc overlays, no visual drift),
   - left rail has exactly 6 business items,
   - each rail item maps to a corresponding section anchor on `/control-tower`,
6. Run validation:
   - `web`: `npm run lint` and `npm run build`,
   - `server`: syntax check for touched files,
7. Document what changed in this file before closing the iteration.

**Do not mark work complete until all 7 checks are satisfied.**

---

## 11) Immediate continuation backlog

1. Save/load named project selections (portfolio presets),
2. Add "portfolio drilldown" routes by selected project set,
3. Add Loops delivery feedback ingestion (events -> outbound status),
4. Upgrade agreements extraction from keyword heuristic to embedding-ranked evidence references,
5. Add dedicated tests for:
   - `resolveScopedProjects`,
   - portfolio aggregation shape,
   - Loops create->update fallback behavior.

