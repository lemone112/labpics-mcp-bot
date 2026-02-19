# Wave 3 — Full Design Overhaul (Iter 17–25)

> Status: **Planning**
> Depends on: Wave 2 iterations 13 (Frontend Resilience) and 14 (Design System) complete
> Target: Production-grade UI/UX with validated design decisions
>
> Source: Deep design audit (2026-02-19), hardened DESIGN_SYSTEM_2026.md,
> research synthesis from Apple HIG, Fluent 2, Polaris, Atlassian, NNGroup,
> Laws of UX, Refactoring UI, Geist, Linear, Stripe, Carbon, Material Design 3.

---

## Architecture

```
Iter 17 (Instrumentation) ──────────────────────────────────────────────┐
                                                                        │
Iter 18 (DS Foundations) ──→ Iter 19 (Components) ──→ Iter 21 (Pages)  │
                                                  ↗     ↑               │
                              Iter 20.5 (Charts) ┘      │               │
Iter 20 (UX Logic) ────────────────────────────────────┘               │
                                                                        │
Iter 22 (Mobile) ─── parallel after 19 ────────────────────────────────│
                                                                        │
Iter 23 (Polish + A11y) ─── after 21, 22 ─────────────────────────────│
                                                                        │
Iter 24 (Validation + QA) ─── final, after ALL ────────────────────────┘
```

**Critical path:** 18 → 19 → 20.5 → 21 → 23 → 24
**Parallel:** 17 (anytime), 20 (parallel with 18-19), 20.5 (after 19), 22 (parallel after 19)
**Final:** 24 — after ALL other iterations

---

## Summary

| Iter | Name | Category | Tasks | Depends on | Effort |
|------|------|----------|-------|------------|--------|
| **17** | Analytics Instrumentation | Data | 8 | — | M |
| **18** | Design System Foundations | Design System | 12 | 14 | L |
| **19** | Component Library Overhaul | Components | 14 | 18 | L |
| **20** | UX Logic & Information Architecture | UX/Logic | 11 | 14 | L |
| **20.5** | Charts & Data Visualization Overhaul | UI/Charts | 12 | 19 | L |
| **21** | Page-Level Redesign | UI/Pages | 12 | 19, 20, 20.5 | XL |
| **22** | Mobile & Responsive | UI/Mobile | 8 | 19 | M |
| **23** | Accessibility, Polish & Dark Mode | Quality | 10 | 21, 22 | L |
| **24** | Design Validation & QA | Validation | 9 | 17, 23 | M |
| | **Total** | | **96** | | |

Effort: S = 1–2 days, M = 3–5 days, L = 5–8 days, XL = 8–12 days

---

## Iter 17 — Analytics Instrumentation

**Category:** Data & Measurement
**Priority:** CRITICAL (blocks validated design decisions)
**Why:** Cannot design without knowing how users behave. Every subsequent
iteration depends on data from instrumentation.

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 17.1 | Integrate PostHog/Mixpanel SDK | Add analytics SDK to Next.js app. Track page views, session duration, device type. No PII. | `analytics`, `setup` |
| 17.2 | Track section navigation events | Event per section visit: which section, time spent, scroll depth, exit point. Answer: "Which sections are actually used?" | `analytics` |
| 17.3 | Track interaction events | Clicks on StatTiles, CTA buttons, table rows, filters. Answer: "What do users click?" | `analytics` |
| 17.4 | Track activation funnel | Step-by-step: login → project select → source connect → first data sync → first section with data. Answer: "Where do users drop off?" | `analytics` |
| 17.5 | Track empty state encounters | Event when user sees EmptyState wizard. Track: which section, did user click CTA, or navigate away. Answer: "Are empty states useful?" | `analytics` |
| 17.6 | Track feature adoption | Which features are used at least once per week: filters, theme toggle, project switch, table sort, drawer open. Answer: "What can we remove?" | `analytics` |
| 17.7 | Session recording setup | Integrate Hotjar/FullStory for qualitative replay. Mask sensitive data. 10% sampling. | `analytics`, `setup` |
| 17.8 | Create baseline metrics dashboard | PostHog/Mixpanel dashboard with: DAU, WAU, activation rate, D7 retention, avg session length, top sections, top actions. | `analytics` |

