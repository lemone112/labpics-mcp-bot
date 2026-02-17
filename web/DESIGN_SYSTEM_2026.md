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
