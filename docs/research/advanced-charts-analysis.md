# Advanced Charts & Visualization — Research & Scope

> Date: 2026-02-19
> Status: Research complete, awaiting approval
> Scope: Database improvements, chart library selection, visualization concepts

---

## Executive Summary

Анализ на основе текущей БД (23 миграции, 50+ таблиц), 17 существующих графиков
(Recharts 3.7), конкурентов (Gainsight, Productive.io, Scoro, HubSpot, Attio,
Linear, Planhat, Totango), best practices (NN/Group, Cambridge Intelligence) и
академических исследований cognitive load в graph visualization.

**Ключевые решения:**

| Вопрос | Рекомендация |
|--------|-------------|
| D3.js как основная библиотека? | **Нет** — anti-pattern в React 19. Держим Recharts + добавляем React Flow + Sigma.js |
| Obsidian-style граф? | **Да, но ограниченно** — ego-graph explorer для LightRAG entities, не глобальный граф |
| Node-based зависимости проектов? | **Нет как граф** — Gantt с dependency arrows (industry standard) |
| Полная воронка Sales+Delivery? | **Да** — горизонтальный segmented bar chart с тремя зонами + drill-down |

---

## 1. Текущее состояние

### 1.1 База данных — что есть

**50+ таблиц в 5 доменах:**

| Домен | Таблицы | Ключевые данные |
|-------|---------|-----------------|
| Connector Raw Data | `cw_contacts`, `cw_conversations`, `cw_messages`, `linear_issues_raw`, `linear_cycles_raw`, `attio_accounts_raw`, `attio_opportunities_raw`, `attio_people_raw`, `attio_activities_raw` | Сырые данные из 3 источников |
| CRM / Sales | `crm_accounts`, `crm_opportunities`, `crm_opportunity_stage_events`, `offers`, `offer_items`, `offer_approvals` | Accounts, pipeline, offers |
| Intelligence | `signals`, `next_best_actions`, `health_scores`, `risk_radar_items`, `risk_pattern_events`, `upsell_opportunities` | Health scores, risks, signals |
| LightRAG | `source_documents`, `entities`, `entity_links`, `document_entity_mentions`, `rag_chunks` | Knowledge graph, embeddings |
| Analytics | `analytics_revenue_snapshots`, `analytics_delivery_snapshots`, `analytics_comms_snapshots`, `project_snapshots`, `case_signatures` | Time-series snapshots |
| Campaigns | `campaigns`, `campaign_segments`, `campaign_members`, `campaign_events`, `outbound_messages` | Outbound engagement |

**Materialized view:** `mv_portfolio_dashboard` — агрегаты по 6 dimensions (messages_7d, linear_open_issues, pipeline_amount, expected_revenue, health_score, risks_open).

### 1.2 Графики — что есть

- **17 графиков** в 2 секциях (Dashboard + Finance) на Recharts 3.7.0
- Типы: Bar (10), Line (4), Area (2), Pie (1)
- Фиксированная высота `h-[240px]` для всех
- Нет анимаций (anime.js подключен, но не используется для charts)
- Нет: Funnel, Sankey, Scatter, Radial, Tree, Network

### 1.3 Метрики — что можем считать уже сейчас (27)

| Категория | Метрики |
|-----------|---------|
| Revenue | Pipeline (weighted), expected revenue (30/60/90d), avg deal size, win rate, sales cycle length, discount utilization |
| Delivery | Open issues, overdue issues, lead time, throughput, sprint velocity |
| Communications | Messages/7d, unique contacts, response time, campaign reply rate |
| Health & Risk | Health score (0-100), open risks count, risk severity distribution, signal detection rate |
| Sales Ops | Approval count, offer count by status, evidence coverage, dedup accuracy |

### 1.4 Метрики — чего НЕ МОЖЕМ считать (16 critical gaps)

| Gap | Что блокирует | Что нужно |
|-----|--------------|-----------|
| ARR / MRR | Нет таблицы контрактов | `contracts` table |
| Logo/Dollar churn | Нет lifecycle tracking | `lifecycle_stage` enum на `crm_accounts` |
| Win/Loss analysis | Нет root cause | `lost_reason`, `competitor` на `crm_opportunities` |
| Customer NPS/CSAT | Нет feedback | `customer_feedback` table |
| Campaign attribution | Нет связи campaign→opp | `attributed_campaign_id` FK |
| Health score trend | `factors` — opaque jsonb | Time-series health components |
| Deal stage velocity | Нет `stage_entered_at` | Computed from `crm_opportunity_stage_events` |
| Product telemetry | Нет usage data | `product_telemetry` table (будущее) |
| Forecast accuracy | Snapshots есть, нет comparison | Computed metric |

