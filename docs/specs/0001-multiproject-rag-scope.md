# Spec 0001 — Multi-project RAG scoping (READY)

Status: **ready**

## Goal

Make ingestion, embeddings, and retrieval **strictly scoped to a project**.

Today (Web-first branch):

- `rag_chunks` has no `project_id` and `POST /search` searches globally.
- Chatwoot sync and chunk creation are not bound to an “active project”.

This spec makes **project_id mandatory for new data**, and makes unscoped legacy rows **inaccessible** (safe-by-default).

## Non-goals

- Multi-tenant organizations
- RBAC
- Backfilling historic data to projects (explicitly skipped for MVP safety)

## Product requirement (why)

A studio runs many projects. Mixing conversation memory across projects breaks trust. Project scoping must be **hard** (enforced in schema + queries), not “best effort”.

## Key design decision: how projects map to Chatwoot

### Problem

Chatwoot has many possible “anchors”:

- Inbox
- Conversation
- Contact
- Team
- Labels

We need a mapping strategy that:

- is **stable** (doesn’t change unintentionally)
- is **operationally convenient** (PM can set it once)
- is **safe** (unknown mapping does not leak data)

### Recommended v1 mapping (best trade-off)

**Map `Chatwoot Inbox → Project`**, and treat that mapping as the ingestion boundary.

Rationale:

- Inbox is the most stable operational unit in Chatwoot for service delivery.
- PMs already route customer messages by inbox.
- This avoids ambiguous “contact used in multiple projects” cases.

### Alternate mapping (supported later)

- `conversation_id → project_id` mapping table (fine-grained overrides)
- labels-based mapping

Not included in v1 to avoid complexity.

### New table: `project_chatwoot_inboxes`

Add a mapping table, maintained via UI.

Columns:

- `project_id uuid not null references projects(id) on delete cascade`
- `chatwoot_account_id bigint not null`
- `inbox_id bigint not null`
- `created_at timestamptz not null default now()`

Constraints:

- `unique(chatwoot_account_id, inbox_id)` so an inbox belongs to exactly one project.
- `unique(project_id, chatwoot_account_id, inbox_id)` (optional redundant).

### Safe default

If an inbox is **not mapped**, its conversations/messages are **not ingested**.

This guarantees no cross-project leakage.

### How ingestion uses mapping

During Chatwoot sync:

1. Pull recent conversations.
2. For each conversation, read `inbox_id`.
3. Lookup `project_id` using `project_chatwoot_inboxes`.
4. If no mapping → skip conversation (record in job meta as `skipped_unmapped`).
5. If mapping exists → write raw + chunks with that `project_id`.

## Data model changes

### 1) Add `project_id` columns (new data only)

Add `project_id` to:

- `cw_conversations`
- `cw_messages`
- `rag_chunks`

> Backfill: **not required**. Existing rows remain NULL and are treated as inaccessible.

### 2) Scope watermarks per project

Change `sync_watermarks.source` format to include project:

- `chatwoot:<account_id>:<project_id>`

This keeps the current table but makes watermarks project-specific.

### 3) Add mapping table

- `project_chatwoot_inboxes` as described above.

### Migration plan

Add migrations:

- `0003_project_scope.sql`
  - add nullable `project_id` columns
  - add indexes on `project_id`
- `0004_chatwoot_inbox_mapping.sql`
  - create `project_chatwoot_inboxes`

After rollout and once you are confident, you may add a follow-up migration to enforce NOT NULL for new rows (or enforce in code only for MVP).

## API changes

### Auth/session prerequisite

All endpoints below require an authenticated session. Additionally:

- any endpoint that writes or reads project data must require a valid `active_project_id`.

If missing:

- respond `400 { ok:false, error:'active_project_required' }`

### `POST /jobs/chatwoot/sync`

Modify to:

- **do not rely solely on `active_project_id` for scoping**.
- ingest based on `project_chatwoot_inboxes` mapping.

Why:

- A single “sync job” should be able to ingest multiple projects safely.
- Active project is a UI context; mapping is the data governance boundary.

Implementation detail:

- For each conversation, resolve `project_id` from mapping.
- Write `cw_*` and `rag_chunks` with that `project_id`.
- Update watermark per project (`chatwoot:<account_id>:<project_id>`).

### `POST /jobs/embeddings/run`

For MVP simplicity, keep embeddings **active-project scoped**:

- requires `active_project_id`
- embeds only chunks for that project

SQL:

- `WHERE project_id = $1 AND embedding_status='pending'`

Later you can add a global embeddings worker.

### `POST /search`

Must be project-scoped:

- requires `active_project_id`
- searches only that project

SQL:

- `WHERE project_id = $1 AND embedding_status='ready'`

Also update response:

- include `active_project_id`

## UI changes

### New page: `/settings/chatwoot`

Goal: manage mapping `Chatwoot inbox → project`.

MVP UI:

- list existing mappings
- add mapping (project select + account_id + inbox_id)
- delete mapping

### Jobs page

- show active project
- show warning banner if no mappings exist (sync would ingest nothing)

### Projects page

- keep as is (create/select active project)

## Operational workflow (recommended)

1. Create project in `/projects`.
2. Map its Chatwoot inbox(es) in `/settings/chatwoot`.
3. Run `/jobs/chatwoot/sync`.
4. Select project as active.
5. Run embeddings.
6. Use search.

## Acceptance criteria

1. Unmapped inbox conversations are not ingested.
2. All inserted `cw_*` and `rag_chunks` rows have `project_id`.
3. Embeddings job only processes active project.
4. Search never returns cross-project rows.
5. Legacy rows with `project_id IS NULL` are never returned by search.

## Testing checklist

- Create Project A and Project B.
- Add two inbox mappings (A->inbox1, B->inbox2).
- Run chatwoot sync.
- Verify counts per project in DB.
- Select A, run embeddings, search.
- Select B, run embeddings, search.

## Observability

Update `job_runs.meta` for chatwoot sync:

- `processed_conversations`
- `processed_messages`
- `created_chunks`
- `skipped_unmapped_conversations`
- `watermarks_updated` (list of project_ids)

## Rollout notes

- Safe rollout: deploy migrations first, then code.
- No backfill required.
- If mapping is wrong, fix mapping and re-run sync; old wrong rows can be cleaned by deleting by `project_id` (optional admin tool).
