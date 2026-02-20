import { processDueOutbounds, cleanupOldOutboundMessages } from "../outbound/outbox.js";
import { runEmbeddings } from "../rag/embeddings.js";
import { extractSignalsAndNba } from "../analytics/signals.js";
import { refreshUpsellRadar } from "../analytics/upsell.js";
import { generateDailyDigest, generateWeeklyDigest, refreshAnalytics, refreshRiskAndHealth } from "../analytics/intelligence.js";
import { syncLoopsContacts } from "../outbound/loops.js";
import { retryConnectorErrors, runAllConnectorsSync, runConnectorSync } from "../connectors/connector-sync.js";
import { runSyncReconciliation } from "../connectors/reconciliation.js";
import { toPositiveInt } from '../../infra/utils.js';

// ── Job duration metrics (44.2) ─────────────────────────────────
// Lightweight in-memory histograms per job type. No external dependency needed.
// Exposed via getSchedulerMetrics() for the /metrics and /health/scheduler endpoints.

const _jobMetrics = new Map();

function recordJobDuration(jobType, durationMs, status) {
  if (!_jobMetrics.has(jobType)) {
    _jobMetrics.set(jobType, {
      count: 0,
      ok: 0,
      failed: 0,
      total_ms: 0,
      max_ms: 0,
      min_ms: Infinity,
      last_duration_ms: 0,
      last_status: null,
      last_at: null,
    });
  }
  const m = _jobMetrics.get(jobType);
  m.count += 1;
  if (status === "ok") m.ok += 1;
  else m.failed += 1;
  m.total_ms += durationMs;
  if (durationMs > m.max_ms) m.max_ms = durationMs;
  if (durationMs < m.min_ms) m.min_ms = durationMs;
  m.last_duration_ms = durationMs;
  m.last_status = status;
  m.last_at = new Date().toISOString();
}

/** Returns a snapshot of all job duration metrics (read-only copy). */
export function getSchedulerMetrics() {
  const snapshot = {};
  for (const [jobType, m] of _jobMetrics) {
    snapshot[jobType] = {
      count: m.count,
      ok: m.ok,
      failed: m.failed,
      avg_ms: m.count > 0 ? Math.round(m.total_ms / m.count) : 0,
      max_ms: m.max_ms,
      min_ms: m.min_ms === Infinity ? 0 : m.min_ms,
      last_duration_ms: m.last_duration_ms,
      last_status: m.last_status,
      last_at: m.last_at,
    };
  }
  return snapshot;
}

// ── Dead job / concurrency state (44.3, 44.6) ──────────────────
const _schedulerState = {
  activeJobs: 0,
  lastTickAt: null,
  totalTicks: 0,
  totalErrors: 0,
};

export function getSchedulerState() {
  return { ..._schedulerState };
}

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

