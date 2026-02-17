# Labpics Web Platform (MVP)

Репозиторий содержит MVP **веб‑платформы Labpics** (web‑first):

- `server/` — API на Fastify + фоновые jobs + Postgres/pgvector
- `web/` — Next.js UI (login / projects / jobs / search)
- `docker-compose.yml` — локальный стек и сервисы

> Legacy bot/worker присутствует в истории/коде, но текущий фокус этой ветки — web‑first MVP.

## Быстрые ссылки

- Документация (индекс): `docs/index.md`
- Архитектура: `docs/architecture.md`
- Развёртывание: `docs/deployment.md`
- API reference: `docs/api.md`
- Pipelines & jobs: `docs/pipelines.md`
- RAG & embeddings: `docs/rag.md`
- Runbooks: `docs/runbooks.md`

## 1) API (`server/`)

### Auth / session

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### Projects

- `GET /projects`
- `POST /projects`
- `POST /projects/:id/select`

### Jobs

- `POST /jobs/chatwoot/sync`
- `POST /jobs/embeddings/run`
- `GET /jobs/status`

### Search

- `POST /search` — vector similarity

### Data review

- `GET /contacts`
- `GET /conversations`
- `GET /messages`

## 2) База данных и миграции

Источник истины для схемы БД: `server/db/migrations/*.sql`.

Ключевые сущности:

- `projects`
- `cw_contacts`
- `cw_conversations`
- `cw_messages`
- `rag_chunks`
- `sync_watermarks`
- `job_runs`
- `sessions`

Индексация / производительность (high level):

- индексы на `rag_chunks(conversation_global_id)`
- векторный индекс на `rag_chunks.embedding` (в зависимости от выбранного метода)

## 3) Локальный запуск

1. Скопируй env:

   - `cp .env.example .env`

2. Подними сервисы:

   - `docker compose up --build`

3. Открой:

   - UI: `http://localhost:3000`
   - API health: `http://localhost:8080/health`

Если включён edge‑proxy (см. env), то внешний домен задаётся переменной `DOMAIN`.

## 4) Деплой dev/prod (GitHub Actions)

В репозитории есть два workflow:

- `.github/workflows/deploy-dev.yml` — деплой при `push` в ветку `cursor/labpics_dashboard`
- `.github/workflows/deploy-prod.yml` — ручной запуск (`workflow_dispatch`) + approval для environment `production`

Общая логика (сверить с workflow перед изменениями):

1. Билдится `server` и `web`
2. Доставка на сервер по SSH
3. На сервере обновляется `.env`
4. Запуск `docker compose up -d --build`
5. Smoke‑check `GET /health` и открываемость страницы логина

## 5) GitHub Secrets / Variables

### Secrets

- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `POSTGRES_PASSWORD`
- `AUTH_PASSWORD`
- `OPENAI_API_KEY`
- `CHATWOOT_API_TOKEN`

### Variables

- `DEPLOY_PATH` (например, `/opt/labpics-web-dev` или `/opt/labpics-web-prod`)
- `COMPOSE_PROJECT_NAME` (например, `labpics-dev`, `labpics-prod`)
- а также переменные из `.env.example`, которые нужны для окружения

## 6) Acceptance checklist

1. `POST /jobs/chatwoot/sync` заполняет `cw_*` и создаёт `rag_chunks` со статусом `pending`.
2. `POST /jobs/embeddings/run` переводит `pending -> ready`.
3. `POST /search` возвращает релевантные chunks по `source_id`.
4. `GET /jobs/status` показывает счётчики и storage‑метрики.
5. UI:
   - логин работает
   - можно запускать Sync/Embeddings
   - отображаются поисковые результаты и источники/метаданные
