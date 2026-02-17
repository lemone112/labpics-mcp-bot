# Iteration log и самоанализ

## Iteration 1 (закрыта): Recommendation -> Evidence -> Action

### Что было слабым местом (самоанализ)

1. Рекомендации генерировались, но не было продуктового цикла "показали -> сделали действие -> зафиксировали результат".
2. Explainability была частичной: evidence были, но не было явного UX-ответа "почему показывается сейчас".
3. Не хватало операционной наблюдаемости на уровне recommendation lifecycle (shown/action/retry).

### Что реализовано

- Evidence gating:
  - `evidence_count`,
  - `evidence_quality_score`,
  - `evidence_gate_status`,
  - `evidence_gate_reason`.
- Lifecycle timestamps:
  - `acknowledged_at`,
  - `dismissed_at`,
  - `completed_at`,
  - `first_shown_at`, `last_shown_at`, `shown_count`.
- Action execution layer:
  - `create_or_update_task`,
  - `send_message`,
  - `set_reminder`,
  - retries через `recommendation_action_runs`.
- Серверные логи:
  - `recommendation_shown`,
  - `recommendation_action_taken`.
- UI секция "Рекомендации" в Control Tower:
  - список,
  - explainability блок,
  - evidence,
  - кнопки действий,
  - лог action-runs.

## Iteration 2 (следующая): Signals + Forecasting как UX-продукт

### Цель

Сделать сигналы/прогнозы понятными PM на уровне принятия решения.

### Backlog задач

1. Каталог сигналов с версионированием:
   - `signal_id`, `version`, `description`, `formula`, `confidence_policy`, `severity_policy`.
2. Вклад top-k сигналов в рекомендацию:
   - визуальный breakdown по signal contribution.
3. Counterfactual hints:
   - "что изменится, если снизить blockers_age / burn_rate".
4. Калибровочные тесты:
   - детерминированность,
   - пороги drift/скачков вероятности между релизами.

### Release критерий по Iteration 2

- PM видит baseline, drivers, confidence и top-k вклады прямо в карточке рекомендации;
- вероятности forecast не демонстрируют резких скачков на стабильном входе (по тестам).