/** Per-job timeout in milliseconds.  Override via JOB_TIMEOUT_<TYPE>_MS. */
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function jobTimeoutMs(jobType) {
  const envKey = `JOB_TIMEOUT_${jobType.toUpperCase()}_MS`;
  const raw = parseInt(process.env[envKey] || "", 10);
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 30 * 60 * 1000);
  return DEFAULT_JOB_TIMEOUT_MS;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`job timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── Dead job detection & cleanup (44.3) ─────────────────────────
// Jobs stuck in "running" status longer than DEAD_JOB_THRESHOLD_MINUTES are
// presumed dead (process crash, OOM, etc.) and auto-marked as failed.

const DEFAULT_DEAD_JOB_THRESHOLD_MINUTES = 30;

/**
 * Detect and clean up jobs stuck in "running" state beyond the threshold.
 * Returns the number of dead jobs cleaned up.
 */
export async function cleanupDeadJobs(pool, scope, logger = console) {
  const thresholdMinutes = toPositiveInt(
    process.env.DEAD_JOB_THRESHOLD_MINUTES,
    DEFAULT_DEAD_JOB_THRESHOLD_MINUTES,
    5,
    1440
  );

  const { rows, rowCount } = await pool.query(
    `
      UPDATE scheduled_jobs
      SET
        status = 'active',
        last_run_at = started_at,
        last_status = 'failed',
        last_error = 'dead_job_auto_cleanup: stuck in running state for over ' || $3 || ' minutes',
        next_run_at = now() + interval '30 seconds',
        payload = jsonb_set(
          COALESCE(payload, '{}'::jsonb),
          '{dead_job_cleaned_at}',
          to_jsonb(now()::text)
        ),
        updated_at = now()
      WHERE project_id = $1
        AND account_scope_id = $2
        AND status = 'running'
        AND started_at < now() - (($3::int)::text || ' minutes')::interval
      RETURNING id, job_type, started_at
    `,
    [scope.projectId, scope.accountScopeId, thresholdMinutes]
  );

  if (rowCount > 0) {
    for (const row of rows) {
      logger.warn(
        { job_id: row.id, job_type: row.job_type, started_at: row.started_at, threshold_minutes: thresholdMinutes },
        "dead job detected and auto-cleaned"
      );
    }
    // Also mark corresponding worker_runs as failed
    await pool.query(
      `
        UPDATE worker_runs
        SET status = 'failed',
            finished_at = now(),
            error = 'dead_job_auto_cleanup'
        WHERE scheduled_job_id = ANY($1::int[])
          AND status = 'running'
      `,
      [rows.map((r) => r.id)]
    );
  }

  return rowCount;
}

// ── Job retry with configurable backoff (44.4) ─────────────────
// The existing schedulerBackoffSeconds already provides exponential backoff.
// Here we add env-configurable base and cap values.

/** Base delay for exponential backoff (seconds). */
const BACKOFF_BASE_SECONDS = toPositiveInt(process.env.JOB_RETRY_BACKOFF_BASE_SECONDS, 30, 5, 600);
/** Maximum backoff cap (seconds). Override via JOB_RETRY_BACKOFF_CAP_SECONDS. */
const BACKOFF_CAP_SECONDS = toPositiveInt(process.env.JOB_RETRY_BACKOFF_CAP_SECONDS, 3600, 60, 86400);

/** Maximum consecutive failures before a job is marked as dead-lettered. Override via JOB_MAX_RETRIES. */
const JOB_MAX_RETRIES = toPositiveInt(process.env.JOB_MAX_RETRIES, 10, 1, 100);

/** Exponential backoff for failed scheduler jobs (capped at 1 hour). */
function schedulerBackoffSeconds(consecutiveFailures, retryAfterMs) {
  // If the error carries a Retry-After value (e.g. from a 429 response), use it
  if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    return Math.min(retryAfterSec, BACKOFF_CAP_SECONDS);
  }
  const attempt = Math.max(1, Math.min(10, consecutiveFailures));
  const seconds = BACKOFF_BASE_SECONDS * Math.pow(2, attempt - 1);
  const jitter = 1 + (Math.random() - 0.5) * 0.3;
  return Math.min(BACKOFF_CAP_SECONDS, Math.round(seconds * jitter));
}

function createHandlers(customHandlers = {}, options = {}) {
  const handlers = {
    chatwoot_sync: async ({ pool, scope, logger }) => runConnectorSync(pool, scope, "chatwoot", logger),
    attio_sync: async ({ pool, scope, logger }) => runConnectorSync(pool, scope, "attio", logger),
    linear_sync: async ({ pool, scope, logger }) => runConnectorSync(pool, scope, "linear", logger),
    connectors_sync_cycle: async ({ pool, scope, logger }) =>
      runAllConnectorsSync(pool, scope, logger, { publishFn: options.publishFn }),
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
    analytics_aggregates: async ({ pool, scope, logger }) => {
      const result = await refreshAnalytics(pool, scope, 30);
      // Refresh materialized view so dashboard picks up latest health scores
      try {
        await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_portfolio_dashboard");
      } catch (err) {
        const msg = String(err?.message || "");
        // Swallow only "relation does not exist" — matview may not exist pre-migration
        if (msg.includes("does not exist")) {
          (logger || console).info("mv_portfolio_dashboard does not exist yet, skipping refresh");
        } else {
          (logger || console).error({ error: msg }, "mv_portfolio_dashboard refresh failed");
          throw err;
        }
      }
      return result;
    },
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
    outbound_retention_cleanup: async ({ pool, scope, logger }) =>
      cleanupOldOutboundMessages(pool, scope, logger),
  };
  return { ...handlers, ...customHandlers };
}

let _defaultJobsEnsured = false;

export async function ensureDefaultScheduledJobs(pool, scope) {
  if (_defaultJobsEnsured) return;

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
    { jobType: "outbound_retention_cleanup", cadenceSeconds: 86400 },
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
  _defaultJobsEnsured = true;
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

/** Max concurrent jobs across all scheduler ticks. Override via SCHEDULER_MAX_CONCURRENT_JOBS. */
const DEFAULT_MAX_CONCURRENT_JOBS = 10;

function maxConcurrentJobs() {
  return toPositiveInt(process.env.SCHEDULER_MAX_CONCURRENT_JOBS, DEFAULT_MAX_CONCURRENT_JOBS, 1, 100);
}

export async function runSchedulerTick(pool, scope, options = {}) {
  const limit = toPositiveInt(options.limit, 10, 1, 100);
  const handlers = createHandlers(options.handlers || {}, { publishFn: options.publishFn });
  const logger = options.logger || console;

  _schedulerState.lastTickAt = new Date().toISOString();
  _schedulerState.totalTicks += 1;

  await ensureDefaultScheduledJobs(pool, scope);

  // 44.3: Clean up dead jobs (stuck in "running" state) before picking new ones
  const deadJobsCleaned = await cleanupDeadJobs(pool, scope, logger);
  if (deadJobsCleaned > 0) {
    logger.warn({ dead_jobs_cleaned: deadJobsCleaned }, "scheduler: dead jobs auto-cleaned before tick");
  }

  // 44.6: Enforce concurrency limit — reduce pick-up limit if already near cap
  const concurrencyLimit = maxConcurrentJobs();
  const availableSlots = Math.max(0, concurrencyLimit - _schedulerState.activeJobs);
  const effectiveLimit = Math.min(limit, availableSlots);

  if (effectiveLimit <= 0) {
    logger.info(
      { active: _schedulerState.activeJobs, limit: concurrencyLimit },
      "scheduler: concurrency limit reached, skipping tick"
    );
    return { processed: 0, ok: 0, failed: 0, details: [], skipped_reason: "concurrency_limit" };
  }

  const dueRows = await pool.query(
    `
      UPDATE scheduled_jobs
      SET status = 'running',
          started_at = now(),
          updated_at = now()
      WHERE id = ANY(
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
      RETURNING id, job_type, cadence_seconds, payload
    `,
    [scope.projectId, scope.accountScopeId, effectiveLimit]
  );

  const stats = {
    processed: 0,
    ok: 0,
    failed: 0,
    details: [],
  };

  for (const job of dueRows.rows) {
    stats.processed++;
    _schedulerState.activeJobs += 1;
    const jobStartMs = Date.now();
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
      const timeoutMs = jobTimeoutMs(job.job_type);
      const details = handler
        ? await withTimeout(handler({ pool, scope, payload: job.payload || {}, logger }), timeoutMs)
        : { status: "ok", skipped: true, reason: "no_handler" };

      const durationMs = Date.now() - jobStartMs;
      recordJobDuration(job.job_type, durationMs, "ok");
      logger.info(
        { job_type: job.job_type, duration_ms: durationMs, run_id: runId },
        "job completed"
      );

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
            status = 'active',
            last_run_at = now(),
            last_status = 'ok',
            last_error = NULL,
            next_run_at = now() + (($2::int)::text || ' seconds')::interval,
            payload = payload - 'consecutive_failures',
            updated_at = now()
          WHERE id = $1
        `,
        [job.id, toPositiveInt(job.cadence_seconds, 900, 1, 2_592_000)]
      );
      stats.ok++;
      stats.details.push({ job_type: job.job_type, status: "ok", duration_ms: durationMs, details: details || {} });
      await triggerCascade(pool, scope, job.job_type, logger);
      await notifyJobCompleted(pool, scope, job.job_type, "ok", logger, options.publishFn);
    } catch (error) {
      const durationMs = Date.now() - jobStartMs;
      const err = truncateError(error);
      recordJobDuration(job.job_type, durationMs, "failed");
      _schedulerState.totalErrors += 1;
      logger.error(
        { job_type: job.job_type, duration_ms: durationMs, run_id: runId, error: err },
        "job failed"
      );

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
      const prevFailures = parseInt(job.payload?.consecutive_failures || 0, 10) || 0;
      const failures = prevFailures + 1;

      // 44.4: If max retries exceeded, mark job as suspended (dead-lettered)
      const isDeadLettered = failures >= JOB_MAX_RETRIES;
      if (isDeadLettered) {
        logger.error(
          { job_type: job.job_type, failures, max: JOB_MAX_RETRIES },
          "job exceeded max retries, suspending (dead-lettered)"
        );
      }

      // Use Retry-After from the error if available (e.g. 429 responses)
      const retryAfterMs = typeof error?.retryAfterMs === 'number' ? error.retryAfterMs : undefined;
      const backoffSec = schedulerBackoffSeconds(failures, retryAfterMs);
      const nextStatus = isDeadLettered ? "suspended" : "active";
      await pool.query(
        `
          UPDATE scheduled_jobs
          SET
            status = $5,
            last_run_at = now(),
            last_status = 'failed',
            last_error = $2,
            next_run_at = now() + (($3::int)::text || ' seconds')::interval,
            payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{consecutive_failures}', $4::jsonb),
            updated_at = now()
          WHERE id = $1
        `,
        [job.id, err, backoffSec, JSON.stringify(failures), nextStatus]
      );
      stats.failed++;
      stats.details.push({
        job_type: job.job_type, status: "failed", duration_ms: durationMs,
        error: err, dead_lettered: isDeadLettered,
      });
      await notifyJobCompleted(pool, scope, job.job_type, "failed", logger, options.publishFn);
    } finally {
      _schedulerState.activeJobs = Math.max(0, _schedulerState.activeJobs - 1);
    }
  }

  return stats;
}

export { CASCADE_CHAINS as _CASCADE_CHAINS_FOR_TESTING };
