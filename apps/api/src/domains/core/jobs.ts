import type { Pool } from "../../types/index.js";

type Scope = {
  projectId: string;
  accountScopeId: string;
};

type JobPatch = {
  status?: string;
  processedCount?: number;
  error?: unknown;
  meta?: unknown;
};

async function getStorageStats(pool: Pool, scope: Scope) {
  const budgetGbRaw = Number.parseFloat(process.env.STORAGE_BUDGET_GB || "20");
  const budgetGb = Number.isFinite(budgetGbRaw) && budgetGbRaw > 0 ? budgetGbRaw : 20;
  const budgetBytes = Math.floor(budgetGb * 1024 * 1024 * 1024);

  const [dbSize, relationSizes, scopedRowStats] = await Promise.all([
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
    pool.query(
      `
        SELECT (
          COALESCE((SELECT sum(pg_column_size(c.*)) FROM cw_contacts AS c WHERE c.project_id = $1), 0)
          + COALESCE((SELECT sum(pg_column_size(cn.*)) FROM cw_conversations AS cn WHERE cn.project_id = $1), 0)
          + COALESCE((SELECT sum(pg_column_size(m.*)) FROM cw_messages AS m WHERE m.project_id = $1), 0)
          + COALESCE((SELECT sum(pg_column_size(r.*)) FROM rag_chunks AS r WHERE r.project_id = $1), 0)
        )::bigint AS bytes
      `,
      [scope.projectId]
    ),
  ]);

  const tableSizes: Record<string, number> = {};
  for (const row of relationSizes.rows as Array<{ relname: string; bytes: string | number }>) {
    tableSizes[row.relname] = Number(row.bytes || 0);
  }

  const databaseBytes = Number((dbSize.rows?.[0] as { bytes?: string | number } | undefined)?.bytes || 0);
  const scopedLogicalBytes = Number((scopedRowStats.rows?.[0] as { bytes?: string | number } | undefined)?.bytes || 0);
  return {
    database_bytes: databaseBytes,
    scoped_logical_bytes: scopedLogicalBytes,
    budget_bytes: budgetBytes,
    usage_percent: Number(((databaseBytes / Math.max(1, budgetBytes)) * 100).toFixed(2)),
    table_bytes: tableSizes,
  };
}

export async function startJob(pool: Pool, jobName: string, scope: Scope) {
  const { rows } = await pool.query(
    `
      INSERT INTO job_runs(job_name, status, project_id, account_scope_id, started_at)
      VALUES ($1, 'running', $2, $3, now())
      RETURNING id, started_at
    `,
    [jobName, scope.projectId, scope.accountScopeId]
  );
  return rows[0];
}

export async function finishJob(pool: Pool, jobId: string | number, patch: JobPatch) {
  const status = patch?.status || "ok";
  const processedCount = Number.isFinite(patch?.processedCount) ? Number(patch.processedCount) : 0;
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

export async function getJobsStatus(pool: Pool, scope: Scope) {
  const [latestRuns, chunkStatusCounts, watermarks, entityCounts, storage] = await Promise.all([
    pool.query(
      `
        SELECT DISTINCT ON (job_name)
          id, job_name, status, started_at, finished_at, processed_count, error, meta
        FROM job_runs
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY job_name, started_at DESC
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT embedding_status, count(*)::int AS count
        FROM rag_chunks
        WHERE project_id = $1
          AND account_scope_id = $2
        GROUP BY embedding_status
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT source, cursor_ts, cursor_id, updated_at, meta
        FROM sync_watermarks
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC
        LIMIT 5
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          (SELECT count(*)::int FROM cw_contacts WHERE project_id = $1 AND account_scope_id = $2) AS contacts,
          (SELECT count(*)::int FROM cw_conversations WHERE project_id = $1 AND account_scope_id = $2) AS conversations,
          (SELECT count(*)::int FROM cw_messages WHERE project_id = $1 AND account_scope_id = $2) AS messages,
          (SELECT count(*)::int FROM rag_chunks WHERE project_id = $1 AND account_scope_id = $2) AS rag_chunks
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    getStorageStats(pool, scope),
  ]);

  const ragCounts: Record<string, number> = { pending: 0, processing: 0, ready: 0, failed: 0 };
  for (const row of chunkStatusCounts.rows as Array<{ embedding_status: string; count: number }>) {
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
