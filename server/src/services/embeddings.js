import { toPositiveInt } from "../lib/chunking.js";
import { vectorLiteral } from "../lib/db.js";
import { createEmbeddings } from "./openai.js";

export async function runEmbeddings(pool, logger = console) {
  const batchSize = toPositiveInt(process.env.EMBED_BATCH_SIZE, 100, 1, 100);

  const { rows } = await pool.query(
    `
      SELECT id, text
      FROM rag_chunks
      WHERE embedding_status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1
    `,
    [batchSize]
  );

  if (!rows.length) {
    return { processed: 0, failed: 0, status: "idle" };
  }

  const { model, embeddings } = await createEmbeddings(rows.map((row) => row.text), logger);

  let processed = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const embedding = embeddings[i];
    if (!embedding) {
      failed++;
      await pool.query(
        `
          UPDATE rag_chunks
          SET embedding_status = 'failed',
              embedding_model = $2
          WHERE id = $1
        `,
        [row.id, model]
      );
      continue;
    }

    try {
      await pool.query(
        `
          UPDATE rag_chunks
          SET embedding = $2::vector,
              embedding_status = 'ready',
              embedding_model = $3
          WHERE id = $1
        `,
        [row.id, vectorLiteral(embedding), model]
      );
      processed++;
    } catch (error) {
      failed++;
      logger.error({ id: row.id, err: String(error?.message || error) }, "failed to update embedding row");
      await pool.query(
        `
          UPDATE rag_chunks
          SET embedding_status = 'failed',
              embedding_model = $2
          WHERE id = $1
        `,
        [row.id, model]
      );
    }
  }

  return { processed, failed, status: "ok", model };
}

export async function searchChunks(pool, query, topK, logger = console) {
  const safeTopK = toPositiveInt(topK, 10, 1, 50);
  const normalizedQuery = String(query || "").trim().slice(0, 4_000);
  if (!normalizedQuery) return { query: "", topK: safeTopK, results: [] };

  const { model, embeddings } = await createEmbeddings([normalizedQuery], logger);
  const vector = embeddings[0];
  if (!vector) throw new Error("Failed to build query embedding");

  const vectorText = vectorLiteral(vector);
  const { rows } = await pool.query(
    `
      SELECT
        id,
        conversation_global_id,
        message_global_id,
        chunk_index,
        left(text, 500) AS text,
        created_at,
        (embedding <-> $1::vector) AS distance
      FROM rag_chunks
      WHERE embedding_status = 'ready'
      ORDER BY embedding <-> $1::vector
      LIMIT $2
    `,
    [vectorText, safeTopK]
  );

  return {
    query: normalizedQuery,
    topK: safeTopK,
    embedding_model: model,
    results: rows,
  };
}
