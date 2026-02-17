# Спека 0005 — Интеграции Linear/Attio: preview/apply (DRAFT)

Статус: **draft**

## Факт принципа

- Любые действия, которые могут изменить внешние системы, делаются через **preview → apply**.

## MVP минимум

- Sync (read-only ingest) допустим.
- Writeback — только после явного apply.

## Acceptance criteria

- Нельзя автоматически мутировать данные Linear/Attio без подтверждения.
