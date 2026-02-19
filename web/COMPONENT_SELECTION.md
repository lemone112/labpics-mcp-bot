# Component Selection Policy

> Normative document. All UI changes must follow this matrix.
> Prevents common AI/developer errors: wrong component for the task.

---

## 1) Decision Matrix

| Task | Correct Component | Wrong Choice | Why wrong |
|------|-------------------|-------------|-----------|
| Boolean on/off | `Switch` | `Select`, `DropdownMenu` | Boolean has 2 states — toggle is the natural control |
| Boolean with label | `Checkbox` | `Select` with true/false items | Same — checkbox is the boolean primitive |
| Multi-select (flags) | `Checkbox` group | `Switch` per item | Switch implies mode, checkbox implies selection |
| Enum 3–5 options | `Tabs` or `Select` | `DropdownMenu` | Dropdown is for actions, not state selection |
| Enum 6–20 options | `Select` | `DropdownMenu` | Dropdown doesn't show current selection |
| Actions list | `DropdownMenu` | `Select` | Select implies "pick a value", dropdown implies "do something" |
| Confirm destructive | `Dialog` | `Sheet`/`Drawer` | Dialogs block and focus; destruction needs explicit confirmation |
| Context / evidence / details | `Sheet` / `Drawer` | `Dialog` | Long scrollable content needs a panel, not a modal |
| Status display | `StatusChip` | `Badge` with ad-hoc colors | StatusChip encodes semantic intent consistently |
| Metric display | `StatTile` | Raw `<div>` with custom styles | StatTile ensures consistent density and tokens |
| Empty section | `EmptyState` (wizard) | Bare `<p>` text | EmptyState provides reason + steps + CTA |

---

## 2) Hard Rules

### 2.1 Boolean Rule

If the value is boolean (`true`/`false`, on/off, enabled/disabled):
- **Use:** `Switch` or `Checkbox`
- **Never:** `Select`, `DropdownMenu`, or radio buttons with 2 options

```jsx
// CORRECT
<Switch checked={enabled} onCheckedChange={setEnabled} />

// WRONG — boolean as Select
<Select value={String(enabled)} onValueChange={v => setEnabled(v === "true")}>
  <SelectItem value="true">Включено</SelectItem>
  <SelectItem value="false">Выключено</SelectItem>
</Select>
```

### 2.2 Dropdown is Actions Only

`DropdownMenu` is for performing actions, not for selecting state/mode/view.

```jsx
// CORRECT — actions
<DropdownMenu>
  <DropdownMenuItem onClick={handleEdit}>Редактировать</DropdownMenuItem>
  <DropdownMenuItem onClick={handleDelete}>Удалить</DropdownMenuItem>
</DropdownMenu>

// WRONG — state selection via dropdown
<DropdownMenu>
  <DropdownMenuItem onClick={() => setView("all")}>Все</DropdownMenuItem>
  <DropdownMenuItem onClick={() => setView("failed")}>Только ошибки</DropdownMenuItem>
</DropdownMenu>
// Should be: <Tabs> or <Select>
```

### 2.3 Dialog is Confirm Only

`Dialog` is for confirmation and destructive warnings. Not for reading content.

```jsx
// CORRECT — destructive confirmation
<Dialog>
  <DialogTitle>Удалить проект?</DialogTitle>
  <DialogDescription>Это действие необратимо.</DialogDescription>
  <Button variant="destructive">Удалить</Button>
</Dialog>

// WRONG — reading evidence in Dialog
<Dialog>
  <DialogTitle>Детали риска</DialogTitle>
  <div className="max-h-[400px] overflow-y-auto">
    {/* long scrollable evidence list */}
  </div>
</Dialog>
// Should be: <Drawer> or <Sheet side="right">
```

### 2.4 Sheet/Drawer for Context

Everything that is long, scrollable, or contextual goes into `Sheet` or `Drawer`.

- Evidence details
- Message threads
- Risk analysis breakdown
- Action history

---

## 3) Corner Cases (where AI typically errs)

| Scenario | AI mistake | Correct approach |
|----------|-----------|-----------------|
| "View: All / Failed / Pending" filter | DropdownMenu with state items | `Tabs` or `Select` |
| "On / Off" toggle | Select with 2 options | `Switch` |
| "Period: 7d / 30d / 90d" | DropdownMenu | `Select` or `Tabs` |
| "Density: Compact / Comfortable" | DropdownMenu | `Select` |
| Evidence panel | Dialog with scroll | `Sheet side="right"` |
| "Are you sure?" before delete | Sheet | `Dialog` with destructive button |
| Status badge for risk | `Badge className="bg-chart-4"` | `StatusChip status="warning"` or severity intent class |
| Empty list | `<p>Не найдено</p>` | `<EmptyState>` with wizard pattern |
| 100% sync but empty data | Show "100%" with no explanation | Add tooltip: "Sync complete, but no data for this period" |

---

## 4) When to Extend the System

If none of the existing components fit:

1. Check [`DESIGN_SYSTEM_2026.md`](./DESIGN_SYSTEM_2026.md) — is there a primitive you missed?
2. Check [shadcn/ui docs](https://ui.shadcn.com/docs) — is there a standard component?
3. If truly new: create in `components/ui/`, define loading/empty/error states, document variant props.

**Never** create one-off styled divs in `features/**` when a system component exists.

---

## 5) Related Documents

- Design tokens: [`DESIGN_SYSTEM_2026.md`](./DESIGN_SYSTEM_2026.md)
- Control Tower structure: [`DESIGN_SYSTEM_CONTROL_TOWER.md`](./DESIGN_SYSTEM_CONTROL_TOWER.md)
- Quality gates: [`QUALITY_GATES_UI.md`](./QUALITY_GATES_UI.md)
