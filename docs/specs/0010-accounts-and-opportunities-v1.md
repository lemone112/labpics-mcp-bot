# Спека 0010 — Accounts & Opportunities (CRM ядро) v1 (DRAFT)

Статус: **draft**

## Факты функционала

- Система ведёт Accounts и Contacts.
- Система ведёт Opportunities (воронка/стадии).
- Sales связан с delivery (Projects) без потери контекста.
- Evidence-first: ключевые изменения должны иметь ссылки на источники.

## Acceptance criteria

- Все сущности строго project-scoped.
- Изменение стадии opportunity создаёт audit event (если audit включён).