---

## 2. Визуализация существующих данных — предложения

### 2.1 Revenue & Pipeline (данные из Attio + CRM)

| # | Визуализация | Тип графика | Источник данных | Ценность |
|---|-------------|-------------|-----------------|----------|
| 1 | **Pipeline по стадиям** | Horizontal bar + conversion % | `crm_opportunities` grouped by `stage` | Видно где застревают deals |
| 2 | **Win rate trend** | Line chart | `crm_opportunity_stage_events` (won/lost по периодам) | Тренд эффективности продаж |
| 3 | **Deal size distribution** | Histogram (bar) | `crm_opportunities.amount_estimate` | Понимание клиентского профиля |
| 4 | **Sales cycle по стадиям** | Stacked horizontal bar | `crm_opportunity_stage_events` timestamps | Где теряем время |
| 5 | **Weighted pipeline vs target** | Gauge/progress | `SUM(amount_estimate * probability)` | Gap to quota |
| 6 | **Discount utilization** | Bar chart | `offers.discount_pct` by client/period | Контроль маржи |
| 7 | **Revenue forecast vs actual** | Dual line (forecast + actual) | `analytics_revenue_snapshots` | Accuracy tracking |

### 2.2 Delivery & Operations (данные из Linear)

| # | Визуализация | Тип графика | Источник данных | Ценность |
|---|-------------|-------------|-----------------|----------|
| 8 | **Sprint burndown** | Area chart (descending) | `linear_issues_raw.completed_at` within `linear_cycles_raw` | Sprint health |
| 9 | **Lead time distribution** | Histogram | `completed_at - created_at` from `linear_issues_raw` | Predictability |
| 10 | **Blocker impact** | Horizontal bar (sorted) | `linear_issues_raw WHERE blocked = true` | Bottleneck identification |
| 11 | **Priority distribution** | Stacked bar (по проектам) | `linear_issues_raw.priority` grouped by project | Workload balance |
| 12 | **Overdue trend** | Area chart | `linear_issues_raw WHERE due_date < now() AND completed_at IS NULL` | Early warning |
| 13 | **Cycle time by state** | Stacked bar | `linear_issues_raw` state transitions | Process bottlenecks |

### 2.3 Communications & Engagement (данные из Chatwoot)

| # | Визуализация | Тип графика | Источник данных | Ценность |
|---|-------------|-------------|-----------------|----------|
| 14 | **Message volume heatmap** | Heatmap (day × hour) | `cw_messages.created_at` | Activity patterns |
| 15 | **Response time trend** | Line chart | `contact_channel_policies` | SLA monitoring |
| 16 | **Contact activity** | Scatter plot (frequency × recency) | `cw_messages` aggregated by contact | Engagement health |
| 17 | **Channel effectiveness** | Grouped bar | `campaign_events` by channel | ROI per channel |
| 18 | **Conversation sentiment map** | Treemap / heatmap | `cw_conversations` + health_scores correlation | Risk detection |

### 2.4 Health & Risk Intelligence

| # | Визуализация | Тип графика | Источник данных | Ценность |
|---|-------------|-------------|-----------------|----------|
| 19 | **Health score distribution** | Histogram + quartile markers | `health_scores.score` | Portfolio health overview |
| 20 | **Health trend per client** | Sparkline grid | `health_scores` over time | Individual trajectories |
| 21 | **Risk radar** | Scatter (severity × probability) | `risk_radar_items` | Risk prioritization |
| 22 | **Signal category breakdown** | Donut / treemap | `signals.signal_type` | What types of issues dominate |
| 23 | **NBA completion rate** | Progress bars | `next_best_actions.status` | Action follow-through |

### 2.5 Cross-Domain Correlations

| # | Визуализация | Тип графика | Источник данных | Ценность |
|---|-------------|-------------|-----------------|----------|
| 24 | **Client health × revenue** | Scatter plot | `health_scores` × `crm_opportunities` | Identify high-value at-risk clients |
| 25 | **Delivery velocity × client satisfaction** | Scatter plot | `analytics_delivery_snapshots` × `health_scores` | Process-outcome correlation |
| 26 | **Team→Client communication matrix** | Heatmap | `cw_messages` grouped by sender × account | Coverage gaps |