**Exit criteria:**
- [ ] Analytics SDK loads on all pages
- [ ] All events fire correctly (verified in PostHog/Mixpanel debug mode)
- [ ] Baseline dashboard shows real data (even if from internal testing)
- [ ] Session recording captures at minimum one full user flow

---

## Iter 18 — Design System Foundations

**Category:** Design System & Tokens
**Priority:** CRITICAL (all subsequent UI work depends on this)
**Why:** Current system has spacing scale in docs but not in code. Shadow tokens
not in CSS. Typography not enforced in Tailwind config. This iteration makes
the doc-defined system executable.

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 18.1 | Add shadow tokens to globals.css | Define `--shadow-subtle`, `--shadow-card`, `--shadow-floating`, `--shadow-modal` in `:root` and `.dark`. Remove old `--shadow-card`. | `design-system`, `tokens` |
| 18.2 | Migrate all shadow usage to tokens | Replace every `shadow-[var(--shadow-card)]` with utility classes mapped to new tokens. Verify dark mode shadow behavior (near-invisible). | `design-system`, `refactor` |
| 18.3 | Add spacing design tokens to Tailwind config | Document which Tailwind spacing values map to DS2026 spacing scale. Consider `@theme` in Tailwind v4. | `design-system`, `tokens` |
| 18.4 | Add typography tokens | Define CSS custom properties for each of the 7 typography roles (page-title, section-heading, card-title, body, label, caption, small-label). Optionally map to Tailwind `@theme`. | `design-system`, `tokens` |
| 18.5 | Fix `lang="en"` → `lang="ru"` | Change in `app/layout.jsx`. Add to CI check. | `a11y`, `fix` |
| 18.6 | Add `tabular-nums` utility to global CSS | Add `.tabular-nums { font-variant-numeric: tabular-nums; }` or rely on Tailwind `tabular-nums` class. Audit all numeric displays. | `design-system`, `typography` |
| 18.7 | Fix form-field.jsx arbitrary `text-[13px]` | Replace `text-[13px]` with `text-xs` (12px). Verify error message readability. | `design-system`, `fix` |
| 18.8 | Fix project-sidebar.jsx arbitrary `text-[11px]` | Verify `text-[11px]` is the correct small-label role. If so, keep (whitelisted). If not, replace with `text-xs`. | `design-system`, `fix` |
| 18.9 | Fix chart.jsx arbitrary `text-[11px]` | Same as 18.8 — verify tooltip label size. | `design-system`, `fix` |
| 18.10 | Add border-radius tokens to globals.css | Define `--radius-sm` through `--radius-xl` with the values from DS2026 section 6. Update existing `--radius` calc-based system. | `design-system`, `tokens` |
| 18.11 | Run design:audit and fix all violations | Run `npm run design:audit` with new rules. Fix every violation. Target: 0 violations. | `design-system`, `quality` |
| 18.12 | Run ui:consistency and fix all violations | Run `npm run ui:consistency` with new rules. Fix every violation. Target: 0 violations. | `design-system`, `quality` |

**Exit criteria:**
- [ ] `npm run design:audit` passes with 0 violations
- [ ] `npm run ui:consistency` passes with 0 violations
- [ ] All shadow/spacing/radius/typography tokens exist in CSS
- [ ] `lang="ru"` on `<html>` element
- [ ] No arbitrary `text-[Npx]` values except whitelisted `text-[11px]`

---

## Iter 19 — Component Library Overhaul

