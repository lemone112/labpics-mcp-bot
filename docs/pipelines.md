# Pipelines & jobs (MVP + platform worker)

Automation has two layers:

- manual API-triggered jobs (`/jobs/chatwoot/sync`, `/jobs/embeddings/run`)
- scheduler/worker jobs (`/jobs/scheduler/tick`) with run logs in `worker_runs`

## 1) Chatwoot sync

Trigger: `POST /jobs/chatwoot/sync`

Does:

- Fetch recent conversations from Chatwoot (ordered by last activity).
- For each conversation, fetch messages.
- Upsert:
  - `cw_contacts`
  - `cw_conversations`
  - `cw_messages`
- Create `rag_chunks` rows for non-private messages (idempotent per `(message_global_id, chunk_index)`).
- Reset changed chunks back to `pending` using `text_hash` diff.
- Update `sync_watermarks` for source `chatwoot:<account_id>`.
- Emit storage usage metadata for DB budget monitoring.

Configuration (env):

- `CHATWOOT_BASE_URL`
- `CHATWOOT_API_TOKEN`
- `CHATWOOT_ACCOUNT_ID` (bootstrap fallback only; canonical binding is `project_sources`)
- `CHATWOOT_CONVERSATIONS_LIMIT` (default 60)
- `CHATWOOT_CONVERSATIONS_PER_PAGE` (default 25)
- `CHATWOOT_PAGES_LIMIT` (default 20)
- `CHATWOOT_MESSAGES_LIMIT` (default 300)
- `CHATWOOT_LOOKBACK_DAYS` (default 7)
- `CHUNK_SIZE` (default 1000)
- `MIN_EMBED_CHARS` (default 30)
- `STORAGE_BUDGET_GB` (default 20)
- `STORAGE_ALERT_THRESHOLD_PCT` (default 85)

## 2) Embeddings

Trigger: `POST /jobs/embeddings/run`

Does:

- Select up to `EMBED_BATCH_SIZE` rows from `rag_chunks` where `embedding_status='pending'`.
- Mark claimed rows as `processing` (`FOR UPDATE SKIP LOCKED`).
- Call OpenAI embeddings.
- Update rows:
  - `embedding` vector
  - `embedding_status='ready'` (or `failed`)
  - `embedding_model`
- Recover stale `processing` rows back to `pending` by timeout.

Configuration (env):

- `OPENAI_API_KEY`
- `EMBEDDING_MODEL` (default `text-embedding-3-small`)
- `EMBED_BATCH_SIZE` (default 100)
- `OPENAI_EMBED_MAX_INPUTS` (default 100)
- `OPENAI_TIMEOUT_MS` (default 20000)
- `EMBED_STALE_RECOVERY_MINUTES` (default 30)

## 3) Status endpoint

`GET /jobs/status`

Returns:

- Latest runs per job (`job_runs`)
- `rag_counts`: counts of `pending|processing|ready|failed`
- `entities`: counts of `contacts|conversations|messages|rag_chunks`
- `storage`: DB bytes, budget, usage percent and key table sizes
- Recent `sync_watermarks`

## 4) Scheduler / worker

Endpoints:

- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`

Default scheduled jobs per project:

- `chatwoot_sync`
- `embeddings_run`
- `signals_extraction`
- `health_scoring`
- `campaign_scheduler`
- `analytics_aggregates`

State tables:

- `scheduled_jobs`
- `worker_runs`

## Suggested cadence (prod)

Scheduler can be triggered:

- by internal API tick (manual or automation)
- by external cron calling `/jobs/scheduler/tick`

Recommended minimum:

- scheduler tick: every **1–5 minutes**
- chatwoot sync cadence: **10–15 minutes**
- embeddings cadence: **20–60 minutes** (depending on backlog)
