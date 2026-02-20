# Labpics Dashboard

Операционная платформа для design studio lab.pics: 2–5 PM + Owner, 5–10 активных проектов,
CRM/PM/support-интеграции, knowledge graph (LightRAG), Telegram bot.

**Статус:** 276 open issues в 33 итерациях (Iter 11–64), 10 execution phases.
Единый план: [`docs/iterations/iteration-plan-wave3.md`](./docs/iterations/iteration-plan-wave3.md).

### Структура монорепо

```
labpics-dashboard/
├── apps/
│   ├── api/             # Fastify API + worker (Fastify, PostgreSQL, pgvector, LightRAG)
│   │   └── src/
│   │       ├── domains/ # Business logic (connectors, analytics, rag, outbound, identity, core)
│   │       ├── infra/   # Infrastructure (db, redis, http, cache, sse, rate-limit)
│   │       ├── routes/  # HTTP route handlers
│   │       └── types/   # TypeScript types
│   ├── web/             # Next.js 16 UI (App Router, shadcn/ui, Radix, Tailwind v4, anime.js)
│   └── telegram-bot/    # Telegram assistant bot (TypeScript, PostgreSQL, Composio MCP)
├── packages/
│   └── shared-types/    # Cross-service TypeScript types
├── docs/                # Canonical documentation (architecture, product, specs, design, operations)
├── infra/               # Caddy, Prometheus, Grafana, scripts
└── docker-compose.yml   # Full stack: Postgres, Redis, API, Worker, Web, Edge (Caddy)
```

Текущий релиз работает в режиме **LightRAG-only** (KAG pipeline полностью удалён в Iter 10).

Worker-контур введен как единый scheduler/worker слой (`apps/api/src/worker-loop.js`).
Real-time обновления: Redis Pub/Sub → SSE endpoint → auto-refresh в браузере. См. [`docs/architecture/redis-sse.md`](./docs/architecture/redis-sse.md).

### Wave 3 — ключевые направления (Iter 44–51)

- **Multi-user (Owner/PM):** роли, ACL, team management UI (Iter 49)
- **Telegram Bot:** CryptoBot-style кнопки, Composio MCP (Linear/Attio), Whisper voice input, push-уведомления (Iter 50–51)
- **System Monitoring UI:** встроенный мониторинг сервисов, job dashboard, alert history (Iter 46)
- **Automated Reporting:** шаблоны отчётов, weekly/monthly auto-генерация (Iter 48)
- **Search UX:** debounce, pagination, date/source фильтры, fuzzy matching (Iter 45)
- **Parallel Connector Sync:** sequential → Promise.all, метрики, dead job detection (Iter 44)
- **Infrastructure Hardening:** automated backups, HTTP/3, fail2ban, zero-downtime deploy (Iter 47)

---

## Документация

Стартовые точки:

- Индекс документации: [`docs/index.md`](./docs/index.md)
- **Единый план исполнения (Wave 3):** [`docs/iterations/iteration-plan-wave3.md`](./docs/iterations/iteration-plan-wave3.md) — 276 issues, 10 phases
- Архитектурный reference (Wave 2): [`docs/iterations/iteration-plan-wave2.md`](./docs/iterations/iteration-plan-wave2.md)
- Нормативный контракт LightRAG-only: [`docs/architecture/lightrag-contract.md`](./docs/architecture/lightrag-contract.md)
- Продуктовый обзор: [`docs/product/overview.md`](./docs/product/overview.md)
- Архитектура: [`docs/architecture/architecture.md`](./docs/architecture/architecture.md)
- Frontend + дизайн: [`docs/architecture/frontend-design.md`](./docs/architecture/frontend-design.md)
- Platform layer (scope/audit/outbox/worker): [`docs/architecture/platform-architecture.md`](./docs/architecture/platform-architecture.md)
- API reference: [`docs/architecture/api.md`](./docs/architecture/api.md)
- Real-time и кеширование (Redis, SSE, auto-refresh): [`docs/architecture/redis-sse.md`](./docs/architecture/redis-sse.md)
- Backend-сервисы: [`docs/architecture/backend-services.md`](./docs/architecture/backend-services.md)
- Тестирование: [`docs/operations/testing.md`](./docs/operations/testing.md)
- Runbooks: [`docs/operations/runbooks.md`](./docs/operations/runbooks.md)
- Roadmap: [`docs/product/mvp-vs-roadmap.md`](./docs/product/mvp-vs-roadmap.md)
- Спеки: [`docs/specs/README.md`](./docs/specs/README.md)
- Design System: [`docs/design/DESIGN_SYSTEM_2026.md`](./docs/design/DESIGN_SYSTEM_2026.md)
- Telegram Bot: [`apps/telegram-bot/docs/`](./apps/telegram-bot/docs/) (архитектура, UX, Composio, PostgreSQL schema)

