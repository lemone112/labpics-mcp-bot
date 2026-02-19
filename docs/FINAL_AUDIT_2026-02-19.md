# Финальный аудит кодовой базы, документации и Issues

**Дата:** 2026-02-19
**Статус:** PRE-CODING GATE — блокирующий документ перед началом разработки
**Охват:** Код сервера, фронтенд, БД/миграции, Redis, LightRAG, интеграции (Attio/Linear/Chatwoot), CI/CD, тесты, дизайн-система, GitHub Issues (200 шт.)

---

## 1. КРИТИЧЕСКИЕ ПРОБЛЕМЫ (блокируют кодинг)

### 1.1 [CRITICAL] Frontend: Toast не экспортируется как компонент
- **Файл:** `web/components/ui/toast.jsx`
- **Суть:** Файл экспортирует `ToastProvider` и `useToast`, но **не экспортирует `Toast`** как именованный компонент.
- **Импорт `{ Toast }` из 10 страниц:** signals, search, login, crm, analytics, projects, control-tower/section-page, digests, jobs, offers — все получают `undefined`.
- **Влияние:** В runtime `<Toast type={toast.type} message={toast.message} />` рендерит `null` → пользователь не видит feedback после действий.
- **Решение:** Экспортировать `Toast = ToastItem` или `Toast = ToastStack`, либо переписать все 10 страниц на `useToast()` хук.

### 1.2 [CRITICAL] Frontend: `lang="en"` вместо `lang="ru"`
- **Файл:** `web/app/layout.jsx:26`
- **Суть:** `<html lang="en">` — весь контент на русском, но язык объявлен как английский.
- **Влияние:** a11y нарушение (screen-reader читает русский текст с английской фонетикой), SEO penalty.
- **Решение:** `<html lang="ru">`

### 1.3 [CRITICAL] Backend: Дублирование `toPositiveInt()` в 3 файлах
- **Файлы:**
  - `server/src/lib/utils.js:3` — `toPositiveInt(value, fallback, min=1, max=100_000)`
  - `server/src/lib/chunking.js:34` — `toPositiveInt(value, fallback, min=1, max=100_000)`
  - `server/src/services/lightrag.js:3` — `toPositiveInt(value, fallback, min=1, max=200)` ← **другой max!**
- **Влияние:** Lightrag-версия молча ограничивает `max=200`, в то время как `chunking` и `utils` используют `max=100_000`. При будущем рефакторинге замена импорта может привести к скрытой ошибке.
- **Решение:** Удалить локальную копию в lightrag.js, импортировать из `lib/utils.js`. Консолидировать utils.js и chunking.js — оставить один canonical export.

---

## 2. ВЫСОКОПРИОРИТЕТНЫЕ ПРОБЛЕМЫ

### 2.1 [HIGH] Frontend: CTA-кнопки без onClick (Codex P2 — OPEN)
- **Файл:** `web/features/control-tower/section-page.jsx:1031`
- **Суть:** `<Button data-testid="primary-cta">{PRIMARY_CTA[normalizedSection]}</Button>` — кнопка без `onClick`.
- Также строки 521, 574, 790, 836, 934, 1007 — все `primaryAction={<Button>...` без обработчиков.
- **Влияние:** Пользователь нажимает CTA → ничего не происходит → confusion.
- **Источник:** Codex code review PR #44. Единственный OPEN finding из 7.

### 2.2 [HIGH] Backend: POST-маршруты без try-catch
- **Файл:** `server/src/index.js` — множественные POST-хендлеры
- **Суть:** Если сервис кидает исключение — Fastify отдаёт 500 со стектрейсом в dev, пустую ошибку в prod.
- **Решение:** Обёрнуть в try-catch с `sendError(reply, toApiError(error))`.

### 2.3 [HIGH] Backend: Inconsistent request validation
- **Суть:** Часть маршрутов валидирует через Zod-схемы (`parseBody`), часть читает `request.query` напрямую без валидации.
- **Файлы:** `index.js:1341`, `1734`, `1784` — неваливированные query-параметры.

### 2.4 [HIGH] Frontend: 6 arbitrary spacing значений
- `section-page.jsx:95` → `h-[240px]` (должен быть `h-60`)
- `chart.jsx:24` → `h-[240px]`
- `form-field.jsx:47` → `text-[13px]` (должен быть `text-xs`)
- Плюс ещё 3 найдены design-audit.mjs.
- **Влияние:** Нарушение DESIGN_SYSTEM_2026.md section 2 (spacing scale).

