# Спека 0013 — Campaigns / Sequences / Compliance (DRAFT)

Статус: **draft**

## Цель

Дать студии инструменты рассылок и прогрева:

- lifecycle sequences
- reactivation
- expansion campaigns

С соблюдением правил: частота, opt-out, approval.

## Объекты данных

- Campaign
- Sequence
- Touch (message)
- Subscription/Opt-out

## Основные правила

- Frequency cap: не более N касаний в неделю на контакт.
- Opt-out обязателен.
- Approval queue обязателен для outbound.

## UX

- Campaign builder
- Очередь на approve
- Отчёты: open/click/reply, conversions

## Критерии приёмки

- Можно собрать sequence из 3–5 касаний.
- Система соблюдает частотные ограничения.
- Любая отправка требует approve.
