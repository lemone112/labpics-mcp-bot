# Design System 2026 (shadcn UI)

This UI is intentionally optimized for a quiet SaaS surface:

- low visual noise
- predictable hierarchy
- fast scanability
- strict consistency across pages

## 1) Non-negotiable rules

1. Use shadcn component primitives from `components/ui/*` first.
2. Use semantic theme classes (`bg-background`, `text-foreground`, `border-input`, etc.).
3. Keep typography simple and consistent with shadcn defaults.
4. One interaction language for all controls:
   - same focus ring family
   - same disabled behavior
   - same density scale

## 2) Visual grammar

- Surfaces: `background`, `card`, `popover`
- Borders: `border`, `input`
- Accent: `primary`, `secondary`, `accent`
- Alerts: `destructive`

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
  - use shadcn `Card` primitives (`CardHeader`, `CardContent`, `CardTitle`, `CardDescription`)
- Table:
  - use shadcn `Table` primitives
  - keep horizontally safe wrappers
  - headers and cells share one density system
- Buttons:
  - use shadcn button variants (`default`, `secondary`, `outline`, `ghost`, `destructive`)
- Inputs:
  - use shadcn `Input` and related form primitives

## 5) Quality gate (before merge)

Every UI change must pass this checklist:

- [ ] No ad-hoc colors when semantic classes exist
- [ ] No one-off style objects
- [ ] No unnecessary typography overrides
- [ ] Hover/focus/disabled states are consistent
- [ ] Mobile overflow is safe
- [ ] Build succeeds
- [ ] `npm run design:audit` succeeds

## 6) Standard component library (shadcn + custom)

All product surfaces must use this shared set before creating new visual primitives:

- `Table` (sortable/list views)
- `Kanban` (opportunity/action stage views)
- `InboxList` (message/evidence streams)
- `Drawer` / modal patterns
- `Filters` (query + trailing controls)
- `StatTile` (topline metrics — supports `loading`, `trend`, `delta`, `actionLabel`)
- `StatusChip` (semantic status language)
- `EmptyState` (wizard pattern: title + reason + steps + CTA)
- `Toast` (inline banner via `<Toast>` or stacked notifications via `useToast()`)
- `SkeletonBlock`
- `PageLoadingSkeleton` (full-page skeleton entrance with motion)
- `LastUpdatedIndicator` (relative timestamp + refresh button)
- `MotionGroup` (staggered reveal for `[data-motion-item]` children)
- `Button` (supports `loading` prop with spinner + `aria-busy`)

Rules:

1. Prefer variant props over one-off classes.
2. New component APIs must preserve compact/comfortable density compatibility.
3. New components must define loading/empty/error state behavior.
4. Touch targets must be ≥44px (use `after:absolute after:-inset-2` pattern for small controls).

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

## 8) Z-index hierarchy

Strict layering to prevent stacking conflicts. Never use arbitrary z-index values outside this scale.

| Token       | Value   | Usage                                           |
| ----------- | ------- | ----------------------------------------------- |
| `z-10`      | 10      | Sidebar panel (fixed), sticky section headers   |
| `z-20`      | 20      | Sidebar rail, page sticky header                |
| `z-50`      | 50      | Overlays: Sheet, Dropdown, Tooltip, Select      |
| `z-[60]`    | 60      | Mobile bottom tabbar                            |
| `z-[70]`    | 70      | Mobile projects sheet (above tabbar)            |
| `z-[80]`    | 80      | Offline banner (always visible)                 |
| `z-[90]`    | 90      | Toast stack (topmost interactive layer)          |

### Rules

1. Page content: no explicit z-index (auto stacking context).
2. Sticky headers within scrollable areas: `z-10`.
3. Global navigation chrome: `z-10`–`z-20`.
4. Radix primitives (Sheet, Dropdown, Tooltip, Select): `z-50` — set by shadcn defaults, do not override.
5. Mobile overlays that must sit above Radix portals: `z-[60]`–`z-[70]`.
6. System-level banners (offline, errors): `z-[80]`.
7. Toast notifications: `z-[90]`.
