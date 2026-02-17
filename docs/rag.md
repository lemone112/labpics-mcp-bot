# RAG & embeddings (MVP)

## Purpose

Provide *evidence-backed retrieval* over client conversations.

In MVP this is implemented as:

1. Chatwoot poll sync → raw tables (`cw_*`)
2. Chunking of message content → `rag_chunks` (`embedding_status='pending'`)
3. Embeddings job → fill `rag_chunks.embedding` and mark `ready`
4. Search endpoint → vector similarity over ready chunks

## Embedding model

- Default: `text-embedding-3-small`
- Vector size: **1536** (matches `vector(1536)` in schema)

## Chunking

Implemented in `server/src/lib/chunking.js`.

Key parameters:

- `CHUNK_SIZE` — target chunk size in characters (default 1000)
- `MIN_EMBED_CHARS` — minimum message length to create chunks (default 30)

## Search

`POST /search` performs:

- compute query embedding
- SQL: order by `(embedding <-> $vector)` (cosine operator via ivfflat index)
- returns topK rows with:
  - `conversation_global_id`
  - `message_global_id`
  - `chunk_index`
  - `text` (truncated)
  - `distance`

## Evidence-first usage

Downstream entities (commitments/risks/digests) must store references to:

- `rag_chunks.id` and/or
- `message_global_id` / `conversation_global_id`

and be reproducible by re-reading the raw rows.
