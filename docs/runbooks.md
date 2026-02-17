# Runbooks

## 1) "Search returns no results"

Checklist:

- Go to `/jobs` and check RAG counts.
  - If `pending > 0`: run **Embeddings** job.
  - If `ready = 0`: you likely haven't synced any messages or chunking is not creating chunks.

- Verify Chatwoot sync watermark exists in `sync_watermarks`.
- Verify `OPENAI_API_KEY` is configured.

## 2) "Chatwoot sync job fails"

- Check `/jobs` latest run error.
- Verify env:
  - `CHATWOOT_BASE_URL`
  - `CHATWOOT_API_TOKEN`
  - `CHATWOOT_ACCOUNT_ID`

## 3) "Auth loop / unauthorized"

- Ensure cookie is being set (check browser devtools).
- Confirm `CORS_ORIGIN` matches UI origin.
- Confirm server is not behind a proxy stripping cookies.

## 4) "Embeddings job fails"

- Check OpenAI key.
- Reduce `EMBED_BATCH_SIZE` to 20.
- Inspect logs for response status.

## 5) DB migrations

Run inside server container:

- `npm run migrate`

Migrations are in `server/db/migrations/`.
