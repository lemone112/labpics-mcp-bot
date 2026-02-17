# Спека 0010 — Accounts & Opportunities (CRM ядро) v1

Статус: **draft**

Дата: 2026-02-17

> Roadmap: CRM/PM/Sales


## Цель

Построить CRM-ядро, заточенное под проектную дизайн-студию, чтобы:

- фиксировать **отношения** с клиентами (Account/Contacts),
- вести **воронку** (Opportunities),
- связывать продажи с delivery (Projects) без потери контекста,
- ускорять продажи и повышать win rate за счёт дисциплины next step и evidence-first.

## Не-цели (v1)

- Полноценный multi-tenant SaaS с биллингом.
- Сложная RBAC матрица (в v1 достаточно owner + ограниченный набор ролей).
- Автоматическая синхронизация с внешним CRM как “истина” (в v1 — мы истина в рамках продукта).

## Персоны

- **Owner/Founder** — смотрит портфель и прогноз.
- **BD/Sales** — ведёт сделки, отправляет офферы.
- **PM** — ведёт delivery и подхватывает риски/сигналы.

## Инварианты

- **Evidence-first**: поля “почему” и важные изменения (stage/amount/discount) имеют evidence.
- **Safe-by-default**: автосоздание сущностей только как proposed, без автодействий.
- **Account-scope** не отменяет **project-scope**: проект остаётся изолятором данных.
- **Идемпотентность** импорта: повторное назначение inbound не создаёт дубликаты.

## Термины

- **Account** — компания/клиент (верхнеуровневый контейнер отношений).
- **Contact** — конкретный человек внутри Account.
- **Opportunity** — сделка (продажа/допродажа).
- **Next step** — конкретный следующий шаг (что/кто/когда).
- **Forecast category** — pipeline/best_case/commit.

## Модель данных (рекомендуемая)

### accounts
- `id` (uuid)
- `name` (text, required)
- `domain` (text, nullable)
- `industry` (text, nullable)
- `segment` (text: smb|mid|enterprise|custom)
- `status` (text: active|dormant|churned)
- `owner_user_id` (uuid)
- `icp_fit_score` (int 0..100)
- `icp_fit_reason` (text)
- `created_at`, `updated_at`

Индексы/уникальности:
- unique lower(`domain`) WHERE domain IS NOT NULL
- index on (`owner_user_id`, `status`)

### contacts
- `id` (uuid)
- `account_id` (uuid, fk)
- `name` (text)
- `email` (text, nullable)
- `phone` (text, nullable)
- `role_tags` (text[])
- `influence_score` (int 0..100)
- `created_at`, `updated_at`

Уникальность:
- unique lower(email) WHERE email IS NOT NULL

### opportunities
- `id` (uuid)
- `account_id` (uuid, fk)
- `name` (text, required)
- `stage` (text)
- `amount_estimate` (numeric)
- `currency` (text)
- `probability` (numeric 0..1)
- `forecast_category` (text)
- `close_date_target` (date)
- `source` (text)
- `primary_competitor` (text, nullable)
- `owner_user_id` (uuid)
- `next_step_text` (text, nullable)
- `next_step_due_at` (timestamptz, nullable)
- `status` (text: open|won|lost)
- `lost_reason` (text, nullable)
- `created_at`, `updated_at`

Индексы:
- index (`owner_user_id`, `stage`, `status`)
- index (`account_id`, `status`)

### opportunity_events (audit)
- `id`
- `opportunity_id`
- `event_type` (stage_changed|amount_changed|probability_changed|note_added|lost|won)
- `old_value` (jsonb)
- `new_value` (jsonb)
- `actor_user_id`
- `evidence_refs` (jsonb array)
- `created_at`

## Стадии и правила

Стадии по умолчанию (настраиваемые, но фиксируем семантику):

- `lead` — ещё не подтверждено, что это реальный запрос/клиент.
- `qualified` — есть явная потребность и шанс.
- `discovery` — собираем требования/контекст.
- `proposal_sent` — отправили оффер.
- `negotiation` — обсуждаем условия.
- `won` — подтверждённая продажа.
- `lost` — закрыто как проигрыш.

Правила:

- При переходе в `qualified` и далее **обязателен** `next_step_due_at`.
- `won/lost` переводят `status`.
- `lost_reason` обязателен при `lost`.

## Автосоздание и triage inbound

### Источники inbound
- Chatwoot conversations/messages
- Telegram threads
- Email (позже)

### Правило автосоздания

Если входящее нельзя однозначно привязать:
- создаём запись **inbound_thread** со статусом `unassigned`
- человек выбирает Account или создаёт новый
- опционально: “создать proposed opportunity”

Никаких автоматических отправок/изменений stage.

## UX

### Accounts list
- фильтры: status/segment/owner
- столбцы: health (из 0014), активные проекты, открытые opportunities, last touch

### Account page
- контакты
- проекты
- сделки
- timeline касаний + сигналы

### Opportunities board
- канбан по stage
- SLA: подсветка overdue next step

### Opportunity page
- ключевые поля + next step
- блок evidence (ссылки на сообщения)
- кнопка “создать Offer” (0012)

## API/команды (черновой контракт)

- `POST /accounts` create
- `POST /opportunities` create
- `PATCH /opportunities/:id` update stage/amount/probability/next_step
- `GET /accounts/:id`
- `GET /opportunities?owner&status&stage`

Все изменения — через audit event.

## Failure modes

- Дубликаты аккаунтов по домену → предлагаем merge (ручной), ничего не сливаем автоматически.
- Отсутствует next step на стадии `qualified+` → блокируем сохранение.

## Операционка

Метрики:
- pipeline по стадиям
- aging: время в стадии
- win rate
- SLA next step overdue

Runbooks:
- “Почему сделки зависают” → отчёт overdue next step

## Критерии приёмки

- Можно создать Account/Contact/Opportunity.
- Можно вести Opportunity по стадиям, соблюдая обязательные поля.
- Любое изменение stage/amount фиксируется в audit с actor.
- Есть kanban, список, карточка.
