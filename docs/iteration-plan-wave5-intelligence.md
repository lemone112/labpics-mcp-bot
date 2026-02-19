# Wave 5 — Client Intelligence (Iter 31–35)

> Status: **Planning**
> Depends on: Wave 4 (Iter 25–30) partially complete (Iter 27, 28 minimum)
> Target: Transform dashboard into predictive client intelligence platform
>
> Source: Competitor analysis (Gainsight, ChurnZero, Clari, Gong, Productive.io, Scoro,
> Planhat, Totango), best practices research, business metric impact assessment (2026-02-19).

---

## Architecture

```
Iter 31 (Health & Signals) ── foundation for ALL intelligence ──────────┐
    │                                                                    │
    ├── Iter 32 (Predictive) ── uses health score + signals ────────────│
    │       │                                                            │
    │       └── Iter 33 (Revenue & Ops) ── monetizes predictions ───────│
    │               │                                                    │
    │               └── Iter 35 (Reporting) ── aggregates ALL data ─────┘
    │
    └── Iter 34 (Automation) ── automates based on 31 + 32 signals
```

**Critical path:** 31 → 32 → 33 → 35
**Parallel:** 34 может начинаться после 31 + 32
**Final:** 35 — после ALL других Wave 5 итераций

---

## Summary

| Iter | Name | Category | Tasks | Milestone | Depends on | Effort |
|------|------|----------|-------|-----------|------------|--------|
| **31** | Client Health & Signals | Foundation | 4 | [21](https://github.com/lemone112/labpics-dashboard/milestone/21) | 27, 11 | L |
| **32** | Predictive Intelligence | AI/ML | 4 | [22](https://github.com/lemone112/labpics-dashboard/milestone/22) | 31 | XL |
| **33** | Revenue & Operations Analytics | Revenue | 3 | [23](https://github.com/lemone112/labpics-dashboard/milestone/23) | 32, 29 | L |
| **34** | Automation & Workflows | Automation | 3 | [24](https://github.com/lemone112/labpics-dashboard/milestone/24) | 31, 32, 28 | XL |
| **35** | Reporting & Executive Layer | Reporting | 1 | [25](https://github.com/lemone112/labpics-dashboard/milestone/25) | 33, ALL | L |
| | **Total** | | **15** | | | |

Effort: S = 1–2 days, M = 3–5 days, L = 5–8 days, XL = 8–12 days

---

## Уникальные дифференциаторы

Три функции, которых нет ни у одного конкурента:

1. **AI Sentiment Analysis** (#273) — анализ тональности живой переписки в мессенджерах (не CRM-тикеты)
2. **Scope Creep Detector** (#277) — автоматическое обнаружение расползания объёма работ
3. **QBR Auto-Generator** (#284) — полностью автоматическая генерация квартальных отчётов

---

## Iter 31 — Client Health & Signals

**Category:** Foundation
**Priority:** CRITICAL
**Why:** Все intelligence-функции строятся на health score и сигналах. Без этого
фундамента невозможны предсказания, автоматизация и reporting.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 31.1 | Composite Health Score (DEAR) | [#272](https://github.com/lemone112/labpics-dashboard/issues/272) | Delivery + Engagement + Attio + Revenue = 0–100 score |
| 31.2 | AI Sentiment Analysis | [#273](https://github.com/lemone112/labpics-dashboard/issues/273) | LLM-based message tone classification + trend |
| 31.3 | Unified Client Timeline | [#276](https://github.com/lemone112/labpics-dashboard/issues/276) | Chronological event feed from 3 sources |
| 31.4 | Client Satisfaction Pulse | [#279](https://github.com/lemone112/labpics-dashboard/issues/279) | NPS/CSAT/CES micro-surveys with auto-send |

**Exit criteria:**
- [ ] Health Score computed for all active clients
- [ ] Sentiment trend visible per client
- [ ] Timeline aggregates events from Chatwoot, Linear, Attio
- [ ] NPS survey can be sent and responses collected

**Business impact:** Health Score visibility → proactive client management. Sentiment → early warning system.

---

## Iter 32 — Predictive Intelligence

**Category:** AI/ML
**Priority:** CRITICAL
**Why:** Превращает dashboard из реактивного инструмента (смотрю что произошло)
в предиктивный (знаю что произойдёт). Churn prediction за 30 дней до факта.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 32.1 | Predictive Churn Model | [#274](https://github.com/lemone112/labpics-dashboard/issues/274) | Logistic regression, 15+ features, 30-day prediction |
| 32.2 | Cross-Sell/Upsell Engine | [#275](https://github.com/lemone112/labpics-dashboard/issues/275) | Opportunity detection with revenue estimation |
| 32.3 | Scope Creep Detector | [#277](https://github.com/lemone112/labpics-dashboard/issues/277) | Plan vs actual comparison, drift alerts |
| 32.4 | Onboarding Health Tracker | [#278](https://github.com/lemone112/labpics-dashboard/issues/278) | Milestone tracking, time-to-value benchmark |

**Exit criteria:**
- [ ] Churn predictions generated daily with risk factors
- [ ] Scope creep alerts fire at configurable thresholds
- [ ] Upsell opportunities detected with estimated value
- [ ] Onboarding TTV tracked and benchmarked

**Business impact:** Churn reduction -25%. Upsell revenue +15%. Scope creep → margin protection.

---

## Iter 33 — Revenue & Operations Analytics

**Category:** Revenue
**Priority:** HIGH
**Why:** Без P&L per client невозможно принимать решения о ценообразовании.
Renewal management — прямое влияние на retention и revenue predictability.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 33.1 | Client Profitability Dashboard | [#280](https://github.com/lemone112/labpics-dashboard/issues/280) | P&L per client: revenue, cost, margin |
| 33.2 | Resource Utilization Analytics | [#281](https://github.com/lemone112/labpics-dashboard/issues/281) | Billable vs non-billable, capacity planning |
| 33.3 | Renewal Calendar & Lifecycle | [#282](https://github.com/lemone112/labpics-dashboard/issues/282) | Contract renewals, lifecycle stages, revenue at risk |

**Exit criteria:**
- [ ] P&L visible per client with accurate margin
- [ ] Team utilization rates visible and alertable
- [ ] Renewal calendar shows upcoming expirations with auto-reminders

**Business impact:** Margin visibility → pricing decisions. Utilization → capacity optimization. Renewals → revenue predictability.

---

## Iter 34 — Automation & Workflows

**Category:** Automation
**Priority:** HIGH
**Why:** Manual responses to health drops и churn signals не масштабируются.
Playbooks автоматизируют рутинные реакции. AI Copilot ускоряет доступ к данным.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 34.1 | Automated Playbooks Engine | [#283](https://github.com/lemone112/labpics-dashboard/issues/283) | Trigger → conditions → actions chain |
| 34.2 | AI Copilot (NL Interface) | [#285](https://github.com/lemone112/labpics-dashboard/issues/285) | Natural language queries to dashboard data |
| 34.3 | Stakeholder Map | [#286](https://github.com/lemone112/labpics-dashboard/issues/286) | Visual contact relationship graph per client |

**Exit criteria:**
- [ ] Playbooks execute automatically on trigger events
- [ ] AI Copilot answers questions about clients, revenue, utilization
- [ ] Stakeholder map shows contact relationships with strength indicators

**Business impact:** Automation → team efficiency +30%. Copilot → decision speed +50%. Stakeholder map → relationship risk mitigation.

---

## Iter 35 — Reporting & Executive Layer

**Category:** Reporting
**Priority:** HIGH
**Why:** QBR отчёты — обязательный элемент B2B-сервисного бизнеса. Ручная подготовка
занимает 2–4 часа. Автогенерация сокращает это до < 60 секунд.

| # | Task | Issue | Description |
|---|------|-------|-------------|
| 35.1 | QBR Report Auto-Generator | [#284](https://github.com/lemone112/labpics-dashboard/issues/284) | 8-section QBR with AI narrative + PDF |

**Exit criteria:**
- [ ] QBR generates automatically with all 8 sections
- [ ] AI narrative is coherent and actionable
- [ ] PDF is professional and branded
- [ ] Generation < 60 seconds

**Business impact:** QBR preparation time: 4 hours → 60 seconds. Professional perception → client retention.

---

## Effort Estimate

| Iter | Tasks | Effort | Calendar (1 dev) |
|------|-------|--------|------------------|
| 31 | 4 | L (5–8d) | Week 1–2 |
| 32 | 4 | XL (8–12d) | Week 3–4 |
| 33 | 3 | L (5–8d) | Week 5–6 |
| 34 | 3 | XL (8–12d) | Week 5–6 (parallel with 33) |
| 35 | 1 | L (5–8d) | Week 7–8 |
| **Total** | **15** | | **~8 weeks** |

---

## Labels

| Label | Color | Description |
|-------|-------|-------------|
| `intelligence` | #D93F0B | Client intelligence & predictive analytics |
| `ai` | #7057FF | AI/ML features |
| `revenue` | #0E8A16 | Revenue & profitability analytics |
| `automation` | #FBCA04 | Workflow automation & playbooks |
