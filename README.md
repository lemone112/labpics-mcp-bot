# Labpics MCP Bot (v2) — внутренняя AI‑операционная система Labpics

Этот репозиторий — production‑код внутреннего продукта Labpics, который:

- превращает переписки с клиентами (Chatwoot) в **операционную память** (Supabase)
- извлекает **договорённости (commitments)** и **следующие шаги**
- помогает управлять **PM (Linear)** и **CRM (Attio)**
- предоставляет единый интерфейс через **Telegram**

> Этот README написан так, чтобы при потере контекста можно было восстановить **абсолютно всё важное**: архитектуру, данные, контракты, ограничения, runbooks, приоритеты.

---

## Легенда: статусы и приоритеты

**Статусы:**
- ✅ реализовано и используется
- 🧪 реализовано частично / прототип
- 🗺️ план (описано как должно работать)

**Приоритеты:**
- **P0** — критично для надёжности/масштабирования/стоимости
- **P1** — даёт максимальную бизнес‑ценность PM/CRM
- **P2** — усилители/удобство/приятности

---

## 0) TL;DR (как система работает в 20 строк)

1) Клиент пишет в Chatwoot.
2) `cw-sync` регулярно забирает conversations/messages и пишет raw данные в `cw_*` таблицы Supabase.
3) `cw-sync` режет сообщения в чанки и сохраняет в `rag_chunks`.
4) `cw-sync` считает embeddings (OpenAI) и сохраняет `rag_chunks.embedding` (pgvector).
5) PM/аккаунт‑менеджер общается с ботом в Telegram (`tgbot`).
6) `tgbot` хранит состояние пользователя (активный проект, pending input) в Supabase.
7) `tgbot` отправляет запрос в `agent-gw` через Service Binding и подписывает payload HMAC.
8) `agent-gw` строит контекст проекта (links + память + commitments).
9) `agent-gw` выполняет intent: поиск / извлечение договорённостей / предложения действий.
10) Результат возвращается в Telegram как текст + inline‑клавиатура.

---

## 1) Компоненты (Cloudflare Workers)

### 1.1 `tgbot` — Telegram UI / контроллер
**Роль:** UI, роутинг, state, безопасность подписи.

✅ Реализовано:
- Telegram webhook
- UI: Home / Projects / Dashboard / Search / Договорённости
- pending input state (`user_input_state`)
- active project per user (`user_project_state`)
- сервисный вызов `agent-gw` через binding `AGENT_GW`
- диагностические endpoints: `/__whoami`, `/__env`, `/health`

🗺️ Принцип:
- `tgbot` НЕ делает LLM и тяжёлые операции
- `tgbot` НЕ должен напрямую дергать Attio/Linear (в v2), только создавать jobs через агента

### 1.2 `agent-gw` — агент (intent + инструменты + контекст)
**Роль:** “мозг” системы. В v2 внутри него выделяем `agent-core`.

✅ Реализовано:
- intent: commitments vs search (MVP)
- commitments extraction через LLM (OpenAI) → запись в `project_commitments`
- идемпотентное поведение upsert commitments (dedup конфликт не ломает UX)
- выдача ответов в TG как `{text, keyboard}`

🧪 Частично:
- поиск по памяти проекта (пока MVP)
- интеграционные действия (Linear/Attio) — как сценарии/прототипы, но не полный прод‑поток

🗺️ В v2:
- agent-core = intent-router + context-builder + tool-orchestrator
- tools = маленькие изолированные функции со строгими контрактами

### 1.3 `cw-sync` — ingestion (Chatwoot → Supabase + embeddings)
**Роль:** сбор переписок + построение векторной памяти.

✅ Реализовано:
- polling Chatwoot
- watermark/cursor
- запись raw: `cw_conversations`, `cw_messages`
- чанкинг → `rag_chunks` (status pending)
- embeddings batch → `rag_chunks.embedding` (status ready)
- endpoints: `/health`, `/sync`, `/embed` (Bearer `SYNC_TOKEN`)
- scheduled: периодическое embedd’инг‑дособирание

