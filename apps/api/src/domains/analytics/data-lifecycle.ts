import { toPositiveInt } from "../../infra/utils.js";
import type { Logger, Pool, ProjectScope } from "../../types/index.js";

interface RetentionConfig {
  searchAnalyticsDays: number;
  lightragQueryRunsDays: number;
  generatedReportsCompletedDays: number;
  generatedReportsFailedDays: number;
  batchSize: number;
}

interface CleanupLagByTable {
  search_analytics: number;
  lightrag_query_runs: number;
  generated_reports_completed: number;
  generated_reports_failed: number;
}

interface DeletedRowsByTable {
  search_analytics: number;
  lightrag_query_runs: number;
  generated_reports_completed: number;
  generated_reports_failed: number;
  total: number;
}

interface AnalyticsRetentionRuntimeMetrics {
  runs_total: number;
  deleted_rows_total: number;
  last_deleted_rows: number;
  saturation_warnings_total: number;
  last_run_at: string | null;
  overdue_lag_days: CleanupLagByTable;
}

export interface AnalyticsRetentionCleanupResult {
  deleted_rows: DeletedRowsByTable;
  overdue_lag_days: CleanupLagByTable;
  config: RetentionConfig;
}

const retentionRuntimeMetrics: AnalyticsRetentionRuntimeMetrics = {
  runs_total: 0,
  deleted_rows_total: 0,
  last_deleted_rows: 0,
  saturation_warnings_total: 0,
  last_run_at: null,
  overdue_lag_days: {
    search_analytics: 0,
    lightrag_query_runs: 0,
    generated_reports_completed: 0,
    generated_reports_failed: 0,
  },
};

export function getAnalyticsRetentionMetrics(): AnalyticsRetentionRuntimeMetrics {
  return {
    ...retentionRuntimeMetrics,
    overdue_lag_days: { ...retentionRuntimeMetrics.overdue_lag_days },
  };
}

export function resolveRetentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  return {
    searchAnalyticsDays: toPositiveInt(env.SEARCH_ANALYTICS_RETENTION_DAYS, 365, 7, 3650),
    lightragQueryRunsDays: toPositiveInt(env.LIGHTRAG_QUERY_RUNS_RETENTION_DAYS, 180, 7, 3650),
    generatedReportsCompletedDays: toPositiveInt(env.GENERATED_REPORTS_COMPLETED_RETENTION_DAYS, 180, 7, 3650),
    generatedReportsFailedDays: toPositiveInt(env.GENERATED_REPORTS_FAILED_RETENTION_DAYS, 45, 7, 3650),
    batchSize: toPositiveInt(env.ANALYTICS_RETENTION_BATCH_SIZE, 1000, 100, 20_000),
  };
}

async function deleteSearchAnalyticsBatch(pool: Pool, scope: ProjectScope, days: number, batchSize: number): Promise<number> {
  const result = await pool.query(
    `
      WITH doomed AS (
        SELECT ctid
        FROM search_analytics
        WHERE project_id = $1::uuid
          AND account_scope_id = $2::uuid
          AND created_at < now() - (($3::int)::text || ' days')::interval
        ORDER BY created_at ASC
        LIMIT $4::int
      )
      DELETE FROM search_analytics s
      USING doomed d
      WHERE s.ctid = d.ctid
    `,
    [scope.projectId, scope.accountScopeId, days, batchSize]
  );
  return result.rowCount || 0;
}

async function deleteLightragRunsBatch(pool: Pool, scope: ProjectScope, days: number, batchSize: number): Promise<number> {
  const result = await pool.query(
    `
      WITH doomed AS (
        SELECT ctid
        FROM lightrag_query_runs
        WHERE project_id = $1::uuid
          AND account_scope_id = $2::uuid
          AND created_at < now() - (($3::int)::text || ' days')::interval
        ORDER BY created_at ASC
        LIMIT $4::int
      )
      DELETE FROM lightrag_query_runs q
      USING doomed d
      WHERE q.ctid = d.ctid
    `,
    [scope.projectId, scope.accountScopeId, days, batchSize]
  );
  return result.rowCount || 0;
}

async function deleteGeneratedReportsBatch(
  pool: Pool,
  scope: ProjectScope,
  status: "completed" | "failed",
  days: number,
  batchSize: number
): Promise<number> {
  const result = await pool.query(
    `
      WITH doomed AS (
        SELECT ctid
        FROM generated_reports
        WHERE project_id = $1::uuid
          AND account_scope_id = $2::uuid
          AND status = $3
          AND created_at < now() - (($4::int)::text || ' days')::interval
        ORDER BY created_at ASC
        LIMIT $5::int
      )
      DELETE FROM generated_reports g
      USING doomed d
      WHERE g.ctid = d.ctid
    `,
    [scope.projectId, scope.accountScopeId, status, days, batchSize]
  );
  return result.rowCount || 0;
}

