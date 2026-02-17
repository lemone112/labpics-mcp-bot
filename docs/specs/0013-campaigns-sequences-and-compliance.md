# Спека 0013 — Campaigns / Sequences / Compliance

Статус: **draft**

Дата: 2026-02-17

> Roadmap: CRM/PM/Sales


## Цель

Дать студии управляемые рассылки для:

- прогрева (education)
- reactivation
- expansion/upsell
- post-delivery follow-up

При этом:

- обязательный opt-out,
- частотные ограничения,
- approval.

## Каналы (v1)

- Email (при наличии)
- Chatwoot (если это допустимый канал)

Telegram — только если юридически/этически ок.

## Сущности

### audience_segment
- `id`, `name`
- `query` (jsonb: правила сегмента)

### campaign
- `id`, `name`, `goal`
- `segment_id`
- `status` (draft|approved|running|paused|completed)
- `created_by`

### sequence
- `id`, `campaign_id`
- `steps[]`: {day_offset, channel, template_id}

### message_template
- `id`, `name`, `subject`, `body_md`

### outbound_message
- `id`, `account_id`, `contact_id`
- `campaign_id`, `sequence_step`
- `status` (draft|approved|sent|failed|canceled)
- `approval_actor`
- `sent_at`

### opt_out
- `contact_id`
- `channel`
- `reason`
- `created_at`

## Compliance / Guardrails

- Frequency cap по умолчанию:
  - max 2 касания/неделя/контакт
  - max 4 касания/неделя/аккаунт
- Любой reply клиента останавливает sequence для контакта.
- Opt-out останавливает всё по каналу.
- Без approve ничего не отправляется.

## Метрики

- sent/open/click/reply
- conversion to meeting/opportunity
- opt-out rate

## Критерии приёмки

- Можно создать сегмент.
- Можно собрать sequence.
- Approval обязателен.
- Частотные лимиты соблюдаются.
- Opt-out работает.
