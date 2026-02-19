import { processDueOutbounds } from "./outbox.js";
import { runEmbeddings } from "./embeddings.js";
import { extractSignalsAndNba } from "./signals.js";
import { refreshUpsellRadar } from "./upsell.js";
import { generateDailyDigest, generateWeeklyDigest, refreshAnalytics, refreshRiskAndHealth } from "./intelligence.js";
import { syncLoopsContacts } from "./loops.js";
import { retryConnectorErrors, runAllConnectorsSync, runConnectorSync } from "./connector-sync.js";
import { runSyncReconciliation } from "./reconciliation.js";
import { toPositiveInt } from '../lib/utils.js';

/**
 * After a job completes successfully, downstream jobs are triggered immediately
 * by setting their next_run_at to now(). This eliminates the 15-30 min delay
 * between data sync and recommendation/signal updates.
 *
 * Chain: sync → signals + embeddings → health → analytics
 */
const CASCADE_CHAINS = {
  connectors_sync_cycle: ["signals_extraction", "embeddings_run"],
  signals_extraction: ["health_scoring"],
  health_scoring: ["analytics_aggregates"],
};

async function triggerCascade(pool, scope, completedJobType, logger) {
  const downstreamJobs = CASCADE_CHAINS[completedJobType];
  if (!downstreamJobs || !downstreamJobs.length) return;

  for (const downstream of downstreamJobs) {
    try {
      const { rowCount } = await pool.query(
        `
          UPDATE scheduled_jobs
          SET next_run_at = now(),
              updated_at = now(),
              payload = jsonb_set(
                COALESCE(payload, '{}'::jsonb),
                '{cascade_triggered_by}',
                $4::jsonb
              )
          WHERE project_id = $1
            AND account_scope_id = $2
            AND job_type = $3
            AND status = 'active'
            AND next_run_at > now()
        `,
        [
          scope.projectId,
          scope.accountScopeId,
          downstream,
          JSON.stringify({ job_type: completedJobType, at: new Date().toISOString() }),
        ]
      );
      if (rowCount > 0) {
        logger.info(
          { trigger: completedJobType, cascaded: downstream },
          "cascade: moved next_run_at to now"
        );
      }
    } catch (error) {
      logger.error(
        { trigger: completedJobType, cascaded: downstream, error: String(error?.message || error) },
        "cascade: failed to trigger downstream job"
      );
    }
  }
}

/**
 * Publish a job completion event via Redis Pub/Sub.
 * When Redis is unavailable (publishFn is null), this is a no-op —
 * real-time SSE updates require Redis. Frontend polling (Level 1) still works.
 */
async function notifyJobCompleted(pool, scope, jobType, status, logger, publishFn) {
  if (typeof publishFn !== "function") return;
  const payload = {
    job_type: jobType,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    status,
    at: new Date().toISOString(),
  };
  try {
    await publishFn("job_completed", JSON.stringify(payload));
  } catch (error) {
    logger.warn(
      { job_type: jobType, error: String(error?.message || error) },
      "notifyJobCompleted failed"
    );
  }
}

function truncateError(error, max = 1000) {
  return String(error?.message || error || "scheduler_error").slice(0, max);
}

function createHandlers(customHandlers = {}) {
  const handlers = {
    chatwoot_sync: async ({ pool, scope, logger }) => runConnectorSync(pool, scope, "chatwoot", logger),
    attio_sync: async ({ pool, scope, logger }) => runConnectorSync(pool, scope, "attio", logger),
    linear_sync: async ({ pool, scope, logger }) => runConnectorSync(pool, scope, "linear", logger),
    connectors_sync_cycle: async ({ pool, scope, logger }) => runAllConnectorsSync(pool, scope, logger),
    connectors_reconciliation_daily: async ({ pool, scope }) =>
      runSyncReconciliation(pool, scope, { source: "daily_job" }),
    connector_errors_retry: async ({ pool, scope, logger }) => retryConnectorErrors(pool, scope, { logger }),
    embeddings_run: async ({ pool, scope, logger }) => runEmbeddings(pool, scope, logger),
    signals_extraction: async ({ pool, scope }) => extractSignalsAndNba(pool, scope),
    health_scoring: async ({ pool, scope }) => refreshRiskAndHealth(pool, scope),
    upsell_radar: async ({ pool, scope }) => refreshUpsellRadar(pool, scope),
    daily_digest: async ({ pool, scope }) => generateDailyDigest(pool, scope),
    weekly_digest: async ({ pool, scope }) => generateWeeklyDigest(pool, scope),
    campaign_scheduler: async ({ pool, scope }) =>
      processDueOutbounds(pool, scope, "scheduler", `scheduler_campaign_${Date.now()}`, 50),
    analytics_aggregates: async ({ pool, scope }) => refreshAnalytics(pool, scope, 30),
    loops_contacts_sync: async ({ pool, scope }) =>
      syncLoopsContacts(
        pool,
        { accountScopeId: scope.accountScopeId, projectIds: [scope.projectId] },
        {
          actorUsername: "scheduler",
          requestId: `scheduler_loops_${Date.now()}`,
          limit: 300,
        }
      ),
  };
  return { ...handlers, ...customHandlers };
}

export async function ensureDefaultScheduledJobs(pool, scope) {
  const defaults = [
    { jobType: "connectors_sync_cycle", cadenceSeconds: 900 },
    { jobType: "connectors_reconciliation_daily", cadenceSeconds: 86400 },
    { jobType: "connector_errors_retry", cadenceSeconds: 300 },
    { jobType: "embeddings_run", cadenceSeconds: 1200 },
    { jobType: "signals_extraction", cadenceSeconds: 900 },
    { jobType: "health_scoring", cadenceSeconds: 1800 },
    { jobType: "upsell_radar", cadenceSeconds: 1800 },
    { jobType: "daily_digest", cadenceSeconds: 86400 },
    { jobType: "weekly_digest", cadenceSeconds: 604800 },
    { jobType: "campaign_scheduler", cadenceSeconds: 300 },
    { jobType: "analytics_aggregates", cadenceSeconds: 1800 },
    { jobType: "loops_contacts_sync", cadenceSeconds: 3600 },
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
      WITH claimed AS (
        SELECT id
        FROM scheduled_jobs
        WHERE project_id = $1
          AND account_scope_id = $2
          AND status = 'active'
          AND next_run_at <= now()
        ORDER BY next_run_at ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      SELECT
        s.id,
        s.job_type,
        s.cadence_seconds,
        s.payload
      FROM scheduled_jobs s
      INNER JOIN claimed c ON c.id = s.id
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
        [job.id, toPositiveInt(job.cadence_seconds, 900, 1, 2_592_000)]
      );
      stats.ok++;
      stats.details.push({ job_type: job.job_type, status: "ok", details: details || {} });
      await triggerCascade(pool, scope, job.job_type, logger);
      await notifyJobCompleted(pool, scope, job.job_type, "ok", logger, options.publishFn);
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
      await notifyJobCompleted(pool, scope, job.job_type, "failed", logger, options.publishFn);
    }
  }

  return stats;
}

export { CASCADE_CHAINS as _CASCADE_CHAINS_FOR_TESTING };