**Итого: 26 новых визуализаций** из существующих данных (без изменения БД).

---

## 3. Доработки базы данных

### 3.1 CRITICAL — блокирует ключевые метрики

#### 3.1.1 Таблица контрактов (ARR/MRR, renewal, churn)

```sql
CREATE TABLE contracts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  account_id  uuid NOT NULL REFERENCES crm_accounts(id),
  title       text NOT NULL,
  start_date  date NOT NULL,
  end_date    date,                    -- NULL = evergreen
  mrr         numeric(12,2),           -- monthly recurring
  arr         numeric(14,2) GENERATED ALWAYS AS (mrr * 12) STORED,
  renewal_date date,
  auto_renew  boolean DEFAULT false,
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('draft','active','expired','cancelled','renewed')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE contract_line_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id),
  contract_id  uuid NOT NULL REFERENCES contracts(id),
  offering_ref text,                   -- FK to future product_offerings
  name         text NOT NULL,
  quantity     int DEFAULT 1,
  unit_price   numeric(12,2) NOT NULL,
  line_total   numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at   timestamptz DEFAULT now()
);
```

**Разблокирует:** ARR/MRR, renewal rate, logo churn, dollar churn, revenue at risk,
contract lifecycle, renewal calendar, revenue predictability.

#### 3.1.2 Lifecycle stage на crm_accounts

```sql
ALTER TABLE crm_accounts ADD COLUMN lifecycle_stage text
  DEFAULT 'prospect'
  CHECK (lifecycle_stage IN (
    'lead', 'prospect', 'qualified', 'onboarding',
    'active', 'at_risk', 'churned', 'reactivated'
  ));
ALTER TABLE crm_accounts ADD COLUMN lifecycle_stage_entered_at timestamptz;
```

**Разблокирует:** Customer lifecycle funnel, cohort analysis, retention metrics, stage velocity.

#### 3.1.3 Lost deal tracking на crm_opportunities

```sql
ALTER TABLE crm_opportunities ADD COLUMN lost_reason text
  CHECK (lost_reason IN (
    'price', 'competitor', 'no_budget', 'timing',
    'no_decision', 'scope_mismatch', 'champion_left', 'other'
  ));
ALTER TABLE crm_opportunities ADD COLUMN lost_competitor text;
ALTER TABLE crm_opportunities ADD COLUMN lost_notes text;
```

**Разблокирует:** Win/loss analysis, competitive intelligence, pricing insights.

### 3.2 HIGH — расширяет аналитику

#### 3.2.1 Stage timing для opportunities

`crm_opportunity_stage_events` уже существует! Нужен только computed metric:

```sql
-- Materialized view: time in each stage
CREATE MATERIALIZED VIEW mv_opportunity_stage_durations AS
SELECT
  project_id,
  opportunity_id,
  to_stage AS stage,
  created_at AS entered_at,
  LEAD(created_at) OVER (
    PARTITION BY opportunity_id ORDER BY created_at
  ) AS exited_at,
  EXTRACT(EPOCH FROM (
    LEAD(created_at) OVER (PARTITION BY opportunity_id ORDER BY created_at)
    - created_at
  )) / 86400.0 AS days_in_stage
FROM crm_opportunity_stage_events
ORDER BY opportunity_id, created_at;

CREATE UNIQUE INDEX ON mv_opportunity_stage_durations (opportunity_id, stage, entered_at);
```

**Разблокирует:** Sales cycle velocity per stage, bottleneck detection, stage conversion rates.

#### 3.2.2 Campaign attribution

```sql
ALTER TABLE crm_opportunities ADD COLUMN attributed_campaign_id uuid
  REFERENCES campaigns(id);
```

**Разблокирует:** Campaign ROI, source attribution, marketing effectiveness.

#### 3.2.3 Каталог услуг (для P&L и upsell)

```sql
CREATE TABLE product_offerings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id),
  code         text NOT NULL,
  name         text NOT NULL,
  category     text NOT NULL CHECK (category IN (
    'design', 'development', 'strategy', 'support', 'retainer', 'other'
  )),
  list_price   numeric(12,2),
  mrr          numeric(12,2),
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(project_id, code)
);
```

**Разблокирует:** Product mix analysis, upsell engine data, P&L per service line.

### 3.3 MEDIUM — углубляет insights

