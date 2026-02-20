# Visual Design Audit — Phase 3 Preparation

> Дата: 2026-02-20
> Автор: Visual Design Specialist Agent
> Цель: подготовительный аудит перед Phase 3 (Iter 21, 20.5, 23)

---

## 1. Инвентаризация компонентов (shadcn/ui)

### 1.1 Установленные компоненты

Путь: `apps/web/components/ui/`

| Компонент | Файл | Тип | Статус |
|-----------|------|-----|--------|
| Alert | `alert.jsx` | shadcn стандарт | Установлен |
| Badge | `badge.jsx` | shadcn стандарт | Установлен |
| Breadcrumb | `breadcrumb.jsx` | shadcn стандарт | Установлен |
| Button | `button.jsx` | shadcn + loading prop | Установлен, расширен |
| Card | `card.jsx` | shadcn стандарт | Установлен |
| Chart | `chart.jsx` | shadcn chart wrapper (Recharts) | Установлен |
| Checkbox | `checkbox.jsx` | shadcn стандарт (Radix) | Установлен |
| Dialog | `dialog.jsx` | shadcn стандарт (Radix) | Установлен |
| Drawer | `drawer.jsx` | shadcn стандарт | Установлен |
| DropdownMenu | `dropdown-menu.jsx` | shadcn стандарт (Radix) | Установлен |
| Input | `input.jsx` | shadcn стандарт | Установлен |
| Label | `label.jsx` | shadcn стандарт (Radix) | Установлен |
| Pagination | `pagination.jsx` | shadcn стандарт | Установлен |
| Select | `select.jsx` | shadcn стандарт (Radix) | Установлен |
| Separator | `separator.jsx` | shadcn стандарт (Radix) | Установлен |
| Sheet | `sheet.jsx` | shadcn стандарт | Установлен |
| Sidebar | `sidebar.jsx` | shadcn стандарт | Установлен |
| Skeleton | `skeleton.jsx` | shadcn + anime.js shimmer | Установлен, расширен |
| Switch | `switch.jsx` | shadcn стандарт (Radix) | Установлен |
| Table | `table.jsx` | shadcn стандарт | Установлен |
| Tooltip | `tooltip.jsx` | shadcn стандарт (Radix) | Установлен |

### 1.2 Кастомные компоненты (расширения дизайн-системы)

| Компонент | Файл | Назначение |
|-----------|------|------------|
| EmptyState | `empty-state.jsx` | Wizard-паттерн: title + reason + steps + CTA |
| Filters | `filters.jsx` | Панель фильтрации с trailing controls |
| FormField | `form-field.jsx` | Обёртка для form fields |
| InboxList | `inbox-list.jsx` | Потоковый список сообщений/сигналов |
| Kanban | `kanban.jsx` | Канбан-доска (стадии сделок) |
| LastUpdatedIndicator | `last-updated-indicator.jsx` | Временная метка + кнопка обновления |
| MotionGroup | `motion-group.jsx` | Staggered reveal (anime.js) |
| NavBadge | `nav-badge.jsx` | Бейдж для навигации (sidebar counts) |
| PageLoadingSkeleton | `page-loading-skeleton.jsx` | Full-page skeleton entrance |
| SkeletonBlock | `skeleton-block.jsx` | Блочный скелетон |
| StatTile | `stat-tile.jsx` | KPI-плитка (loading, trend, delta, actionLabel) |
| StatusChip | `status-chip.jsx` | Семантический статус (22 статуса) |
| Toast | `toast.jsx` | Inline banner + stacked notifications |
| InsightTile | `insight-tile.jsx` | Insight-карточка (sparkline, trend, severity, CTA) |

### 1.3 Отсутствующие компоненты (нужны для полноценного SaaS dashboard)

