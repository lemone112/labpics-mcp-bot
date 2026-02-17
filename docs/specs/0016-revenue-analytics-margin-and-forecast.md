# Спека 0016 — Revenue Analytics / Margin / Forecast

Статус: **draft**

Дата: 2026-02-17

> Roadmap: CRM/PM/Sales

## Цель

Дать финансовую управляемость:

- прогноз выручки (pipeline)
- план/факт по проектам
- маржинальность
- вклад допродаж/кампаний

## Инварианты

- **Auditability**: все числа должны уметь drill-down до сущностей (opportunity/offer/project/cost rows).
- **No silent edits**: ручные правки модели затрат/ставок фиксируются.
- **Consistency**: forecast использует только open opportunities и их probability.

## Сущности

### revenue_snapshot
- `scope` (studio/account/project)
- `period` (month)
- `pipeline_amount`
- `commit_amount`
- `won_amount`
- `created_at`

### cost_model (v1 простой)
- hours_logged * rate
- tool_costs (фикс)

## Forecast

- `expected_revenue = sum(amount_estimate * probability)` по open opportunities в горизонте.
- категории:
  - pipeline (0.1–0.49)
  - best_case (0.5–0.79)
  - commit (0.8–1)

## Маржа

- `gross_margin = revenue - costs`

## Атрибуция допродаж

- offer может ссылаться на signal_id и campaign_id.
- считаем expansion revenue.

## UX

- Dashboard 30/60/90
- Drill-down до аккаунтов и сделок

## Критерии приёмки

- Есть pipeline агрегаты.
- Есть forecast 30/60/90.
- Есть маржа по проектам (простая).
- Любой показатель имеет drill-down.
