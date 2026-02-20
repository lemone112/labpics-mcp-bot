import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { cacheKeyHash } from "../infra/cache.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { getLightRagStatus, queryLightRag, refreshLightRag, submitLightRagFeedback } from "../domains/rag/lightrag.js";

/**
 * @param {object} ctx
 */
export function registerLightragRoutes(ctx) {
  const { registerGet, registerPost, pool, cache, SearchSchema, LightRagQuerySchema, LightRagFeedbackSchema } = ctx;

  registerPost("/search", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(SearchSchema, request.body);
    const result = await queryLightRag(
      pool,
      scope,
      { query: body.query, topK: body.topK, sourceLimit: body.sourceLimit, createdBy: request.auth?.username || null },
      request.log
    );
    return sendOk(reply, request.requestId, {
      ...result,
      results: result.chunks,
      mode: "lightrag",
    });
  });

  registerGet("/lightrag/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const status = await getLightRagStatus(pool, scope);
    return sendOk(reply, request.requestId, status);
  });

  registerPost("/lightrag/query", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(LightRagQuerySchema, request.body);

    const ragCacheKey = `lightrag:${scope.projectId}:${cacheKeyHash(body.query, String(body.topK), JSON.stringify(body.sourceFilter || []))}`;
    const cached = await cache.get(ragCacheKey);
    if (cached) return sendOk(reply, request.requestId, { ...cached, cached: true });

    const result = await queryLightRag(
      pool,
      scope,
      { query: body.query, topK: body.topK, sourceLimit: body.sourceLimit, sourceFilter: body.sourceFilter, createdBy: request.auth?.username || null },
      request.log
    );
    await cache.set(ragCacheKey, result, 300);
    return sendOk(reply, request.requestId, result);
  });

  registerPost("/lightrag/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await refreshLightRag(pool, scope, request.log);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "lightrag.refresh",
      entityType: "lightrag",
      entityId: scope.projectId,
      status: result?.embeddings?.status || "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/lightrag/feedback", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(LightRagFeedbackSchema, request.body);
    const result = await submitLightRagFeedback(pool, scope, {
      queryRunId: body.query_run_id,
      rating: body.rating,
      comment: body.comment,
      createdBy: request.auth?.username || null,
    });
    if (!result) {
      return sendError(reply, request.requestId, new ApiError(400, "feedback_failed", "Failed to submit feedback"));
    }
    return sendOk(reply, request.requestId, result);
  });
}