#### 3.3.1 Health score components (time-series)

Текущая `health_scores.factors` — opaque jsonb. Нужна нормализация:

```sql
CREATE TABLE health_score_components (
  id              bigserial PRIMARY KEY,
  project_id      uuid NOT NULL REFERENCES projects(id),
  account_id      uuid NOT NULL REFERENCES crm_accounts(id),
  computed_at     timestamptz NOT NULL DEFAULT now(),
  -- DEAR model components (0-100 each)
  delivery_score  smallint CHECK (delivery_score BETWEEN 0 AND 100),
  engagement_score smallint CHECK (engagement_score BETWEEN 0 AND 100),
  attio_score     smallint CHECK (attio_score BETWEEN 0 AND 100),
  revenue_score   smallint CHECK (revenue_score BETWEEN 0 AND 100),
  -- Composite
  composite_score smallint CHECK (composite_score BETWEEN 0 AND 100),
  -- Weights used
  weights_json    jsonb,
  UNIQUE(project_id, account_id, computed_at)
);
```

**Разблокирует:** Health component trends, root cause analysis, "what's driving the score change".

#### 3.3.2 Customer feedback

```sql
CREATE TABLE customer_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id),
  account_id   uuid NOT NULL REFERENCES crm_accounts(id),
  feedback_type text NOT NULL CHECK (feedback_type IN ('nps', 'csat', 'ces', 'general')),
  score        smallint,               -- NPS: -100 to 100, CSAT: 1-5, CES: 1-7
  comment      text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  survey_source text,                   -- 'auto', 'manual', 'email'
  created_at   timestamptz DEFAULT now()
);
```

**Разблокирует:** NPS trend, CSAT per client, voice of customer analytics.

### 3.4 Оптимизация существующей БД

| Проблема | Решение | Impact |
|----------|---------|--------|
| `mv_portfolio_dashboard` не обновляется по scheduler | Добавить scheduler job `refresh_portfolio_matview` | Dashboard показывает stale data |
| `health_scores.factors` — opaque jsonb | Параллельно с новой `health_score_components` table | Queryable health trends |
| Нет индекса на `crm_opportunity_stage_events(opportunity_id, created_at)` | `CREATE INDEX` | Stage duration queries |
| `analytics_*_snapshots` не партиционированы | Range partitioning by `period_start` (monthly) | Query performance при росте |
| `cw_messages` без индекса на `sender_type` | Composite index `(project_id, sender_type, created_at)` | Inbound/outbound split queries |
| `connector_events` растёт unbounded | Retention policy: archive >90 days | Storage optimization |

---

## 4. Библиотека графиков — критический анализ D3.js

### 4.1 Почему D3.js — **плохой выбор** для основной библиотеки

| Проблема | Детали |
|----------|--------|
| **DOM conflict с React** | D3 манипулирует DOM напрямую (d3-selection). React управляет DOM через virtual DOM. Два хозяина одного DOM = баги, memory leaks, race conditions. |
| **Огромная learning curve** | Scales, axes, selections, joins, transitions, generators — недели обучения. Recharts позволяет создать график за минуты. |
| **Нет компонентной модели** | D3 — императивный. React — декларативный. Заставлять D3 работать в React = useRef + useEffect обёртки на каждый график. |
| **Bundle size** | Полный d3: ~90KB gzipped. Tree-shaking помогает, но нужно знать какие модули импортировать. |
| **Нет готовых компонентов** | Каждый tooltip, legend, axis label — с нуля. Recharts даёт их из коробки. |
| **Несовместимость с design system** | Стили D3 графиков — через JS, не CSS custom properties. Конфликт с вашей token-based системой. |

### 4.2 Когда D3.js оправдан

D3 оправдан **только** как набор math-утилит (`d3-scale`, `d3-shape`, `d3-array`, `d3-interpolate`),
когда React рендерит SVG, а D3 вычисляет координаты. Это именно то, что делает visx (Airbnb).
Но visx не поддерживает React 19 (PR висит 12+ месяцев).

### 4.3 Рекомендуемая стратегия: 3 библиотеки

