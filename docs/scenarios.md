# Ручные сценарии (Iteration 1)

Документ фиксирует минимум ручных e2e-сценариев для вертикали:

`Recommendation -> Evidence -> Action`.

---

## Сценарий 1: Waiting on client -> отправка follow-up

1. Открыть `Control Tower -> Рекомендации`.
2. Выбрать рекомендацию категории `Ожидание клиента`.
3. Проверить блок **"Почему я это вижу"**:
   - есть rationale/why_now,
   - есть `evidence_count`,
   - `evidence_gate_status = visible`.
4. Нажать **"Отправить сообщение"**.
5. Проверить:
   - в карточке есть запись в "Лог действий" со статусом `succeeded`,
   - в `/audit?action=recommendation_action_taken` есть событие с action_type `send_message`.

Ожидаемый результат: follow-up отправлен через outbox, рекомендация переходит минимум в `acknowledged`.

---

## Сценарий 2: Delivery risk -> create/update task

1. В рекомендациях выбрать карточку `Delivery risk`.
2. Нажать **"Создать / обновить задачу"**.
3. Проверить:
   - в "Лог действий" есть run типа `create_or_update_task`,
   - в `linear_issues_raw` появилась/обновилась запись с `data.source = recommendation_action`.

Ожидаемый результат: действие идемпотентно (повторный вызов обновляет ту же задачу, не создавая дубликат).

---

## Сценарий 3: Finance risk -> set reminder + retry failed action

1. Выбрать рекомендацию `Finance risk`.
2. Нажать **"Поставить напоминание"**.
3. Проверить:
   - создан/обновлён `scheduled_jobs.job_type = recommendation_reminder:<recommendation_id>`.
4. Для любого failed action в логе нажать **"Повторить"**.
5. Проверить:
   - attempts увеличился,
   - появился новый `recommendation_action_taken` в `/audit`.

Ожидаемый результат: retry выполняется без пересчёта всего KAG-пайплайна.
