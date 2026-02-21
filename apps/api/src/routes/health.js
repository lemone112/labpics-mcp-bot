import { sendOk } from "../infra/api-contract.js";
import { getCircuitBreakerStates } from "../infra/http.js";
import { getSchedulerMetrics, getSchedulerState } from "../domains/core/scheduler.js";

/**
 * @param {object} ctx
 * @param {Function} ctx.registerGet
 * @param {object} ctx.metrics
 * @param {object} ctx.sseBroadcaster
 * @param {object} ctx.cache
 * @param {object} ctx.pool
 */
export function registerHealthRoutes(ctx) {
  const { registerGet, metrics, sseBroadcaster, cache, pool } = ctx;

  registerGet("/health", async (request, reply) => {
    return sendOk(reply, request.requestId, { service: "server" });
  });

  registerGet("/metrics", async (_request, reply) => {
    const sseStats = sseBroadcaster.getStats();
    const cacheStats = cache.getStats();
    const mem = process.memoryUsage();
    const cbStates = getCircuitBreakerStates();
    const lines = [
      // --- HTTP ---
      "# TYPE app_requests_total counter",
      `app_requests_total ${metrics.requests_total}`,
      "# TYPE app_responses_total counter",
      `app_responses_total ${metrics.responses_total}`,
      "# TYPE app_errors_total counter",
      `app_errors_total ${metrics.errors_total}`,
      // --- SSE ---
      "# TYPE app_sse_connections_total gauge",
      `app_sse_connections_total ${sseStats.total_connections}`,
      "# TYPE app_sse_projects_subscribed gauge",
      `app_sse_projects_subscribed ${sseStats.projects}`,
      // --- Cache ---
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
      // --- DB Pool ---
      "# TYPE app_db_pool_total gauge",
      `app_db_pool_total ${pool.totalCount}`,
      "# TYPE app_db_pool_idle gauge",
      `app_db_pool_idle ${pool.idleCount}`,
      "# TYPE app_db_pool_waiting gauge",
      `app_db_pool_waiting ${pool.waitingCount}`,
      // --- Process ---
      "# TYPE app_process_uptime_seconds gauge",
      `app_process_uptime_seconds ${Math.floor(process.uptime())}`,
      "# TYPE app_process_heap_bytes gauge",
      `app_process_heap_bytes ${mem.heapUsed}`,
      "# TYPE app_process_rss_bytes gauge",
      `app_process_rss_bytes ${mem.rss}`,
    ];
    // --- HTTP status breakdown ---
    for (const [statusCode, count] of Object.entries(metrics.status_counts)) {
      lines.push(`app_response_status_total{status="${statusCode}"} ${count}`);
    }
    // --- Route response times ---
    for (const [route, t] of Object.entries(metrics.route_times)) {
      const avgMs = t.count > 0 ? (t.total_ms / t.count).toFixed(1) : "0";
      lines.push(`app_route_response_avg_ms{route="${route}"} ${avgMs}`);
      lines.push(`app_route_response_max_ms{route="${route}"} ${t.max_ms.toFixed(1)}`);
      lines.push(`app_route_requests_total{route="${route}"} ${t.count}`);
    }
    // --- Scheduler job duration metrics (44.2) ---
    const jobMetrics = getSchedulerMetrics();
    for (const [jobType, m] of Object.entries(jobMetrics)) {
      lines.push(`app_job_duration_avg_ms{job_type="${jobType}"} ${m.avg_ms}`);
      lines.push(`app_job_duration_max_ms{job_type="${jobType}"} ${m.max_ms}`);
      lines.push(`app_job_duration_min_ms{job_type="${jobType}"} ${m.min_ms}`);
      lines.push(`app_job_runs_total{job_type="${jobType}"} ${m.count}`);
      lines.push(`app_job_runs_ok{job_type="${jobType}"} ${m.ok}`);
      lines.push(`app_job_runs_failed{job_type="${jobType}"} ${m.failed}`);
    }
    // --- Circuit breakers ---
    for (const cb of cbStates) {
      lines.push(`app_circuit_breaker_state{host="${cb.name}",state="${cb.state}"} ${cb.state === "open" ? 1 : 0}`);
      lines.push(`app_circuit_breaker_failures{host="${cb.name}"} ${cb.failures}`);
    }
    reply.type("text/plain; version=0.0.4");
    return lines.join("\n");
  });

  // 44.7: Scheduler health endpoint
  registerGet("/health/scheduler", async (request, reply) => {
    const schedulerState = getSchedulerState();
    const jobMetrics = getSchedulerMetrics();

    // Determine overall scheduler health status
    let status = "healthy";
    if (!schedulerState.lastTickAt) {
      status = "not_started";
    } else {
      const lastTickAge = Date.now() - new Date(schedulerState.lastTickAt).getTime();
      // If no tick in the last 5 minutes, consider it degraded
      if (lastTickAge > 5 * 60 * 1000) {
        status = "degraded";
      }
    }

    return sendOk(reply, request.requestId, {
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

  // SSE endpoint for real-time job completion events
  registerGet("/events/stream", async (request, reply) => {
    const projectId = String(request.auth?.active_project_id || "").trim();
    if (!projectId) {
      reply.code(400).send({ ok: false, error: "project_required" });
      return;
    }

    let cleanup = () => {};
    try {
      cleanup = sseBroadcaster.addClient(projectId, reply, request.auth?.session_id || null);
    } catch (error) {
      const code = String(error?.code || "");
      const isLimit = code === "sse_project_limit_reached" || code === "sse_global_limit_reached";
      reply.code(isLimit ? 429 : 503).send({ ok: false, error: code || "sse_unavailable" });
      return;
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ project_id: projectId })}\n\n`);

    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);

    // Prevent Fastify from closing the response
    reply.hijack();
  });
}
