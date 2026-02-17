# Design System 2026 (Attio/Amie-aligned)

This UI is intentionally optimized for a quiet SaaS surface:

- low visual noise
- predictable hierarchy
- fast scanability
- strict consistency across pages

## 1) Non-negotiable rules

1. Tokens first. No raw visual values in features when a token exists.
2. No decorative shadows by default.
3. Minimal typography: only apply explicit text styles when hierarchy requires it.
4. Radius math for nested blocks is mandatory:
   - `innerRadius = outerRadius - containerPadding`
   - use `.app-inset` + `--container-radius` + `--container-padding`
5. One interaction language for all controls:
   - same focus ring family
   - same disabled behavior
   - same density scale

## 2) Visual grammar

- Surfaces: neutral (`--surface-*`)
- Borders: thin (`--border-subtle`, `--border-strong`)
- Accent: reserved for action and focus (`--brand-*`)
- Status: semantic tokens (`--status-*`)

## 3) Typography scale

Prefer built-in semantic sizes:

- `text-xs` for metadata
- `text-sm` for body/UI labels
- `text-base` for section titles
- `text-2xl` only for page title

Avoid:

- custom letter spacing unless essential
- uppercase labels unless they encode product semantics
- one-off font-size values without system reason

## 4) Component constraints

- Card:
  - defines container radius/padding variables
  - nested tiles inside card must use `.app-inset`
- Table:
  - always horizontally safe (`overflow-x-auto`)
  - headers and cells share one density system
- Buttons:
  - no decorative transforms
  - explicit focus-visible ring
- Inputs:
  - border-driven interaction state
  - focus ring for keyboard accessibility

## 5) Quality gate (before merge)

Every UI change must pass this checklist:

- [ ] No ad-hoc colors when token exists
- [ ] No unnecessary shadow
- [ ] No unnecessary typography overrides
- [ ] Nested radius follows formula
- [ ] Hover/focus/disabled states are consistent
- [ ] Mobile overflow is safe
- [ ] Build succeeds
- [ ] `npm run design:audit` succeeds

## 6) Standard component library (Hero UI + custom)

All product surfaces must use this shared set before creating new visual primitives:

- `Table` (sortable/list views)
- `Kanban` (opportunity/action stage views)
- `InboxList` (message/evidence streams)
- `Drawer` / modal patterns
- `Filters` (query + trailing controls)
- `StatTile` (topline metrics)
- `StatusChip` (semantic status language)
- `EmptyState`
- `Toast`
- `SkeletonBlock`

Rules:

1. Prefer variant props over one-off classes.
2. New component APIs must preserve compact/comfortable density compatibility.
3. New components must define loading/empty/error state behavior.

## 7) Motion system (Anime.js standard)

Anime.js is the single motion engine.

- Duration tokens live in `web/lib/motion.js`.
- Easing tokens live in `web/lib/motion.js`.
- Respect reduced motion (`prefers-reduced-motion`).
- No random per-page animation curves/durations.

### Motion budget

- Micro feedback: `120-220ms`
- Surface/list transitions: `220-420ms`
- Avoid chaining more than 2 sequential animations for one interaction.
- Never animate layout in a way that causes content jumps.

### Where motion is required

- Feedback after critical user actions (submit, approve, status changes)
- Progressive reveal for page sections and dense lists
- Controlled transitions for drawers/modals

### Where motion is forbidden

- Decorative looping animations on data tables/forms
- Aggressive entrance motion that delays reading
- Rapid repetitive animation that distracts from evidence workflows
