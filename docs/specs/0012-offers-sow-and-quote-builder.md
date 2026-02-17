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

## Инварианты

- **Evidence-first**: у Offer всегда есть `evidence_refs` (почему именно этот пакет/аддон).
- **Safe-by-default**: отправка и любые финансовые изменения (скидки/override цены) — только после approve.
- **Idempotency**: повторное нажатие “Send” не создаёт дубликаты отправок; используется outbox-идемпотентность.
- **Auditability**: изменение цены/скидки/статуса фиксируется в `offer_events`.
- **Scope baseline**: принятый Offer создаёт baseline scope для health/risk (см. 0014).

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
- `id`, `offer_id`
- `event_type` (created|price_changed|discount_changed|approved|sent|accepted|rejected)
- `old_value` (jsonb)
- `new_value` (jsonb)
- `actor_user_id`
- `evidence_refs` (jsonb[])
- `created_at`

### outbound_message (связь с 0011/0013)
- Offer→Send создаёт `outbound_message` со ссылкой на offer_id
- отправка через outbox с idempotency_key = offer_id + channel + version

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
- Состояния: draft → approve → send
- Ошибки: “нет approve”, “нет evidence”, “не указан currency/price_type”, “частотный лимит outbound”

## Связь с сигналами

- Offer может ссылаться на signal_id (почему возник upsell/fast-track).

## Критерии приёмки

- Есть каталог пакетов.
- Offer создаётся из Opportunity.
- SOW генерируется как черновик.
- Discount требует approve.
- Отправка требует approve и не дублируется при ретраях.
