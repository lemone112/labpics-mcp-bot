# RAG & embeddings (MVP)

Purpose: evidence-backed retrieval over client conversations.

## Pipeline

1. Sync source messages into Postgres (Chatwoot)
2. Chunk messages into `rag_chunks`
3. Generate embeddings for `rag_chunks` with `embedding_status='pending'`
4. Search via vector similarity over `embedding_status='ready'`

## Invariants

- strictly project-scoped queries
- idempotent chunking and embedding runs
- show evidence references in UI