### 2.5 [HIGH] Redis: Только 2 из 10+ endpoints кешируются
- **Кешированы:** `/control-tower` (120s), `/portfolio/overview` (90s)
- **Не кешированы:** `/projects`, `/signals`, `/analytics`, `/search`, `/jobs`, `/connectors/state`, `/reconciliation`, `/identity/links` и др.
- **Влияние:** Каждый polling-цикл (15-60с) идёт напрямую в PostgreSQL. Потенциальное снижение QPS на 40-50% при расширении кеша.

### 2.6 [HIGH] Rate limiting — in-memory вместо Redis
- **Файл:** `server/src/index.js` — rate limiter хранит counters в памяти процесса.
- **Влияние:** При горизонтальном масштабировании (2+ server instances) лимиты не шарятся между нодами.

---

## 3. СРЕДНИЕ ПРОБЛЕМЫ

### 3.1 [MEDIUM] GitHub Issues: 8 дубликатов
- **Iter 37 внутренние (5):** #293-297 (chart base) дублируют #298-306 (chart concrete)
- **Кросс-milestone (3):** #228/#102 (NPS), #233/#97 (escalation), #200/#256 (API docs)

### 3.2 [MEDIUM] GitHub Issues: 137 issues без priority labels
- Waves 3-7 (Iter 22-43) — sparse labeling, усложняет планирование.

### 3.3 [MEDIUM] GitHub Issues: отсутствуют due dates и assignees
- 33 milestones — ни у одного нет `dueOn`.
- 200 issues — 0 assignees.

### 3.4 [MEDIUM] Documentation: несоответствие номера миграции
- `docs/iteration-plan-wave2.md` упоминает «0021 — последняя миграция».
- **Факт:** последняя миграция — `0023_idempotency_keys.sql`.

### 3.5 [MEDIUM] Frontend: DropdownMenu используется как state selector
- Вместо `Select`/`RadioGroup` для выбора состояния используется `DropdownMenu` → нарушение COMPONENT_SELECTION.md.

---

## 4. СОСТОЯНИЕ ПОДСИСТЕМ

### 4.1 База данных (PostgreSQL + pgvector)
- **23 миграции** (0001–0023), нумерация последовательная (кроме 0017b).
- Все таблицы правильно индексированы (0002, 0017b).
- pgvector: HNSW-индекс на `rag_chunks.embedding`, настройки через env: `SEARCH_IVFFLAT_PROBES=10`, `SEARCH_HNSW_EF_SEARCH=40`.
- **Materialized view** `mv_portfolio_dashboard` — refresh после каждого sync-цикла.
- **Потенциальная проблема:** Отсутствует periodic VACUUM/ANALYZE configuration в docker-compose (autovacuum включен по умолчанию в PostgreSQL).

### 4.2 Redis
- **Версия:** Redis 7-alpine, maxmemory 128MB, policy allkeys-lru.
- **Cache layer** (`lib/cache.js`): graceful degradation (no-op если Redis недоступен), TTL по умолчанию 90s, scanStream для invalidateByPrefix.
- **Pub/Sub** (`lib/redis-pubsub.js`): 2 соединения (publisher + subscriber), канал `job_completed`, callback-based routing с try-catch на каждый callback.
- **SSE** (`lib/sse-broadcaster.js`): трансляция Redis Pub/Sub событий клиентам через Server-Sent Events.
- **Статус:** Работоспособен, но underutilized (см. 2.5).

### 4.3 LightRAG / Embeddings
- **Pipeline:** `chatwoot.js` → chunking → `rag_chunks` (pending) → `embeddings.js` → OpenAI `text-embedding-3-small` → vector storage.
- **Search:** `searchChunks()` → pgvector cosine distance → top-K results.
- **Query:** `queryLightRag()` → parallel: vector search + ILIKE на messages/issues/opportunities → evidence merging → quality score (coverage 40% + diversity 35% + depth 25%).
- **Feedback:** `lightrag_feedback` table, rating [-1, 0, 1] + comment.
- **Stale recovery:** Автоматический recovery stuck `processing` rows через 30 минут (configurable).
- **Max attempts:** 5 попыток на chunk, после чего permanent fail.
- **Статус:** Корректная реализация. Обработка edge-cases (empty query, missing vector, stale rows) присутствует.

### 4.4 Интеграции

#### Attio CRM
- **Сущности:** companies → `attio_accounts_raw`, opportunities → `attio_opportunities_raw`, people → `attio_people_raw`, activities → `attio_activities_raw`.
- **Mock mode:** `ATTIO_MOCK_MODE=1` (по умолчанию ON) — генерирует данные на основе существующих `cw_contacts`.
- **Pagination:** cursor-based с deduplication, max pages configurable.
- **Mirror:** Raw Attio → CRM tables (3-step: update by external_ref → attach by name → insert new).
- **Coverage tracking:** After each sync, counts unmapped opportunities.
- **Статус:** Продакшн-готов. Graceful degradation: people/activities endpoints can fail without blocking.

