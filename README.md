# Labpics Dashboard (MVP)

Репозиторий ориентирован на **web-платформу**:

- `server/` — Fastify API + platform layers (scope/audit/outbox/scheduler) + Redis Pub/Sub + SSE
- `web/` — Next.js UI (auth/projects/jobs/search + shell) с auto-refresh и SSE
- `docs/` — каноническая документация
- `docker-compose.yml` — локальный и серверный запуск стека (Postgres, Redis, server, worker, web)

Текущий релиз работает в режиме **LightRAG-only** (`LIGHTRAG_ONLY=1`).

Worker-контур введен как единый scheduler/worker слой (`server/src/worker-loop.js`).
Real-time обновления: Redis Pub/Sub → SSE endpoint → auto-refresh в браузере. См. [`docs/redis-sse.md`](./docs/redis-sse.md).

---

## Документация

Стартовые точки:

- Индекс документации: [`docs/index.md`](./docs/index.md)
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

---

## 1) API (high level)

Важное правило: для разработки используется только LightRAG API; `/kag/*` не входит в текущий контракт.

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
- `POST /connectors/reconciliation/run`

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

UI построен на **shadcn/ui** + Radix + Tailwind v4. Поверхности:

- **Control Tower** — 6 секций: dashboard/messages/agreements/risks/finance/offers
- **Projects** — создание и выбор проектов
- **Search** — LightRAG поиск с evidence
- **Jobs** — мониторинг задач и storage
- **CRM** — аккаунты + opportunities (kanban)
- **Signals** — сигналы, NBA, upsell, identity graph, continuity
- **Offers** — создание и approval flow
- **Digests** — daily/weekly дайджесты
- **Analytics** — метрики, forecast, risk radar

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
