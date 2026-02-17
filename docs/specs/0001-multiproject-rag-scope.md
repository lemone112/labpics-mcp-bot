# Spec 0001 — Multi-project RAG scoping (READY)

Status: **ready**

## Goal

Make all RAG data and retrieval **strictly scoped to the active project**.

Today, `rag_chunks` does not contain `project_id`, and `POST /search` searches globally across all chunks.

## Non-goals

- Multi-tenant orgs
- Role-based access (single admin user is fine for MVP)

## User story

As a PM/Owner, when I select an active project and run search, I must **never** see chunks belonging to other projects.

## Design

### Source of scoping

- `sessions.active_project_id` is the single source of “current project context”.
- All ingestion and retrieval must require an active project.

### Data model change

Add `project_id` to:

- `cw_conversations`
- `cw_messages`
- `rag_chunks`
- `sync_watermarks` (or keep source as `chatwoot:<account_id>:<project_id>`)

Rationale: enables strict scoping, simplifies queries, enables per-project watermarks.

### Migration plan

Add migration `0003_project_scope.sql`:

1) Add columns:

- `ALTER TABLE cw_conversations ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;`
- `ALTER TABLE cw_messages ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;`
- `ALTER TABLE rag_chunks ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;`

2) Backfill strategy (MVP acceptable):

- If there is only 0–1 projects, backfill everything to that one.
- Otherwise, leave NULL and treat unscoped rows as **inaccessible** (safe default).

3) Constraints:

- For new writes, enforce `project_id NOT NULL`.
  - Implement as a code-level requirement first.
  - Optionally add `NOT NULL` after backfill.

4) Indexes:

- `CREATE INDEX IF NOT EXISTS rag_chunks_project_idx ON rag_chunks(project_id);`
- `CREATE INDEX IF NOT EXISTS cw_messages_project_created_idx ON cw_messages(project_id, created_at DESC);`
- If using ivfflat, keep embedding index as is; project filter will still help.

### API changes

#### `POST /jobs/chatwoot/sync`

- Must require `sessions.active_project_id`.
- Writes must set `project_id` on:
  - `cw_conversations`
  - `cw_messages`
  - `rag_chunks`
- Watermark must be stored per-project.

#### `POST /jobs/embeddings/run`

- Must embed only chunks for active project:
  - `WHERE project_id = $active_project_id AND embedding_status='pending'`.

#### `POST /search`

- Must search only `rag_chunks` for active project:
  - `WHERE project_id = $active_project_id AND embedding_status='ready'`.

- Must return `active_project_id` in response meta.

### UI changes

- In `/jobs`, show active project name/id.
- If no active project selected, show a blocking CTA linking to `/projects`.

## Acceptance criteria

1) With two projects A and B, after syncing both, searching in A never returns rows from B.
2) Running `/jobs/chatwoot/sync` without selecting a project fails with `400` `active_project_required`.
3) Embeddings and search are filtered by `project_id`.
4) Watermarks are per project and visible in `/jobs/status`.

## Testing checklist

- Create two projects
- Select A → run sync → run embeddings → search
- Select B → run sync → run embeddings → search
- Ensure returned `conversation_global_id`/`message_global_id` sets differ per project.
