# Labpics Web Platform (MVP)

Репозиторий ориентирован на **web-платформу**:

- `server/` — Fastify API + platform layers (scope/audit/outbox/scheduler)
- `web/` — Next.js UI (auth/projects/jobs/search + shell)
- `docs/` — каноническая документация
- `docker-compose.yml` — локальный и серверный запуск стека

Worker-контур снова введен как единый scheduler/worker слой (`server/src/worker-loop.js`).

---

## Документация

Стартовые точки:

- Индекс документации: [`docs/index.md`](./docs/index.md)
- Архитектура: [`docs/architecture.md`](./docs/architecture.md)
- Platform layer (scope/audit/outbox/worker): [`docs/platform-architecture.md`](./docs/platform-architecture.md)
- API reference: [`docs/api.md`](./docs/api.md)
- Runbooks: [`docs/runbooks.md`](./docs/runbooks.md)
- Спеки: [`docs/specs/README.md`](./docs/specs/README.md)

---

## 1) API (high level)

### Auth/session

- `POST /auth/login`
- `GET /auth/signup/status`
- `POST /auth/signup/start`
- `POST /auth/signup/confirm`
- `POST /auth/telegram/webhook`
- `POST /auth/logout`
- `GET /auth/me`

### Projects

- `GET /projects`
- `POST /projects`
- `POST /projects/:id/select`

### Jobs

- `POST /jobs/chatwoot/sync`
- `POST /jobs/embeddings/run`
- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`
- `GET /jobs/status`

### Search

- `POST /search` (vector similarity)

### Data review

- `GET /contacts`
- `GET /conversations`
- `GET /messages`

---

## 2) UI (`web`) — текущий статус

UI активно мигрируется на **shadcn/ui** (включая sidebar shell и light/dark toggle). Если видишь расхождения между спеками и UI — считай источником правды `docs/` + открытые PR.

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

## 4) Деплой

См. [`docs/deployment.md`](./docs/deployment.md) и [`docs/runbooks.md`](./docs/runbooks.md).
