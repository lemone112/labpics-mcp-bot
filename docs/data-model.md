# Data model & tables (MVP)

Source of truth: Postgres in the `db` container.

Schema is applied from `server/db/migrations/*.sql`.

## Extensions

- `vector` (pgvector)

## MVP tables (core)

- `projects`
- `sessions`
- `cw_contacts`
- `cw_conversations`
- `cw_messages`
- `rag_chunks`
- `sync_watermarks`
- `job_runs`

## Notes

- `rag_chunks.embedding` is indexed for vector search.
- Jobs must use watermarks to avoid full rescans.
- All rows must be scoped by `project_id` (and `account_scope_id` where applicable).

See:

- RAG pipeline: [`docs/rag.md`](./rag.md)
- Platform constraints: [`docs/platform-architecture.md`](./platform-architecture.md)
