async function getStorageStats(pool) {
  const budgetGbRaw = Number.parseFloat(process.env.STORAGE_BUDGET_GB || "20");
  const budgetGb = Number.isFinite(budgetGbRaw) && budgetGbRaw > 0 ? budgetGbRaw : 20;
  const budgetBytes = Math.floor(budgetGb * 1024 * 1024 * 1024);

  const [dbSize, relationSizes] = await Promise.all([
    pool.query("SELECT pg_database_size(current_database())::bigint AS bytes"),
    pool.query(
      `
        SELECT
          relname,
          pg_total_relation_size(c.oid)::bigint AS bytes
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE relname = ANY($1::text[])
          AND n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
      `,
      [["cw_contacts", "cw_conversations", "cw_messages", "rag_chunks"]]
    ),
  ]);

  const tableSizes = {};
  for (const row of relationSizes.rows) {
    tableSizes[row.relname] = Number(row.bytes || 0);
  }

  const databaseBytes = Number(dbSize.rows?.[0]?.bytes || 0);
  return {
    database_bytes: databaseBytes,
    budget_bytes: budgetBytes,
    usage_percent: Number(((databaseBytes / Math.max(1, budgetBytes)) * 100).toFixed(2)),
    table_bytes: tableSizes,
  };
}

export async function startJob(pool, jobName) {
  const { rows } = await pool.query(
    `
      INSERT INTO job_runs(job_name, status, started_at)
      VALUES ($1, 'running', now())
      RETURNING id, started_at
    `,
    [jobName]
  );
  return rows[0];
}

export async function finishJob(pool, jobId, patch) {
  const status = patch?.status || "ok";
  const processedCount = Number.isFinite(patch?.processedCount) ? patch.processedCount : 0;
  const error = patch?.error ? String(patch.error).slice(0, 2000) : null;
  const meta = patch?.meta && typeof patch.meta === "object" ? patch.meta : {};

  await pool.query(
    `
      UPDATE job_runs
      SET status = $2,
          finished_at = now(),
          processed_count = $3,
          error = $4,
          meta = $5::jsonb
      WHERE id = $1
    `,
    [jobId, status, processedCount, error, JSON.stringify(meta)]
  );
}

export async function getJobsStatus(pool) {
  const [latestRuns, chunkStatusCounts, watermarks, entityCounts, storage] = await Promise.all([
    pool.query(
      `
        SELECT DISTINCT ON (job_name)
          id, job_name, status, started_at, finished_at, processed_count, error, meta
        FROM job_runs
        ORDER BY job_name, started_at DESC
      `
    ),
    pool.query(
      `
        SELECT embedding_status, count(*)::int AS count
        FROM rag_chunks
        GROUP BY embedding_status
      `
    ),
    pool.query(
      `
        SELECT source, cursor_ts, cursor_id, updated_at, meta
        FROM sync_watermarks
        ORDER BY updated_at DESC
        LIMIT 5
      `
    ),
    pool.query(
      `
        SELECT
          (SELECT count(*)::int FROM cw_contacts) AS contacts,
          (SELECT count(*)::int FROM cw_conversations) AS conversations,
          (SELECT count(*)::int FROM cw_messages) AS messages,
          (SELECT count(*)::int FROM rag_chunks) AS rag_chunks
      `
    ),
    getStorageStats(pool),
  ]);

  const ragCounts = { pending: 0, processing: 0, ready: 0, failed: 0 };
  for (const row of chunkStatusCounts.rows) {
    ragCounts[row.embedding_status] = row.count;
  }

  return {
    jobs: latestRuns.rows,
    rag_counts: ragCounts,
    entities: entityCounts.rows[0] || {
      contacts: 0,
      conversations: 0,
      messages: 0,
      rag_chunks: 0,
    },
    storage,
    watermarks: watermarks.rows,
  };
}