```
┌─────────────────────────────────────────────────────────┐
│  Standard charts (bar, line, area, pie, funnel, gauge)  │
│  Recharts 3.7.0 (уже установлен, 70KB gzip)            │
│  ✅ Keep — 17 графиков уже работают                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Node diagrams, flowcharts, stakeholder maps            │
│  React Flow / @xyflow/react 12.x (+50KB gzip)          │
│  ✅ Add — React 19 + Tailwind 4, shadcn-based UI       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Network graphs, entity relationship visualization      │
│  Sigma.js + @react-sigma/core + graphology (+60KB gzip) │
│  ✅ Add — WebGL, ForceAtlas2, React 19 compatible       │
└─────────────────────────────────────────────────────────┘

Total additional bundle: ~110KB gzipped
```

### 4.4 Детальное сравнение (топ-5)

| Критерий | Recharts | D3 (raw) | React Flow | Sigma.js | ECharts |
|----------|----------|----------|------------|----------|---------|
| React 19 | ✅ v3.x | ⚠️ DOM conflict | ✅ v12 | ✅ @react-sigma | ⚠️ wrapper stale |
| Bundle | 70KB | 90KB (full) | 50KB | 60KB | 135KB+ |
| Learning curve | Low | Very High | Low-Medium | Medium-High | Medium |
| Standard charts | ✅ | ✅ (manual) | ❌ | ❌ | ✅ |
| Funnel | ✅ Native | Manual | ❌ | ❌ | ✅ Native |
| Network graph | ❌ | Via d3-force | Partial | ✅ Primary | ✅ Native |
| Node editor | ❌ | ❌ | ✅ Primary | ❌ | ❌ |
| Tailwind integration | ✅ CSS vars | ❌ | ✅ Built on shadcn | ⚠️ Manual | ❌ |
| SSR/Next.js | Client only | useEffect | v12 SSR | Client only | Client only |
| Dark mode | ✅ CSS vars | Manual | ✅ CSS vars | Manual theming | Built-in themes |
| a11y | Basic ARIA | None | Keyboard nav | Poor (WebGL) | WCAG in v4+ |
| Anime.js совместимость | Рядом | Конфликт | Рядом | Рядом | Свои анимации |

---

## 5. Obsidian-style Graph — глубокий анализ

### 5.1 Честная оценка

**Факты из исследований:**

1. Graph view в Obsidian/Roam/Logseq **"unusable for day-to-day work"** — консенсус
   пользователей и рецензентов. Используется для "wow-эффекта", не для insight.

2. NN/Group: dashboards должны оптимизировать **"at-a-glance comprehension"** — графы
   требуют значительного cognitive load для интерпретации.

3. Huang, Eades & Hong (2009): graph visualizations impose **higher cognitive load**
   than tabular alternatives for quantitative comparison tasks.

4. Cambridge Intelligence: network visualization effective **only** when data is
   inherently relational AND user's primary task is understanding connections.

### 5.2 Что НЕ стоит делать

**Full global graph** (все entities, все связи) — **SKIP**.

Причины:
- При 500+ nodes = visual hairball, невозможно интерпретировать
- PM/sales не имеют graph literacy для работы с force-directed layouts
- Тот же insight доступен через фильтрованные таблицы/списки
- Effort: XL (8-12 дней), value: novelty wear-off через неделю

### 5.3 Что СТОИТ делать: Ego-Graph Explorer

**Концепция:** Пользователь кликает на entity (клиент, контакт, deal) →
открывается panel/sheet → показывается 2-hop граф вокруг этой entity.

**Почему это работает:**

1. **Данные уже есть.** `entities` + `entity_links` (migration 0021) — это граф.
   `link_type`: 'same_as', 'related_to', 'belongs_to', 'mapped_to', 'thread_of', 'mentions'.
   `confidence`: 0-1. `directional`: boolean.

2. **Ограниченный scope** — 20-50 nodes max (2-hop от центра). Человек может интерпретировать.

3. **Реальный use case:** PM спрашивает "что мы знаем о Company X?" → граф показывает:
   Company X ← belongs_to → 3 deals ← mapped_to → 5 Linear projects ← thread_of → 12 conversations.
   Это context, который текст не передаёт так быстро.

4. **View `v_entity_context`** уже агрегирует link_count и mention_count per entity.

**Прототип API:**
```
GET /v1/entities/:ref/graph?depth=2&kinds=company,person,deal&min_confidence=0.5
```

**Визуальный дизайн (для обсуждения с дизайнером):**
- Центральная node: крупнее, accent color
- Nodes цветом по `entity_kind` (company=blue, person=green, deal=orange, project=purple)
- Edge толщина по `confidence`
- Edge label по `link_type`
- Node size по mention_count
- Click on node → navigate to entity detail
- Hover → tooltip with `display_name`, `entity_kind`, links count

