# Labpics MCP Bot v2

AI‑операционная система для проектных бизнесов: превращает коммуникацию (Chatwoot) в операционную память (Supabase + pgvector) и даёт единый интерфейс управления через Telegram.

> README намеренно написан как **операционный runbook**: чтобы за 5–10 минут восстановить контекст проекта.

## TL;DR

- `tgbot` принимает Telegram updates → формирует контекст → вызывает `agent-gw` по Service Binding.
- `agent-gw` решает intent (search vs commitments) → RAG через `match_rag_chunks` → (дальше tool-layer/automation).
- `cw-sync` ходит в Chatwoot API → пишет raw (`cw_*`) → режет в чанки (`rag_chunks`) → считает embeddings (OpenAI) и помечает `embedding_status='ready'`.

## Архитектура (v2)

Chatwoot → **cw-sync** → Supabase (raw + rag_chunks) → **agent-gw** → Telegram (**tgbot**)

## Canonical IDs (критично)

- `project_id` = **внутренний** ID проекта из `public.projects.project_id` (canonical).
- Chatwoot IDs:
  - conversation: `cw:<account_id>:<conversation_id>`
  - message: `cwmsg:<account_id>:<message_id>`

Один Chatwoot account обслуживает много проектов → нельзя использовать `cw:<account_id>` как `project_id`.

## Сервисы (Cloudflare Workers)

### tgbot

- endpoints: `/health`, `/__whoami`, `/__env`
- хранит state в Supabase: `telegram_users`, `user_project_state`, `user_input_state`

### agent-gw

- endpoints: `/health`, `/__whoami`, `/__env`, `/agent/run`
- Supabase: `rag_chunks`, `project_commitments`
- RAG RPC: `match_rag_chunks(project_id, query_embedding, match_count, filter_conversation_global_id)`

### cw-sync

- endpoints: `/health`, `/sync` (Bearer), `/embed` (Bearer)
- cron: `*/10 * * * *` (см. `cw-sync/wrangler.toml`)

## Supabase (data backbone)

Ключевые таблицы (schema `public`):

- Projects & linking
  - `projects`
  - `project_links` — mapping project ↔ external IDs (chatwoot/linear/attio)
  - `project_conversation_map` — **conversation_global_id → project_id** (обязательный маппинг для cw-sync)

- Chatwoot raw
  - `cw_conversations`, `cw_messages`, `cw_contacts`, `cw_webhook_events`

- RAG
  - `rag_chunks` (`embedding` vector, `embedding_status`)

- Ops
  - `sync_watermarks` и/или `rag_chatwoot_sync_state` (legacy)

## cw-sync: Multi-project ingestion (важно)

### Как cw-sync решает, в какой проект писать

Перед ingestion должен существовать маппинг:
- `project_conversation_map.conversation_global_id = cw:<account_id>:<conversation_id>`
- `project_conversation_map.project_id = <projects.project_id>`

**Если маппинга нет — conversation пропускается.** (P0 поведение, чтобы не делать “свалку” в один проект.)

### Env vars (Cloudflare)

Secrets:
- `SUPABASE_SERVICE_ROLE_KEY`
- `CHATWOOT_API_TOKEN`
- `OPENAI_API_KEY`
- `SYNC_TOKEN` (Bearer для `/sync` и `/embed`)

Vars:
- `SUPABASE_URL`
- `CHATWOOT_BASE_URL`
- `CHATWOOT_ACCOUNT_ID`
- `SYNC_TABLE` (default: `rag_chatwoot_sync_state`)
- `RAG_TABLE` (default: `rag_chunks`)
- Embeddings: `EMBEDDING_MODEL` (default `text-embedding-3-small`), `EMBED_BATCH`, `EMBED_MAX_BATCHES_PER_RUN`, `MIN_EMBED_CHARS`, `CHUNK_CHARS`

## Диагностика

### RAG пуст

`match_rag_chunks` возвращает только чанки где:
- `embedding_status='ready'`
- `embedding is not null`

```sql
select embedding_status, count(*) from public.rag_chunks group by 1;
```

### Embeddings не считаются

- cw-sync не видит `OPENAI_API_KEY`
- `/embed` не запускается (cron/ручной вызов)
- `project_conversation_map` пуст → cw-sync пропускает conversations

## Deploy

- Dev: `.github/workflows/deploy-dev.yml` (auto on push to main)
- Prod: `.github/workflows/deploy-prod.yml` (manual `workflow_dispatch`)
