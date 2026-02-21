# Runbooks (эксплуатация, LightRAG-only)

См. также:

- `docs/operations/data-lifecycle-retention.md` — lifecycle-политики (retention, cleanup job, partitioning strategy).
- `docs/operations/performance-budgets.md` — perf budgets, regression policy, local run commands.
- `docs/operations/observability/workforce-metrics-dashboard.json` — dashboard package (health/freshness/perf).
- `docs/operations/observability/workforce-metrics-alerts.json` — alert rules и пороги.
- `docs/operations/observability/workforce-metrics-slos.md` — SLI/SLO и error budget policy.

## 1) Быстрый operational checklist

1. `GET /health` и `GET /metrics` отвечают.
2. Есть сессия и выбран активный проект.
3. `GET /jobs/scheduler` показывает рабочие jobs.
4. `GET /connectors/state` не содержит зависших `running`.
5. `GET /lightrag/status` показывает `ready` embeddings > 0 (для search-сценариев).
6. Redis: `redis-cli -u $REDIS_URL ping` — отвечает PONG.
7. SSE: `GET /metrics` → `app_sse_connections_total` показывает подключённых клиентов.

## 1.5) Дашборд не обновляется автоматически

Проверки:

- Browser DevTools → Network → фильтр EventStream → `/api/events/stream` — соединение установлено?
- `GET /metrics` → `app_sse_connections_total > 0`?
- Redis доступен: `redis-cli -u $REDIS_URL ping`

Действия:

1. Перезагрузить страницу (SSE `EventSource` переподключится автоматически).
2. Если Redis down: `docker compose restart redis` — SSE восстановится.
3. Если Redis полностью недоступен — frontend polling (15-60 сек) продолжает работать как fallback.
4. Проверить Caddy config: `flush_interval -1` должен быть в блоке reverse_proxy для API.

## 2) LightRAG возвращает пусто

Проверить:

- есть ли source-данные по проекту (`cw_messages`, `linear_issues_raw`, `attio_opportunities_raw`);
- есть ли `rag_chunks` и `embedding_status='ready'`;
- валиден ли `OPENAI_API_KEY`.

Действия:

1. `POST /jobs/chatwoot/sync` (и/или Linear/Attio sync)
2. `POST /jobs/embeddings/run`
3. `POST /lightrag/query`

## 3) Connector sync падает

Проверить:

- `GET /connectors/errors`
- `GET /connectors/state`
- токены `CHATWOOT_*`, `LINEAR_*`, `ATTIO_*`

Действия:

1. Исправить доступ/квоты.
2. `POST /connectors/:name/sync`.
3. `POST /connectors/errors/retry`.

## 4) Падение полноты данных между системами

Симптом: в одной системе сделки есть, в dashboard нет.

Проверить:

- `GET /connectors/reconciliation` (missing/duplicate/completeness).
- в raw-таблицах есть ли записи с нужным `external_id`.
- в CRM mirror корректно заполнены `source_system` и `external_ref`.

Действия:

1. Запустить `POST /connectors/reconciliation/run`.
2. Сделать targeted sync нужного коннектора.
3. Проверить dedupe конфликты (уникальные индексы по `external_ref`).

## 5) Auth/CSRF проблемы

Проверить:

- session cookie существует;
- CSRF cookie соответствует `x-csrf-token`;
- `CORS_ORIGIN` совпадает с доменом UI.

## 6) Что мониторить постоянно

- `connector_errors` (рост, dead-letter).
- лаг по `connector_sync_state`.
- `sync_reconciliation_metrics` (completeness/missing/duplicates).
- долю `rag_chunks` в `failed`/`processing`.
- долю ошибок LightRAG query по `audit_events`.