| Компонент | Приоритет | Обоснование |
|-----------|-----------|-------------|
| Tabs | P0 | Нужен для переключения view/period (Iter 21). Сейчас вместо Tabs используется Select или DropdownMenu, что нарушает COMPONENT_SELECTION.md |
| Avatar | P1 | Нужен для multi-user (Owner/PM roles, Wave 3). Отображение пользователей в sidebar, CRM |
| Progress | P1 | Нужен для sync progress, budget burn визуализации, setup wizard steps |
| Textarea | P1 | Нужен для комментариев, notes, custom messages |
| ScrollArea | P1 | Нужен для контролируемого скролла в Sheet/Drawer, длинных списках |
| Popover | P1 | Нужен для inline-подсказок, filter pickers, date range selection |
| Calendar / DatePicker | P1 | Нужен для выбора периодов аналитики (Iter 20.5 charts) |
| RadioGroup | P2 | Нужен для enum 3-5 options (альтернатива Tabs в формах) |
| Collapsible | P2 | Нужен для складных секций (FAQ, risk details) |
| Slider | P2 | Нужен для range filters, threshold настроек |
| Toggle / ToggleGroup | P2 | Нужен для compact mode switching, density controls |
| Accordion | P2 | Нужен для FAQ, settings grouping |
| Command | P0 | Нужен для Cmd+K command palette (Iter 21.12) |
| Sonner (toast upgrade) | P2 | Текущий toast — кастомный; рассмотреть shadcn/sonner для стандартизации |

---

## 2. Инвентаризация графиков и визуализаций

### 2.1 Библиотека

- **Recharts** v3.7.0 (`recharts` в package.json)
- Обёртка: `components/ui/chart.jsx` (ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent)
- Пустое состояние: `features/control-tower/sections/chart-no-data.jsx` (ChartNoData)

### 2.2 Используемые типы графиков

| Тип | Компонент Recharts | Где используется | Количество |
|-----|-------------------|------------------|------------|
| AreaChart | `<AreaChart>` + `<Area>` | dashboard-charts.jsx (здоровье, burn vs budget) | 2 |
| BarChart | `<BarChart>` + `<Bar>` | dashboard-charts.jsx (скорость, договорённости, апсейл), finance-section.jsx (выручка, затраты, маржа, прогноз, план/факт, юнит-экономика) | 9 |
| LineChart | `<LineChart>` + `<Line>` | dashboard-charts.jsx (просрочки, отзывчивость, риски, синхронизация), finance-section.jsx (burn rate) | 5 |
| PieChart | `<PieChart>` + `<Pie>` | finance-section.jsx (воронка стадий) | 1 |
| **Итого** | | | **17 графиков** |

### 2.3 Отсутствующие типы графиков (рекомендации ui-ux-pro-max)

| Тип | Когда нужен | Рекомендация |
|-----|-------------|--------------|
| Sparkline (SVG) | KPI-плитки, InsightTile | **Уже реализован** в `insight-tile.jsx` как inline SVG. Не использует Recharts |
| Radar / Spider Chart | Сравнение проектов по нескольким метрикам | Подходит для multi-variable comparison (5-8 осей) |
| Funnel Chart | Воронка продаж (вместо PieChart) | ui-ux-pro-max рекомендует Funnel вместо Pie для воронки стадий |
| Stacked Area | Сравнение burn vs budget over time | Уже частично используется (AreaChart с fillOpacity) |
| Waterfall | Cash flow, budget adjustments | Нужен для детального финансового анализа |

### 2.4 Расположение графиков в кодовой базе

```
apps/web/features/control-tower/sections/
  dashboard-charts.jsx    — 9 графиков + 4 StatTile
  finance-section.jsx     — 8 графиков + 6 StatTile + PieChart
  chart-no-data.jsx       — компонент пустого состояния

apps/web/components/ui/
  chart.jsx               — ChartContainer wrapper (Recharts)
  stat-tile.jsx           — KPI плитка
  insight-tile.jsx        — Insight карточка со Sparkline
```

### 2.5 Проблемы графиков (выявленные)

| # | Проблема | Файл | Серьёзность |
|---|----------|------|-------------|
| C1 | PieChart для воронки — плохая практика (>5 сегментов, плохая accessibility) | `finance-section.jsx:166` | High |
| C2 | Нет CTA в ChartNoData (часть empty states без actionable CTA) | `dashboard-charts.jsx` (6 из 9 ChartNoData без `action`) | Medium |
| C3 | Использование `hsl(var(--...))` — требует двойного wrapping для Recharts | Все chart файлы | Low (работает, но неудобно) |
| C4 | Нет responsive dimension system (все графики 240px фиксированно) | `chart.jsx:25` | High |
| C5 | PieChart без легенды | `finance-section.jsx:166-169` | Medium |
| C6 | Нет sparkline-интеграции в StatTile для dashboard overview | `stat-tile.jsx` | Medium |

