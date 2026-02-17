# Pipelines & jobs (MVP)

All automation is exposed as **API-triggered jobs** and recorded in `job_runs`.

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
- `CHATWOOT_ACCOUNT_ID`
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

## Suggested cadence (prod)

MVP has no scheduler.

Recommended external schedule:

- Chatwoot sync: every **10–15 minutes**
- Embeddings: every **30–60 minutes** or on demand

You can implement cron outside the app (GitHub Actions, VPS cron, or managed scheduler) that calls the job endpoints.
