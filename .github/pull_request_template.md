## Summary

<!-- 1-3 bullet points describing what changed and why -->

## UI Checklist

> Required for any PR that touches `web/` UI code. Skip if backend-only.

### Component selection ([COMPONENT_SELECTION.md](../web/COMPONENT_SELECTION.md))
- [ ] Boolean controls use Switch/Checkbox (not Select or Dropdown)
- [ ] DropdownMenu used only for actions (not state/mode/view selection)
- [ ] Dialog used only for confirmation/destructive (not reading content)
- [ ] Sheet/Drawer used for context, evidence, details (not Dialog)
- [ ] StatusChip used for all status displays (no ad-hoc Badge colors)
- [ ] EmptyState uses wizard pattern (title + reason + steps + CTA)

### Control Tower ([DESIGN_SYSTEM_CONTROL_TOWER.md](../web/DESIGN_SYSTEM_CONTROL_TOWER.md))
- [ ] Hero panel present with `data-testid="ct-hero"`
- [ ] Exactly 1 primary CTA with `data-testid="primary-cta"`
- [ ] Trust bar visible with `data-testid="trust-bar"`
- [ ] Empty states are wizards with `data-testid="empty-wizard"`

### Design system ([DESIGN_SYSTEM_2026.md](../web/DESIGN_SYSTEM_2026.md))
- [ ] No raw colors in `web/features/**` (use semantic tokens)
- [ ] No one-off style objects or ad-hoc spacing
- [ ] Typography follows scale: text-xs / text-sm / text-base / text-2xl
- [ ] Motion follows MOTION_GUIDELINES.md (anime.js tokens only)

### Quality gates
- [ ] `npm run lint` passes (design:audit + ui:consistency)
- [ ] `npm run build` passes
- [ ] E2E tests pass if UI changed

## Test plan

<!-- How to verify this change works correctly -->