---

## 3. Валидация дизайн-токенов

### 3.1 Спецификация (DESIGN_SYSTEM_2026.md) vs реализация (globals.css)

#### Семантические поверхности

| Токен | Спецификация | Light Mode | Dark Mode | Статус |
|-------|-------------|------------|-----------|--------|
| `--background` | Surface: background | `#fcfcfc` | `#0a0a0a` | OK |
| `--card` | Surface: card | `#ffffff` | `#111111` | OK |
| `--popover` | Surface: popover | `#ffffff` | `#111111` | OK |
| `--foreground` | Text: primary | `#171717` | `#fafafa` | OK |

#### Акцентные цвета

| Токен | Light Mode | Dark Mode | Контраст Light (WCAG) | Статус |
|-------|------------|-----------|----------------------|--------|
| `--primary` | `#2563eb` (blue-600) | `#60a5fa` (blue-400) | 4.6:1 на white | OK (AA) |
| `--destructive` | `#e5484d` | `#ff6369` | 3.7:1 на white | WARN (AA для текста требует 4.5:1) |
| `--success` | `#059669` | `#34d399` | 3.8:1 на white | WARN (AA для текста требует 4.5:1) |
| `--warning` | `#d97706` | `#fbbf24` | 3.1:1 на white | FAIL (AA не проходит) |

#### Дополнительные токены (отсутствующие в стандартном shadcn)

| Токен | Назначение | Реализован | Статус |
|-------|-----------|------------|--------|
| `--success` / `--success-foreground` | Semantic success | Да | OK (кастомное расширение) |
| `--warning` / `--warning-foreground` | Semantic warning | Да | OK (кастомное расширение) |
| `--shadow-subtle/card/floating/modal` | Elevation system | Да | OK |
| `--selection` | Text selection color | Да | OK |
| `--chart-1` .. `--chart-5` | Chart palette | Да | OK |
| `--sidebar-*` (8 tokens) | Sidebar theming | Да | OK |

#### Радиусы

| Токен | Значение | Статус |
|-------|----------|--------|
| `--radius` | `0.5rem` (8px) | OK |
| `--radius-sm` | `calc(var(--radius) - 4px)` = 4px | OK |
| `--radius-md` | `calc(var(--radius) - 2px)` = 6px | OK |
| `--radius-lg` | `var(--radius)` = 8px | OK |
| `--radius-xl` | `calc(var(--radius) + 4px)` = 12px | OK |
| `--radius-2xl` | `calc(var(--radius) + 8px)` = 16px | OK |
| `--radius-3xl` | `calc(var(--radius) + 12px)` = 20px | OK |
| `--radius-4xl` | `calc(var(--radius) + 16px)` = 24px | OK |

### 3.2 Соответствие спецификации

| Категория | Спецификация (DESIGN_SYSTEM_2026.md) | Реализация | Вердикт |
|-----------|--------------------------------------|------------|---------|
| Поверхности (background/card/popover) | Определены | Реализованы | OK |
| Границы (border/input) | Определены | Реализованы | OK |
| Акценты (primary/secondary/accent) | Определены | Реализованы | OK |
| Алерты (destructive) | Определены | Реализованы + success + warning | OK (расширен) |
| Chart palette (chart-1..5) | Не упомянуты в спецификации | Реализованы в CSS | GAP: нет в спецификации |
| Z-index scale | Определена (z-10/20/50/60/70/80/90) | Реализована в компонентах | OK |
| Shadows (elevation) | Не в базовой спецификации | Реализованы 4 уровня | OK |
| Typography scale | Определена (xs/sm/base/2xl) | Используется через Tailwind | OK |

### 3.3 Выявленные расхождения

