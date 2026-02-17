# Спека 0012 — Offers / SOW / Quote Builder

Статус: **draft**

Дата: 2026-02-17

> Roadmap: CRM/PM/Sales


## Цель

Ускорить коммерческий цикл и увеличить средний чек:

- Service catalog (пакеты/аддоны)
- Offer builder (сборка предложения)
- SOW/Quote generator (черновик)
- Approval (скидки/отправка)

## Не-цели (v1)

- Электронная подпись и полный legal workflow.
- Автоматическая отправка без approve.

## Сущности

### service_packages
- `id`, `name`
- `price_type` (fixed|range|custom)
- `price_from`, `price_to`
- `currency`
- `duration_days_from`, `duration_days_to`
- `includes` (markdown)
- `excludes` (markdown)
- `ideal_for` (text[])
- `status` (active|deprecated)

### add_ons
- `id`, `name`, `price`, `currency`, `notes`

### offers
- `id`, `account_id`, `opportunity_id`
- `selected_packages` (jsonb)
- `selected_add_ons` (jsonb)
- `assumptions` (markdown)
- `timeline` (markdown)
- `discount` (numeric, nullable)
- `discount_reason` (text, nullable)
- `total_price` (numeric)
- `status` (draft|approved|sent|accepted|rejected)
- `evidence_refs` (jsonb[])
- `created_at`, `updated_at`

### offer_events (audit)
- changes + actor + evidence

## Политика скидок (v1)

- Любая скидка > 0 требует:
  - `discount_reason`
  - approve ролью Owner/BD
  - audit event

## Генерация SOW

SOW должен включать:

- Контекст и цель
- Scope (что делаем)
- Out of scope (что не делаем)
- Таймлайн
- Роли и ответственность
- Процесс изменений (change requests)
- Допущения

## UX

- Offer builder: packages → add-ons → assumptions → preview SOW
- Approve → Send

## Связь с сигналами

- Offer может ссылаться на signal_id (почему возник upsell/fast-track).

## Критерии приёмки

- Есть каталог пакетов.
- Offer создаётся из Opportunity.
- SOW генерируется как черновик.
- Discount требует approve.
- Отправка требует approve.