🗺️ В v2:
- строгие лимиты и rate limit защита
- batch embeddings ≤ 100 за вызов
- опциональная очередь `embedding-queue`

---

## 2) Системы (внешние) и их роль

### Chatwoot (коммуникации)
- источник правды по тексту и динамике общения
- ingestion в Supabase делается через `cw-sync`

### Supabase (операционная память + pgvector)
- хранит проекты, линковку, commitments, raw chat и rag_chunks
- является внутренним data backbone

### Linear (PM)
- задачи и проекты, создаваемые из договорённостей / action items

### Attio (CRM)
- company/person/deal
- в v2: автоматическое дополнение карточек из переписок через patch flow

---

## 3) Модель данных (текущая v1 + план v2)

### 3.1 Текущие ключевые таблицы (v1)

**Проекты/состояние/линковка:**
- `public.projects`
- `public.project_links` (ключевой слой интеграций)
- `public.project_conversation_map`
- `public.telegram_users`
- `public.user_project_state`
- `public.user_input_state`

**Chatwoot raw:**
- `public.cw_conversations`
- `public.cw_messages`
- `public.cw_contacts`
- `public.cw_webhook_events` (таблица есть; ingestion сейчас polling)

**RAG:**
- `public.rag_chunks` (pgvector, embedding_status)

**Commitments:**
- `public.project_commitments`

**Automation/ops:**
- `public.automation_settings`
- `public.automation_jobs`
- `public.audit_log`
- `public.integration_watermarks`
- `public.rag_chatwoot_sync_state` (legacy)
- `public.sync_watermarks` (новее)

### 3.2 Сигналы из текущих данных (факты)

Из `project_links` уже используются типы:
- `linear.linear_issue` (несколько)
- `attio.company`, `attio.deal`, `attio.person`
- `chatwoot.contact`, `chatwoot.conversation`, `chatwoot.message`

Это подтверждает: продукт реально нацелен на синхронизацию CRM/PM поверх переписок.

### 3.3 Multi-tenant (v2) — для внутренней студии

Мы остаёмся **внутренним продуктом**, но строим multi-tenant как “multi‑workspace”:
- разные команды/направления/юридические лица студии
- возможность изоляции данных и лимитов

**Решение tenant boundary:** org = **Attio workspace** (CRM‑контур).

🗺️ Новые таблицы:
- `organizations(id, name, billing_plan, meta, created_at)`
- `memberships(user_id, organization_id, role)`
- `users(id, display_name, meta, created_at)`

🗺️ Изменения:
- `projects` → добавить `organization_id NOT NULL`

---

## 4) Идентификаторы и нормализация (важно для идемпотентности)

### 4.1 Глобальные ID (рекомендация)

- Chatwoot conversation: `cw:<account_id>:<conversation_id>`
- Chatwoot message: `cwmsg:<account_id>:<message_id>`

Это уже используется в коде `cw-sync`.

### 4.2 Дедупликация commitments

В БД есть dedup (уникальный индекс), поэтому:
- commitments upsert должен быть идемпотентным
- повторные извлечения не должны ломать UX

✅ Уже исправлено в `agent-gw`.

---

## 5) Контракты v2 (agent-core / tool-layer)

> Цель: tools не должны зависеть от UI, а UI не должен зависеть от внутренней реализации.

### 5.1 Контракт запроса `tgbot → agent-gw`

**Вход (payload):**
- `request_id` (correlation_id)
- `telegram_user_id`
- `chat_id`
- `active_project_id`
- `user_text`
- `context`:
  - `project` (минимум: id/name/status)
  - `links[]` (Attio/Linear/Chatwoot)
  - (опционально) топ‑чанки памяти

**Безопасность:** HMAC подпись заголовком `x-signature`.

**Выход (agent response):**
- `text` (HTML для Telegram)
- `keyboard` (inline keyboard)
- (в v2) `actions[]` (предложения действий)

### 5.2 Контракт tool

Каждый tool:
- принимает `tool_input` (JSON)
- возвращает `tool_output` (JSON)
- пишет usage_event
- не содержит intent‑маршрутизации

