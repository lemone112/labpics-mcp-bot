CREATE INDEX IF NOT EXISTS rag_chunks_conversation_idx
  ON rag_chunks (conversation_global_id);

CREATE INDEX IF NOT EXISTS rag_chunks_message_idx
  ON rag_chunks (message_global_id);

CREATE INDEX IF NOT EXISTS cw_messages_conversation_idx
  ON cw_messages (conversation_id);

CREATE INDEX IF NOT EXISTS cw_messages_created_at_idx
  ON cw_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS rag_chunks_embedding_ivfflat_idx
  ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
