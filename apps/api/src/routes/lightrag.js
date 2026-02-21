import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { cacheKeyHash } from "../infra/cache.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { getLightRagStatus, queryLightRag, refreshLightRag, submitLightRagFeedback } from "../domains/rag/lightrag.js";
import { rankSearchResults, computeRankingStats } from "../domains/rag/search-ranking.js";
import { trackSearchEvent, getSearchAnalyticsSummary, getSearchSuggestions } from "../domains/rag/search-analytics.js";


export function assertDateRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return;
  const from = dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
  const to = dateTo instanceof Date ? dateTo : new Date(dateTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;
  if (from > to) {
    throw new ApiError(400, "invalid_date_range", "date_from must be less than or equal to date_to");
  }
}


export function paginateEvidence(evidence, offset, limit) {
  const source = Array.isArray(evidence) ? evidence : [];
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Number(limit) || 10);
  return {
    evidence: source.slice(safeOffset, safeOffset + safeLimit),
    total: source.length,
    offset: safeOffset,
    limit: safeLimit,
  };
}

/**
 * @param {object} ctx
 */
export function registerLightragRoutes(ctx) {
  const { registerGet, registerPost, pool, cache, SearchSchema, LightRagQuerySchema, LightRagFeedbackSchema, SearchAnalyticsTrackSchema, SearchAnalyticsSummarySchema, SearchSuggestionsSchema } = ctx;

  registerPost("/search", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(SearchSchema, request.body);
    assertDateRange(body.date_from, body.date_to);
    const result = await queryLightRag(
      pool,
      scope,
      { query: body.query, topK: body.topK, sourceLimit: body.sourceLimit, dateFrom: body.date_from, dateTo: body.date_to, createdBy: request.auth?.username || null },
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
    assertDateRange(body.date_from, body.date_to);

    const ragCacheKey = `lightrag:${scope.projectId}:${cacheKeyHash(body.query, String(body.topK), JSON.stringify(body.sourceFilter || []), String(body.date_from || ''), String(body.date_to || ''), String(body.offset || 0), String(body.limit || 10))}`;
    const cached = await cache.get(ragCacheKey);
    if (cached) return sendOk(reply, request.requestId, { ...cached, cached: true });

    const startTime = Date.now();
    const result = await queryLightRag(
      pool,
      scope,
      { query: body.query, topK: body.topK, sourceLimit: body.sourceLimit, sourceFilter: body.sourceFilter, dateFrom: body.date_from, dateTo: body.date_to, createdBy: request.auth?.username || null },
      request.log
    );
    const durationMs = Date.now() - startTime;

    // Rank evidence by composite score (semantic + recency + authority)
    const rankedEvidence = rankSearchResults(result.evidence || []);
    const rankingStats = computeRankingStats(rankedEvidence);
    const paged = paginateEvidence(rankedEvidence, body.offset, body.limit);

    const enrichedResult = {
      ...result,
      evidence: paged.evidence,
      evidence_total: paged.total,
      evidence_offset: paged.offset,
      evidence_limit: paged.limit,
      ranking_stats: rankingStats,
      duration_ms: durationMs,
    };

    await cache.set(ragCacheKey, enrichedResult, 300);

    // Track analytics asynchronously (fire-and-forget)
    trackSearchEvent(pool, scope, {
      query: body.query,
      resultCount: rankedEvidence.length,
      filters: { sourceFilter: body.sourceFilter, topK: body.topK, dateFrom: body.date_from, dateTo: body.date_to },
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


  registerGet("/search/suggestions", async (request, reply) => {
    const scope = requireProjectScope(request);
    const query = parseBody(SearchSuggestionsSchema, request.query || {});
    const suggestions = await getSearchSuggestions(pool, scope, {
      query: query.q,
      limit: query.limit,
      days: query.days,
    });
    return sendOk(reply, request.requestId, { suggestions });
  });

  registerGet("/search/analytics/summary", async (request, reply) => {
    const scope = requireProjectScope(request);
    const days = Number(request.query?.days) || 30;
    const topQueriesLimit = Number(request.query?.top_queries_limit) || 20;
    const summary = await getSearchAnalyticsSummary(pool, scope, { days, topQueriesLimit });
    return sendOk(reply, request.requestId, summary);
  });
}