**Category:** Components (UI primitives + custom)
**Priority:** HIGH
**Why:** Component audit found 6 HIGH-severity issues and 7 MEDIUM issues.
Components are the building blocks — fixing them propagates to all pages.

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 19.1 | StatTile → interactive + loading + trend | Add props: `onClick`, `href`, `loading`, `trend` (up/down/flat), `delta` ("+12%"), `actionLabel` ("3 требуют внимания →"). Add hover/focus states. Add Skeleton loading variant. | `component`, `enhancement` |
| 19.2 | ThemeToggle: DropdownMenu → Select | Replace DropdownMenu with Select for theme selection (light/dark/system). Fixes COMPONENT_SELECTION.md violation. | `component`, `fix` |
| 19.3 | Switch: extend touch target to 44px | Add label wrapper or `after:absolute after:-inset-2` hit area extension. Visual size stays same. | `component`, `a11y` |
| 19.4 | Checkbox: extend touch target to 44px | Same pattern as Switch. Wrap in label with adequate padding. | `component`, `a11y` |
| 19.5 | Toast close button: extend touch target | Add `after:absolute after:-inset-2` to close button. Visual `size-4` stays, hit area becomes 44px+. | `component`, `a11y` |
| 19.6 | LastUpdatedIndicator: fix touch target | Increase refresh button from `h-6` (24px) to adequate hit area. | `component`, `a11y` |
| 19.7 | Button: add loading prop | Add `loading` boolean prop. When true: show spinner, disable interaction, set `aria-busy="true"`. Remove manual loading patterns from consumers (LoginPage, etc.). | `component`, `enhancement` |
| 19.8 | InboxList: replace bare empty state | Replace `"Список пуст"` with `<EmptyState>` wizard pattern. Props: title, reason, steps, primaryAction. | `component`, `fix` |
| 19.9 | Kanban: replace bare empty state | Replace `"Нет элементов"` with `<EmptyState>` wizard pattern per column. | `component`, `fix` |
| 19.10 | Card: CardTitle as heading element | Change CardTitle from `<div>` to `<h3>` (default) with optional `as` prop for semantic heading level. | `component`, `a11y` |
| 19.11 | Breadcrumb: fix displayName typo | `"BreadcrumbElipssis"` → `"BreadcrumbEllipsis"`. | `component`, `fix` |
| 19.12 | LoginPage: fix Toast import | Fix `import { Toast }` — should use `useToast` hook. Fix label association (`htmlFor`). | `fix`, `a11y` |
| 19.13 | Error pages: add `role="alert"` | Add `role="alert"` to error boundary containers in all 5+ error.jsx files. | `a11y`, `fix` |
| 19.14 | Filters: add aria-label to search input | Associate label with search input via `aria-label` or visually hidden label. | `a11y`, `fix` |

**Exit criteria:**
- [ ] StatTile is interactive (hover, focus, click) with loading and trend variants
- [ ] ThemeToggle uses Select, not DropdownMenu
- [ ] All touch targets >= 44px (verified visually)
- [ ] Button has `loading` prop used in LoginPage
- [ ] No bare empty states in InboxList or Kanban
- [ ] All accessibility fixes applied

---

## Iter 20 — UX Logic & Information Architecture

**Category:** UX/Logic
**Priority:** HIGH
**Why:** Current architecture is metrics-first (flat sections). Users need
action-first (prioritized). This iteration restructures the information
architecture without changing visual design.

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 20.1 | Design Action Queue data model | Define action item schema: `{ id, type, urgency, impact, title, description, evidence[], entity_ref, section, created_at, status }`. API endpoint `GET /api/portfolio/actions`. | `ux`, `backend`, `design` |
| 20.2 | Implement Action Queue API | Backend endpoint that aggregates: unread messages → action, expiring agreements → action, high risks → action, finance anomalies → action, stale offers → action. Rank by urgency × impact. | `ux`, `backend` |
| 20.3 | Design single guided setup flow | Replace 6 separate empty wizards with 1 unified onboarding flow: Step 1 (connect source) → Step 2 (select project) → Step 3 (first sync) → Step 4 (explore). | `ux`, `design` |
| 20.4 | Design navigation badge system | Define which sections show counters and what they count. Messages: unread count. Risks: critical count. Finance: anomaly count. Agreements: expiring count. Offers: pending count. | `ux`, `design` |
| 20.5 | Design client-centric view | Define entity page for a single client/project: health score + timeline + cross-section data (messages + risks + agreements + finance in one view). API: `GET /api/portfolio/client/:id/summary`. | `ux`, `design` |
| 20.6 | Define Insight Tile spec | Formal spec for enhanced StatTile: trend direction (arrow), delta vs. previous period, threshold coloring (green/amber/red), action link count. | `ux`, `design` |
| 20.7 | Define dashboard hierarchy | Determine: what are the top 5-7 metrics visible above the fold? What gets progressive disclosure? What gets removed? Based on analytics data from Iter 17 if available. | `ux`, `design` |
| 20.8 | Design cross-section search | Global search that spans all sections: messages, contacts, risks, agreements, offers. Results grouped by entity type. `Cmd+K` command palette spec. | `ux`, `design` |
| 20.9 | Define notification/alert system | When dashboard detects something urgent (new critical risk, agreement expiring in 3 days), how is user notified? In-app alert? Badge? Toast? Push? | `ux`, `design` |
| 20.10 | Design table interaction patterns | Standardize across all tables: row click behavior, bulk actions, column visibility toggle, export, density toggle. | `ux`, `design` |
| 20.11 | Design error/recovery flows | Standardize: API failure → retry + fallback. Sync failure → diagnostic. Auth expired → re-login. Offline → queue actions. | `ux`, `design` |

