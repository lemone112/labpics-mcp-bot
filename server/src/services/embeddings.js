import { toPositiveInt } from "../lib/chunking.js";
import { vectorLiteral } from "../lib/db.js";
import { createEmbeddings } from "./openai.js";

function truncateError(error, maxLen = 400) {
  const message = String(error?.message || error || "embedding_error");
  return message.slice(0, maxLen);
}

async function safeSetLocal(client, key, value, logger = console) {
  try {
    await client.query(`SET LOCAL ${key} = ${value}`);
  } catch (error) {
    logger.warn({ key, value, err: truncateError(error, 180) }, "unable to set local pgvector knob");
  }
}

async function claimPendingChunks(pool, batchSize) {
  const { rows } = await pool.query(
    `
      WITH picked AS (
        SELECT id, text
        FROM rag_chunks
        WHERE embedding_status = 'pending'
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE rag_chunks AS r
      SET
        embedding_status = 'processing',
        embedding_attempts = embedding_attempts + 1,
        updated_at = now()
      FROM picked
      WHERE r.id = picked.id
      RETURNING r.id, picked.text
    `,
    [batchSize]
  );
  return rows;
}

async function recoverStaleProcessingRows(pool, staleMinutes = 30) {
  const safeMinutes = Math.max(1, Math.min(24 * 60, staleMinutes));
  await pool.query(
    `
      UPDATE rag_chunks
      SET
        embedding_status = 'pending',
        embedding_error = COALESCE(embedding_error, 'recovered_from_stale_processing'),
        updated_at = now()
      WHERE
        embedding_status = 'processing'
        AND updated_at < (now() - ($1::text || ' minutes')::interval)
    `,
    [safeMinutes]
  );
}

async function markClaimedAsPending(pool, ids, error) {
  if (!ids.length) return;
  await pool.query(
    `
      UPDATE rag_chunks
      SET
        embedding_status = 'pending',
        embedding_error = $2,
        updated_at = now()
      WHERE id = ANY($1::uuid[])
    `,
    [ids, truncateError(error)]
  );
}

async function markFailedRows(pool, ids, model, error) {
  if (!ids.length) return;
  await pool.query(
    `
      UPDATE rag_chunks
      SET
        embedding_status = 'failed',
        embedding_model = $2,
        embedding_error = $3,
        updated_at = now()
      WHERE id = ANY($1::uuid[])
    `,
    [ids, model, truncateError(error)]
  );
}

async function markReadyRows(pool, rows, model) {
  if (!rows.length) return;

  const payload = rows.map((row) => ({
    id: row.id,
    embedding: vectorLiteral(row.embedding),
  }));

  await pool.query(
    `
      UPDATE rag_chunks AS r
      SET
        embedding = x.embedding::vector,
        embedding_status = 'ready',
        embedding_model = $2,
        embedding_error = NULL,
        last_embedded_at = now(),
        updated_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, embedding text)
      WHERE r.id = x.id
    `,
    [JSON.stringify(payload), model]
  );
}

export async function runEmbeddings(pool, logger = console) {
  const batchSize = toPositiveInt(process.env.EMBED_BATCH_SIZE, 100, 1, 100);
  const staleMinutes = toPositiveInt(process.env.EMBED_STALE_RECOVERY_MINUTES, 30, 1, 24 * 60);
  await recoverStaleProcessingRows(pool, staleMinutes);

  const claimedRows = await claimPendingChunks(pool, batchSize);
  if (!claimedRows.length) {
    return { processed: 0, failed: 0, status: "idle" };
  }

  const claimedIds = claimedRows.map((row) => row.id);
  let model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  try {
    const result = await createEmbeddings(claimedRows.map((row) => row.text), logger);
    model = result.model || model;

    const readyRows = [];
    const failedIds = [];
    for (let index = 0; index < claimedRows.length; index++) {
      const claimed = claimedRows[index];
      const embedding = result.embeddings[index];
      if (!Array.isArray(embedding) || !embedding.length) {
        failedIds.push(claimed.id);
        continue;
      }
      readyRows.push({ id: claimed.id, embedding });
    }

    await markReadyRows(pool, readyRows, model);
    await markFailedRows(pool, failedIds, model, "embedding_missing_from_provider");

    return {
      processed: readyRows.length,
      failed: failedIds.length,
      status: "ok",
      model,
    };
  } catch (error) {
    await markClaimedAsPending(pool, claimedIds, error);
    logger.error({ err: truncateError(error) }, "embedding batch failed and was returned to pending");
    throw error;
  }
}

export async function searchChunks(pool, query, topK, logger = console) {
  const safeTopK = toPositiveInt(topK, 10, 1, 50);
  const normalizedQuery = String(query || "").trim().slice(0, 4_000);
  if (!normalizedQuery) return { query: "", topK: safeTopK, results: [] };

  const { model, embeddings } = await createEmbeddings([normalizedQuery], logger);
  const vector = embeddings[0];
  if (!vector) throw new Error("Failed to build query embedding");

  const vectorText = vectorLiteral(vector);
  const ivfProbes = toPositiveInt(process.env.SEARCH_IVFFLAT_PROBES, 10, 1, 1000);
  const hnswEfSearch = toPositiveInt(process.env.SEARCH_HNSW_EF_SEARCH, 40, 1, 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await safeSetLocal(client, "ivfflat.probes", ivfProbes, logger);
    await safeSetLocal(client, "hnsw.ef_search", hnswEfSearch, logger);

    const { rows } = await client.query(
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
          AND embedding IS NOT NULL
        ORDER BY embedding <-> $1::vector
        LIMIT $2
      `,
      [vectorText, safeTopK]
    );
    await client.query("COMMIT");

    return {
      query: normalizedQuery,
      topK: safeTopK,
      embedding_model: model,
      search_config: {
        ivfflat_probes: ivfProbes,
        hnsw_ef_search: hnswEfSearch,
      },
      results: rows,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
