# Спека 0010 — Accounts & Opportunities (CRM ядро) v1 (DRAFT)

Статус: **draft**

## Цель

Добавить CRM-ядро, заточенное под проектную дизайн-студию:

- **Account (клиент/компания)** как контейнер отношений и истории.
- **Opportunity (сделка)** как управляемая воронка до победы/проигрыша.
- Связь Account ↔ Contacts ↔ Projects ↔ Opportunities.

## Почему

Сейчас коммуникации и RAG помогают искать контекст, но не превращают его в:

- управляемую продажу,
- прогноз,
- дисциплину next step,
- возможности допродаж.

## Определения (см. глоссарий)

- Account, Contact, Opportunity, Stage, Next Step, ICP-fit.

## Объекты данных

### Account
Поля (минимум):

- `id`
- `name`
- `domain` (опционально)
- `segment` (SMB/Mid/Enterprise/Custom)
- `industry`
- `icp_fit_score` (0–100, объяснимый)
- `owner_user_id` (кто ведёт)
- `status` (active / dormant / churned)
- `created_at`, `updated_at`

### Contact
- `id`, `account_id`
- `name`, `email/phone` (если доступно)
- `role_tags`: decision_maker / champion / user / procurement
- `influence_score` (0–100)

### Opportunity
- `id`, `account_id`
- `name`
- `stage` (см. ниже)
- `amount_estimate` (в валюте)
- `probability` (0–1)
- `forecast_category` (pipeline / best_case / commit)
- `close_date_target`
- `primary_competitor` (опционально)
- `source` (inbound/referral/outbound)
- `owner_user_id`

### Связи
- Opportunity может быть связана с будущим Project (после Won).
- Project всегда связан с Account.

## Воронка (стадии)

Рекомендуемый дефолт (настраиваемый):

- `lead`
- `qualified`
- `discovery`
- `proposal_sent`
- `negotiation`
- `won`
- `lost`

Переходы фиксируются в audit trail.

## UX / поведение

### Страница Accounts
- список аккаунтов с health/статусом
- быстрые ссылки: проекты, активные opportunities, последние сигналы

### Страница Opportunity
- stage, вероятность, сумма, next step
- панель “контекст из переписок” (evidence-first)

## Safe-by-default

- Автосоздание opportunity из inbound — только в статусе **proposed** (черновик), требует подтверждения.

## Failure modes

- Не удалось привязать inbound к аккаунту → создаём “Unassigned inbox thread” и требуем ручного назначения.

## Операционка

- Минимальные метрики: число сделок по стадиям, среднее время в стадии, win rate.

## Критерии приёмки

- Можно создать Account, Contact, Opportunity.
- Можно перевести Opportunity по стадиям с audit trail.
- Opportunity связана с Account.
- Есть экран списка и карточки.
