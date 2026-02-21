import { sendOk } from "../infra/api-contract.js";
import { getCircuitBreakerStates } from "../infra/http.js";
import { requestIdOf } from "../infra/utils.js";
import { getSchedulerMetrics, getSchedulerState } from "../domains/core/scheduler.js";
import { getAnalyticsRetentionMetrics } from "../domains/analytics/data-lifecycle.js";
import { getMetricsCriteriaRuntimeMetrics } from "../domains/analytics/metrics-contract.js";
import type { Pool } from "../types/index.js";
import type { FastifyReply, FastifyRequest } from "fastify";

type Metrics = {
  requests_total: number;
  responses_total: number;
  errors_total: number;
  status_counts: Record<string, number>;
  route_times: Record<string, { count: number; total_ms: number; max_ms: number }>;
};

type SseBroadcaster = {
  getStats: () => { total_connections: number; projects: number };
  addClient: (projectId: string, reply: FastifyReply, sessionId?: string | null) => () => void;
};

type CacheLayer = {
  getStats: () => {
    hits: number;
    misses: number;
    sets: number;
    invalidations: number;
    enabled: boolean;
  };
};

type RedisPubSub = {
  getStats: () => {
    publish_total: number;
    publish_failed_total: number;
    published_recipients_total: number;
    received_messages_total: number;
    callback_errors_total: number;
    subscribed_channels: number;
  };
};

type RequestLike = FastifyRequest & {
  auth?: {
    active_project_id?: string | null;
    session_id?: string | null;
  };
  requestId?: string;
};
type ReplyLike = FastifyReply;
type RegisterFn = (
  path: string,
  handler: (request: RequestLike, reply: ReplyLike) => Promise<unknown> | unknown
) => void;

interface RouteCtx {
  registerGet: RegisterFn;
  metrics: Metrics;
  sseBroadcaster: SseBroadcaster;
  cache: CacheLayer;
  redisPubSub: RedisPubSub;
  pool: Pool;
}

