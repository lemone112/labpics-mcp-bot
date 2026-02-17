import { processDueOutbounds } from "./outbox.js";
import { runChatwootSync } from "./chatwoot.js";
import { runEmbeddings } from "./embeddings.js";

function toPositiveInt(value, fallback, min = 1, max = 86400) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function truncateError(error, max = 1000) {
  return String(error?.message || error || "scheduler_error").slice(0, max);
}

async function runSignalsExtractionStub() {
  return { extracted: 0, status: "ok", note: "signals extraction stub" };
}

async function runHealthScoringStub() {
  return { scored_accounts: 0, status: "ok", note: "health scoring stub" };
}

async function runAnalyticsAggregate(pool, scope) {
  const snapshot = await pool.query(
    `
      WITH open_opps AS (
        SELECT
          COALESCE(sum(amount_estimate), 0)::numeric(14,2) AS pipeline_amount,
          COALESCE(sum(amount_estimate * probability), 0)::numeric(14,2) AS expected_revenue
        FROM crm_opportunities
        WHERE project_id = $1
          AND account_scope_id = $2
          AND stage NOT IN ('won', 'lost')
      ),
      won_opps AS (
        SELECT COALESCE(sum(amount_estimate), 0)::numeric(14,2) AS won_amount
        FROM crm_opportunities
        WHERE project_id = $1
          AND account_scope_id = $2
          AND stage = 'won'
      )
      SELECT
        open_opps.pipeline_amount,
        open_opps.expected_revenue,
        won_opps.won_amount
      FROM open_opps, won_opps
    `,
    [scope.projectId, scope.accountScopeId]
  );
  const row = snapshot.rows[0] || {};

  const horizons = [30, 60, 90];
  for (const horizon of horizons) {
    await pool.query(
      `
        INSERT INTO analytics_revenue_snapshots(
          project_id,
          account_scope_id,
          period_start,
          horizon_days,
          pipeline_amount,
          commit_amount,
          won_amount,
          expected_revenue,
          costs_amount,
          gross_margin,
          attribution,
          generated_at
        )
        VALUES ($1, $2, date_trunc('month', now())::date, $3, $4, $5, $6, $7, 0, $7, '{}'::jsonb, now())
        ON CONFLICT (project_id, period_start, horizon_days)
        DO UPDATE SET
          pipeline_amount = EXCLUDED.pipeline_amount,
          commit_amount = EXCLUDED.commit_amount,
          won_amount = EXCLUDED.won_amount,
          expected_revenue = EXCLUDED.expected_revenue,
          gross_margin = EXCLUDED.gross_margin,
          generated_at = now()
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        horizon,
        row.pipeline_amount || 0,
        row.expected_revenue || 0,
        row.won_amount || 0,
        row.expected_revenue || 0,
      ]
    );
  }

  return {
    status: "ok",
    horizons,
    pipeline_amount: row.pipeline_amount || 0,
    expected_revenue: row.expected_revenue || 0,
    won_amount: row.won_amount || 0,
  };
}

function createHandlers(customHandlers = {}) {
  return {
    chatwoot_sync: async ({ pool, scope, logger }) => runChatwootSync(pool, scope, logger),
    embeddings_run: async ({ pool, scope, logger }) => runEmbeddings(pool, scope, logger),
    signals_extraction: async () => runSignalsExtractionStub(),
    health_scoring: async () => runHealthScoringStub(),
    campaign_scheduler: async ({ pool, scope }) =>
      processDueOutbounds(pool, scope, "scheduler", `scheduler_campaign_${Date.now()}`, 50),
    analytics_aggregates: async ({ pool, scope }) => runAnalyticsAggregate(pool, scope),
    ...customHandlers,
  };
}

export async function ensureDefaultScheduledJobs(pool, scope) {
  const defaults = [
    { jobType: "chatwoot_sync", cadenceSeconds: 900 },
    { jobType: "embeddings_run", cadenceSeconds: 1200 },
    { jobType: "signals_extraction", cadenceSeconds: 900 },
    { jobType: "health_scoring", cadenceSeconds: 1800 },
    { jobType: "campaign_scheduler", cadenceSeconds: 300 },
    { jobType: "analytics_aggregates", cadenceSeconds: 1800 },
  ];

  for (const item of defaults) {
    await pool.query(
      `
        INSERT INTO scheduled_jobs(
          project_id,
          account_scope_id,
          job_type,
          status,
          cadence_seconds,
          next_run_at
        )
        VALUES ($1, $2, $3, 'active', $4, now())
        ON CONFLICT (project_id, job_type)
        DO NOTHING
      `,
      [scope.projectId, scope.accountScopeId, item.jobType, item.cadenceSeconds]
    );
  }
}

export async function listScheduledJobs(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        job_type,
        status,
        cadence_seconds,
        next_run_at,
        last_run_at,
        last_status,
        last_error,
        payload
      FROM scheduled_jobs
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY job_type ASC
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

export async function runSchedulerTick(pool, scope, options = {}) {
  const limit = toPositiveInt(options.limit, 10, 1, 100);
  const handlers = createHandlers(options.handlers || {});
  const logger = options.logger || console;

  await ensureDefaultScheduledJobs(pool, scope);

  const dueRows = await pool.query(
    `
      SELECT
        id,
        job_type,
        cadence_seconds,
        payload
      FROM scheduled_jobs
      WHERE project_id = $1
        AND account_scope_id = $2
        AND status = 'active'
        AND next_run_at <= now()
      ORDER BY next_run_at ASC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, limit]
  );

  const stats = {
    processed: 0,
    ok: 0,
    failed: 0,
    details: [],
  };

  for (const job of dueRows.rows) {
    stats.processed++;
    const handler = handlers[job.job_type];
    const { rows: runRows } = await pool.query(
      `
        INSERT INTO worker_runs(
          scheduled_job_id,
          project_id,
          account_scope_id,
          job_type,
          status,
          started_at
        )
        VALUES ($1, $2, $3, $4, 'running', now())
        RETURNING id
      `,
      [job.id, scope.projectId, scope.accountScopeId, job.job_type]
    );
    const runId = runRows[0]?.id;

    try {
      const details = handler
        ? await handler({ pool, scope, payload: job.payload || {}, logger })
        : { status: "ok", skipped: true, reason: "no_handler" };

      await pool.query(
        `
          UPDATE worker_runs
          SET status = 'ok',
              finished_at = now(),
              details = $2::jsonb
          WHERE id = $1
        `,
        [runId, JSON.stringify(details || {})]
      );
      await pool.query(
        `
          UPDATE scheduled_jobs
          SET
            last_run_at = now(),
            last_status = 'ok',
            last_error = NULL,
            next_run_at = now() + (($2::int)::text || ' seconds')::interval,
            updated_at = now()
          WHERE id = $1
        `,
        [job.id, toPositiveInt(job.cadence_seconds, 900, 1, 86400)]
      );
      stats.ok++;
      stats.details.push({ job_type: job.job_type, status: "ok", details: details || {} });
    } catch (error) {
      const err = truncateError(error);
      await pool.query(
        `
          UPDATE worker_runs
          SET status = 'failed',
              finished_at = now(),
              error = $2
          WHERE id = $1
        `,
        [runId, err]
      );
      await pool.query(
        `
          UPDATE scheduled_jobs
          SET
            last_run_at = now(),
            last_status = 'failed',
            last_error = $2,
            next_run_at = now() + interval '5 minutes',
            updated_at = now()
          WHERE id = $1
        `,
        [job.id, err]
      );
      stats.failed++;
      stats.details.push({ job_type: job.job_type, status: "failed", error: err });
    }
  }

  return stats;
}