**Exit criteria:**
- [ ] Action Queue data model and API spec documented
- [ ] Guided setup flow wireframed (text-based or Figma)
- [ ] Navigation badge spec complete with source data
- [ ] Client-centric view wireframed
- [ ] All specs reviewed and approved by design owner

---

## Iter 20.5 — Charts & Data Visualization Overhaul

**Category:** UI / Charts / Data Visualization
**Priority:** HIGH
**Depends on:** Iter 19 (components ready)
**Why:** Current charts have broken spacing, wrong chart types for data context,
poor card composition, and unusable dimensions. Charts are the primary data
communication tool — if they're wrong, the dashboard is wrong.

### Current problems (from audit)

1. **Chart container `h-[240px]` is hardcoded** — one size for all chart types regardless of data density.
2. **Spacing inside chart cards** is inconsistent — padding varies between chart containers.
3. **Chart type selection is ad-hoc** — no mapping between data shape and chart style.
4. **Card composition** doesn't account for chart + legend + title + controls layout.
5. **No responsive chart sizing** — charts don't adapt to container width.
6. **Empty chart state** takes same space as populated chart (wastes screen real estate).
7. **shadcn/ui has 20+ chart variants** (area, bar, line, pie, radar, radial, tooltip) — most are unused.

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 20.5.1 | Audit all current chart usages | Identify every chart in the codebase: what data it shows, what type it uses, what dimensions. Catalog: chart location, data shape, current type, current size. | `charts`, `audit` |
| 20.5.2 | Define chart type selection matrix | Map data context → chart type. Reference shadcn chart catalog. Rules: trend over time → Area/Line. Comparison → Bar. Distribution → Bar (horizontal). Part-of-whole → Stacked bar (NOT pie for >5 slices). Single KPI → Radial/number. Ranking → Horizontal bar. | `charts`, `design` |
| 20.5.3 | Define chart card composition spec | Standardize chart card layout: `CardHeader` (title + period selector + controls) → `CardContent` (chart area + legend) → optional `CardFooter` (summary/action). Define padding: `p-6` outer, `p-0` on chart area (chart touches card edges for visual impact). | `charts`, `design` |
| 20.5.4 | Define chart dimension system | Height by chart type: sparkline `h-16` (64px), compact chart `h-40` (160px), standard chart `h-60` (240px), detailed chart `h-80` (320px). Width: always `w-full`, min-width `min-w-[280px]`. Responsive: charts scale with container via `ResponsiveContainer`. | `charts`, `design` |
| 20.5.5 | Fix chart internal spacing | Audit and fix: axis label margins, legend spacing, tooltip offset, grid line density. Rules: left axis label `ml-[-8px]`, bottom axis `mb-2`, legend `mt-4 gap-4`, grid lines `stroke-border/30`. | `charts`, `fix` |
| 20.5.6 | Implement chart type migrations | Replace mismatched chart types: if a trend-over-time uses Bar → migrate to Area. If a comparison uses Line → migrate to Bar. If a single KPI uses full chart → migrate to Radial or numeric display. | `charts`, `refactor` |
| 20.5.7 | Implement compact chart cards | For sections with 3+ charts: use 2-column grid of compact cards (`h-40`). Each card: title + chart only (no description, no legend — legend on hover/tooltip). Saves vertical space. | `charts`, `ui` |
| 20.5.8 | Implement detailed chart cards | For primary/hero charts: full-width card with `h-60` or `h-80`. Include: title, period selector, legend, axis labels, tooltip with full data. Interactive: hover crosshair, click to drill-down. | `charts`, `ui` |
| 20.5.9 | Implement empty chart state (compact) | When chart has no data: show compact placeholder inside card (same height as populated). CTA: "Подключить источник" / "Изменить период". Never dominate screen with empty charts. | `charts`, `ui` |
| 20.5.10 | Chart color palette enforcement | Ensure all charts use `chart-1` through `chart-5` tokens only. No hardcoded colors. Verify dark mode contrast. Add colorblind-safe patterns (dashed lines, different shapes) as secondary encoding. | `charts`, `a11y` |
| 20.5.11 | Chart tooltip standardization | Unify tooltip style across all charts: `bg-popover text-popover-foreground shadow-floating rounded-lg p-3`. Show: value, label, % change if applicable. Use `tabular-nums` for values. | `charts`, `ui` |
| 20.5.12 | Chart performance optimization | Lazy-load charts below fold. Use `IntersectionObserver` to render chart only when card is visible. Skeleton placeholder while loading. Target: chart renders in <100ms after visible. | `charts`, `performance` |

