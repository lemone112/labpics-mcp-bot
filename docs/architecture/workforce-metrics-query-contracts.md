# Workforce/Metrics Query Contracts (Iter 65.3)

Документ фиксирует ожидаемые предикаты и индексы для критичных read-path запросов.
Используется как source of truth для perf-regression проверки (EXPLAIN plan-shape gate).

## Критичные query classes

| Query class | Предикаты / сортировка | Ожидаемый индекс |
| --- | --- | --- |
| `workforce_employee_lookup` | `WHERE account_scope_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT ?` | `employees_scope_status_updated_cover_idx` |
| `workforce_conditions_timeline` | `WHERE employee_id = ? ORDER BY effective_from DESC LIMIT ?` | `employee_conditions_employee_effective_cover_idx` |
| `graph_links_active_by_project` | `WHERE project_id = ? AND account_scope_id = ? AND status = 'active' ORDER BY priority ASC, effective_from DESC LIMIT ?` | `client_executor_links_active_project_scope_priority_idx` |
| `search_analytics_scope_rollup` | `WHERE account_scope_id = ? AND created_at >= now()-interval ... GROUP BY event_type` | `search_analytics_scope_event_created_idx` |
| `metrics_query_scope_project_recent` | `WHERE account_scope_id = ? AND project_id = ? ORDER BY observed_at DESC LIMIT/OFFSET` | `metric_observations_scope_project_observed_cover_idx` |

## Контракт по plan-shape

- Для `workforce_employee_lookup`, `workforce_conditions_timeline`, `graph_links_active_by_project` CI ожидает:
  - наличие index-driven node (`Index Scan` / `Index Only Scan` / `Bitmap ...`),
  - использование индекса с ожидаемым префиксом имени,
  - отсутствие `Seq Scan` по целевой таблице при `Plan Rows` выше порога.
- Порог `seq_scan_min_plan_rows` задается в `apps/api/perf/perf-budgets.json` (секция `plan_shapes`).

## Где проверяется автоматически

- Скрипт: `apps/api/scripts/check-perf-budgets.mjs`
- Правила формы плана: `apps/api/perf/perf-budgets.json -> plan_shapes`
- CI entrypoint: `npm run perf:budget:ci`

## Политика изменения контрактов

При изменении query template необходимо:

1. Обновить ожидаемый индекс в этом документе.
2. Обновить правила `plan_shapes` в `perf-budgets.json`.
3. Проверить, что migration создает/обновляет нужный индекс.
4. Пересобрать baseline (`npm run perf:baseline:update`) после валидации.
