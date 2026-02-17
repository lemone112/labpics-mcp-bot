# Labpics Web Platform (MVP)

Репозиторий полностью переориентирован на **web-сервис**:

- `server/` — Fastify API + jobs + Postgres/pgvector
- `web/` — Next.js UI (login/projects/jobs/search)
- `docker-compose.yml` — локальный и серверный запуск стека

Legacy bot/worker контур удален из кода и деплоя.

---

## 1) Архитектура

### API (`server`)

- Auth/session:
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/me`
- Projects:
  - `GET /projects`
  - `POST /projects`
  - `POST /projects/:id/select`
- Jobs:
  - `POST /jobs/chatwoot/sync`
  - `POST /jobs/embeddings/run`
  - `GET /jobs/status`
- Search:
  - `POST /search` (vector similarity)
- Data review:
  - `GET /contacts`
  - `GET /conversations`
  - `GET /messages`

### UI (`web`)

- `/login`
- `/projects`
- `/jobs`
- `/search`

---

## 2) База данных и миграции

Миграции находятся в `server/db/migrations/*.sql`.

Ключевое:

- `CREATE EXTENSION IF NOT EXISTS vector;`
- таблицы:
  - `projects`
  - `cw_contacts`
  - `cw_conversations`
  - `cw_messages`
  - `rag_chunks`
  - `sync_watermarks`
  - `job_runs`
  - `sessions`
- индексы:
  - `rag_chunks(conversation_global_id)`
  - `hnsw`/`ivfflat` по `rag_chunks.embedding`
  - статусные индексы для embeddings pipeline

Оптимизации для self-hosted Postgres:

- watermark-based sync без повторного полного обхода
- batching для OpenAI embeddings
- конкурентобезопасный claim (`FOR UPDATE SKIP LOCKED`) в embeddings job
- reset embeddings только для реально изменившихся chunk'ов (hash-based)
- хранение контактов отдельно (`cw_contacts`) + легкие review endpoints
- мониторинг размера БД в `/jobs/status` + бюджет хранения (`STORAGE_BUDGET_GB`, по умолчанию 20 GB)

Автоприменение миграций происходит при старте `server`.

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
- через edge proxy (если включен профиль `edge`): `https://dashboard.lab.pics`

---

## 4) Разделение деплоя dev/prod

Настроены 2 workflow:

- `.github/workflows/deploy-dev.yml`
  - авто на `push` в `main` (только если изменились `server/web/compose`)
  - окружение GitHub: `dev`
- `.github/workflows/deploy-prod.yml`
  - manual `workflow_dispatch`
  - окружение GitHub: `production`

Оба workflow:

1. валидируют сборку (`server` + `web`)
2. синхронизируют код по SSH на сервер
3. обновляют `.env` на сервере
4. выполняют `docker compose up -d --build`
5. делают smoke-check `/health` и `/login`

Для production включается профиль `edge` (Caddy), который публикует UI на `https://dashboard.lab.pics` и проксирует `/api/*` в `server`.

---

## 5) GitHub Secrets / Variables (для каждого environment)

### Secrets

- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `POSTGRES_PASSWORD`
- `AUTH_PASSWORD`
- `OPENAI_API_KEY`
- `CHATWOOT_API_TOKEN`

### Variables

- `DEPLOY_PATH` (например `/opt/labpics-web-dev` или `/opt/labpics-web-prod`)
- `COMPOSE_PROJECT_NAME` (например `labpics-dev`, `labpics-prod`)
- `POSTGRES_DB`
- `POSTGRES_USER`
- `DB_PORT`
- `API_PORT`
- `WEB_PORT`
- `NEXT_PUBLIC_API_BASE_URL`
- `API_UPSTREAM_URL`
- `DOMAIN` (prod: `dashboard.lab.pics`)
- `API_UPSTREAM`
- `WEB_UPSTREAM`
- `ENABLE_EDGE_PROXY`
- `CORS_ORIGIN`
- `AUTH_USERNAME`
- `SESSION_COOKIE_NAME`
- `CHATWOOT_BASE_URL`
- `CHATWOOT_ACCOUNT_ID`
- `CHATWOOT_CONVERSATIONS_LIMIT`
- `CHATWOOT_CONVERSATIONS_PER_PAGE`
- `CHATWOOT_PAGES_LIMIT`
- `CHATWOOT_MESSAGES_LIMIT`
- `CHATWOOT_LOOKBACK_DAYS`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIM`
- `EMBED_BATCH_SIZE`
- `OPENAI_EMBED_MAX_INPUTS`
- `OPENAI_TIMEOUT_MS`
- `EMBED_STALE_RECOVERY_MINUTES`
- `CHUNK_SIZE`
- `MIN_EMBED_CHARS`
- `SEARCH_IVFFLAT_PROBES`
- `SEARCH_HNSW_EF_SEARCH`
- `STORAGE_BUDGET_GB`
- `STORAGE_ALERT_THRESHOLD_PCT`

---

## 6) Acceptance checklist

1. `POST /jobs/chatwoot/sync` заполняет `cw_contacts`, `cw_conversations`, `cw_messages` и создает `rag_chunks` со статусом `pending`.
2. `POST /jobs/embeddings/run` переводит `pending -> ready`.
3. `POST /search` возвращает релевантные chunks с source id.
4. `GET /jobs/status` показывает счетчики и storage bytes по ключевым таблицам.
5. UI позволяет:
   - залогиниться
   - запустить Sync/Embeddings
   - выполнить поиск и увидеть источники.