#### Linear
- **Сущности:** projects, workflow states, cycles, issues → `linear_*_raw` tables.
- **Mock mode:** `LINEAR_MOCK_MODE=1` (по умолчанию ON).
- **API:** GraphQL с pagination (issues, cursor-based).
- **Blocking issues:** tracks `blockedByIssues` for each issue.
- **Статус:** Продакшн-готов.

#### Chatwoot
- **Сущности:** conversations, messages, contacts → `cw_*` tables + `rag_chunks`.
- **Chunking:** Text chunking с configurable `CHUNK_SIZE=1000`, `MIN_EMBED_CHARS=30`.
- **Pagination:** page-based с configurable limits.
- **Lookback:** `CHATWOOT_LOOKBACK_DAYS=7` — only recent conversations.
- **Storage budget:** `STORAGE_BUDGET_GB=20` с alert threshold.

### 4.5 Scheduler & Worker
- **Worker loop:** Separate container (`npm run worker:loop`), runs every 60s.
- **Cascade chains:** `sync → signals + embeddings → health → analytics`.
- **Redis Pub/Sub notification:** After job completion, publishes to `job_completed` channel.
- **Scheduled jobs:** Stored in DB (`scheduled_jobs` table), ticker picks due jobs.
- **Статус:** Well-structured with process logging and cascade triggers.

### 4.6 CI/CD
- **GitHub Actions:** `ci-quality.yml`
  - Server tests (node:test, 19 test files)
  - Web lint + build
  - Playwright e2e (mocked + integration)
  - Smoke test (docker compose → `/health`, `/metrics`, auth check)
- **Deploy:** `deploy-dev.yml`, `deploy-prod.yml`
- **Статус:** Полноценный pipeline. smoke-test.sh существует и работает.

---

## 5. СОСТОЯНИЕ ТЕСТОВ

### 5.1 Server unit tests (19 файлов)
| Файл | Покрытие | Edge-cases |
|---|---|---|
| `chunking.unit.test.js` | Chunking logic | Empty, large, cyrillic text |
| `connector-state.unit.test.js` | State transitions | Error states |
| `connectors.unit.test.js` | Connector infra | Mode switching |
| `db.unit.test.js` | DB helpers | Pool, vector literal |
| `http.unit.test.js` | Retry, circuit breaker | Timeout, status codes |
| `jobs.unit.test.js` | Job lifecycle | Start/finish/fail |
| `lightrag.unit.test.js` | Tokenize, patterns, answer | Cyrillic, empty, long |
| `platform.unit.test.js` | Platform scope | Multi-tenant |
| `portfolio.unit.test.js` | Portfolio calcs | Empty data |
| `reconciliation.unit.test.js` | Sync reconciliation | Missing data |
| `redis-client.unit.test.js` | Redis client | Connection, errors |
| `redis-pubsub.unit.test.js` | Pub/Sub | Callbacks, disconnect |
| `sse-broadcaster.unit.test.js` | SSE broadcast | Multi-client, disconnect |
| `utils.unit.test.js` | Utility functions | Edge values |
| `extended-schemas.unit.test.js` | Extended Zod schemas | Invalid inputs |
| `scheduler.cascade.unit.test.js` | Cascade triggers | Chain completion |
| `schemas.unit.test.js` | Core schemas | Validation boundaries |
| `security-hardening.unit.test.js` | Security | XSS, injection |

### 5.2 Playwright e2e (2 файла)
| Файл | Покрытие |
|---|---|
| `design-system-control-tower.spec.js` | Control Tower UI compliance |
| `project-scope-regression.spec.js` | Project scope switching |

### 5.3 Пробелы в тестовом покрытии
- **Не покрыты unit-тестами:** `attio.js`, `linear.js`, `chatwoot.js`, `signals.js`, `intelligence.js`, `identity-graph.js`, `upsell.js`, `continuity.js`, `audit.js`, `outbox.js`, `loops.js`
- **Не покрыты e2e:** login flow, CRM page, analytics page, search page, signals page, jobs page, digests page, offers page
- **Нет integration tests:** LightRAG end-to-end (query → vector search → results), connector sync chain (mock → DB → CRM mirror)
- **Нет contract tests:** API response shapes не проверяются
- **Нет performance/load tests**

---

## 6. CODEX CODE REVIEW — статус находок