**Chart type selection matrix (reference for 20.5.2):**

| Data context | Best chart type | shadcn variant | Why |
|-------------|----------------|----------------|-----|
| Metric over time (1 series) | Area chart | `chart-area-default` | Shows trend + volume |
| Metric over time (2-3 series) | Line chart | `chart-line-multiple` | Clean comparison without overlap |
| Metric over time (stacked categories) | Stacked area | `chart-area-stacked` | Shows both total and composition |
| Comparison (3-7 categories) | Vertical bar | `chart-bar-default` | Easy visual comparison of discrete values |
| Comparison (8+ categories) | Horizontal bar | `chart-bar-horizontal` | Labels readable without rotation |
| Ranking / Top N | Horizontal bar (sorted) | `chart-bar-horizontal` | Natural top-to-bottom reading |
| Part-of-whole (2-4 parts) | Donut / Radial | `chart-radial-stacked` | Works for few segments |
| Part-of-whole (5+ parts) | Stacked bar (100%) | `chart-bar-stacked` | Pie/donut fails at 5+ segments |
| Single KPI with target | Radial progress | `chart-radial-text` | Compact, clear goal-vs-actual |
| Binary state | None (use number + icon) | — | Chart is overkill for yes/no |
| Distribution | Histogram / bar | `chart-bar-default` | Shows spread and outliers |
| Pipeline / funnel | Horizontal stacked bar | custom | Shows stage progression |

**Exit criteria:**
- [ ] Every chart uses the correct type for its data context
- [ ] Chart card composition follows standardized layout spec
- [ ] Chart heights match dimension system (sparkline/compact/standard/detailed)
- [ ] Internal spacing is consistent across all charts
- [ ] Empty chart states are compact with CTA
- [ ] All charts use `chart-*` color tokens only
- [ ] Dark mode chart contrast verified
- [ ] Charts lazy-load below fold

---

## Iter 21 — Page-Level Redesign

