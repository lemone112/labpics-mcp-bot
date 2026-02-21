# Performance budgets (Iter 67.3)

Источник конфигурации: `apps/api/perf/perf-budgets.json`  
Скрипт проверки: `apps/api/scripts/check-perf-budgets.mjs`

## Что проверяется автоматически

1. **Write-heavy ingest**
   - `write_ingest_p95_ms` (search analytics insert path)
   - `metric_observations_write_ingest_p95_ms` (metrics layer ingest path)

2. **Read-heavy query classes**
   - `workforce_employee_lookup`
   - `workforce_conditions_timeline`
   - `graph_links_active_by_project`
   - `graph_dependency_traversal`
   - `search_analytics_scope_rollup`
   - `metrics_observations_scope_recent`
   - `generated_reports_scope_status_recent`

3. **Redis throughput / cache invalidation**
   - `redis_pubsub_min_ops_sec`
   - `cache_invalidation_p95_ms`

4. **Plan-shape regression gate (EXPLAIN)**
   - обязательные index-driven node types
   - required index prefix
   - запрет Seq Scan для high-cardinality таблиц выше порога `seq_scan_min_plan_rows`

## Политика regression

- Порог деградации: `regression_threshold_pct` (по умолчанию 40%).
- В `perf:budget:ci` регрессии приводят к fail job.
- В отчете сохраняются top-5 деградировавших query classes + explain summary.

## Запуск локально

```bash
cd apps/api
PERF_BUDGETS_INTEGRATION=1 DATABASE_URL=... REDIS_URL=... npm run perf:budget
```

Обновление baseline:

```bash
cd apps/api
PERF_BUDGETS_INTEGRATION=1 PERF_WRITE_BASELINE=1 DATABASE_URL=... REDIS_URL=... npm run perf:baseline:update
```
