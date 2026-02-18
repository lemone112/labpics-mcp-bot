# LightRAG и embeddings (MVP)

Назначение: единый retrieval слой по чатам, задачам и сделкам.

## Pipeline

1. Source sync в raw-таблицы (`cw_*`, `linear_*`, `attio_*`).
2. Чанкинг текста в `rag_chunks`.
3. Embeddings job (`embedding_status: pending -> ready`).
4. `POST /lightrag/query`:
   - vector retrieval по `rag_chunks`,
   - source lookup в raw-таблицах,
   - сбор answer + evidence.

## Invariants

- строго project-scoped выполнение;
- идемпотентные chunk/embedding циклы;
- ответы без evidence считаются неполноценными;
- каждая query может быть трассирована через `lightrag_query_runs`.