| # | Расхождение | Серьёзность | Рекомендация |
|---|-------------|-------------|--------------|
| T1 | `--destructive` light (#e5484d) не проходит WCAG AA для мелкого текста (3.7:1, требуется 4.5:1) | High | Затемнить до ~#d13438 или использовать только для backgrounds/badges |
| T2 | `--success` light (#059669) не проходит WCAG AA для мелкого текста (3.8:1) | High | Затемнить до ~#047857 |
| T3 | `--warning` light (#d97706) не проходит WCAG AA (3.1:1) | Critical | Затемнить до ~#b45309 или использовать только для фонов |
| T4 | Chart palette (chart-1..5) не документирована в DESIGN_SYSTEM_2026.md | Medium | Добавить секцию "Chart Tokens" в спецификацию |
| T5 | Shadow tokens не документированы в DESIGN_SYSTEM_2026.md | Low | Добавить секцию "Elevation System" |
| T6 | Шрифт Geist Sans/Mono используется в коде, но DESIGN_SYSTEM_2026.md не фиксирует выбор шрифта | Medium | Зафиксировать font stack в спецификации |
| T7 | ui-ux-pro-max рекомендует Fira Code/Fira Sans для dashboards, а проект использует Geist — это осознанный выбор, но стоит задокументировать обоснование | Low | Информационно |

---

## 4. Рекомендации ui-ux-pro-max

### 4.1 Общие рекомендации дизайн-системы

**Стиль:** Flat Design
- 2D, минимализм, bold colors, no shadows, clean lines
- Лучше всего подходит для: Web apps, SaaS, dashboards
- Производительность: Excellent
- Доступность: WCAG AAA потенциал

**Цветовая палитра (для project management SaaS):**
- Рекомендация: Micro SaaS palette — `#6366F1` (indigo primary) + `#10B981` (emerald CTA)
- Текущий выбор (`#2563eb` blue primary) — валиден, согласуется с trust blue для dashboard
- Альтернатива dark mode: Financial Dashboard palette (`#0F172A` bg + `#22C55E` green indicators)

**Типографика:**
- Рекомендация 1: Fira Code + Fira Sans (dashboard, data, analytics)
- Рекомендация 2: Plus Jakarta Sans (friendly SaaS, modern alternative to Inter)
- Рекомендация 3: Space Grotesk + DM Sans (tech startup)
- Текущий выбор: Geist Sans + Geist Mono — хороший выбор для SaaS, современный шрифт от Vercel, хорошо сочетается с Next.js ecosystem

### 4.2 Рекомендации по графикам

| Тип данных | Рекомендуемый тип | Текущий тип | Соответствие |
|-----------|-------------------|-------------|--------------|
| Trend over time (здоровье, burn) | Line/Area Chart | AreaChart | OK |
| Compare categories (выручка по проектам) | Bar Chart | BarChart | OK |
| Part-to-whole (воронка стадий) | Funnel / Stacked Bar | PieChart | ПРОБЛЕМА |
| Multi-series comparison (burn vs budget) | Area Chart | AreaChart | OK |
| Risk dynamics | Line Chart | LineChart | OK |
| Velocity (задачи) | Bar Chart | BarChart | OK |

### 4.3 Pre-delivery checklist (из ui-ux-pro-max)

- [ ] Нет эмодзи как иконок (используются SVG: Lucide) — **ПРОХОДИТ**
- [ ] `cursor-pointer` на всех кликабельных элементах — **ПРОХОДИТ** (Button, StatTile, InsightTile)
- [ ] Hover states с плавными transitions (150-300ms) — **ПРОХОДИТ** (через Tailwind `transition-colors`)
- [ ] Light mode: контраст текста 4.5:1 минимум — **ЧАСТИЧНО** (T1, T2, T3)
- [ ] Focus states видимы для keyboard nav — **ПРОХОДИТ** (`focus-visible:ring-1 focus-visible:ring-ring`)
- [ ] `prefers-reduced-motion` respected — **ПРОХОДИТ** (globals.css + motionEnabled() + useReducedMotion())
- [ ] Responsive: 375px, 768px, 1024px, 1440px — **НЕ ПОЛНОСТЬЮ ПРОВЕРЕНО** (нужен Iter 23)

### 4.4 UX-рекомендации

- **Z-Index Management:** Определена чёткая scale (10/20/50/60/70/80/90). Произвольных z-index значений не обнаружено.
- **Memoized Components:** Графические секции используют `memo()` — правильно.
- **Dynamic Imports:** chart-секции загружаются через dynamic import (`section-page.jsx:27`) — правильно для bundle size.

---

## 5. Gap-анализ для Phase 3

### 5.1 Iter 21 — Page-Level Redesign (12 задач)

| Задача | Готовность инфраструктуры | Что не хватает |
|--------|--------------------------|----------------|
| 21.1 Break section-page.jsx monolith | Компоненты готовы | — |
| 21.2 Action Queue page | EmptyState, Table, Filters готовы | Tabs компонент не установлен |
| 21.3 Guided setup flow | EmptyState wizard готов | Progress bar отсутствует |
| 21.4 Redesign Dashboard section | StatTile, Chart, InsightTile готовы | — |
| 21.5 Redesign Messages section | InboxList, Filters готовы | — |
| 21.6 Redesign Agreements section | Table, StatusChip готовы | — |
| 21.7 Redesign Risks section | StatusChip, severity intents определены | — |
| 21.8 Redesign Finance section | Chart, StatTile готовы | PieChart нужно заменить на Funnel |
| 21.9 Redesign Offers section | Kanban, StatusChip готовы | — |
| 21.10 Navigation badges | NavBadge готов | — |
| 21.11 Client-centric view | ClientProfileCard, ClientTimeline уже начаты | Avatar компонент нужен |
| 21.12 Cmd+K command palette | CommandSearch.jsx существует | Command (shadcn/cmdk) не установлен |

### 5.2 Iter 20.5 — Charts & Data Visualization (12 задач)

| Задача | Готовность | Что не хватает |
|--------|-----------|----------------|
| 20.5.1 Audit all chart usages | **Выполнен в данном отчёте** | — |
| 20.5.2 Chart type selection matrix | Частично (ui-ux-pro-max дал рекомендации) | Нужно формализовать и зафиксировать |
| 20.5.3 Chart card composition spec | ChartContainer + Card pattern определён | Нет стандартизированного шаблона card composition |
| 20.5.4 Chart dimension system | Отсутствует (все 240px) | Нужна responsive система: compact/standard/detailed |
| 20.5.5 Fix chart internal spacing | Не проверено визуально | Нужен визуальный аудит |
| 20.5.6 Chart type migrations | PieChart → Funnel выявлен | Остальные типы корректны |
| 20.5.7 Compact chart cards | InsightTile sparkline — начало | Нужны mini card / sparkline для StatTile |
| 20.5.8 Detailed chart cards | Отсутствует | Fullscreen/drilldown charts не реализованы |
| 20.5.9 Empty chart state (compact) | ChartNoData реализован, но без CTA в большинстве случаев | Добавить CTA |
| 20.5.10 Chart color palette enforcement | chart-1..5 определены | Не документированы, нет enforcement скрипта |
| 20.5.11 Chart tooltip standardization | ChartTooltipContent реализован | Нет единого формата (%, trend, period) |
| 20.5.12 Chart performance optimization | Dynamic imports уже есть | memo() уже применяется |

### 5.3 Iter 23 — Accessibility, Polish & Dark Mode (10 задач)

| Задача | Готовность | Что не хватает |
|--------|-----------|----------------|
| 23.1 WCAG AA contrast (light) | 3 токена не проходят (T1, T2, T3) | Нужна коррекция destructive, success, warning |
| 23.2 WCAG AA contrast (dark) | Не проверено | Нужен инструментальный аудит |
| 23.3 Keyboard navigation | Focus rings определены | Нужен полный аудит всех interactive элементов |
| 23.4 Screen reader | aria-labels присутствуют в toast, insight-tile | Нужен полный аудит |
| 23.5 axe-core в e2e | Playwright установлен | axe-core не интегрирован |
| 23.6 Visual regression | script `visual-regression.mjs` определён | Нужно проверить наличие baseline |
| 23.7 Animation polish | MOTION tokens определены, anime.js интегрирован | — |
| 23.8 Typography polish | Geist Sans/Mono используется | Нет документации выбора в спецификации |
| 23.9 Spacing polish | Tailwind spacing scale | Визуальный аудит не выполнен |
| 23.10 Dark mode visual polish | Все CSS variables имеют dark variants | Визуальный аудит dark mode не выполнен |

---

## 6. Приоритетные исправления для визуальной консистентности

### P0 — Критические (до начала Phase 3)

| # | Проблема | Действие | Файлы |
|---|----------|----------|-------|
| 1 | WCAG AA: `--warning` light mode (3.1:1) | Затемнить `--warning` до `#b45309` или `#a16207` | `globals.css:81` |
| 2 | Отсутствует компонент Tabs | Установить shadcn Tabs | `components/ui/` |
| 3 | Отсутствует компонент Command | Установить shadcn Command (cmdk) для Cmd+K | `components/ui/` |
| 4 | Chart dimension system — все 240px | Определить responsive breakpoints для charts | `chart.jsx`, DESIGN_SYSTEM_2026.md |

### P1 — Важные (в рамках Phase 3)

| # | Проблема | Действие | Файлы |
|---|----------|----------|-------|
| 5 | WCAG AA: `--destructive` light (3.7:1) | Затемнить до `#d13438` | `globals.css:77` |
| 6 | WCAG AA: `--success` light (3.8:1) | Затемнить до `#047857` | `globals.css:79` |
| 7 | PieChart для воронки — accessibility issue | Заменить на Funnel или Stacked Bar | `finance-section.jsx:166-169` |
| 8 | ChartNoData без CTA в 6 из 9 использований | Добавить `action` prop с кнопкой | `dashboard-charts.jsx` |
| 9 | Chart tokens не документированы | Добавить секцию в DESIGN_SYSTEM_2026.md | `docs/design/DESIGN_SYSTEM_2026.md` |
| 10 | Шрифт не зафиксирован в спецификации | Задокументировать Geist Sans/Mono | `docs/design/DESIGN_SYSTEM_2026.md` |
| 11 | Отсутствуют Avatar, Progress, ScrollArea | Установить по мере необходимости | `components/ui/` |

### P2 — Желательные (после Phase 3)

| # | Проблема | Действие |
|---|----------|----------|
| 12 | Shadow tokens не в спецификации | Документация |
| 13 | Нет Textarea, Popover, Calendar | Установить при появлении use case |
| 14 | Sparkline в StatTile | Интеграция mini-charts в KPI плитки |
| 15 | Toast → рассмотреть миграцию на shadcn/sonner | Стандартизация |

---

## 7. Общая оценка

### Что работает хорошо

1. **Дизайн-система зрелая** — 5 нормативных документов, 2 автоматических скрипта проверки
2. **Нет raw colors** — ни одного нарушения в `features/` и `components/`
3. **Нет произвольных z-index** — строго следуют scale из DESIGN_SYSTEM_2026.md
4. **Motion system консистентна** — единый anime.js, токены в `lib/motion.js`, 3 слоя reduced-motion
5. **Нет запрещённых animation библиотек** — framer-motion, react-spring, gsap не обнаружены
6. **StatusChip покрывает 22 статуса** — полный семантический словарь
7. **Chart wrapping стандартизирован** — ChartContainer + ChartTooltipContent + ChartLegendContent
8. **Empty state wizard реализован** — data-testid, steps, CTA

### Что требует внимания

1. **WCAG AA контрасты** — 3 семантических цвета не проходят AA для мелкого текста
2. **Нет Tabs и Command** — ключевые компоненты для Phase 3
3. **Charts фиксированные 240px** — нет responsive dimension system
4. **PieChart для воронки** — плохая accessibility, рекомендуется Funnel
5. **ChartNoData без CTA** — нарушает DESIGN_SYSTEM_CONTROL_TOWER.md
6. **Документация неполная** — шрифт, chart tokens, shadows не зафиксированы

### Метрики готовности к Phase 3

| Аспект | Оценка | Комментарий |
|--------|--------|-------------|
| Компонентная база | 8/10 | 21 shadcn + 14 кастомных. Не хватает Tabs, Command |
| Токены и переменные | 7/10 | Полные light/dark. WCAG AA — 3 проблемы |
| Документация | 8/10 | 5 нормативных документов, но пробелы в font/chart/shadow |
| Chart infrastructure | 6/10 | 17 графиков работают, но нет dimension system, стандартизации |
| Accessibility foundation | 6/10 | Focus rings, aria, reduced-motion есть. Контрасты не проходят |
| Motion system | 9/10 | Полностью стандартизирована, 3 слоя fallback |

**Итоговая готовность к Phase 3: 7.3/10**

Основные блокеры: контрасты WCAG AA (T1-T3), отсутствие Tabs/Command, chart dimension system.
