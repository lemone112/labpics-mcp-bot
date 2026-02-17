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
  const [latestRuns, statusCounts, watermark] = await Promise.all([
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
  ]);

  const ragCounts = { pending: 0, ready: 0, failed: 0 };
  for (const row of statusCounts.rows) {
    ragCounts[row.embedding_status] = row.count;
  }

  return {
    jobs: latestRuns.rows,
    rag_counts: ragCounts,
    watermarks: watermark.rows,
  };
}