**Category:** UI / Pages
**Priority:** HIGH
**Depends on:** Iter 19 (components ready), Iter 20 (UX logic decided)
**Why:** This is where everything comes together. Pages are rebuilt using
new components, new IA, and new UX logic.

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 21.1 | Break section-page.jsx monolith | Split 51KB monolith into 6 section files: `dashboard-section.jsx`, `messages-section.jsx`, `agreements-section.jsx`, `risks-section.jsx`, `finance-section.jsx`, `offers-section.jsx`. Shared layout via `SectionLayout` component. | `refactor`, `ui` |
| 21.2 | Implement Action Queue page | New page `/control-tower/actions` (or make it the default landing). Renders prioritized action feed. Each item: insight + context + action button + evidence link. | `ui`, `feature` |
| 21.3 | Implement guided setup flow | First-login experience: detect no sources → show full-screen guided wizard (not per-section empty states). After first source connected → redirect to partial data view. | `ui`, `feature` |
| 21.4 | Redesign Dashboard section | Replace flat StatTiles with Insight Tiles (trend + delta + action link). Restructure: action summary at top → key metrics → charts (progressive disclosure). Max 7 metrics above fold. | `ui`, `redesign` |
| 21.5 | Redesign Messages section | Implement InboxList with proper empty states. Add unread count badge in nav. Add person-centric grouping. | `ui`, `redesign` |
| 21.6 | Redesign Agreements section | Expiring agreements highlighted. Timeline view option. Extraction status clear. | `ui`, `redesign` |
| 21.7 | Redesign Risks section | Severity-ranked list (critical first). Each risk: evidence count, probability, impact, recommended action. Risk summary as Insight Tile. | `ui`, `redesign` |
| 21.8 | Redesign Finance section | Pipeline stages visual. Anomaly highlighting. Revenue metrics as Insight Tiles with trend. | `ui`, `redesign` |
| 21.9 | Redesign Offers section | Status-based Kanban. Template gallery. Approval workflow inline. | `ui`, `redesign` |
| 21.10 | Implement navigation badges | Add unread/critical/pending counters to sidebar navigation items. Real-time update via existing React Query cache. | `ui`, `feature` |
| 21.11 | Implement client-centric view | New page or drawer: all data for one project/client in a unified timeline. Cross-section synthesis. | `ui`, `feature` |
| 21.12 | Implement `Cmd+K` command palette | Global search + action palette. Navigate to sections, search entities, trigger actions. Keyboard-first. | `ui`, `feature` |

**Exit criteria:**
- [ ] section-page.jsx monolith replaced with 6 files
- [ ] Action Queue renders prioritized items
- [ ] Guided setup replaces per-section empty wizards for new users
- [ ] All 6 sections redesigned with Insight Tiles and proper hierarchy
- [ ] Navigation badges show real counts
- [ ] `Cmd+K` palette functional
- [ ] All pages pass 3-second test

---

## Iter 22 — Mobile & Responsive

**Category:** UI / Mobile
**Priority:** MEDIUM
**Depends on:** Iter 19 (components)
**Why:** Current mobile is "desktop shrunk". Mobile users need notification-style
feed, not 6 sections with charts.

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 22.1 | Define mobile IA | Mobile entry point = Action Queue feed (not dashboard). Bottom tabbar: Actions (default), Messages, Search, Profile. Max 4 tabs. | `mobile`, `ux` |
| 22.2 | Optimize bottom tabbar | Reduce from 6 to 4 tabs. Each tab = 80px width on 320px screen. Active indicator. Badge support. | `mobile`, `ui` |
| 22.3 | Mobile Action Queue | Full-screen feed of action items. Swipe gestures: dismiss, snooze, accept. Pull-to-refresh. | `mobile`, `ui` |
| 22.4 | Mobile table responsive | Tables on mobile: card-based layout instead of horizontal scroll. Each row becomes a mini-card with key columns visible. | `mobile`, `ui` |
| 22.5 | Mobile charts | Charts on mobile: simplified (sparklines instead of full charts). Or hide below fold with "Show charts" toggle. | `mobile`, `ui` |
| 22.6 | Mobile Sheet/Drawer | Full-screen on mobile (not side panel). Swipe-to-close. Back button navigation. | `mobile`, `ui` |
| 22.7 | Safe area handling | Verify `env(safe-area-inset-*)` on all fixed elements (tabbar, sticky headers, toasts). Test on iOS Safari notch/Dynamic Island. | `mobile`, `quality` |
| 22.8 | Touch target audit (mobile) | Verify ALL interactive elements >= 44px on mobile viewports. Fix any violations found. | `mobile`, `a11y` |

