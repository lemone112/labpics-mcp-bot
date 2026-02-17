# Спека 0013 — Campaigns / Sequences / Compliance (DRAFT)

Статус: **draft**

## Факты функционала

- Система поддерживает sequences (управляемые последовательности исходящих касаний).
- Встроены guardrails:
  - opt-out
  - frequency caps
  - stop-on-reply
  - approvals (явное подтверждение)

## Acceptance criteria

- Нельзя отправлять касания получателю с opt-out.
- Нельзя превышать frequency caps.
- Нельзя продолжать sequence после reply (если включено stop-on-reply).
- Любая отправка проходит через approval.
