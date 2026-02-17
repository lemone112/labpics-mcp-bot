# Пайплайны и автоматизации

Документ описывает рабочие циклы автоматизации и их назначение.

---

## 1) Слои автоматизации

1. **Manual jobs** (ручной запуск через API)
2. **Scheduler jobs** (фоновый запуск по cadence)
3. **Retry/DLQ loops** (восстановление после ошибок интеграций)

Все циклы:

- project-scoped,
- идемпотентные,
- наблюдаемые через `worker_runs`, `job_runs`, `kag_event_log`.

---

## 2) Рекомендуемое расписание (текущее)

### Быстрые циклы

- `connectors_sync_cycle` — каждые ~15 минут
  - общий инкрементальный sync Chatwoot + Linear + Attio
- `connector_errors_retry` — каждые ~5 минут
  - ретрай due ошибок из `connector_errors`
- `kag_recommendations_refresh` — каждые ~15 минут
  - базовый KAG v1 refresh (если feature flags включены)

### Средние циклы

- `embeddings_run` — ~20 минут
- `signals_extraction` — ~15 минут
- `health_scoring` / `upsell_radar` / `analytics_aggregates` — ~30 минут
- `campaign_scheduler` — ~5 минут
- `loops_contacts_sync` — ~60 минут

### Суточные/недельные циклы

- `kag_daily_pipeline` — 1 раз в сутки
  - snapshot -> forecast -> recommendations v2
- `daily_digest` — 1 раз в сутки
- `weekly_digest` — 1 раз в неделю
- `case_signatures_refresh` — 1 раз в неделю

---

## 3) Основной цикл ingest (A)

Каждые ~15 минут:

1. обновление `connector_sync_state`,
2. запуск sync для подключённых источников,
3. upsert новых/изменённых записей в raw-таблицы,
4. фиксация process events в `kag_event_log` (start/finish/error/duration/counters).

Инварианты качества sync:

- **Идемпотентность:** каждый raw-слой пишет через `ON CONFLICT ... DO UPDATE`, повторный sync не создаёт дублей.
- **Полнота:** для Attio/Linear используется постраничная загрузка (не только `first/limit`), чтобы не терять записи при росте объёма.
- **Прозрачность режима:** mock-режим явно логируется как `process_warning` (чтобы не спутать с production-данными).
- **Reconciliation:** после sync Attio считаются coverage-метрики (сколько аккаунтов/сделок дошло до CRM-mirror и где есть разрывы ссылок).

При ошибках:

- запись в `connector_errors`,
- backoff/attempt обновляются,
- в `kag_event_log` пишется процессная ошибка,
- цикл не вызывает cascading failure всей системы.

---

## 4) Retry цикл connector errors (A)

Каждые ~5 минут:

1. выбираются due ошибки (`next_retry_at <= now()`),
2. повторяется sync конкретного источника,
3. при успехе ошибка переводится в `resolved`,
4. при неуспехе повышается attempt/next_retry_at, статус идёт к `dead_letter`.

---

## 5) Event log для мониторинга (B)

`kag_event_log` содержит:

- domain events (из источников),
- process events (`process_started/finished/failed/warning`).

Это единая лента:

- здоровья автоматизаций,
- диагностики,
- источника для UI-мониторинга.

---

## 6) Daily snapshot + outcomes (C)

Раз в сутки:

1. строится `project_snapshots`,
2. считается нормализация сигналов и score-агрегаты,
3. обновляются `past_case_outcomes`.

Назначение:

- тренды,
- similarity,
- forecasting,
- исторический аудит состояния проекта.

---

## 7) Similarity (D)

`case_signatures_refresh` запускается редко (еженедельно), т.к. операция тяжелее:

- пересборка signatures для окон 7/14/30,
- пересчёт event+signal признаков.

По запросу UI:

- `find_similar_cases` возвращает похожие кейсы + причины + outcomes.

---

## 8) Forecast + Recommendations v2 (E/F)

После daily snapshot:

1. прогноз (`kag_risk_forecasts`) на 7/14/30 дней,
2. рекомендации v2 (`recommendations_v2`) с lifecycle/feedback.

В рамках продуктового цикла Iteration 1:

- показ рекомендаций фиксируется как `recommendation_shown` (audit),
- исполнение действия по рекомендации фиксируется как `recommendation_action_taken`,
- execution runs пишутся в `recommendation_action_runs` с retry-метаданными.

Оптимизация токенов:

- LLM-формулировки только для top-N рекомендаций,
- остальное формируется детерминированно.

---

## 9) Evidence gating (G)

Любой snapshot/forecast/recommendation без evidence:

- сохраняется для аудита/диагностики,
- но не публикуется в primary выдаче,
- вызывает `process_warning` в `kag_event_log`.

---

## 10) Полезные API для операций

- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`
- `GET /connectors/state`
- `GET /connectors/errors`
- `POST /connectors/errors/retry`
- `GET /kag/events`

См. также:

- [`docs/api.md`](./api.md)
- [`docs/runbooks.md`](./runbooks.md)