**Exit criteria:**
- [ ] Mobile entry point is Action Queue, not dashboard
- [ ] Bottom tabbar has max 4 items with badges
- [ ] Tables render as cards on mobile
- [ ] All touch targets >= 44px on mobile
- [ ] Safe area handling verified

---

## Iter 23 — Accessibility, Polish & Dark Mode

**Category:** Quality & Polish
**Priority:** HIGH
**Depends on:** Iter 21 (pages), Iter 22 (mobile)
**Why:** WCAG AA compliance is a DS2026 requirement. Dark mode needs contrast
verification. Polish makes the difference between "functional" and "professional".

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 23.1 | WCAG AA contrast audit (light mode) | Test every text/background combination with contrast checker. Fix any ratio < 4.5:1 (text) or < 3:1 (UI components). | `a11y`, `quality` |
| 23.2 | WCAG AA contrast audit (dark mode) | Same as 23.1 for `.dark` theme. Pay special attention to `muted-foreground` on `muted` backgrounds. Semantic colors (destructive, warning, success) on dark surfaces. | `a11y`, `quality` |
| 23.3 | Keyboard navigation full audit | Tab through every page. Verify: logical order, visible focus rings, escape closes modals, enter activates buttons, arrow keys in composite widgets. Fix all issues. | `a11y`, `quality` |
| 23.4 | Screen reader audit | Test with VoiceOver (macOS) or NVDA (Windows). Verify: all landmarks labeled, headings hierarchy correct, dynamic content announced (`aria-live`), form errors announced. | `a11y`, `quality` |
| 23.5 | Add axe-core to e2e tests | Integrate @axe-core/playwright into e2e test suite. Auto-check every page for a11y violations. Target: 0 critical/serious violations. | `a11y`, `test` |
| 23.6 | Visual regression testing | Set up Percy or Chromatic. Screenshot every page in light + dark mode at 3 viewports (mobile, tablet, desktop). Baseline snapshots. | `quality`, `test` |
| 23.7 | Animation polish pass | Review all animations against MOTION_GUIDELINES.md. Verify durations, easing, stagger. Test with `prefers-reduced-motion`. Fix any violations. | `quality`, `motion` |
| 23.8 | Typography polish pass | Audit all pages for typography scale adherence. Fix: wrong sizes, wrong weights, missing `tabular-nums` in numeric columns, paragraph width exceeding `max-w-prose`. | `quality`, `typography` |
| 23.9 | Spacing polish pass | Audit all pages for spacing scale adherence. Fix: inconsistent card padding, section gaps, component spacing. Verify against DS2026 section 2 rules. | `quality`, `spacing` |
| 23.10 | Dark mode visual polish | Review every component and page in dark mode. Fix: shadows invisible (use tonal elevation), borders too harsh, charts unreadable, status colors indistinct. | `quality`, `dark-mode` |

**Exit criteria:**
- [ ] WCAG AA contrast passes on every text/background combo (light + dark)
- [ ] Keyboard navigation works on every page without mouse
- [ ] Screen reader announces all content correctly
- [ ] axe-core e2e: 0 critical/serious violations
- [ ] Visual regression baseline established
- [ ] All animations match MOTION_GUIDELINES.md
- [ ] Dark mode visually polished

---

## Iter 24 — Design Validation & QA

**Category:** Validation
**Priority:** CRITICAL (final gate)
**Depends on:** ALL previous iterations (17–23)
**Why:** Validates that design decisions actually improve UX.
Compares post-redesign metrics with Iter 17 baseline.

