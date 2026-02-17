# Glossary

Canonical terms used across `docs/` and `docs/specs/`.

## Project
A top-level workspace context selected per session (`active_project_id`).
Current platform enforces project/account scope in SQL and DB triggers.

## Account scope
An upper isolation boundary attached to projects (`projects.account_scope_id`) and enforced alongside project scope.

## Evidence-first
A rule: any valuable output (commitment/risk/digest/proposal) must reference primary sources.

## Safe-by-default
If the system cannot unambiguously bind an action to a project/entity, it must not do it automatically.

## Sync
Ingest raw external data (e.g., Chatwoot conversations/messages) into the DB.

## Watermark
A cursor that marks how far a sync has progressed for a given scope (e.g., per inbox / per project binding).

## Chunking
Transform raw messages into chunks suitable for embeddings and retrieval.

## Embeddings
Vector representations stored in Postgres/pgvector.

## Vector search
Similarity search over embeddings (`rag_chunks`) using pgvector distance.
Current platform filters search by `(project_id, account_scope_id)`.

## RAG
Retrieval-augmented generation: generation grounded in retrieved evidence.

## Job
A background task (sync / embeddings / maintenance) with observable status and logs.
