import { ApiError, sendError, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { runEmbeddings } from "../domains/rag/embeddings.js";
import { finishJob, getJobsStatus, startJob } from "../domains/core/jobs.js";
import { runConnectorSync } from "../domains/connectors/connector-sync.js";
import { listScheduledJobs, runSchedulerTick } from "../domains/core/scheduler.js";
import { parseLimit } from "../infra/api-contract.js";

/**
 * @param {object} ctx
 */
export function registerJobRoutes(ctx) {
  const { registerGet, registerPost, pool, cache } = ctx;

  registerPost("/jobs/chatwoot/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const job = await startJob(pool, "chatwoot_sync", scope);
    try {
      const sync = await runConnectorSync(pool, scope, "chatwoot", request.log);
      const result = sync.result;
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: result.processed_messages,
        meta: result,
      });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.chatwoot_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      request.log.error({ err: errMsg, request_id: request.requestId }, "chatwoot sync job failed");
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.chatwoot_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "failed",
        requestId: request.requestId,
        payload: { error: errMsg },
        evidenceRefs: [],
      });
      if (errMsg.includes("chatwoot_source_")) {
        return sendError(
          reply,
          request.requestId,
          new ApiError(409, "chatwoot_source_binding_error", "Chatwoot source binding conflict")
        );
      }
      return sendError(reply, request.requestId, new ApiError(500, "chatwoot_sync_failed", "Chatwoot sync failed"));
    }
  });

  registerPost("/jobs/embeddings/run", async (request, reply) => {
    const scope = requireProjectScope(request);
    const job = await startJob(pool, "embeddings_run", scope);
    try {
      const result = await runEmbeddings(pool, scope, request.log);
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: result.processed,
        meta: result,
      });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.embeddings_run",
        entityType: "job_run",
        entityId: String(job.id),
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      cache.invalidateByPrefix(`lightrag:${scope.projectId}`);
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      request.log.error({ err: errMsg, request_id: request.requestId }, "embeddings job failed");
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.embeddings_run",
        entityType: "job_run",
        entityId: String(job.id),
        status: "failed",
        requestId: request.requestId,
        payload: { error: errMsg },
        evidenceRefs: [],
      });
      return sendError(reply, request.requestId, new ApiError(500, "embeddings_job_failed", "Embeddings job failed"));
    }
  });

  registerPost("/jobs/attio/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const job = await startJob(pool, "attio_sync", scope);
    try {
      const sync = await runConnectorSync(pool, scope, "attio", request.log);
      const result = sync.result;
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: Number(result.touched_accounts || 0) + Number(result.touched_opportunities || 0),
        meta: result,
      });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.attio_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.attio_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "failed",
        requestId: request.requestId,
        payload: { error: errMsg },
        evidenceRefs: [],
      });
      if (errMsg.includes("attio_workspace_source_")) {
        return sendError(
          reply,
          request.requestId,
          new ApiError(409, "attio_source_binding_error", "Attio source binding conflict")
        );
      }
      return sendError(reply, request.requestId, new ApiError(500, "attio_sync_failed", "Attio sync failed"));
    }
  });

  registerPost("/jobs/linear/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const job = await startJob(pool, "linear_sync", scope);
    try {
      const sync = await runConnectorSync(pool, scope, "linear", request.log);
      const result = sync.result;
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: Number(result.touched_projects || 0) + Number(result.touched_issues || 0),
        meta: result,
      });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.linear_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.linear_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "failed",
        requestId: request.requestId,
        payload: { error: errMsg },
        evidenceRefs: [],
      });
      if (errMsg.includes("linear_workspace_source_")) {
        return sendError(
          reply,
          request.requestId,
          new ApiError(409, "linear_source_binding_error", "Linear source binding conflict")
        );
      }
      return sendError(reply, request.requestId, new ApiError(500, "linear_sync_failed", "Linear sync failed"));
    }
  });

  registerGet("/jobs/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const status = await getJobsStatus(pool, scope);
    return sendOk(reply, request.requestId, status);
  });

  registerGet("/jobs/scheduler", async (request, reply) => {
    const scope = requireProjectScope(request);
    const jobs = await listScheduledJobs(pool, scope);
    return sendOk(reply, request.requestId, { jobs });
  });

  registerPost("/jobs/scheduler/tick", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 10, 100);
    const result = await runSchedulerTick(pool, scope, { limit, logger: request.log });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "job.scheduler_tick",
      entityType: "scheduler",
      entityId: scope.projectId,
      status: result.failed > 0 ? "partial" : "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });
}
