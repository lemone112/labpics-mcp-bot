# Runbooks

Operational playbooks for the MVP.

Start from: [`docs/index.md`](./index.md)

## MVP loop checklist

1. Login works
2. Project selected
3. Sync runs
4. Embeddings run
5. Search returns evidence-backed results

## Runbook: Search returns no results

Checks:

- Verify an active project is selected.
- Verify `rag_chunks` exist for the project.
- Verify embeddings have `ready > 0`.
- Verify `OPENAI_API_KEY` is set.

Fix:

- Run sync, then embeddings.

## Runbook: Chatwoot sync fails

Checks:

- `CHATWOOT_BASE_URL`
- `CHATWOOT_API_TOKEN`
- `CHATWOOT_ACCOUNT_ID`

Fix:

- Correct env vars and rerun the job.

## Runbook: Auth loop / unauthorized

Checks:

- Session cookie is set and sent.
- For protected POST requests: CSRF cookie + `x-csrf-token` header.

Fix:

- Clear cookies and login again.
- Align `CORS_ORIGIN` with the UI origin.

## Runbook: Embeddings job fails

Checks:

- OpenAI key/quota
- job error payload

Fix:

- Reduce `EMBED_BATCH_SIZE` and retry.