async function loadOverdueLagDays(
  pool: Pool,
  scope: ProjectScope,
  table: "search_analytics" | "lightrag_query_runs" | "generated_reports",
  days: number,
  status: "completed" | "failed" | null = null
): Promise<number> {
  const whereStatus = status ? "AND status = $4" : "";
  const params = status
    ? [scope.projectId, scope.accountScopeId, days, status]
    : [scope.projectId, scope.accountScopeId, days];
  const result = await pool.query<{ lag_days: string | number | null }>(
    `
      SELECT COALESCE(
        ROUND((EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 86400.0)::numeric, 2),
        0
      ) AS lag_days
      FROM ${table}
      WHERE project_id = $1::uuid
        AND account_scope_id = $2::uuid
        AND created_at < now() - (($3::int)::text || ' days')::interval
        ${whereStatus}
    `,
    params
  );
  const value = Number(result.rows[0]?.lag_days ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function logRetentionWindowSaturation(
  logger: Logger | Console | undefined,
  scope: ProjectScope,
  table: string,
  deletedRows: number,
  batchSize: number
): number {
  if (deletedRows < batchSize) return 0;
  logger?.warn?.(
    {
      project_id: scope.projectId,
      account_scope_id: scope.accountScopeId,
      table,
      deleted_rows: deletedRows,
      batch_size: batchSize,
    },
    "retention cleanup reached batch limit; more stale rows likely remain"
  );
  return 1;
}

export async function runAnalyticsRetentionCleanup(
  pool: Pool,
  scope: ProjectScope,
  logger: Logger | Console = console
): Promise<AnalyticsRetentionCleanupResult> {
  const config = resolveRetentionConfig();

  const deletedSearchAnalytics = await deleteSearchAnalyticsBatch(
    pool,
    scope,
    config.searchAnalyticsDays,
    config.batchSize
  );
  const deletedLightragRuns = await deleteLightragRunsBatch(
    pool,
    scope,
    config.lightragQueryRunsDays,
    config.batchSize
  );
  const deletedGeneratedReportsCompleted = await deleteGeneratedReportsBatch(
    pool,
    scope,
    "completed",
    config.generatedReportsCompletedDays,
    config.batchSize
  );
  const deletedGeneratedReportsFailed = await deleteGeneratedReportsBatch(
    pool,
    scope,
    "failed",
    config.generatedReportsFailedDays,
    config.batchSize
  );

  const saturationWarnings =
    logRetentionWindowSaturation(
    logger,
    scope,
    "search_analytics",
    deletedSearchAnalytics,
    config.batchSize
  ) +
    logRetentionWindowSaturation(
    logger,
    scope,
    "lightrag_query_runs",
    deletedLightragRuns,
    config.batchSize
  ) +
    logRetentionWindowSaturation(
    logger,
    scope,
    "generated_reports.completed",
    deletedGeneratedReportsCompleted,
    config.batchSize
  ) +
    logRetentionWindowSaturation(
    logger,
    scope,
    "generated_reports.failed",
    deletedGeneratedReportsFailed,
    config.batchSize
  );

  const lagByTable: CleanupLagByTable = {
    search_analytics: await loadOverdueLagDays(pool, scope, "search_analytics", config.searchAnalyticsDays),
    lightrag_query_runs: await loadOverdueLagDays(pool, scope, "lightrag_query_runs", config.lightragQueryRunsDays),
    generated_reports_completed: await loadOverdueLagDays(
      pool,
      scope,
      "generated_reports",
      config.generatedReportsCompletedDays,
      "completed"
    ),
    generated_reports_failed: await loadOverdueLagDays(
      pool,
      scope,
      "generated_reports",
      config.generatedReportsFailedDays,
      "failed"
    ),
  };

  const deletedRows: DeletedRowsByTable = {
    search_analytics: deletedSearchAnalytics,
    lightrag_query_runs: deletedLightragRuns,
    generated_reports_completed: deletedGeneratedReportsCompleted,
    generated_reports_failed: deletedGeneratedReportsFailed,
    total:
      deletedSearchAnalytics +
      deletedLightragRuns +
      deletedGeneratedReportsCompleted +
      deletedGeneratedReportsFailed,
  };

  retentionRuntimeMetrics.runs_total += 1;
  retentionRuntimeMetrics.deleted_rows_total += deletedRows.total;
  retentionRuntimeMetrics.last_deleted_rows = deletedRows.total;
  retentionRuntimeMetrics.saturation_warnings_total += saturationWarnings;
  retentionRuntimeMetrics.last_run_at = new Date().toISOString();
  retentionRuntimeMetrics.overdue_lag_days = { ...lagByTable };

  logger.info?.(
    {
      project_id: scope.projectId,
      account_scope_id: scope.accountScopeId,
      deleted_rows: deletedRows,
      overdue_lag_days: lagByTable,
      retention_days: {
        search_analytics: config.searchAnalyticsDays,
        lightrag_query_runs: config.lightragQueryRunsDays,
        generated_reports_completed: config.generatedReportsCompletedDays,
        generated_reports_failed: config.generatedReportsFailedDays,
      },
      batch_size: config.batchSize,
    },
    "analytics retention cleanup completed"
  );

  return {
    deleted_rows: deletedRows,
    overdue_lag_days: lagByTable,
    config,
  };
}
