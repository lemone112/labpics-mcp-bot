# Product overview (MVP)

## Target users

- **PM** and **Owner** of a multi-project design studio.

## 5-minute outcome (core value)

**Enter → select project → see the latest operational picture → take an action**.

Minimum loop:

1. Open `/projects`
2. Create/select an *active project*
3. Run sync + embeddings (`/jobs`)
4. Use `/search` to retrieve evidence-backed context from recent conversations

## MVP scenarios

- **Chatwoot → DB sync** (raw conversations + messages)
- **Chunking + embeddings** stored in Postgres/pgvector
- **Vector search** over embedded chunks (project-scoped)
- **Project selection** stored per session
- **Jobs UI** for triggering sync/embeddings and observing status

## Evidence-first rule

Any derived insight that will be added later (commitments/risks/digests) must carry evidence references:

- `conversation_global_id`
- `message_global_id`
- and/or `rag_chunks.id` (preferred)

## Non-goals for MVP (explicit)

- Multi-tenant organizations
- Automatic CRM patching without preview/approve
- Fully autonomous project management actions without guardrails
