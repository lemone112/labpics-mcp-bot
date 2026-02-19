# UI Quality Gates

> Automated and manual checks that block merge of UI changes.
> Run via `npm run lint` (design:audit + ui:consistency).
>
> Hardened 2026-02-19. Zero-tolerance policy for design system violations.

---

## 1) Automated Checks — Design Audit (`npm run design:audit`)

The script `web/scripts/design-audit.mjs` enforces:

### 1.1 Raw Tailwind palette colors

**Fails on:** Any Tailwind palette utility (`text-red-500`, `bg-blue-200`, `border-gray-300`, etc.) in `app/`, `components/`, `features/`.

```
ERROR: [legacy-palette-utility] Use design tokens instead of Tailwind palette utilities
  features/crm/card.jsx:33  bg-red-100
```

**Fix:** Use semantic classes: `bg-destructive/10`, `text-warning`, `border-primary`, etc.

### 1.2 Raw hex colors

**Fails on:** Hex color literals (`#ff0000`, `#e5e7eb`, etc.) in component/page files.

```
ERROR: [raw-hex-in-component] Use tokens instead of raw hex colors
  components/ui/custom.jsx:12  color: #ff6369
```

**Fix:** Use CSS custom properties via semantic classes.

### 1.3 Uppercase utility

**Fails on:** `uppercase` class in any JSX/TSX file.

**Fix:** Remove. Only permitted if encoding product semantics (status codes). Requires comment justification.

### 1.4 Inline styles

**Fails on:** `style={{` in any JSX/TSX file.

**Fix:** Use Tailwind utility classes. Only exception: CSS custom property injection (e.g., sidebar width variables).

### 1.5 Hardcoded animation duration

**Fails on:** `duration: <number>` literal in any file.

**Fix:** Use `MOTION.durations.*` tokens from `web/lib/motion.js`.

### 1.6 Hardcoded easing

**Fails on:** `ease: "<string>"` literal in any file.

**Fix:** Use `MOTION.easing.*` tokens from `web/lib/motion.js`.

### 1.7 Arbitrary spacing values (NEW)

**Fails on:** Arbitrary Tailwind spacing brackets in `app/`, `components/`, `features/`:
- `p-[<number>px]`, `m-[<number>px]`, `gap-[<number>px]`
- `px-[<number>px]`, `py-[<number>px]`, `mx-[<number>px]`, `my-[<number>px]`
- `top-[<number>px]`, `left-[<number>px]`, `right-[<number>px]`, `bottom-[<number>px]`

**Exceptions:** `calc()` expressions, `env()`, `var()`, `%`, `vh`, `vw`, `rem` values, and known z-index values `z-[60]`, `z-[70]`, `z-[80]`, `z-[90]`.

```
ERROR: [arbitrary-spacing] Use spacing scale tokens instead of arbitrary px values
  features/dashboard/card.jsx:15  p-[13px]
```

**Fix:** Use the spacing scale from `DESIGN_SYSTEM_2026.md` section 2.

### 1.8 Arbitrary typography values (NEW)

**Fails on:** `text-[<number>px]` in any file, EXCEPT the whitelisted `text-[11px]` (small label role).

```
ERROR: [arbitrary-typography] Use typography scale instead of arbitrary text sizes
  components/ui/form-field.jsx:47  text-[13px]
```

