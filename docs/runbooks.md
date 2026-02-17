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
2. Confirm active project is selected in session.
3. Confirm scoped data exists for selected project:
   - `cw_messages` rows with matching `project_id`
   - `rag_chunks` with `embedding_status='ready'` and matching `project_id`
4. Verify environment
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
- Browser request headers include `x-csrf-token` for protected POST endpoints.
- Server env: `CORS_ORIGIN` matches UI origin.
- Reverse proxy: cookies are not stripped.

**Fix**
- Align `CORS_ORIGIN` and proxy settings, then re-login.
- If 403 `csrf_invalid`: clear browser cookies and login again.

**Evidence to capture**
- Response headers
- Server logs around auth

---

## Runbook: Scheduler tick / worker jobs failing

**Symptom**
- `POST /jobs/scheduler/tick` returns failures or `worker_runs` show failed status.

**Checks**
- `GET /jobs/scheduler` for `last_error` and `next_run_at`.
- `GET /jobs/status` for sync/embeddings backlog.
- Validate project source bindings (`project_sources`) for Chatwoot jobs.

**Fix**
- Correct failing dependency (credentials/source binding/rate limits).
- Re-run manual jobs (`/jobs/chatwoot/sync`, `/jobs/embeddings/run`) then scheduler tick.

**Evidence to capture**
- Scheduler result payload
- `worker_runs` latest failed rows
- Relevant upstream error (Chatwoot/OpenAI/outbound)

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

---

## Runbook: Signup disabled / PIN flow unavailable

**Symptom**
- On `/login`, account creation flow is disabled or cannot send PIN.

**Checks**
- `GET /auth/signup/status` response:
  - `has_telegram_token`
  - `owner_bound`
- Server env:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_WEBHOOK_SECRET` (if used)
  - `SIGNUP_PIN_SECRET` (optional)
- Telegram owner binding:
  - send `/bind` to bot and verify owner is stored.

**Fix**
- Configure Telegram bot token.
- Bind owner via webhook flow (`/bind` from target owner account).
- Retry `POST /auth/signup/start`.

**Evidence to capture**
- `/auth/signup/status` payload
- Telegram webhook delivery status
- Backend logs around `/auth/telegram/webhook` and `/auth/signup/start`

---

## Runbook: Outbound delivery blocked or failing

**Symptom**
- Outbound remains `draft/approved/failed/blocked_opt_out` and does not reach `sent`.

**Checks**
- `GET /outbound` item status and `last_error`.
- Verify policy row in `contact_channel_policies`:
  - `opted_out`
  - `stop_on_reply`
  - frequency counters/caps
- Check `outbound_attempts` history.

**Fix**
- For `blocked_opt_out`: only explicit opt-in policy change can unlock.
- For `frequency_cap_reached`: wait for window reset or change cap.
- For provider errors: fix payload/provider config and retry via `/outbound/process`.

**Evidence to capture**
- outbound payload + status history
- policy values for affected contact/channel
- related `audit_events` (`outbound.*` actions)
