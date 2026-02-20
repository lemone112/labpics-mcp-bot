# Labpics Dashboard

Операционная платформа для design studio lab.pics: 2–5 PM + Owner, 5–10 активных проектов,
CRM/PM/support-интеграции, knowledge graph (LightRAG), Telegram bot.

**Статус:** 159 open issues в 20 итерациях (Iter 11–51), 7 execution phases.
Единый план: [`docs/iteration-plan-wave3.md`](./docs/iteration-plan-wave3.md).

### Структура монорепо

- `server/` — Fastify API + platform layers (scope/audit/outbox/scheduler) + Redis Pub/Sub + SSE
- `web/` — Next.js 16 UI (App Router, shadcn/ui, Radix, Tailwind v4, anime.js)
- `telegram-bot/` — Telegram assistant bot (TypeScript, Supabase, Composio MCP, Docker)
- `infra/` — Caddy, deployment configs
- `scripts/` — smoke tests, утилиты
- `docs/` — каноническая документация
- `docker-compose.yml` — локальный и серверный запуск стека (Postgres, Redis, server, worker, web)

Текущий релиз работает в режиме **LightRAG-only** (KAG pipeline полностью удалён в Iter 10).

Worker-контур введен как единый scheduler/worker слой (`server/src/worker-loop.js`).
Real-time обновления: Redis Pub/Sub → SSE endpoint → auto-refresh в браузере. См. [`docs/redis-sse.md`](./docs/redis-sse.md).

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
- **Единый план исполнения (Wave 3):** [`docs/iteration-plan-wave3.md`](./docs/iteration-plan-wave3.md) — 159 issues, 7 phases
- Архитектурный reference (Wave 2): [`docs/iteration-plan-wave2.md`](./docs/iteration-plan-wave2.md)
- Нормативный контракт LightRAG-only: [`docs/lightrag-contract.md`](./docs/lightrag-contract.md)
- Продуктовый обзор: [`docs/product/overview.md`](./docs/product/overview.md)
- Архитектура: [`docs/architecture.md`](./docs/architecture.md)
- Frontend + дизайн: [`docs/frontend-design.md`](./docs/frontend-design.md)
- Platform layer (scope/audit/outbox/worker): [`docs/platform-architecture.md`](./docs/platform-architecture.md)
- API reference: [`docs/api.md`](./docs/api.md)
- Real-time и кеширование (Redis, SSE, auto-refresh): [`docs/redis-sse.md`](./docs/redis-sse.md)
- Backend-сервисы: [`docs/backend-services.md`](./docs/backend-services.md)
- Тестирование: [`docs/testing.md`](./docs/testing.md)
- Runbooks: [`docs/runbooks.md`](./docs/runbooks.md)
- Roadmap: [`docs/mvp-vs-roadmap.md`](./docs/mvp-vs-roadmap.md)
- Спеки: [`docs/specs/README.md`](./docs/specs/README.md)
- Telegram Bot: [`telegram-bot/docs/`](./telegram-bot/docs/) (архитектура, UX, Composio, Supabase schema)

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

Полный API reference: [`docs/api.md`](./docs/api.md)

---

## 2) UI (`web`) — текущий статус

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
cd server && npm test

# Frontend lint + design audit
cd web && npm run lint

# E2E tests (Playwright)
cd web && npm run test:e2e
```

Подробнее: [`docs/testing.md`](./docs/testing.md)

---

## 5) Деплой

См. [`docs/deployment.md`](./docs/deployment.md) и [`docs/runbooks.md`](./docs/runbooks.md).
