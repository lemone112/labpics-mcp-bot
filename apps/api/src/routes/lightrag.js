import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { cacheKeyHash } from "../infra/cache.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { getLightRagStatus, queryLightRag, refreshLightRag, submitLightRagFeedback } from "../domains/rag/lightrag.js";
import { rankSearchResults, computeRankingStats } from "../domains/rag/search-ranking.js";
import { trackSearchEvent, getSearchAnalyticsSummary } from "../domains/rag/search-analytics.js";

/**
 * @param {object} ctx
 */
export function registerLightragRoutes(ctx) {
  const { registerGet, registerPost, pool, cache, SearchSchema, LightRagQuerySchema, LightRagFeedbackSchema, SearchAnalyticsTrackSchema, SearchAnalyticsSummarySchema } = ctx;

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

    const startTime = Date.now();
    const result = await queryLightRag(
      pool,
      scope,
      { query: body.query, topK: body.topK, sourceLimit: body.sourceLimit, sourceFilter: body.sourceFilter, createdBy: request.auth?.username || null },
      request.log
    );
    const durationMs = Date.now() - startTime;

    // Rank evidence by composite score (semantic + recency + authority)
    const rankedEvidence = rankSearchResults(result.evidence || []);
    const rankingStats = computeRankingStats(rankedEvidence);

    const enrichedResult = {
      ...result,
      evidence: rankedEvidence,
      ranking_stats: rankingStats,
      duration_ms: durationMs,
    };

    await cache.set(ragCacheKey, enrichedResult, 300);

    // Track analytics asynchronously (fire-and-forget)
    trackSearchEvent(pool, scope, {
      query: body.query,
      resultCount: rankedEvidence.length,
      filters: { sourceFilter: body.sourceFilter, topK: body.topK },
      userId: request.auth?.user_id || null,
      eventType: "search",
      durationMs,
    }, request.log).catch(() => {});

    return sendOk(reply, request.requestId, enrichedResult);
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

  // --- Search Analytics (Iter 45.5) ---

  registerPost("/search/analytics", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(SearchAnalyticsTrackSchema, request.body);
    const eventId = await trackSearchEvent(pool, scope, {
      query: body.query,
      resultCount: body.result_count,
      filters: body.filters,
      userId: request.auth?.user_id || null,
      clickedResultId: body.clicked_result_id,
      clickedSourceType: body.clicked_source_type,
      eventType: body.event_type,
      durationMs: body.duration_ms,
    }, request.log);
    return sendOk(reply, request.requestId, { tracked: Boolean(eventId), event_id: eventId });
  });

  registerGet("/search/analytics/summary", async (request, reply) => {
    const scope = requireProjectScope(request);
    const days = Number(request.query?.days) || 30;
    const topQueriesLimit = Number(request.query?.top_queries_limit) || 20;
    const summary = await getSearchAnalyticsSummary(pool, scope, { days, topQueriesLimit });
    return sendOk(reply, request.requestId, summary);
  });
}
