# Glossary

Canonical terms used across `docs/` and `docs/specs/`.

## Project
A top-level isolation boundary. All ingestion, storage, embedding, and search are **project-scoped**.

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
Similarity search over embeddings within a project scope.

## RAG
Retrieval-augmented generation: generation grounded in retrieved evidence (project-scoped).

## Job
A background task (sync / embeddings / maintenance) with observable status and logs.
