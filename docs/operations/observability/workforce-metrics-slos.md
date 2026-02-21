# Workforce/Metrics SLO package (Iter 67.4)

## SLO-1: Ingest reliability

- **SLI:** `1 - failed_ingest_batches / total_ingest_batches`
- **Target:** `>= 99.0%` за rolling 7 дней.
- **Источник:** `app_metrics_ingest_batches_success_total`, `app_metrics_ingest_batches_failed_total`.

## SLO-2: Criteria evaluation health

- **SLI:** `1 - failed_criteria_runs / total_criteria_runs`
- **Target:** `>= 98.0%` за rolling 7 дней.
- **Источник:** `app_criteria_runs_total`, `app_criteria_runs_failed_total`.

## SLO-3: Data freshness / cleanup lag

- **SLI:** `max(retention_cleanup_lag_days)` для `search_analytics`.
- **Target:** `< 2 дня` на 99% времени.
- **Источник:** `app_retention_cleanup_lag_days{table="search_analytics"}`.

## SLO-4: Redis pub/sub delivery stability

- **SLI:** `publish_failed_rate + callback_error_rate`.
- **Target:** `< 0.5%` за rolling 24 часа.
- **Источник:** `app_redis_pubsub_publish_total`, `app_redis_pubsub_publish_failed_total`, `app_redis_pubsub_callback_errors_total`.

## SLO-5: Scope isolation correctness

- **SLI:** `increase(app_scope_violation_total[24h])`.
- **Target:** `0` (zero tolerance).

## Error budget policy

- Превышение бюджета 2 дня подряд => freeze на нефункциональные изменения в affected domain.
- До восстановления SLO разрешены только fixes/rollback/perf tuning.
