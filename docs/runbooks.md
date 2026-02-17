# Runbooks

Operational playbooks for the MVP.

> If you are new: start from [`docs/index.md`](./index.md) → run the MVP loop → then use this page when something breaks.

## Incident templates

Each runbook uses the same structure:

- **Symptom**
- **Impact**
- **Checks** (UI, DB, logs, env)
- **Fix**
- **Evidence to capture** (for an issue)

---

## Runbook: Search returns no results

**Symptom**
- `/search` returns empty results for queries that should match.

**Impact**
- Users cannot retrieve evidence-backed context.

**Checks**
1. Open `/jobs` and inspect latest runs.
   - If there are pending sync runs: complete sync first.
   - If embeddings show `ready = 0`: embeddings are missing.
2. Confirm project scope
   - Ensure the UI is set to the intended project (no cross-project assumptions).
3. Verify environment
   - `OPENAI_API_KEY` is set on the server.

**Fix**
- Run **Sync** job, then **Embeddings** job.
- If embeddings keep failing: set `EMBED_BATCH_SIZE=20` and retry.

**Evidence to capture**
- Screenshot of `/jobs` status
- The job run error text
- Project id/name

---

## Runbook: Chatwoot sync job fails

**Symptom**
- Sync job shows failed status.

**Checks**
- In `/jobs`, open the latest error details.
- Verify env variables:
  - `CHATWOOT_BASE_URL`
  - `CHATWOOT_API_TOKEN`
  - `CHATWOOT_ACCOUNT_ID`

**Fix**
- Correct env vars and re-run the sync job.

**Evidence to capture**
- The failing request/endpoint (if present in logs)
- The account id and inbox id (if applicable)

---

## Runbook: Auth loop / unauthorized

**Symptom**
- UI redirects back to login or API returns 401/403.

**Checks**
- Browser devtools: cookie is set and sent.
- Server env: `CORS_ORIGIN` matches UI origin.
- Reverse proxy: cookies are not stripped.

**Fix**
- Align `CORS_ORIGIN` and proxy settings, then re-login.

**Evidence to capture**
- Response headers
- Server logs around auth

---

## Runbook: Embeddings job fails

**Symptom**
- Embeddings job fails or stalls.

**Checks**
- Validate OpenAI key and quotas.
- Inspect error logs from the job run.

**Fix**
- Reduce `EMBED_BATCH_SIZE` to 20 and retry.

**Evidence to capture**
- Error message
- Batch size
- Approx message/chunk counts