**Библиотека:** `@react-sigma/core` + `graphology` + `graphology-layout-forceatlas2`.
Альтернатива для простых случаев (<100 nodes): `react-force-graph`.

**Effort:** M (3-5 дней). Данные готовы после Iter 11.

### 5.4 Другие варианты graph view

| Use case | Полезно? | Почему |
|----------|----------|--------|
| Client relationship network | ⚠️ Условно | Только при 100+ клиентах. Таблица лучше для малого масштаба |
| Team workload graph | ❌ Нет | Bar chart лучше для quantitative comparison |
| Communication graph | ⚠️ Рисковано | Privacy issues, unstable data. Heatmap — безопаснее |

---

## 6. Node-based зависимости проектов

### 6.1 Что делают лидеры рынка

| Tool | Подход | Визуализация |
|------|--------|-------------|
| Linear | Project-level dependencies (blocked-by/blocking) | Timeline с arrows |
| Asana | Task dependencies | Gantt chart с drag-and-drop arrows |
| monday.com | All 4 dependency types (SS, SF, FS, FF) | Gantt chart |
| Jira | Issue links | Plugins (Structure.Gantt, Dependency Mapper) |

**Консенсус индустрии:** "Use graphs for structure, use Gantt for timing."
Все best-in-class PM tools (Linear, Asana) выбрали **Gantt с dependency arrows**,
а не free-form graph.

### 6.2 Почему React Flow node diagram — НЕ лучший выбор для зависимостей

1. PM спрашивает **"когда я смогу начать X, если Y задерживается?"** — это temporal question,
   Gantt отвечает на него лучше (timeline axis).

2. Graph diagram отвечает на **"что блокирует что?"** — secondary question.

3. При 5-20 задачах в типичном проекте agency, graph будет тривиален.

4. React Flow требует dagre/elkjs для auto-layout + custom nodes — значительный effort
   для результата, который Gantt даёт из коробки.

### 6.3 Рекомендация: Gantt с dependency arrows

