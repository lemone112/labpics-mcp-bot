# Runbooks (эксплуатация)

Практические сценарии диагностики и восстановления для production/staging.

Стартовая точка: [`docs/index.md`](./index.md)

---

## 1) Быстрый operational checklist

1. `GET /health` и `GET /metrics` отвечают без ошибок.
2. Есть валидная сессия и активный проект.
3. `GET /jobs/scheduler` показывает актуальные due jobs.
4. `GET /connectors/state` не содержит зависших `running` с устаревшим timestamp.
5. `GET /kag/events` показывает process finish события за последний цикл.
6. Для проблемных проектов есть `project_snapshots`, `kag_risk_forecasts`, `recommendations_v2`.

---

## 2) Search возвращает пусто

Проверки:

- выбран активный проект;
- в `rag_chunks` есть записи по проекту;
- embeddings имеют `ready > 0`;
- корректен `OPENAI_API_KEY`.

Действия:

1. `POST /jobs/chatwoot/sync`
2. `POST /jobs/embeddings/run`
3. повторить `POST /search`

---

## 3) Connector sync падает

Проверки:

- `GET /connectors/errors`
- `GET /connectors/state`
- корректность env токенов:
  - Chatwoot: `CHATWOOT_*`
  - Linear: `LINEAR_*`
  - Attio: `ATTIO_*`

Действия:

1. исправить env/квоты/доступы;
2. выполнить `POST /connectors/:name/sync`;
3. при накопленных ошибках — `POST /connectors/errors/retry`.

Если ошибка повторяется:

- проверить backoff в `connector_errors`,
- убедиться, что не достигнут `dead_letter`,
- анализировать payload ошибки и `kag_event_log`.

---

## 4) Daily KAG pipeline не даёт результата

Симптом:

- нет новых snapshots/forecasts/recommendations после суточного окна.

Проверки:

- feature flags:
  - `KAG_ENABLED`
  - `KAG_SNAPSHOTS_ENABLED`
  - `KAG_FORECASTING_ENABLED`
  - `KAG_RECOMMENDATIONS_V2_ENABLED`
- наличие source событий в `kag_event_log`.

Действия:

1. `POST /kag/snapshots/refresh`
2. `POST /kag/v2/forecast/refresh`
3. `POST /kag/v2/recommendations/refresh`
4. проверить `GET /kag/events` на `process_failed/process_warning`.

---

## 5) Recommendations v2 пустые или мало записей

Проверки:

- есть ли forecast для проекта;
- есть ли evidence refs в сигналах/прогнозах;
- нет ли фильтрации по `publishable=false`.

Действия:

1. диагностировать последние warnings в `kag_event_log`;
2. проверить трассировку на message/issue/deal refs;
3. перезапустить refresh после восстановления источников.

---

## 6) Similarity не находит похожие кейсы

Проверки:

- есть ли `project_snapshots` за окно;
- есть ли `case_signatures` по `window_days`;
- корректные параметры `window_days/top_k`.

Действия:

1. `POST /kag/similarity/rebuild`
2. `GET /kag/similar-cases?project_id=...&window_days=14&top_k=5`

---

## 7) Auth loop / unauthorized

Проверки:

- session cookie создаётся и отправляется;
- CSRF cookie + `x-csrf-token` для POST/PATCH/DELETE;
- `CORS_ORIGIN` совпадает с UI origin.

Действия:

- очистить cookies и перелогиниться;
- выровнять CORS/CSRF настройки.

---

## 8) Что мониторить постоянно

- доля `process_failed` и `process_warning` в `kag_event_log`,
- рост `connector_errors` и dead-letter записей,
- lag по `connector_sync_state.cursor_ts`,
- доля `publishable=false` в snapshots/forecasts,
- доля рекомендаций со статусом `new` без обработки.
