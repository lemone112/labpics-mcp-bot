# Пайплайны и автоматизации (LightRAG-only)

## 1) Слои автоматизаций

1. Manual jobs через API.
2. Scheduler jobs по cadence.
3. Retry/DLQ loop для ошибок интеграций.

Все циклы project-scoped и идемпотентны.

## 2) Базовое расписание

### Быстрый контур

- `connectors_sync_cycle` — каждые 15 минут
- `connector_errors_retry` — каждые 5 минут
- `campaign_scheduler` — каждые 5 минут

### Средний контур

- `embeddings_run` — каждые 20 минут
- `signals_extraction` — каждые 15 минут
- `health_scoring` / `upsell_radar` / `analytics_aggregates` — каждые 30 минут
- `loops_contacts_sync` — каждый час

### Суточный/недельный контур

- `daily_digest` — раз в сутки
- `weekly_digest` — раз в неделю
- `connectors_reconciliation_daily` — раз в сутки

## 3) Ingest цикл

На каждом sync:

1. обновляется `connector_sync_state`;
2. данные upsert-ятся в raw-таблицы;
3. ошибки пишутся в `connector_errors`;
4. вычисляется полнота/дубли в `sync_reconciliation_metrics`.

## 4) LightRAG цикл

1. Новые source-данные порождают/обновляют `rag_chunks`.
2. `embeddings_run` переводит chunk в `ready`.
3. `POST /lightrag/query` комбинирует vector retrieval + source lookups.
4. Запрос логируется в `lightrag_query_runs`.

## 5) Legacy jobs в LightRAG-only режиме

При `LIGHTRAG_ONLY=1` legacy jobs, связанные с `/kag/*` (`kag_*`, `case_signatures_refresh`, `project_snapshot_daily`), автоматически переводятся в `paused`.

## 6) Полезные operational endpoints

- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`
- `GET /connectors/state`
- `GET /connectors/errors`
- `GET /connectors/reconciliation`
- `POST /connectors/errors/retry`
- `GET /lightrag/status`
- `POST /lightrag/refresh`

См. также:

- [`docs/api.md`](./api.md)
- [`docs/runbooks.md`](./runbooks.md)