**НО**: React Flow всё равно нужен для:
- Stakeholder Map (#286, Iter 34.3) — visual contact relationship graph
- Playbook Builder (#283, Iter 34.1) — trigger → condition → actions flow
- Workflow visualization (будущее)

Поэтому **добавить React Flow**, но использовать его для stakeholder maps и workflow,
а не для project dependencies. Для зависимостей — отдельный Gantt component.

**Библиотеки Gantt (оценка):**
- `gantt-task-react` — React-native, lightweight, MIT
- `frappe-gantt` — популярный, но jQuery-based (не идеально)
- Custom с `@dnd-kit` + SVG — максимальный контроль, больше effort

---

## 7. Full Lifecycle Funnel — главный deliverable

### 7.1 Архитектура воронки

**Ключевой insight из research:** НЕ строить одну линейную воронку.
Sales, Delivery и Relationship — разные домены с разными time scales и owners.

**3 зоны:**

```
┌──────────── SALES ZONE (Attio + CRM) ───────────────┐
│                                                       │
│  Lead → Qualified → Discovery → Proposal → Won/Lost   │
│                                                       │
│  Metrics: volume, conversion %, velocity (days),       │
│           weighted pipeline, avg deal size              │
│                                                       │
└──────────────────────┬────────────────────────────────┘
                       │ HANDOFF (time to kickoff)
┌──────────────────────▼────────────────────────────────┐
│          DELIVERY ZONE (Linear + Chatwoot)             │
│                                                       │
│  Onboarding → In Progress → Review/QA → Delivered      │
│                                                       │
│  Metrics: time-in-stage, on-time %, budget adherence,  │
│           velocity, utilization rate                    │
│                                                       │
└──────────────────────┬────────────────────────────────┘
                       │ TRANSITION
┌──────────────────────▼────────────────────────────────┐
│        RELATIONSHIP ZONE (Attio + Chatwoot)            │
│                                                       │
│  Active ←→ Expansion/Upsell ←→ Renewal → Churned      │
│                               ↑              │         │
│                               └──────────────┘ (loop)  │
│                                                       │
│  Metrics: health score, NPS, renewal rate, expansion   │
│           revenue, churn rate, lifetime value           │
│                                                       │
└────────────────────────────────────────────────────────┘
```

### 7.2 Primary visualization: Horizontal Segmented Bar

**Почему НЕ классическая воронка (trapezoid):**
- 12+ стадий — трапеция становится нечитаемой
- 3 зоны имеют разную семантику — pretending they're one narrowing process = ложь
- Трапеция плоха для precise comparison (diagonal shapes distort proportions)

**Почему НЕ Sankey:**
- Слишком complex для daily view (NN/Group: dashboards = at-a-glance)
- Sankey хорош для **analysis** (drill-down view), не для **overview**

**Horizontal segmented bar — лучший выбор:**
- Все стадии на одной оси → easy comparison
- Color-coded zones (Sales=blue, Delivery=green, Relationship=purple)
- Conversion % аннотации между bars
- Абсолютные числа внутри bars
- Click на bar → drill-down в zone detail

### 7.3 Стадии воронки

| Zone | Stage | Source | Exit Criteria | Key Metric |
|------|-------|--------|--------------|------------|
| **Sales** | Lead | Attio | ICP fit confirmed | Volume, source |
| **Sales** | Qualified | Attio | Budget + timeline | MQL→SQL rate |
| **Sales** | Discovery | Attio + Chatwoot | Pain points mapped | Discovery→Proposal rate |
| **Sales** | Proposal | CRM offers | Scope + price sent | Avg deal value |
| **Sales** | Negotiation | CRM | Terms agreed | Discount rate |
| **Sales** | Won | CRM stage_events | Contract signed | Win rate, cycle length |
| **Sales** | Lost | CRM stage_events | Reason captured | Loss reasons |
| **Delivery** | Onboarding | Linear + Chatwoot | Kickoff complete | Time to kickoff |
| **Delivery** | In Progress | Linear | Active sprints | Velocity, utilization |
| **Delivery** | Review/QA | Linear | Client sign-off | Revision count |
| **Delivery** | Delivered | Linear | Project launched | On-time rate |
| **Relationship** | Active Support | Chatwoot | Engagement ongoing | Response time, CSAT |
| **Relationship** | Expansion | CRM upsell_opportunities | Upsell opportunity | Expansion revenue |
| **Relationship** | Renewal | Contracts table | Contract renewed | Renewal rate |
| **Relationship** | Churned | CRM lifecycle_stage | Contract ended | Churn rate, reasons |

### 7.4 Drill-down views

| View | Тип графика | Данные |
|------|-------------|--------|
| Sales zone detail | Classic funnel chart (trapezoid) | 5-6 стадий, хорошо работает |
| Delivery zone detail | Kanban / Gantt | Проекты по стадиям |
| Relationship zone detail | Health score cards + trend sparklines | Per-client |
| Flow analysis | Sankey diagram | Stage transitions (где уходят deals/clients) |
| Cohort comparison | Multi-line | Conversion by cohort period |
| Segment filter | Filtered horizontal bars | By service type, deal size, source |

### 7.5 Уникальные метрики (чего нет у конкурентов)

1. **Handoff quality** — time from Won to Kickoff + scope match (sold vs delivered)
2. **Cross-lifecycle cohort** — "referral clients have 2x higher retention than cold outbound"
3. **Cross-zone bottleneck** — "delivery backlog causing sales slowdown because can't onboard"
4. **Revenue trajectory** — deal value → project profitability → lifetime value in one view

### 7.6 Данные для воронки

**Что уже есть:**
- `crm_opportunities.stage` + `crm_opportunity_stage_events` → Sales stages + transitions
- `linear_issues_raw.state` + `linear_states_raw.type` → Delivery stages
- `cw_messages` + `cw_conversations` → Communication activity
- `health_scores` → Health metric
- `analytics_revenue_snapshots` → Revenue data

**Что нужно добавить:**
- `crm_accounts.lifecycle_stage` → Relationship zone stages
- `contracts` table → Renewal tracking
- `lost_reason` на `crm_opportunities` → Loss analysis
- `product_offerings` → Service categorization for segment filters

---

## 8. Implementation Roadmap

### Phase 1 — DB Foundation (prerequisite)

| Task | Effort | Blocks |
|------|--------|--------|
| Create `contracts` + `contract_line_items` tables | S (1d) | ARR/MRR, renewal calendar |
| Add `lifecycle_stage` to `crm_accounts` | S (0.5d) | Lifecycle funnel |
| Add `lost_reason` to `crm_opportunities` | S (0.5d) | Win/loss analysis |
| Create `mv_opportunity_stage_durations` matview | S (0.5d) | Stage velocity |
| Add missing indexes | S (0.5d) | Query performance |
| Schedule `mv_portfolio_dashboard` refresh | S (0.5d) | Dashboard freshness |

**Total Phase 1: ~3.5 days**

### Phase 2 — Enhanced Analytics Tables

| Task | Effort | Blocks |
|------|--------|--------|
| Create `product_offerings` table | S (0.5d) | Service categorization |
| Create `health_score_components` table | M (1d) | Health trend analysis |
| Create `customer_feedback` table | S (0.5d) | NPS/CSAT |
| Add `attributed_campaign_id` to opportunities | S (0.5d) | Campaign ROI |

**Total Phase 2: ~2.5 days**

### Phase 3 — Install Libraries + Base Components

| Task | Effort |
|------|--------|
| Install `@xyflow/react` + create base wrapper component | S (1d) |
| Install `@react-sigma/core` + `graphology` + create base wrapper | S (1d) |
| Create `FunnelChart` wrapper (Recharts `FunnelChart`) | S (0.5d) |
| Create chart dimension system (h-16, h-40, h-60, h-80) from Iter 20.5 | S (1d) |

**Total Phase 3: ~3.5 days**

### Phase 4 — Full Lifecycle Funnel

| Task | Effort |
|------|--------|
| Backend: funnel aggregation endpoint (`GET /v1/analytics/funnel`) | M (2d) |
| Backend: stage transition endpoint (`GET /v1/analytics/funnel/transitions`) | M (1d) |
| Frontend: Horizontal segmented bar (3-zone funnel) | M (3d) |
| Frontend: Sales zone drill-down (classic funnel) | M (2d) |
| Frontend: Sankey flow analysis view | M (3d) |
| Frontend: Cohort comparison view | M (2d) |

**Total Phase 4: ~13 days**

### Phase 5 — Entity Graph Explorer

| Task | Effort |
|------|--------|
| Backend: ego-graph endpoint (`GET /v1/entities/:ref/graph`) | M (2d) |
| Frontend: Sigma.js graph component in Sheet/panel | M (3d) |
| UX: node styling per entity_kind, edge styling per link_type | S (1d) |
| Integration: click entity in CRM → open graph panel | S (1d) |

**Total Phase 5: ~7 days**

### Phase 6 — Stakeholder Map + Workflow Editor (React Flow)

| Task | Effort |
|------|--------|
| Stakeholder Map component (React Flow) | M (3d) |
| Playbook Builder flow editor (React Flow) | L (5d) |

**Total Phase 6: ~8 days**

---

**Grand total: ~37.5 days** (without parallelization)
**With 2-person parallelization: ~20 days** (Phase 1-2 + Phase 3 parallel, Phase 4 + Phase 5 parallel)

---

## Appendix A: Rejected Alternatives

| Alternative | Why rejected |
|-------------|-------------|
| D3.js as primary library | DOM conflict with React 19, massive learning curve, no component model |
| ECharts | 135KB+ even tree-shaken, option-object API conflicts with React/Tailwind design system |
| Nivo | Lateral move from Recharts, single maintainer risk, not worth switching cost |
| Victory | Slow maintenance, no funnels, no graphs |
| Tremor | Just a styled Recharts wrapper, redundant with shadcn/ui |
| visx | React 19 support not released, too low-level for dashboard pace |
| Full Obsidian graph | "Cool but useless" per research consensus, XL effort, novelty wear-off |
| React Flow for project dependencies | Industry uses Gantt for timing; graph is secondary |

## Appendix B: Sources

### Academic & UX Research
- Huang, Eades & Hong (2009) — Cognitive load in graph visualization
- NN/Group — Dashboard design: at-a-glance comprehension
- Cambridge Intelligence — When to use network visualization

### Competitor Analysis
- Gainsight, ChurnZero, Planhat, Totango — Customer success platforms
- HubSpot, Salesforce, Pipedrive, Attio — CRM pipeline visualization
- Productive.io, Scoro — Agency management tools
- Linear, Asana, monday.com, Jira — Project dependency approaches
- Obsidian, Roam, Logseq — Graph view assessment

### Library Documentation
- Recharts 3.x, React Flow 12.x, Sigma.js, Cytoscape.js
- D3.js v7, Nivo, Victory, visx, ECharts 5.5, Tremor, Observable Plot
