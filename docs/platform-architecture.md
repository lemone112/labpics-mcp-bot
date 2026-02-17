# Платформенная архитектура и инварианты

Документ фиксирует обязательные правила для всех доменов (RAG, CRM, KAG, forecasting, recommendations).

---

## 1) Scope (необсуждаемо)

- Все чтения/записи выполняются в рамках `project_id`.
- Для мультипроектного режима дополнительно обязателен `account_scope_id`.
- Protected API работают только при активном проекте в сессии.
- На уровне БД применяется trigger `enforce_project_scope_match`.

Зачем:

- защита от утечек между проектами,
- предсказуемое поведение в all-projects режимах.

---

## 2) Deterministic intelligence + LLM boundaries

- Signals / scores / forecasts / recommendation decision logic — только deterministic (rules + stats).
- LLM разрешён только для:
  - extraction структур из сообщений,
  - генерации текстовых шаблонов,
  - (опционально) summarization.

Зачем:

- повторяемость,
- контролируемая стоимость,
- минимизация галлюцинаций.

---

## 3) Evidence-first + gating

- Любая производная сущность должна иметь evidence links.
- Snapshot/forecast/recommendation без evidence:
  - не попадает в primary выдачу (`publishable=false` или фильтрация),
  - логируется `process_warning` в `kag_event_log`.

Зачем:

- доверие PM к выводам,
- объяснимость каждого решения,
- снижение ложноположительных алертов.

---

## 4) Connector reliability и fault isolation

- Каждому connector соответствует состояние в `connector_sync_state`.
- Ошибки пишутся в `connector_errors` с backoff и DLQ-статусами.
- Retry выполняется точечно по конкретному connector и не валит весь цикл.

Зачем:

- устойчивость к нестабильным внешним API,
- экономный retry без лишней нагрузки.

---

## 5) Event-first observability

Платформа ведёт единый `kag_event_log` для:

- domain events (`message_sent`, `issue_blocked`, `deal_stage_changed`, ...),
- process events (`process_started`, `process_finished`, `process_failed`, `process_warning`).

Лог содержит:

- длительность,
- счётчики обработки,
- источник/ссылки на origin id.

Зачем:

- health-timeline системы,
- быстрая диагностика,
- база для UI-мониторинга.

---

## 6) Outbox и контролируемые коммуникации

Для outbound действий обязателен state machine:

- `draft -> approved -> sent`

Guardrails:

- opt-out,
- frequency caps,
- stop-on-reply,
- идемпотентность по dedupe/idempotency ключам.

---

## 7) Scheduler/worker контракт

- scheduler только claim’ит due jobs и фиксирует `worker_runs`;
- задачи должны быть идемпотентны и безопасны при повторе;
- каждый цикл должен быть bounded (лимиты/окна обработки).

---

## 8) API observability baseline

- Каждый ответ содержит `request_id` + header `x-request-id`.
- Критические операции пишут `audit_events`.
- Ошибки jobs/connectors наблюдаемы через API и таблицы статусов.

---

Детали по таблицам и индексам: [`docs/data-model.md`](./data-model.md)  
Операционные циклы: [`docs/pipelines.md`](./pipelines.md)
