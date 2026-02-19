# Design System 2026 (shadcn UI)

> Normative. Every UI change must comply. No exceptions without explicit design-owner approval.
>
> Sources: Apple HIG, Microsoft Fluent 2, Shopify Polaris, Atlassian, NNGroup, Laws of UX,
> Refactoring UI, Vercel Geist, Linear, Stripe, IBM Carbon, Material Design 3.

This UI is optimized for a quiet SaaS surface:

- low visual noise
- predictable hierarchy
- fast scanability
- strict consistency across pages

---

## 1) Non-negotiable rules

1. Use shadcn component primitives from `components/ui/*` first.
2. Use semantic theme classes (`bg-background`, `text-foreground`, `border-input`, etc.).
3. All spacing, typography, color, shadow, radius, and motion values **must come from defined scales**. No arbitrary values.
4. One interaction language for all controls:
   - same focus ring family (`ring-ring/50`, 2px offset)
   - same disabled behavior (`opacity-50 pointer-events-none`)
   - same density scale (comfortable default, compact optional)
5. **WCAG AA** is the minimum accessibility target for all surfaces.
6. **`lang="ru"`** on `<html>` element (content language is Russian).
7. Every interactive element must have a minimum **44×44px** touch/click target (Fitts's Law, Apple HIG, WCAG 2.5.8).

---

## 2) Spacing scale

Base unit: **8px** with **4px** half-step. All spacing must use values from this scale.

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `spacing-0.5` | 2px | `0.5` | Hairline gaps, optical adjustments |
| `spacing-1` | 4px | `1` | Icon-to-text gap, tight element spacing |
| `spacing-2` | 8px | `2` | Default internal component padding, small gaps |
| `spacing-3` | 12px | `3` | Form field internal padding, medium element gap |
| `spacing-4` | 16px | `4` | Standard component padding |
| `spacing-5` | 20px | `5` | Card internal padding (compact) |
| `spacing-6` | 24px | `6` | Card internal padding (comfortable), card grid gap |
| `spacing-8` | 32px | `8` | Section internal padding, large component gap |
| `spacing-10` | 40px | `10` | Layout spacing |
| `spacing-12` | 48px | `12` | Section-to-section gap |
| `spacing-16` | 64px | `16` | Page-level vertical rhythm |
| `spacing-20` | 80px | `20` | Major layout sections |

### Spacing rules

1. **Within component**: 4–16px (`gap-1` to `gap-4`).
2. **Between related components** (e.g., filter bar items): 8–16px (`gap-2` to `gap-4`).
3. **Between groups** (e.g., toolbar and table): 24–32px (`gap-6` to `gap-8`).
4. **Between page sections**: 32–48px (`gap-8` to `gap-12`).
5. **Card padding**: `p-6` (24px) comfortable, `p-4` (16px) compact.
6. **Page margins**: `px-6` mobile, `px-8` desktop.

### Prohibited

- Arbitrary values like `p-[13px]`, `gap-[17px]`, `m-[23px]`.
- Using `px-*` / `py-*` with values outside the scale.

---

## 3) Typography scale

Seven sizes. No more, no less on any single view.

| Role | Size | Tailwind | Weight | Line-height | Usage |
|------|------|----------|--------|-------------|-------|
| Page title | 24px | `text-2xl` | 600 `font-semibold` | 32px `leading-8` | One per page, top-left |
| Section heading | 18px | `text-lg` | 500 `font-medium` | 28px `leading-7` | Card groups, page sections |
| Card title | 16px | `text-base` | 500 `font-medium` | 24px `leading-6` | Card headers, dialog titles |
| Body | 14px | `text-sm` | 400 `font-normal` | 20px `leading-5` | Default UI text, table cells |
| Label | 14px | `text-sm` | 500 `font-medium` | 20px `leading-5` | Form labels, sidebar items |
| Caption | 12px | `text-xs` | 400 `font-normal` | 16px `leading-4` | Metadata, timestamps, help text |
| Small label | 11px | `text-[11px]` | 500 `font-medium` | 16px `leading-4` | Badge text, compact indicators (only where caption is too large) |

### Typography rules

1. **Max 3 font weights** on any view: regular (400), medium (500), semibold (600). Never use `font-bold` (700) for body. Never use `font-light`/`font-thin`.
2. **Tabular numerals** (`font-variant-numeric: tabular-nums` / `tabular-nums` class) required in all tables, stat tiles, financial data, and numeric displays.
3. **Paragraph width**: max `65ch` (`max-w-prose`) for description text blocks.
4. **No custom letter-spacing** unless essential for small-caps or branding.
5. **No `uppercase`** unless it encodes product semantics (e.g., status codes).
6. **No arbitrary `text-[Npx]`** values outside the scale above. The only exception is `text-[11px]` for small labels.

---

## 4) Color system

### 4.1 Semantic token structure

All colors are CSS custom properties. Never use raw hex, rgb, or Tailwind palette classes (e.g., `text-red-500`).

| Category | Tokens | Usage |
|----------|--------|-------|
| Surfaces | `background`, `card`, `popover`, `muted`, `secondary`, `accent` | Page bg, cards, dropdowns, subtle areas |
| Text | `foreground`, `card-foreground`, `muted-foreground`, `popover-foreground` | Primary, secondary, contextual text |
| Borders | `border`, `input` | Dividers, form inputs |
| Focus | `ring` | Focus ring color |
| Brand | `primary`, `primary-foreground` | Primary actions, active states |
| Semantic | `destructive` / `success` / `warning` + `-foreground` variants | Error, success, warning states |
| Charts | `chart-1` through `chart-5` | Data visualization only |
| Sidebar | `sidebar`, `sidebar-*` variants | Navigation chrome |

### 4.2 Color rules

1. **90% neutral**: gray/neutral tones for the vast majority of UI. Color is accent, not decoration.
2. **1 accent color** (primary blue) for primary actions and active indicators only.
3. **3 semantic colors**: `destructive` (errors, danger), `warning` (caution), `success` (confirmation). Each has `bg-*/10` for backgrounds, `text-*` for text, `border-*/30` for borders.
4. **Never mix chart colors with status semantics**. `chart-*` is for data series only.
5. **Color is never the sole indicator**. Every status must have icon + text + color (minimum 2 channels). Required by WCAG 1.4.1.
6. **Dark mode**: defined via `.dark` class with separate token values. Both themes must pass WCAG AA contrast (4.5:1 normal text, 3:1 large text and UI components).

### 4.3 Contrast requirements (WCAG AA)

| Element | Minimum ratio |
|---------|---------------|
| Normal text (< 24px / < 18.5px bold) | 4.5:1 |
| Large text (>= 24px / >= 18.5px bold) | 3:1 |
| UI components (buttons, inputs, icons) | 3:1 |
| Non-text indicators (chart lines, borders of interactive elements) | 3:1 |

---

## 5) Shadow scale

Five levels. No other shadow values permitted.

| Level | CSS Value | CSS Variable | Usage |
|-------|-----------|-------------|-------|
| None | `none` | — | Flat elements, inline components |
| Subtle | `0 1px 2px rgba(0,0,0,0.05)` | `--shadow-subtle` | Slight lift, sticky table headers |
| Card | `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)` | `--shadow-card` | Cards, raised surfaces |
| Floating | `0 4px 16px rgba(0,0,0,0.12)` | `--shadow-floating` | Dropdowns, popovers, tooltips |
| Modal | `0 8px 32px rgba(0,0,0,0.16)` | `--shadow-modal` | Modals, dialogs, command palettes |

### Shadow rules

1. Cards at rest use `--shadow-card`. Hovered cards may elevate to `--shadow-floating`.
2. Radix overlays (Sheet, Dropdown, Tooltip, Select, Dialog) use `--shadow-floating` or `--shadow-modal`.
3. Dark mode: shadows are near-invisible. Use tonal elevation (lighter surface colors) instead.
4. **Never** use arbitrary `shadow-[...]` values.

---

## 6) Border radius scale

| Token | Value | CSS Variable | Usage |
|-------|-------|-------------|-------|
| `rounded-sm` | 4px | `--radius-sm` | Inputs, badges, tags, small buttons |
| `rounded-md` | 6px | `--radius-md` | Default buttons, dropdowns, tooltips |
| `rounded-lg` | 8px | `--radius-lg` | Cards, panels, table containers |
| `rounded-xl` | 12px | `--radius-xl` | Modals, dialogs, large cards |
| `rounded-full` | 9999px | — | Avatars, pill buttons, circular indicators |

### Radius rules

1. Adjacent elements must share the same radius. Never mix sharp and rounded corners.
2. Nested radius: inner radius = outer radius − padding. (e.g., outer `rounded-xl` with `p-2` → inner `rounded-lg`).

---

## 7) Interaction state matrix

Every interactive component must implement these states. No exceptions.

| State | Visual treatment | Required for |
|-------|-----------------|--------------|
| **Default** | Base styling | All |
| **Hover** | `bg-accent` or subtle background shift | Buttons, links, table rows, sidebar items, cards (if clickable) |
| **Focus-visible** | `ring-2 ring-ring ring-offset-2` (2px solid, 2px offset) | All focusable elements |
| **Active/Pressed** | Slight scale or darker background | Buttons, toggles |
| **Disabled** | `opacity-50 pointer-events-none cursor-not-allowed` | Buttons, inputs, switches, checkboxes |
| **Loading** | Spinner or skeleton + `pointer-events-none` | Buttons, tiles, cards, pages |
| **Error** | `border-destructive text-destructive` + error message | Inputs, form fields |
| **Empty** | `EmptyState` wizard pattern (title + reason + steps + CTA) | All list/table/card containers |
| **Selected** | `bg-accent` or `bg-primary/10` + `aria-selected="true"` | Table rows, sidebar items, list items |

### State rules

1. **Focus rings**: visible only on keyboard navigation (`:focus-visible`), not on mouse click.
2. **Disabled**: never hide; always show with reduced opacity. Include `aria-disabled="true"`.
3. **Loading**: must use `Skeleton` or spinner from component library. Never plain text "Загрузка...".
4. **Empty**: must use `EmptyState` wizard variant. Bare text ("Не найдено", "Список пуст") is **prohibited**.

---

## 8) Touch target requirements

| Element | Minimum size | Implementation |
|---------|-------------|----------------|
| Buttons (all variants) | 44×44px (visual or hit area) | `min-h-11 min-w-11` or `after:absolute after:-inset-2` |
| Switch | 44×44px hit area | Wrap in label/button with extended area |
| Checkbox | 44×44px hit area | Wrap in label with padding |
| Icon buttons | 44×44px | `h-11 w-11` or extended hit area |
| Table row actions | 36×36px minimum (desktop) | `h-9 w-9` minimum |
| Close buttons (Toast, Dialog) | 44×44px hit area | Extended hit area pattern |

### Extended hit area pattern

```jsx
// For small visual elements that need large touch targets:
<button className="relative">
  <Icon className="h-4 w-4" />
  <span className="absolute -inset-2" aria-hidden="true" />
</button>
```

---

## 9) Data table rules

Tables are core dashboard UI. These rules are mandatory.

### Layout

1. **Left-align text** columns (names, descriptions, statuses).
2. **Right-align numeric** columns (amounts, percentages, counts, dates with time).
3. **Never center-align** data columns (only acceptable for single-icon columns).
4. **Headers align with their data** (left-aligned header for left-aligned column).
5. **Sticky header** on vertical scroll: `sticky top-0 z-10 bg-card`.

### Typography

6. **Tabular numerals** in all numeric columns: `tabular-nums` class.
7. **Monospace font** for IDs, hashes, codes: `font-mono`.
8. Body text size: `text-sm` (14px). Never smaller than `text-xs` (12px) in table cells.

### Density

9. **Comfortable row height**: 48px (`h-12`). Default.
10. **Compact row height**: 36px (`h-9`). Optional toggle.
11. **Row hover**: `hover:bg-muted/50`.
12. **Selected row**: `bg-muted data-[state=selected]:bg-muted`.

### Pagination

13. Default to 25–50 rows per page. Not infinite scroll for analytical data.
14. Pagination controls at bottom-right of table.

### Responsive

15. Horizontal scroll wrapper with `overflow-x-auto` for wide tables.
16. Consider hiding low-priority columns at smaller breakpoints.

---

## 10) Form design rules

### Layout

1. **Single column always**. Multi-column forms are prohibited (NNGroup).
2. **Labels above inputs**, never as placeholders. Placeholders may provide format hints only.
3. **Required fields**: mark with `*` after label text. Optional fields: explicitly mark `(необязательно)`.
4. **Form width**: constrain to `max-w-md` (28rem / 448px) or `max-w-lg` (32rem / 512px).

### Validation

5. **Validate on blur**, never on keystroke. Exception: real-time format hints (e.g., password strength).
6. **Never validate empty required fields on blur** (user may be tabbing through). Validate on submit.
7. **Error placement**: inline, directly below the erroring field, in `text-destructive text-sm`.
8. **Error content**: specific, constructive, no technical jargon. Never say "invalid" — say what's expected.
9. **Error icon**: `AlertCircle` from Lucide alongside error text. Color is never the sole indicator.

### Components

10. Use `FormField` wrapper for all form inputs (provides `aria-describedby`, `aria-invalid`, error display).
11. Use `Switch` / `Checkbox` for booleans. Never `Select` with true/false.
12. Use `Select` for enums (3–20 options). Use `Tabs` for enums (2–5 visible options).
13. Use `DropdownMenu` for actions only. Never for state selection.

---

## 11) Responsive breakpoints

| Name | Width | Tailwind | Columns | Sidebar |
|------|-------|----------|---------|---------|
| Mobile | < 768px | default | 4 | Hidden (hamburger) |
| Tablet | 768px | `md:` | 8 | Icon-only rail |
| Desktop | 1024px | `lg:` | 12 | Full expanded |
| Wide | 1280px | `xl:` | 12 | Full expanded |
| Ultra-wide | 1536px | `2xl:` | 16 | Full expanded |

### Responsive rules

1. **Sidebar**: hidden on mobile, icon rail on tablet, full on desktop.
2. **Card grids**: 1 column mobile, 2 columns tablet, 3–4 columns desktop.
3. **Tables**: full width with horizontal scroll on mobile.
4. **StatTile grids**: 2 columns mobile, 3 columns tablet, 4–5 columns desktop.
5. **Dialogs/Sheets**: full-screen on mobile, centered/side-panel on desktop.

---

## 12) Density system

Two modes. Comfortable is default. Compact is opt-in for power users.

| Property | Comfortable | Compact |
|----------|-------------|---------|
| Card padding | `p-6` (24px) | `p-4` (16px) |
| Table row height | `h-12` (48px) | `h-9` (36px) |
| Button height | `h-9` (36px) | `h-8` (32px) |
| Input height | `h-9` (36px) | `h-8` (32px) |
| Gap between cards | `gap-6` (24px) | `gap-4` (16px) |
| Section spacing | `gap-8` (32px) | `gap-6` (24px) |
| Font body | `text-sm` (14px) | `text-sm` (14px) |
| Font caption | `text-xs` (12px) | `text-xs` (12px) |

---

## 13) Component constraints

### Card
- Use shadcn `Card` primitives (`CardHeader`, `CardContent`, `CardTitle`, `CardDescription`).
- `CardTitle` should render as a heading element (`<h3>`, `<h4>`) for semantic structure.
- Shadow: `--shadow-card` at rest.

### Table
- Use shadcn `Table` primitives.
- Follow all rules in section 9.

### Buttons
- Use shadcn button variants: `default`, `secondary`, `outline`, `ghost`, `destructive`.
- **Max 1 `default` (primary) button per view** (Von Restorff Effect).
- All other buttons: `outline`, `ghost`, or `secondary`.

### Inputs
- Use shadcn `Input` and `FormField` wrapper.
- Follow all rules in section 10.

---

## 14) Standard component library (shadcn + custom)

All product surfaces must use this shared set before creating new visual primitives:

- `Table` — sortable/list views
- `Kanban` — opportunity/action stage views
- `InboxList` — message/evidence streams
- `Drawer` / `Sheet` — context/detail panels
- `Filters` — query + trailing controls
- `StatTile` — topline metrics (must be actionable: link, tooltip, or onClick)
- `StatusChip` — semantic status language
- `EmptyState` — wizard pattern (title + reason + steps + CTA)
- `Toast` — success confirmations and non-user-caused failures
- `SkeletonBlock` — loading placeholders
- `FormField` — form input wrapper with label + error

### Rules

1. Prefer variant props over one-off classes.
2. New component APIs must preserve compact/comfortable density compatibility.
3. New components **must define** loading/empty/error state behavior.
4. New components must pass WCAG AA accessibility (keyboard, screen reader, contrast).
5. New components must respect `prefers-reduced-motion`.

---

## 15) Keyboard navigation

1. **Tab order** must follow visual reading order (top-to-bottom, left-to-right).
2. **Focus rings** must be visible on all interactive elements during keyboard navigation.
3. **Escape** closes modals, sheets, dropdowns, popovers.
4. **Enter/Space** activates buttons, toggles, checkboxes.
5. **Arrow keys** navigate within composite widgets (tabs, menus, selects, table rows).
6. **Cmd+K** (future): global command palette.
7. Never override Radix keyboard handling with custom handlers.

---

## 16) Motion system (Anime.js standard)

> Full specification: [`MOTION_GUIDELINES.md`](./MOTION_GUIDELINES.md)

Anime.js is the single motion engine.

- Duration tokens: `web/lib/motion.js`.
- Easing tokens: `web/lib/motion.js`.
- Respect `prefers-reduced-motion`.
- No random per-page animation curves/durations.

---

## 17) Z-index hierarchy

Strict layering. Never use arbitrary z-index values outside this scale.

| Token | Value | Usage |
|-------|-------|-------|
| `z-10` | 10 | Sidebar panel (fixed), sticky section headers |
| `z-20` | 20 | Sidebar rail, page sticky header |
| `z-50` | 50 | Overlays: Sheet, Dropdown, Tooltip, Select |
| `z-[60]` | 60 | Mobile bottom tabbar |
| `z-[70]` | 70 | Mobile projects sheet (above tabbar) |
| `z-[80]` | 80 | Offline banner (always visible) |
| `z-[90]` | 90 | Toast stack (topmost interactive layer) |

### Rules

1. Page content: no explicit z-index (auto stacking context).
2. Sticky headers within scrollable areas: `z-10`.
3. Global navigation chrome: `z-10`–`z-20`.
4. Radix primitives (Sheet, Dropdown, Tooltip, Select): `z-50` — set by shadcn defaults, do not override.
5. Mobile overlays that must sit above Radix portals: `z-[60]`–`z-[70]`.
6. System-level banners (offline, errors): `z-[80]`.
7. Toast notifications: `z-[90]`.

---

## 18) Quality gates

> Full specification: [`QUALITY_GATES_UI.md`](./QUALITY_GATES_UI.md)

Every UI change must pass:

- [ ] `npm run design:audit` — no raw colors, no inline styles, no arbitrary values
- [ ] `npm run ui:consistency` — component selection, empty states, boolean checks
- [ ] No arbitrary `text-[Npx]`, `p-[Npx]`, `gap-[Npx]` values outside defined scales
- [ ] All interactive elements have 44×44px touch targets
- [ ] All states implemented (hover, focus, disabled, loading, error, empty)
- [ ] WCAG AA contrast verified (4.5:1 text, 3:1 UI components)
- [ ] Mobile overflow safe
- [ ] Build succeeds

---

## 19) Related documents

- Control Tower structure: [`DESIGN_SYSTEM_CONTROL_TOWER.md`](./DESIGN_SYSTEM_CONTROL_TOWER.md)
- Motion: [`MOTION_GUIDELINES.md`](./MOTION_GUIDELINES.md)
- Component selection: [`COMPONENT_SELECTION.md`](./COMPONENT_SELECTION.md)
- Quality gates: [`QUALITY_GATES_UI.md`](./QUALITY_GATES_UI.md)