Примеры tools v2:
- `search_project_memory`
- `extract_commitments`
- `suggest_attio_patch`
- `apply_attio_patch` (через automation job)
- `create_linear_issue`
- `update_linear_issue`
- `generate_weekly_digest`

---

## 6) RAG v2 (как должно работать)

### P0: перейти на embedding retrieval

**Цель:** использовать pgvector RPC `match_rag_chunks` (уже есть в БД) вместо `ilike`.

**Pipeline:**
1) embedding запроса
2) vector similarity topK=50
3) дедуп по `message_global_id`
4) top 15 chunks
5) опционально LLM rerank

**Лимиты:**
- `max_chunks = 15`
- `max_context_tokens = 6000`

---

## 7) Очереди и automation-worker (v2)

### P0: все внешние изменения через jobs

🗺️ Компоненты:
- `automation-queue` (Cloudflare Queue)
- `automation-worker` (новый Worker)

**automation-worker делает:**
- выполнение `automation_jobs`
- retries с backoff
- DLQ
- строгую идемпотентность

**Idempotency:**
- `automation_jobs.idempotency_key`
- уникальный индекс `(organization_id, idempotency_key)`

---

## 8) Commitments lifecycle UI (v2)

### P1: превратить commitments в управляемые объекты

Telegram UI:
- done
- cancel
- assign owner
- set due
- create Linear issue

---

## 9) CRM Patch Flow (Attio)

### P1: автозаполнение CRM из переписок

Поток:
1) агент генерирует patch diff (структурно)
2) Telegram показывает diff
3) Apply / Ignore
4) Apply → `automation_job`
5) `audit_log` + evidence

---

## 10) Weekly Digest

### P1: управляемая регулярность

Содержимое:
- закрытые commitments
- просроченные
- новые риски
- инсайты
- Linear summary

Каналы:
- Telegram
- опционально Linear comment

Запуск:
- cron
- manual

---

## 11) Observability и cost control

### P0: correlation + usage events

**Observability:**
- correlation_id во всех логах
- structured JSON logs
- p95 latency
- queue depth
- automation failure rate

**Cost control:**
- `usage_events` + лимиты на org
- деградация модели (intent → дешёвая; reasoning → основная)
- лимиты: max tool calls / max tokens / max commitments per run

---

## 12) Runbooks (операционные инструкции)

### 12.1 Telegram: dev‑бот не отвечает
1) проверить `tgbot-dev/health`
2) проверить `tgbot-dev/__env` (видит ли TELEGRAM_WEBHOOK_PATH)
3) проверить `getWebhookInfo` у dev‑бота
4) переустановить webhook на `https://tgbot-dev...<path>`

### 12.2 cw-sync: не растут embeddings
1) проверить `/health`
2) вызвать `/embed` (Bearer)
3) проверить `rag_chunks` по `embedding_status`

### 12.3 Commitments: дубли/ошибки
- dedup индекс существует → upsert обязан быть идемпотентным (✅ сделано)

---

## 13) Приоритеты работ (Roadmap)

### P0 (надёжность/масштаб/стоимость)
- 🗺️ organizations/users/memberships + organization_id на projects
- 🗺️ usage_events
- 🗺️ embedding search (match_rag_chunks)
- 🗺️ automation-worker + queues + DLQ + idempotency
- 🗺️ structured logs + correlation_id

### P1 (максимальная ценность для PM/CRM)
- 🗺️ commitments lifecycle UI
- 🧪 Linear actions через jobs
- 🧪 Attio patch preview/apply
- 🗺️ weekly digest

### P2 (усилители)
- 🗺️ onboarding wizard
- 🗺️ billing hooks/лимиты
- 🗺️ мульти‑канальность

---

## 14) Быстрый старт (внутренний)

### Деплой
- ✅ `Deploy (dev)` — auto на push в `main`
- ✅ `Deploy (prod)` — manual

### Диагностика
`tgbot`:
- ✅ `GET /__whoami`
- ✅ `GET /__env`
- ✅ `GET /health`

`cw-sync`:
- ✅ `GET /health`
- ✅ `GET /sync` (Bearer `SYNC_TOKEN`)
- ✅ `GET /embed` (Bearer `SYNC_TOKEN`)
