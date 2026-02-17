# Спека 0011 — Signals & Next Best Action (продажи + PM)

Статус: **draft**

Дата: 2026-02-17

> Roadmap: CRM/PM/Sales


## Цель

Сделать единый “action inbox” для студии:

- обнаруживать **сигналы** в коммуникациях и событиях продукта,
- рассчитывать **severity** и **confidence**,
- предлагать **Next Best Action** (NBA) с evidence,
- проводить outbound через approval queue.

## Не-цели (v1)

- Автодействия без подтверждения человека.
- Полноценный автопилот продаж.

## Инварианты

- Каждый сигнал содержит evidence refs.
- Дедупликация сигналов обязательна.
- Внешние сообщения только через approve.

## Сущности

### signal
- `id`
- `scope`: account_id/project_id/opportunity_id (0..n)
- `type`
- `subtype`
- `severity` (low|med|high)
- `confidence` (0..1)
- `summary`
- `why` (короткое объяснение)
- `evidence_refs` (jsonb[])
- `recommended_actions` (jsonb[])
- `status` (proposed|accepted|dismissed|done)
- `owner_user_id`
- `created_at`, `updated_at`

### action_template
- `id`
- `name`
- `applies_to` (signal.type)
- `steps` (jsonb)
- `draft_message_template` (text)

## Каталог типов сигналов (v1)

### Sales / Expansion
- `sales.upsell_request`
- `sales.cross_sell_interest`
- `sales.budget_discussion`
- `sales.fast_track`
- `sales.retainer_interest`

### PM / Delivery
- `pm.scope_creep`
- `pm.deadline_risk`
- `pm.blocked_by_client`
- `pm.quality_risk`

### Finance
- `finance.payment_risk`
- `finance.procurement_delay`

## Severity matrix (пример)

- High: риск срыва дедлайна / явный запрос “срочно и за деньги” / конфликт требований
- Med: намёк на расширение / задержка ответа 3–5 дней
- Low: слабый сигнал интереса

## Confidence scoring (правила)

Вычисляется из:

- прямоты формулировки (явный запрос vs намёк)
- наличия чисел/сроков/бюджета
- повторяемости (≥2 сообщений)
- роли контакта (decision maker ↑)

Правило:
- `confidence < 0.6` → сигнал остаётся proposed, не пушим как high-priority.

## Дедупликация

Ключ дедупа:

- (type, scope, normalized_phrase_hash) в окне 7 дней

Если совпало:
- обновляем evidence_refs и updated_at
- не создаём новый сигнал

## Next Best Action (NBA)

NBA содержит:

- `title`
- `steps[]`
- `expected_impact` (text)
- `risks` (text)
- `draft_outbound` (опционально)

## Approval queue

Outbound объект:

- `outbound_message` (draft|approved|sent|canceled)
- связывается с signal_id
- содержит канал (chatwoot/telegram/email)

## UX

- Экран Signals: сортировка по severity + overdue
- Карточка: evidence, NBA, approve draft

## Операционка

Метрики:
- signals/week
- accept rate
- time-to-accept
- revenue attributed (позже, см 0016)

## Критерии приёмки

- Сигналы создаются из новых сообщений.
- Есть дедуп.
- Можно accept/dismiss.
- NBA отображается с evidence.
- Outbound требует approve.
