-- Migration 0028: Drop redundant IVFFlat index (Iter 63.6)
-- HNSW indexes in 0003 and 0021 supersede this IVFFlat index from 0002.
-- Removing it reduces insert overhead on rag_chunks.

DROP INDEX IF EXISTS rag_chunks_embedding_ivfflat_idx;
