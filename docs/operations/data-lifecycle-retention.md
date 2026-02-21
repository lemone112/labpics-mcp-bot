# Data Lifecycle: retention и partitioning (Iter 65.2)

## 1) Retention matrix

| Таблица | Политика retention | Комментарий |
| --- | --- | --- |
| `search_analytics` | 365 дней | Историческая аналитика поисковых событий, high-growth |
| `lightrag_query_runs` | 180 дней | Диагностические запросы RAG, важно для оперативного анализа |
| `generated_reports` (`status='completed'`) | 180 дней | Достаточно для операционного аудита и сравнения трендов |
| `generated_reports` (`status='failed'`) | 45 дней | Короткий горизонт, чтобы не накапливать шумовые ошибки |

Batch-очистка ограничена `ANALYTICS_RETENTION_BATCH_SIZE` (по умолчанию 1000 строк на таблицу за один запуск).

## 2) Cleanup job

Новый scheduler job: `analytics_retention_cleanup`.

- Cadence: каждые 12 часов (`43200` секунд).
- Scope-safe: чистит только `project_id + account_scope_id` активного scope.
- Идемпотентность: повторный запуск удаляет только оставшийся “хвост”.
- Ограничение влияния на OLTP: cleanup выполняется в батчах, с сортировкой по самым старым строкам.

### Настройки через ENV

- `SEARCH_ANALYTICS_RETENTION_DAYS` (default: `365`)
- `LIGHTRAG_QUERY_RUNS_RETENTION_DAYS` (default: `180`)
- `GENERATED_REPORTS_COMPLETED_RETENTION_DAYS` (default: `180`)
- `GENERATED_REPORTS_FAILED_RETENTION_DAYS` (default: `45`)
- `ANALYTICS_RETENTION_BATCH_SIZE` (default: `1000`, min `100`, max `20000`)

## 3) Метрики и диагностика

Job пишет структурированный результат:

- `deleted_rows.*` — сколько удалено в текущем прогоне;
- `overdue_lag_days.*` — “хвост” просроченных данных после cleanup;
- saturation warning, если удаление уперлось в лимит батча (`deleted_rows == batch_size`).

Это позволяет быстро определить, хватает ли текущего batch window.

## 4) Partitioning strategy (план внедрения)

Для high-growth таблиц рекомендуется range partitioning по `created_at` (месячные партиции):

1. `search_analytics` → monthly partitions (`YYYY_MM`);
2. `lightrag_query_runs` → monthly partitions;
3. (опционально) `generated_reports` при ускорении роста.

Рекомендуемый rollout:

1. Создать partitioned shadow-таблицу + те же индексы.
2. Переключить write path на parent partitioned table.
3. Backfill historical data по окнам (например, по месяцам).
4. Добавить авто-создание партиций N месяцев вперед (cron/maintenance job).
5. После стабилизации — удалить legacy path.

## 5) Rollback plan

1. Отключить `analytics_retention_cleanup` (сменить статус scheduled job на `suspended`).
2. Вернуть предыдущие retention env-параметры.
3. Проверить, что новые удаления не выполняются (`deleted_rows.total = 0` в логах).
4. При partition rollout — вернуть writes на legacy таблицу, затем остановить backfill.
