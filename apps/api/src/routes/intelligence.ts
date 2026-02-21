import { parseBody, parseLimit, sendOk } from "../infra/api-contract.js";
import { cacheKeyHash } from "../infra/cache.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import {
  generateDailyDigest,
  generateWeeklyDigest,
  getAnalyticsOverview,
  getControlTower,
  getDigests,
  getRiskOverview,
  refreshAnalytics,
  refreshRiskAndHealth,
} from "../domains/analytics/intelligence.js";
import { getPortfolioMessages, getPortfolioOverview } from "../domains/analytics/portfolio.js";
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
  AnalyticsRefreshSchema: ZodTypeAny;
  parseProjectIdsInput: (input: unknown, maxCount: number) => string[];
  resolvePortfolioAccountScopeId: (pool: Pool, request: RequestLike, projectIds: string[]) => Promise<string>;
}

/**
 * Control-tower, portfolio, analytics, digests, risk routes.
 */
export function registerIntelligenceRoutes(ctx: RouteCtx) {
  const {
    registerGet,
    registerPost,
    pool,
    cache,
    AnalyticsRefreshSchema,
    parseProjectIdsInput,
    resolvePortfolioAccountScopeId,
  } = ctx;

  registerGet("/control-tower", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const ctCacheKey = `ct:${scope.projectId}`;
    const cached = await cache.get(ctCacheKey);
    if (cached) return sendOk(reply, request.requestId, cached as any);

    const payload = await getControlTower(pool, scope);
    await cache.set(ctCacheKey, payload as any, 120);
    return sendOk(reply, request.requestId, payload as any);
  });

  registerGet("/portfolio/overview", async (request, reply) => {
    const projectIds = parseProjectIdsInput(request.query?.project_ids, 100);
    const accountScopeId = await resolvePortfolioAccountScopeId(pool, request, projectIds);

    const portfolioCacheKey = `portfolio:${accountScopeId}:${cacheKeyHash(...projectIds.sort())}`;
    const cached = await cache.get(portfolioCacheKey);
    if (cached) return sendOk(reply, request.requestId, cached as any);

    const payload = await getPortfolioOverview(pool, {
      accountScopeId,
      activeProjectId: request.auth?.active_project_id || null,
      projectIds,
      messageLimit: request.query?.message_limit,
      cardLimit: request.query?.card_limit,
    });
    await cache.set(portfolioCacheKey, payload as any, 90);
    return sendOk(reply, request.requestId, payload as any);
  });

  registerGet("/portfolio/messages", async (request, reply) => {
    const projectIdCandidate = String(request.query?.project_id || "").trim();
    const accountScopeId = await resolvePortfolioAccountScopeId(
      pool,
      request,
      projectIdCandidate ? [projectIdCandidate] : []
    );

    const payload = await getPortfolioMessages(pool, {
      accountScopeId,
      projectId: request.query?.project_id,
      contactGlobalId: request.query?.contact_global_id,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, payload as any);
  });

  registerPost("/digests/daily/generate", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await generateDailyDigest(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "digest.daily.generate",
      entityType: "daily_digest",
      entityId: (result as any).digest_date,
      status: "ok",
      requestId: request.requestId,
      payload: { digest_date: (result as any).digest_date },
      evidenceRefs: (result as any).evidence_refs || [],
    });
    return sendOk(reply, request.requestId, result as any);
  });

  registerGet("/digests/daily", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const rows = await getDigests(pool, scope, "daily", parseLimit(request.query?.limit, 20, 100));
    return sendOk(reply, request.requestId, { digests: rows as any });
  });

  registerPost("/digests/weekly/generate", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await generateWeeklyDigest(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "digest.weekly.generate",
      entityType: "weekly_digest",
      entityId: (result as any).week_start,
      status: "ok",
      requestId: request.requestId,
      payload: { week_start: (result as any).week_start },
      evidenceRefs: (result as any).evidence_refs || [],
    });
    return sendOk(reply, request.requestId, result as any);
  });

  registerGet("/digests/weekly", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const rows = await getDigests(pool, scope, "weekly", parseLimit(request.query?.limit, 12, 52));
    return sendOk(reply, request.requestId, { digests: rows as any });
  });

  registerPost("/risk/refresh", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await refreshRiskAndHealth(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "risk.refresh",
      entityType: "risk_pattern",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result as any,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/risk/overview", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const overview = await getRiskOverview(pool, scope);
    return sendOk(reply, request.requestId, overview as any);
  });

  registerPost("/analytics/refresh", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody<{ period_days: number }>(AnalyticsRefreshSchema as any, request.body);
    const days = body.period_days;
    const result = await refreshAnalytics(pool, scope, days);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "analytics.refresh",
      entityType: "analytics_snapshot",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result as any,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/analytics/overview", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const overview = await getAnalyticsOverview(pool, scope);
    return sendOk(reply, request.requestId, overview as any);
  });

  registerGet("/analytics/drilldown", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const source = String(request.query?.source || "").trim().toLowerCase();
    const limit = parseLimit(request.query?.limit, 50, 200);
    const { rows } = await pool.query(
      `
        SELECT id, source_type, source_table, source_pk, snippet, payload, created_at
        FROM evidence_items
        WHERE project_id = $1
          AND account_scope_id = $2
          AND ($3 = '' OR source_type = $3 OR source_table = $3)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, source || "", limit]
    );
    return sendOk(reply, request.requestId, { evidence: rows as any });
  });
}