| PR | Severity | Finding | Status |
|---|---|---|---|
| #1 | P0 | cw-sync emptied directory | FIXED (directory removed) |
| #18 | P1 | Search not scoped to project | FIXED (project_id filter added) |
| #18 | P2 | API docs missing auth info | FIXED |
| #29 | P1 | Redis subscribe no try-catch | FIXED (PR #45) |
| #29 | P1 | SSE no reconnect on project change | FIXED (key param, PR #45) |
| #43 | P1 | chunk_ref NOT NULL constraint | FIXED (kept nullable) |
| #44 | P2 | Hero CTA buttons without onClick | **STILL OPEN** |

---

## 7. АРХИТЕКТУРНЫЙ ОБЗОР

```
┌─────────┐     ┌──────────┐     ┌─────────────┐
│ Next.js  │────▶│  Caddy   │────▶│  Fastify    │
│ Frontend │ /api│  (edge)  │     │  API Server │
└─────────┘     └──────────┘     └──────┬──────┘
                                        │
     ┌──────────────────────────────────┤
     │                                  │
┌────▼────┐  ┌─────────┐  ┌────────────▼────────────┐
│ Redis 7 │  │ Worker  │  │  PostgreSQL + pgvector   │
│ Pub/Sub │  │ (cron)  │  │  23 migrations           │
│ Cache   │  │ 60s tick│  │  Materialized views      │
└─────────┘  └─────────┘  └─────────────────────────┘
                │
     ┌──────────┤──────────────┐
     │          │              │
┌────▼───┐ ┌───▼────┐ ┌──────▼─────┐
│Chatwoot│ │ Linear │ │   Attio    │
│REST API│ │GraphQL │ │  REST API  │
└────────┘ └────────┘ └────────────┘
```

**Real-time (3 уровня):**
1. Frontend polling (15-60s configurable)
2. Cascade triggers (sync → signals → health → analytics)
3. Redis Pub/Sub → SSE (sub-second updates)

---

## 8. САМОКРИТИЧНЫЙ АНАЛИЗ

### Что хорошо:
1. **Архитектура** — clean separation: services, lib, routes. Multi-tenant scope (`projectId` + `accountScopeId`) пронизывает все запросы.
2. **Graceful degradation** — Redis отключение не ломает систему, mock mode для всех интеграций.
3. **Observability** — `/metrics` endpoint (Prometheus format), process_runs logging, audit_events.
4. **Sync pipeline** — Watermarks, deduplication, reconciliation, coverage tracking.
5. **Security** — Bcrypt auth, CSRF tokens, rate limiting, session expiration index.

### Что требует внимания до кодинга:
1. **Toast CRITICAL** — пользователь не видит feedback. Нужно починить до начала любой работы.
2. **CTA кнопки** — вся навигация через Control Tower сломана (кнопки ничего не делают).
3. **Тестовое покрытие** — 19 unit-тестов покрывают инфраструктуру, но 11 сервисов не имеют тестов. Нет integration tests.
4. **Redis utilization** — low-hanging fruit для производительности.

### Честная оценка готовности:
- **Инфраструктура:** 9/10 — Docker, CI, migrations, Redis, pgvector — всё настроено.
- **Backend code:** 7/10 — Солидная архитектура, но есть дубликаты функций, POST-маршруты без error handling, inconsistent validation.
- **Frontend code:** 6/10 — Design system задокументирован, но Toast сломан, CTA пустые, spacing violations, lang wrong.
- **Тесты:** 5/10 — Хорошее покрытие инфраструктуры, но сервисы не покрыты, нет integration tests.
- **Issues/Planning:** 7/10 — 200 issues хорошо структурированы, но есть дубликаты и пробелы в приоритизации.

**Вердикт: НЕ готовы к кодингу.** Нужно сначала:
1. Починить 3 CRITICAL проблемы (Toast, lang, toPositiveInt duplicate)
2. Создать comprehensive test plan
3. Написать базовые тесты перед началом новой функциональности

---

## 9. ПЛАН ДЕЙСТВИЙ (PRE-CODING GATE)

### Немедленно (до кодинга):
- [ ] Починить Toast export (1.1)
- [ ] Исправить lang="ru" (1.2)
- [ ] Консолидировать toPositiveInt (1.3)

### Высокий приоритет (первый coding sprint):
- [ ] Добавить onClick обработчики к CTA кнопкам (2.1)
- [ ] Обернуть POST-маршруты в try-catch (2.2)
- [ ] Валидировать query-параметры (2.3)
- [ ] Исправить arbitrary spacing (2.4)
- [ ] Расширить Redis кеширование (2.5)

### Средний приоритет:
- [ ] Закрыть 8 duplicate issues (3.1)
- [ ] Расставить priority labels (3.2)
- [ ] Обновить migration count в docs (3.4)