| # | Task | Description | Labels |
|---|------|-------------|--------|
| 24.1 | Compare analytics: before vs. after | Compare Iter 17 baseline with post-redesign metrics: section usage, time-on-page, click rates, activation funnel, retention. | `validation`, `analytics` |
| 24.2 | Run 5 user interviews | Show redesigned UI to 5 target users. Tasks: "Find the most urgent action", "Check client X health", "Set up a new data source". Measure: task completion, time, satisfaction. | `validation`, `research` |
| 24.3 | 3-second test on all pages | Run informal usability test: show each page for 3 seconds, ask "What is this page about? What should you do?" Score clarity. | `validation`, `research` |
| 24.4 | Full e2e test pass | Run complete Playwright suite. All existing + new tests must pass. No regressions. | `test`, `quality` |
| 24.5 | Design audit script: 0 violations | Final run of `npm run design:audit` + `npm run ui:consistency`. Zero tolerance. | `quality` |
| 24.6 | Performance audit | Lighthouse scores: Performance >= 90, Accessibility >= 95, Best Practices >= 90. Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1. | `quality`, `performance` |
| 24.7 | Cross-browser verification | Test on: Chrome, Firefox, Safari, Edge (latest). Mobile: iOS Safari, Chrome Android. Fix any rendering issues. | `quality`, `test` |
| 24.8 | DoD checklist for every page | Run full 15-point DoD from QUALITY_GATES_UI.md on every page. Document pass/fail. Fix all failures. | `quality` |
| 24.9 | Design system documentation update | Update all docs to reflect final implemented state. Remove any specs that were changed during implementation. Ensure docs match code exactly. | `docs` |

**Exit criteria:**
- [ ] Analytics show measurable improvement in activation or engagement
- [ ] 5 user interviews completed with actionable findings
- [ ] 3-second test passes on all pages
- [ ] Full e2e suite green
- [ ] 0 design audit violations
- [ ] Lighthouse scores meet targets
- [ ] Cross-browser verified
- [ ] All docs match implemented code

---

## Cross-Iteration: Component Fixes Pending Design Approval

These fixes were identified in the audit but require design-owner visual review
before implementation. They will be assigned to the appropriate iteration after approval.

| Fix | Current | Proposed | Iteration |
|-----|---------|----------|-----------|
| StatTile visual redesign | Plain number | Trend + delta + action link | 19 or 21 |
| Navigation badge visual | No badges | Counter badges on sidebar items | 21 |
| Action Queue card design | N/A (new) | Action item card layout | 21 |
| Guided setup visual design | Per-section empty wizards | Full-screen wizard with progress | 21 |
| Mobile Action Queue card | N/A (new) | Swipeable action card | 22 |
| Table card layout (mobile) | Horizontal scroll | Mini-card per row | 22 |
| Dark mode shadow replacement | Drop shadows | Tonal elevation (lighter surfaces) | 23 |

---

## Effort Estimate

| Iter | Tasks | Effort | Calendar (1 dev) |
|------|-------|--------|------------------|
| 17 | 8 | M (3–5d) | Week 1 |
| 18 | 12 | L (5–8d) | Week 1–2 |
| 19 | 14 | L (5–8d) | Week 2–3 |
| 20 | 11 | L (5–8d) | Week 2–3 (parallel with 18–19) |
| 21 | 12 | XL (8–12d) | Week 3–5 |
| 22 | 8 | M (3–5d) | Week 4–5 (parallel with 21) |
| 23 | 10 | L (5–8d) | Week 5–6 |
| 24 | 9 | M (3–5d) | Week 6–7 |
| **Total** | **84** | | **~7 weeks** |

---

## Labels

| Label | Description |
|-------|-------------|
| `design-system` | Design tokens, scales, CSS variables |
| `component` | UI primitive changes |
| `ui` | Page-level UI changes |
| `ux` | Information architecture, flows, logic |
| `a11y` | Accessibility (WCAG compliance) |
| `mobile` | Mobile-specific changes |
| `analytics` | Instrumentation and measurement |
| `validation` | User testing and metric comparison |
| `quality` | Polish, audits, regression testing |
| `fix` | Bug fix or standard violation |
| `feature` | New functionality |
| `refactor` | Code restructuring without behavior change |
| `redesign` | Visual/structural redesign of existing page |
| `dark-mode` | Dark theme specific |
| `motion` | Animation related |
| `typography` | Font sizes, weights, line-heights |
| `spacing` | Padding, margins, gaps |
| `tokens` | Design token definitions |
| `test` | Test coverage |
| `docs` | Documentation updates |
| `backend` | Backend/API changes |
| `research` | User research activities |
| `setup` | Infrastructure/tooling setup |
