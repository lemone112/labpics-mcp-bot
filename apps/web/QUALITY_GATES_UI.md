# UI Quality Gates

> Automated and manual checks that block merge of UI changes.
> Run via `npm run lint` (design:audit + ui:consistency).

---

## 1) Automated Checks (`npm run ui:consistency`)

The script `web/scripts/ui-consistency-check.mjs` enforces:

### 1.1 File existence (existing)

All required pages, components, and config files must exist.

### 1.2 Boolean-in-Select detector

**Fails on:** `SelectItem` with `value="true"` or `value="false"` in any `.jsx`/`.tsx` file.

```
ERROR: Boolean value in Select (line 42 in features/settings/page.jsx)
  → Use Switch or Checkbox for boolean controls. Select is for enums.
```

### 1.3 DropdownMenu-as-state-picker detector

**Fails on:** `DropdownMenuItem` with `onClick` handlers that contain state-setting keywords
(`period`, `mode`, `view`, `density`, `filter`, `sort`, `range`, `interval`).

```
ERROR: DropdownMenu used as state picker (line 18 in features/analytics/filters.jsx)
  → DropdownMenu is for actions only. Use Select or Tabs for state selection.
```

### 1.4 Raw color detector (features only)

**Fails on:** Raw Tailwind color classes in `web/features/**/*.jsx`:
- `text-red-*`, `bg-red-*`, `border-red-*`
- `text-blue-*`, `bg-blue-*`, `border-blue-*`
- `text-green-*`, `bg-green-*`, `border-green-*`
- `text-yellow-*`, `bg-yellow-*`, `border-yellow-*`
- `text-orange-*`, `bg-orange-*`, `border-orange-*`
- `text-gray-*`, `bg-gray-*`, `border-gray-*`

```
ERROR: Raw color class in feature code (line 33 in features/crm/account-card.jsx)
  → Use semantic classes: bg-destructive, text-warning, border-primary, etc.
```

### 1.5 Chart-color-as-status detector

**Fails on:** `chart-*` classes used inside Badge/StatusChip-like patterns
(adjacent to status/severity/probability keywords) in `web/features/**/*.jsx`.

```
ERROR: Chart color used for status semantics (line 94 in features/control-tower/section-page.jsx)
  → Use StatusChip intents or semantic status classes (destructive, warning, success).
```

---

## 2) Manual Checks (PR review)

### 2.1 Three-second test

Open each changed page. In 3 seconds, you must be able to answer:
- Where am I?
- What's important?
- What should I do?

If any answer is unclear → rework.

### 2.2 Component selection audit

For every UI control in the diff, verify against [`COMPONENT_SELECTION.md`](./COMPONENT_SELECTION.md):
- [ ] Boolean → Switch/Checkbox (not Select/Dropdown)
- [ ] Actions → DropdownMenu (not Select)
- [ ] Confirm destructive → Dialog (not Sheet)
- [ ] Context/details → Sheet/Drawer (not Dialog)
- [ ] Status → StatusChip (not Badge with ad-hoc colors)
- [ ] Empty → EmptyState wizard (not bare text)

### 2.3 Control Tower structure

For changes to `/control-tower/*`:
- [ ] Hero panel present with `data-testid="ct-hero"`
- [ ] Exactly 1 primary CTA with `data-testid="primary-cta"`
- [ ] Trust bar present with `data-testid="trust-bar"`
- [ ] Empty states use wizard pattern with `data-testid="empty-wizard"`

---

## 3) Definition of Done (DoD)

A UI PR is ready when:

1. **3-second test** passes on all changed pages
2. **Exactly 1 primary CTA** per page (not 0, not 2+)
3. **All modules** have states: loading / empty / error / success
4. **Empty state** = wizard (title + reason + steps + CTA)
5. **KPI tiles** are actionable or replaced with setup tile
6. **Trust bar** present and accurate
7. **Components** match selection matrix
8. **`npm run lint`** passes (design:audit + ui:consistency)
9. **No raw colors** in feature code
10. **Motion** follows MOTION_GUIDELINES.md

---

## 4) Verification Commands

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

## 5) Related Documents

- Design tokens: [`DESIGN_SYSTEM_2026.md`](./DESIGN_SYSTEM_2026.md)
- Control Tower: [`DESIGN_SYSTEM_CONTROL_TOWER.md`](./DESIGN_SYSTEM_CONTROL_TOWER.md)
- Component selection: [`COMPONENT_SELECTION.md`](./COMPONENT_SELECTION.md)