**Fix:** Use scale values: `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px), `text-2xl` (24px). The only arbitrary exception is `text-[11px]` for small labels.

### 1.9 Arbitrary shadow values (NEW)

**Fails on:** `shadow-[` in any file.

```
ERROR: [arbitrary-shadow] Use shadow scale tokens instead of arbitrary shadow values
  components/card.jsx:8  shadow-[0_2px_8px_rgba(0,0,0,0.1)]
```

**Fix:** Use shadow CSS variables: `shadow-[var(--shadow-card)]`, `shadow-[var(--shadow-floating)]`, `shadow-[var(--shadow-modal)]`.

---

## 2) Automated Checks — UI Consistency (`npm run ui:consistency`)

The script `web/scripts/ui-consistency-check.mjs` enforces:

### 2.1 File existence

All required pages, components, and config files must exist.

### 2.2 Boolean-in-Select detector

**Fails on:** `SelectItem` with `value="true"` or `value="false"` in any `.jsx`/`.tsx` file.

```
ERROR: BOOLEAN-IN-SELECT: features/settings/page.jsx:42
  -> Use Switch or Checkbox for boolean controls. Select is for enums.
```

### 2.3 DropdownMenu-as-state-picker detector

**Fails on:** `DropdownMenuItem` with `onClick` handlers that contain state-setting keywords
(`period`, `mode`, `view`, `density`, `filter`, `sort`, `range`, `interval`, `theme`, `setTheme`).

```
ERROR: DROPDOWN-AS-STATE: features/analytics/filters.jsx:18
  -> DropdownMenu is for actions only. Use Select or Tabs for state selection.
```

### 2.4 Raw color detector (features only)

**Fails on:** Raw Tailwind color classes in `web/features/**/*.jsx`:
- `text-red-*`, `bg-red-*`, `border-red-*`
- `text-blue-*`, `bg-blue-*`, `border-blue-*`
- `text-green-*`, `bg-green-*`, `border-green-*`
- `text-yellow-*`, `bg-yellow-*`, `border-yellow-*`
- `text-orange-*`, `bg-orange-*`, `border-orange-*`
- `text-gray-*`, `bg-gray-*`, `border-gray-*`

### 2.5 Chart-color-as-status detector

**Fails on:** `chart-*` classes used inside Badge/StatusChip-like patterns
(adjacent to status/severity/probability keywords) in `web/features/**/*.jsx`.

### 2.6 Bare empty state detector (NEW)

**Fails on:** Strings matching common bare empty state patterns in any `.jsx`/`.tsx`:
- `"Не найдено"`, `"Список пуст"`, `"Нет элементов"`, `"Нет данных"`, `"Данных пока нет"`
- When used as standalone text content (not inside `EmptyState` component).

```
ERROR: BARE-EMPTY-STATE: components/ui/inbox-list.jsx:29
  -> Use <EmptyState> wizard pattern (title + reason + steps + CTA). Bare text empty states are prohibited.
```

**Fix:** Replace with `<EmptyState variant="wizard" title="..." reason="..." steps={[...]} primaryAction={...} />`.

### 2.7 Missing lang="ru" detector (NEW)

**Fails on:** `lang="en"` in `app/layout.jsx`.

```
ERROR: WRONG-LANG: app/layout.jsx:26
  -> UI language is Russian. Use lang="ru" on <html> element.
```

---

## 3) Manual Checks (PR review)

### 3.1 Three-second test

Open each changed page. In 3 seconds, you must be able to answer:
- Where am I?
- What's important?
- What should I do?

If any answer is unclear -> rework.

### 3.2 Component selection audit

For every UI control in the diff, verify against [`COMPONENT_SELECTION.md`](./COMPONENT_SELECTION.md):
- [ ] Boolean -> Switch/Checkbox (not Select/Dropdown)
- [ ] Actions -> DropdownMenu (not Select)
- [ ] Confirm destructive -> Dialog (not Sheet)
- [ ] Context/details -> Sheet/Drawer (not Dialog)
- [ ] Status -> StatusChip (not Badge with ad-hoc colors)
- [ ] Empty -> EmptyState wizard (not bare text)

### 3.3 Control Tower structure

For changes to `/control-tower/*`:
- [ ] Hero panel present with `data-testid="ct-hero"`
- [ ] Exactly 1 primary CTA with `data-testid="primary-cta"`
- [ ] Trust bar present with `data-testid="trust-bar"`
- [ ] Empty states use wizard pattern with `data-testid="empty-wizard"`

### 3.4 Touch target audit (NEW)

For every interactive element in the diff:
- [ ] Buttons: min 44x44px visual or hit area
- [ ] Icon buttons: `h-11 w-11` or extended hit area (`after:absolute after:-inset-2`)
- [ ] Switch/Checkbox: wrapped in label with adequate padding
- [ ] Close buttons (Toast, Dialog): extended hit area pattern

### 3.5 State coverage audit (NEW)

For every component in the diff:
- [ ] Default state renders correctly
- [ ] Hover state is visible and consistent
- [ ] Focus-visible ring is present (keyboard navigation)
- [ ] Disabled state uses `opacity-50 pointer-events-none`
- [ ] Loading state uses Skeleton or spinner (not plain text)
- [ ] Error state shows inline message with icon
- [ ] Empty state uses EmptyState wizard pattern

### 3.6 Typography audit (NEW)

- [ ] No font sizes outside the 7-step scale
- [ ] No font weights outside 400/500/600
- [ ] Numeric columns use `tabular-nums`
- [ ] No `font-bold` in body text
- [ ] No `font-light` or `font-thin` anywhere

### 3.7 Spacing audit (NEW)

- [ ] No arbitrary `p-[Npx]`, `m-[Npx]`, `gap-[Npx]` values
- [ ] Card padding is `p-6` (comfortable) or `p-4` (compact)
- [ ] Section gaps are `gap-6` to `gap-12`
- [ ] Within-component gaps are `gap-1` to `gap-4`

### 3.8 Accessibility audit (NEW)

- [ ] All interactive elements are keyboard-navigable
- [ ] All form inputs have associated labels (`htmlFor` or `FormField` wrapper)
- [ ] All images/icons have `alt` text or `aria-label`
- [ ] Color is never the sole indicator (icon + color or text + color)
- [ ] Error pages include `role="alert"`
- [ ] Dialogs have `DialogTitle` (required by Radix for `aria-labelledby`)
- [ ] Text contrast >= 4.5:1 (normal) or >= 3:1 (large/UI components)

---

## 4) Definition of Done (DoD)

A UI PR is ready when:

1. **3-second test** passes on all changed pages
2. **Exactly 1 primary CTA** per view (not 0, not 2+)
3. **All components** have states: default / hover / focus / disabled / loading / error / empty
4. **Empty state** = wizard pattern (title + reason + steps + CTA)
5. **KPI tiles** are actionable (link, tooltip, or onClick)
6. **Trust bar** present and accurate (Control Tower pages)
7. **Components** match selection matrix
8. **`npm run lint`** passes (design:audit + ui:consistency)
9. **No raw colors** in any code
10. **No arbitrary spacing/typography/shadow** values outside defined scales
11. **Motion** follows `MOTION_GUIDELINES.md`
12. **Touch targets** >= 44x44px for all interactive elements
13. **WCAG AA** contrast verified
14. **Keyboard navigation** works for all interactive flows
15. **`lang="ru"`** on `<html>` element

---

## 5) Verification Commands

```bash
# Run all quality gates
cd web && npm run lint

# Run only UI consistency check
cd web && npm run ui:consistency

# Run only design audit
cd web && npm run design:audit

# Run e2e tests (mocked API)
cd web && npm run test:e2e

# Run e2e tests (full stack)
cd web && npm run test:e2e:integration
```

---

## 6) Related Documents

- Design tokens: [`DESIGN_SYSTEM_2026.md`](./DESIGN_SYSTEM_2026.md)
- Control Tower: [`DESIGN_SYSTEM_CONTROL_TOWER.md`](./DESIGN_SYSTEM_CONTROL_TOWER.md)
- Component selection: [`COMPONENT_SELECTION.md`](./COMPONENT_SELECTION.md)
- Motion: [`MOTION_GUIDELINES.md`](./MOTION_GUIDELINES.md)