---

## 1) API (high level)

Intelligence layer: custom hybrid RAG (`/lightrag/*` endpoints). Миграция на HKUDS LightRAG — Iter 11.

### Public (no auth)

- `GET /health` — health check
- `GET /metrics` — Prometheus-формат метрики (включая SSE connections)

### Auth/session

- `POST /auth/login` — вход (rate-limited по IP + username)
- `POST /auth/logout`
- `GET /auth/me`

Protected routes требуют session cookie + CSRF header (`x-csrf-token`) для мутирующих запросов.

### Projects

- `GET /projects`
- `POST /projects`
- `POST /projects/:id/select`

### LightRAG (основной интеллект-контур)

- `POST /lightrag/query` — основной endpoint (vector search + source ILIKE + evidence)
- `POST /lightrag/refresh` — запускает embeddings refresh + возвращает статус
- `GET /lightrag/status` — состояние embeddings и объёмы source-данных
- `POST /lightrag/feedback` — обратная связь по результатам запроса
- `POST /search` — alias на LightRAG для совместимости

### Jobs / Scheduler

- `POST /jobs/chatwoot/sync`
- `POST /jobs/attio/sync`
- `POST /jobs/linear/sync`
- `POST /jobs/embeddings/run`
- `GET /jobs/status` — агрегированный статус (job runs + RAG counts + storage + watermarks)
- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`

### Connectors / Reliability

- `GET /connectors/state`
- `GET /connectors/errors`
- `POST /connectors/sync`
- `POST /connectors/:name/sync`
- `POST /connectors/errors/retry`
- `GET /connectors/reconciliation`
- `GET /connectors/reconciliation/diff`
- `POST /connectors/reconciliation/run`
- `GET /connectors/errors/dead-letter`
- `POST /connectors/errors/dead-letter/:id/retry`

### Real-time (SSE)

- `GET /events/stream` — Server-Sent Events (требует session cookie)

### Control Tower / Portfolio

- `GET /portfolio/overview` — агрегированный portfolio dashboard с charts
- `GET /portfolio/messages` — сообщения по проекту с контактами
- `GET /control-tower` — executive dashboard

### Data review

- `GET /contacts`
- `GET /conversations`
- `GET /messages`

Полный API reference: [`docs/architecture/api.md`](./docs/architecture/api.md)

---

## 2) UI (`apps/web`) — текущий статус

UI построен на **shadcn/ui** + Radix + Tailwind v4 + anime.js. Поверхности:

- **Control Tower** — 6 секций: dashboard/messages/agreements/risks/finance/offers
- **Projects** — создание и выбор проектов
- **Search** — LightRAG поиск с evidence
- **Jobs** — мониторинг задач и storage
- **CRM** — аккаунты + opportunities (kanban)
- **Signals** — сигналы, NBA, upsell, identity graph, continuity
- **Offers** — создание и approval flow
- **Digests** — daily/weekly дайджесты
- **Analytics** — метрики, forecast, risk radar

Планируемые страницы (Wave 3):

- **System** — мониторинг сервисов, job dashboard, connector timeline, alert history (Iter 46)
- **Reports** — автоматические отчёты: project status (weekly), financial overview (monthly), team KPI (Iter 48)
- **Team** — управление пользователями (Owner/PM), назначение проектов, роли (Iter 49)

Real-time: SSE push (~1-2 сек) → fallback на polling (15-60 сек).

---

## 3) Локальный запуск

1. Скопируй env:

```bash
cp .env.example .env
```

2. Запусти стек:

```bash
docker compose up --build
```

3. Открой:

- UI: `http://localhost:3000`
- API health: `http://localhost:8080/health`

---

## 4) Тестирование

```bash
# Backend unit tests (Node.js test runner)
cd apps/api && npm test

# Frontend lint + design audit
cd apps/web && npm run lint

# E2E tests (Playwright)
cd apps/web && npm run test:e2e
```

Подробнее: [`docs/operations/testing.md`](./docs/operations/testing.md)

---

## 5) Деплой

См. [`docs/operations/deployment.md`](./docs/operations/deployment.md) и [`docs/operations/runbooks.md`](./docs/operations/runbooks.md).