export function registerHealthRoutes(ctx: RouteCtx) {
  const { registerGet, metrics, sseBroadcaster, cache, pool, redisPubSub } = ctx;

  registerGet("/health", async (request, reply) => {
    return sendOk(reply, requestIdOf(request), { service: "server" });
  });

  registerGet("/metrics", async (_request, reply) => {
    const sseStats = sseBroadcaster.getStats();
    const cacheStats = cache.getStats();
    const pubsubStats = redisPubSub.getStats();
    const retentionStats = getAnalyticsRetentionMetrics();
    const metricsCriteriaStats = getMetricsCriteriaRuntimeMetrics();
    const mem = process.memoryUsage();
    const cbStates = getCircuitBreakerStates();
    const lines = [
      "# TYPE app_requests_total counter",
      `app_requests_total ${metrics.requests_total}`,
      "# TYPE app_responses_total counter",
      `app_responses_total ${metrics.responses_total}`,
      "# TYPE app_errors_total counter",
      `app_errors_total ${metrics.errors_total}`,
      "# TYPE app_sse_connections_total gauge",
      `app_sse_connections_total ${sseStats.total_connections}`,
      "# TYPE app_sse_projects_subscribed gauge",
      `app_sse_projects_subscribed ${sseStats.projects}`,
      "# TYPE app_cache_hits_total counter",
      `app_cache_hits_total ${cacheStats.hits}`,
      "# TYPE app_cache_misses_total counter",
      `app_cache_misses_total ${cacheStats.misses}`,
      "# TYPE app_cache_sets_total counter",
      `app_cache_sets_total ${cacheStats.sets}`,
      "# TYPE app_cache_invalidations_total counter",
      `app_cache_invalidations_total ${cacheStats.invalidations}`,
      "# TYPE app_cache_enabled gauge",
      `app_cache_enabled ${cacheStats.enabled ? 1 : 0}`,
      "# TYPE app_redis_pubsub_publish_total counter",
      `app_redis_pubsub_publish_total ${pubsubStats.publish_total}`,
      "# TYPE app_redis_pubsub_publish_failed_total counter",
      `app_redis_pubsub_publish_failed_total ${pubsubStats.publish_failed_total}`,
      "# TYPE app_redis_pubsub_published_recipients_total counter",
      `app_redis_pubsub_published_recipients_total ${pubsubStats.published_recipients_total}`,
      "# TYPE app_redis_pubsub_received_messages_total counter",
      `app_redis_pubsub_received_messages_total ${pubsubStats.received_messages_total}`,
      "# TYPE app_redis_pubsub_callback_errors_total counter",
      `app_redis_pubsub_callback_errors_total ${pubsubStats.callback_errors_total}`,
      "# TYPE app_redis_pubsub_subscribed_channels gauge",
      `app_redis_pubsub_subscribed_channels ${pubsubStats.subscribed_channels}`,
      "# TYPE app_db_pool_total gauge",
      `app_db_pool_total ${pool.totalCount}`,
      "# TYPE app_db_pool_idle gauge",
      `app_db_pool_idle ${pool.idleCount}`,
      "# TYPE app_db_pool_waiting gauge",
      `app_db_pool_waiting ${pool.waitingCount}`,
      "# TYPE app_process_uptime_seconds gauge",
      `app_process_uptime_seconds ${Math.floor(process.uptime())}`,
      "# TYPE app_process_heap_bytes gauge",
      `app_process_heap_bytes ${mem.heapUsed}`,
      "# TYPE app_process_rss_bytes gauge",
      `app_process_rss_bytes ${mem.rss}`,
      "# TYPE app_metrics_ingest_batches_success_total counter",
      `app_metrics_ingest_batches_success_total ${metricsCriteriaStats.ingest_batches_success_total}`,
      "# TYPE app_metrics_ingest_batches_failed_total counter",
      `app_metrics_ingest_batches_failed_total ${metricsCriteriaStats.ingest_batches_failed_total}`,
      "# TYPE app_metrics_ingest_observations_inserted_total counter",
      `app_metrics_ingest_observations_inserted_total ${metricsCriteriaStats.ingest_observations_inserted_total}`,
      "# TYPE app_metrics_ingest_observations_duplicate_total counter",
      `app_metrics_ingest_observations_duplicate_total ${metricsCriteriaStats.ingest_observations_duplicate_total}`,
      "# TYPE app_criteria_runs_total counter",
      `app_criteria_runs_total ${metricsCriteriaStats.criteria_runs_total}`,
      "# TYPE app_criteria_runs_failed_total counter",
      `app_criteria_runs_failed_total ${metricsCriteriaStats.criteria_runs_failed_total}`,
      "# TYPE app_criteria_evaluations_error_total counter",
      `app_criteria_evaluations_error_total ${metricsCriteriaStats.criteria_evaluations_error_total}`,
      "# TYPE app_criteria_last_run_duration_ms gauge",
      `app_criteria_last_run_duration_ms ${metricsCriteriaStats.criteria_last_run_duration_ms}`,
      "# TYPE app_scope_violation_total counter",
      `app_scope_violation_total ${metricsCriteriaStats.scope_violation_total}`,
      "# TYPE app_contract_error_total counter",
      `app_contract_error_total ${metricsCriteriaStats.contract_error_total}`,
      "# TYPE app_retention_cleanup_runs_total counter",
      `app_retention_cleanup_runs_total ${retentionStats.runs_total}`,
      "# TYPE app_retention_cleanup_deleted_rows_total counter",
      `app_retention_cleanup_deleted_rows_total ${retentionStats.deleted_rows_total}`,
      "# TYPE app_retention_cleanup_last_deleted_rows gauge",
      `app_retention_cleanup_last_deleted_rows ${retentionStats.last_deleted_rows}`,
      "# TYPE app_retention_cleanup_saturation_warnings_total counter",
      `app_retention_cleanup_saturation_warnings_total ${retentionStats.saturation_warnings_total}`,
    ];

    for (const [statusCode, count] of Object.entries(metrics.status_counts)) {
      lines.push(`app_response_status_total{status="${statusCode}"} ${count}`);
    }
    for (const [route, t] of Object.entries(metrics.route_times)) {
      const avgMs = t.count > 0 ? (t.total_ms / t.count).toFixed(1) : "0";
      lines.push(`app_route_response_avg_ms{route="${route}"} ${avgMs}`);
      lines.push(`app_route_response_max_ms{route="${route}"} ${t.max_ms.toFixed(1)}`);
      lines.push(`app_route_requests_total{route="${route}"} ${t.count}`);
    }

    const jobMetrics = getSchedulerMetrics() as Record<string, { avg_ms: number; max_ms: number; min_ms: number; count: number; ok: number; failed: number }>;
    for (const [jobType, m] of Object.entries(jobMetrics)) {
      lines.push(`app_job_duration_avg_ms{job_type="${jobType}"} ${m.avg_ms}`);
      lines.push(`app_job_duration_max_ms{job_type="${jobType}"} ${m.max_ms}`);
      lines.push(`app_job_duration_min_ms{job_type="${jobType}"} ${m.min_ms}`);
      lines.push(`app_job_runs_total{job_type="${jobType}"} ${m.count}`);
      lines.push(`app_job_runs_ok{job_type="${jobType}"} ${m.ok}`);
      lines.push(`app_job_runs_failed{job_type="${jobType}"} ${m.failed}`);
    }

    lines.push(`app_retention_cleanup_lag_days{table="search_analytics"} ${retentionStats.overdue_lag_days.search_analytics}`);
    lines.push(`app_retention_cleanup_lag_days{table="lightrag_query_runs"} ${retentionStats.overdue_lag_days.lightrag_query_runs}`);
    lines.push(`app_retention_cleanup_lag_days{table="generated_reports_completed"} ${retentionStats.overdue_lag_days.generated_reports_completed}`);
    lines.push(`app_retention_cleanup_lag_days{table="generated_reports_failed"} ${retentionStats.overdue_lag_days.generated_reports_failed}`);

    for (const cb of cbStates as Array<{ name: string; state: string; failures: number }>) {
      lines.push(`app_circuit_breaker_state{host="${cb.name}",state="${cb.state}"} ${cb.state === "open" ? 1 : 0}`);
      lines.push(`app_circuit_breaker_failures{host="${cb.name}"} ${cb.failures}`);
    }
    reply.type("text/plain; version=0.0.4");
    return lines.join("\n");
  });

  registerGet("/health/scheduler", async (request, reply) => {
    const schedulerState = getSchedulerState();
    const jobMetrics = getSchedulerMetrics();
    let status = "healthy";
    if (!schedulerState.lastTickAt) {
      status = "not_started";
    } else {
      const lastTickAge = Date.now() - new Date(schedulerState.lastTickAt).getTime();
      if (lastTickAge > 5 * 60 * 1000) {
        status = "degraded";
      }
    }

    return sendOk(reply, requestIdOf(request), {
      scheduler: {
        status,
        last_tick_at: schedulerState.lastTickAt,
        total_ticks: schedulerState.totalTicks,
        active_jobs: schedulerState.activeJobs,
        total_errors: schedulerState.totalErrors,
        uptime_seconds: Math.floor(process.uptime()),
      },
      jobs: jobMetrics,
    });
  });

  registerGet("/events/stream", async (request, reply) => {
    const projectId = String(request.auth?.active_project_id || "").trim();
    if (!projectId) {
      reply.code(400).send({ ok: false, error: "project_required" });
      return;
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ project_id: projectId })}\n\n`);

    const cleanup = sseBroadcaster.addClient(projectId, reply, request.auth?.session_id || null);

    const heartbeat = setInterval(() => {
      try {
        if (reply.raw.destroyed || !reply.raw.writable) {
          clearInterval(heartbeat);
          cleanup();
          return;
        }
        reply.raw.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        cleanup();
      }
    }, 25_000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      cleanup();
    });

    request.raw.on("error", () => {
      clearInterval(heartbeat);
      cleanup();
    });

    reply.hijack();
  });
}
