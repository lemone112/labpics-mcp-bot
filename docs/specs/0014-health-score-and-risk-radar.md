# Спека 0014 — Health Score & Risk Radar

Статус: **draft**

Дата: 2026-02-17

> Roadmap: CRM/PM/Sales


## Цель

Дать PM/Owner объяснимый health score для Account и Project и радар рисков.

## Сущности

### health_snapshot
- `id`
- `scope_type` (account|project)
- `scope_id`
- `score` (0..100)
- `factors[]`: {name, weight, value, explanation, evidence_refs[]}
- `created_at`

### risk_item
- `id`, `scope`
- `type` (schedule|scope|relationship|finance)
- `severity`, `confidence`
- `summary`, `evidence_refs`
- `recommended_actions`

## Факторы (v1)

- Response latency клиента
- Кол-во правок/повторных правок
- Негативная тональность
- Частота “срочно/переделать/не то”
- Отклонение от baseline scope (из 0012)

## Объяснимость

- Любой score обязан иметь factors с весами.
- Нельзя показывать “чёрный ящик”.

## UX

- Health badge на Account/Project
- Drill-down: факторы + evidence
- Top risks this week

## Критерии приёмки

- Score считается и объясняется.
- Риски показываются с NBA.
