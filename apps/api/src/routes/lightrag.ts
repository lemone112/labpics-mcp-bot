import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { cacheKeyHash } from "../infra/cache.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { getLightRagStatus, queryLightRag, refreshLightRag, submitLightRagFeedback } from "../domains/rag/lightrag.js";
import { rankSearchResults, computeRankingStats } from "../domains/rag/search-ranking.js";
import { trackSearchEvent, getSearchAnalyticsSummary } from "../domains/rag/search-analytics.js";
import type { Pool, FastifyReply, FastifyRequest } from "../types/index.js";
import type { ZodTypeAny } from "zod";

type RequestLike = FastifyRequest & {
  requestId: string;
  auth?: {
    active_project_id?: string | null;
    account_scope_id?: string | null;
    user_id?: string | null;
    user_role?: "owner" | "pm" | null;
    username?: string | null;
  };
  query?: Record<string, unknown>;
};

type ReplyLike = FastifyReply;
type RegisterFn = (
  path: string,
  handler: (request: RequestLike, reply: ReplyLike) => Promise<unknown> | unknown
) => void;

interface RouteCtx {
  registerGet: RegisterFn;
  registerPost: RegisterFn;
  pool: Pool;
  cache: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown, ttlSeconds: number) => Promise<void> | void;
  };
  SearchSchema: ZodTypeAny;
  LightRagQuerySchema: ZodTypeAny;
  LightRagFeedbackSchema: ZodTypeAny;
  SearchAnalyticsTrackSchema: ZodTypeAny;
  SearchAnalyticsSummarySchema: ZodTypeAny;
}

export function assertDateRange(dateFrom: unknown, dateTo: unknown) {
  if (!dateFrom || !dateTo) return;
  const from = dateFrom instanceof Date ? dateFrom : new Date(String(dateFrom));
  const to = dateTo instanceof Date ? dateTo : new Date(String(dateTo));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;
  if (from > to) {
    throw new ApiError(400, "invalid_date_range", "date_from must be less than or equal to date_to");
  }
}

export function registerLightragRoutes(ctx: RouteCtx) {
  const {
    registerGet,
    registerPost,
    pool,
    cache,
    SearchSchema,
    LightRagQuerySchema,
    LightRagFeedbackSchema,
    SearchAnalyticsTrackSchema,
  } = ctx;

  registerPost("/search", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody<{
      query: string;
      topK?: number;
      sourceLimit?: number;
      date_from?: string | null;
      date_to?: string | null;
    }>(SearchSchema as any, request.body);
    assertDateRange(body.date_from, body.date_to);
    const result = await queryLightRag(
      pool,
      scope,
      {
        query: body.query,
        topK: body.topK,
        sourceLimit: body.sourceLimit,
        dateFrom: body.date_from,
        dateTo: body.date_to,
        createdBy: request.auth?.username || null,
      },
      request.log as any
    );
    return sendOk(reply, request.requestId, {
      ...(result as any),
      results: (result as any).chunks,
      mode: "lightrag",
    });
  });

  registerGet("/lightrag/status", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const status = await getLightRagStatus(pool, scope);
    return sendOk(reply, request.requestId, status as any);
  });

  registerPost("/lightrag/query", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody<{
      query: string;
      topK?: number;
      sourceLimit?: number;
      sourceFilter?: string[];
      date_from?: string | null;
      date_to?: string | null;
    }>(LightRagQuerySchema as any, request.body);
    assertDateRange(body.date_from, body.date_to);

    const ragCacheKey = `lightrag:${scope.projectId}:${cacheKeyHash(
      body.query,
      String(body.topK),
      JSON.stringify(body.sourceFilter || []),
      String(body.date_from || ""),
      String(body.date_to || "")
    )}`;
    const cached = await cache.get(ragCacheKey);
    if (cached) return sendOk(reply, request.requestId, { ...(cached as any), cached: true });

    const startTime = Date.now();
    const result = await queryLightRag(
      pool,
      scope,
      {
        query: body.query,
        topK: body.topK,
        sourceLimit: body.sourceLimit,
        sourceFilter: body.sourceFilter,
        dateFrom: body.date_from,
        dateTo: body.date_to,
        createdBy: request.auth?.username || null,
      },
      request.log as any
    );
    const durationMs = Date.now() - startTime;

    const rankedEvidence = rankSearchResults((result as any).evidence || []);
    const rankingStats = computeRankingStats(rankedEvidence as any);

    const enrichedResult = {
      ...(result as any),
      evidence: rankedEvidence,
      ranking_stats: rankingStats,
      duration_ms: durationMs,
    };

    await cache.set(ragCacheKey, enrichedResult, 300);

    void trackSearchEvent(
      pool,
      scope,
      {
        query: body.query,
        resultCount: (rankedEvidence as any[]).length,
        filters: { sourceFilter: body.sourceFilter, topK: body.topK, dateFrom: body.date_from, dateTo: body.date_to },
        userId: request.auth?.user_id || null,
        eventType: "search",
        durationMs,
      },
      request.log as any
    ).catch((err) => {
      request.log.warn(
        { error: String((err as Error)?.message || err), request_id: request.requestId },
        "search analytics fire-and-forget failed"
      );
    });

    return sendOk(reply, request.requestId, enrichedResult);
  });

  registerPost("/lightrag/refresh", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await refreshLightRag(pool, scope, request.log as any);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "lightrag.refresh",
      entityType: "lightrag",
      entityId: scope.projectId,
      status: (result as any)?.embeddings?.status || "ok",
      requestId: request.requestId,
      payload: result as any,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/lightrag/feedback", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody<{ query_run_id: string; rating: number; comment?: string | null }>(
      LightRagFeedbackSchema as any,
      request.body
    );
    const result = await submitLightRagFeedback(pool, scope, {
      queryRunId: body.query_run_id,
      rating: body.rating,
      comment: body.comment,
      createdBy: request.auth?.username || null,
    });
    if (!result) {
      return sendError(reply, request.requestId, new ApiError(400, "feedback_failed", "Failed to submit feedback"));
    }
    return sendOk(reply, request.requestId, result as any);
  });

  registerPost("/search/analytics", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody<{
      query: string;
      result_count: number;
      filters?: Record<string, unknown>;
      clicked_result_id?: string | null;
      clicked_source_type?: string | null;
      event_type?: string;
      duration_ms?: number;
    }>(SearchAnalyticsTrackSchema as any, request.body);
    const eventId = await trackSearchEvent(
      pool,
      scope,
      {
        query: body.query,
        resultCount: body.result_count,
        filters: body.filters,
        userId: request.auth?.user_id || null,
        clickedResultId: body.clicked_result_id,
        clickedSourceType: body.clicked_source_type,
        eventType: body.event_type,
        durationMs: body.duration_ms,
      },
      request.log as any
    );
    return sendOk(reply, request.requestId, { tracked: Boolean(eventId), event_id: eventId });
  });

  registerGet("/search/analytics/summary", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const days = Number(request.query?.days) || 30;
    const topQueriesLimit = Number(request.query?.top_queries_limit) || 20;
    const summary = await getSearchAnalyticsSummary(pool, scope, { days, topQueriesLimit });
    return sendOk(reply, request.requestId, summary as any);
  });
}
