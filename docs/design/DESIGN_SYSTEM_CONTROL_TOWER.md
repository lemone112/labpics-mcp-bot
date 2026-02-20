# Control Tower — Design System Extension

> Normative supplement to `DESIGN_SYSTEM_2026.md`.
> Defines mandatory page structure, component contracts, and empty-state standards
> specific to Control Tower sections (`/control-tower/*`).

---

## 1) Page Skeleton (mandatory for every section)

Every Control Tower section must render these blocks **in order**:

```
PageShell (title + subtitle — already exists)
  └── HeroPanel [data-testid="ct-hero"]
        ├── Highlights (3–5 StatTiles, each links to detail)
        ├── Primary CTA [data-testid="primary-cta"] (exactly 1 Button variant="default")
        └── TrustBar [data-testid="trust-bar"]
              ├── LastUpdated (timestamp + relative)
              ├── Sources (connector chips)
              ├── Coverage / data-health (coarse %)
              └── Errors (count + "details" link)
  └── Work Surface
        ├── Top items (3–12)
        └── View all → list/table or progressive disclosure via Sheet/Drawer
```

### 1.1 Hero Panel rules

- **Always** the first meaningful block after subtitle.
- **Highlights** use `StatTile` — each tile should be actionable (link, tooltip, or onClick).
- **Primary CTA** — exactly 1 per section. Variant `default`. Examples:
  - Dashboard: "Синхронизировать" / "Подключить источник"
  - Messages: "Запустить дайджест" / "Подключить Chatwoot"
  - Agreements: "Запустить извлечение"
  - Risks: "Запустить сканирование"
  - Finance: "Подключить Attio" / "Сгенерировать отчёт"
  - Offers: "Создать оффер"
- **No section may have 0 or 2+ primary CTA buttons.**

### 1.2 Trust Bar rules

- Always visible below highlights.
- Must show: last updated time, source names, coverage/health, error count.
- If sync completeness ≥ 95% but data is sparse (< 5 items), show explain tooltip:
  > "100% = все задачи синхронизации завершились успешно, но за выбранный период данных мало."

---

## 2) Empty State Standard (wizard, not "не найдено")

When a section has no data, render `<EmptyState variant="wizard">`:

```jsx
<EmptyState
  data-testid="empty-wizard"
  title="Риски"
  reason="Сканирование рисков ещё не запускалось."
  steps={["Подключите источники данных", "Запустите синхронизацию", "Дождитесь анализа"]}
  primaryAction={<Button>Запустить сканирование</Button>}
  secondaryAction={<Button variant="ghost">Открыть интеграции</Button>}
/>
```

### Requirements:

| Field | Required | Purpose |
|-------|----------|---------|
| `title` | yes | What this section is about |
| `reason` | yes | Why it's empty |
| `steps` | yes (2–3) | What user should do |
| `primaryAction` | yes | Exactly 1 Button default |
| `secondaryAction` | no | Ghost/outline, optional |

### Prohibited empty states:

```jsx
// BAD: bare text without guidance
<p className="text-sm text-muted-foreground">Риски не найдены.</p>

// BAD: empty chart card dominating the screen
<ChartNoData message="Нет данных" />  // without any CTA

// BAD: generic "Данных пока нет" without reason
<EmptyState title="Данных пока нет" />
```

---

## 3) Chart Policy

### 3.1 Each chart answers one question

Chart titles must be phrased as questions or clear statements:
- "Как менялся индекс здоровья?" (✓)
- "Индекс здоровья проекта" (✓ — implicit question)

### 3.2 No-data state

When chart has no data:
- Show compact `ChartNoData` **inside the card** (not replacing it).
- Include CTA: "Подключить источник" / "Запустить синхронизацию" / "Изменить период".
- Chart card must **not dominate** the screen when empty — keep same height as populated.

### 3.3 Color separation

| Use case | Allowed palette | Prohibited |
|----------|----------------|------------|
| Chart series/bars | `chart-1` through `chart-5`, `primary`, `destructive` | Status intent colors for data series |
| Status badges | `StatusChip` intents (`success`, `warning`, `destructive`, `primary`) | `chart-*` colors for status meaning |
| Risk severity | Dedicated severity classes (see section 4) | `chart-2`, `chart-4`, `chart-5` as severity levels |

---

## 4) Status & Severity Coloring

### 4.1 Use StatusChip for all statuses

Any badge that represents a status/state must use `<StatusChip status="...">`.
Never create inline `className` with `chart-*` colors for status meaning.

### 4.2 Risk severity intents

Instead of mapping severity to chart colors, use semantic classes:

| Severity | Intent | Class pattern |
|----------|--------|---------------|
| Critical (≥5) | destructive | `border-destructive/35 bg-destructive/10 text-destructive` |
| High (4) | warning | `border-warning/30 bg-warning/10 text-warning` |
| Medium (3) | muted-warning | `border-warning/20 bg-warning/5 text-warning` |
| Low (≤2) | neutral | `border-border bg-muted text-muted-foreground` |

### 4.3 Probability intents

| Probability | Intent | Class pattern |
|-------------|--------|---------------|
| ≥70% | destructive | `border-destructive/35 bg-destructive/10 text-destructive` |
| 40–69% | warning | `border-warning/30 bg-warning/10 text-warning` |
| <40% | neutral | `border-border bg-muted text-muted-foreground` |

---

## 5) Section Matrix (6 sections — "how it should be")

| Section | Hero highlights | Primary CTA | Empty wizard reason |
|---------|----------------|-------------|---------------------|
| Dashboard | Active projects, messages 7d, open risks, sync % | Sync now / Connect | "Подключите источники данных" |
| Messages | New messages, selected person, digest status | Run digest / Connect Chatwoot | "Нет подключённых источников сообщений" |
| Agreements | New agreements, need review, last extraction | Run extraction | "Извлечение договорённостей не запускалось" |
| Risks | Top risks, missing evidence, last scan | Run scan | "Сканирование рисков ещё не запускалось" |
| Finance | Pipeline, anomalies, last updated | Connect CRM / Generate report | "Подключите Attio для финансовых данных" |
| Offers | Pending approvals, upsell opps, templates | Create offer | "Нет офферов для отображения" |

---

## 6) data-testid Convention

| Attribute | Where | Purpose |
|-----------|-------|---------|
| `ct-hero` | Hero panel wrapper div | E2E: verify hero exists |
| `primary-cta` | The one primary CTA button | E2E: verify exactly 1 |
| `trust-bar` | Trust bar wrapper | E2E: verify trust layer |
| `empty-wizard` | EmptyState wizard variant | E2E: verify wizard pattern |

---

## 7) Related Documents

- Design tokens: [`DESIGN_SYSTEM_2026.md`](./DESIGN_SYSTEM_2026.md)
- Motion: [`MOTION_GUIDELINES.md`](./MOTION_GUIDELINES.md)
- Component selection: [`COMPONENT_SELECTION.md`](./COMPONENT_SELECTION.md)
- Quality gates: [`QUALITY_GATES_UI.md`](./QUALITY_GATES_UI.md)
