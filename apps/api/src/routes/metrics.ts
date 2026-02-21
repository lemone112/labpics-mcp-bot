import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { assertUuid, requestIdOf } from "../infra/utils.js";
import { findCachedResponse, storeCachedResponse } from "../infra/idempotency.js";
import {
  evaluateCriteriaAndStoreRun,
  exportMetricObservations,
  getCriteriaRunDetails,
  ingestMetricObservations,
  queryMetricObservations,
  upsertMetricDefinition,
} from "../domains/analytics/metrics-contract.js";
import type { Pool, FastifyReply, FastifyRequest } from "../types/index.js";
import type { ZodTypeAny } from "zod";
import type {
  CriteriaEvaluateInput,
  MetricDefinitionUpsertInput,
  MetricsExportInput,
  MetricsIngestInput,
  MetricsQueryInput,
} from "../infra/schemas.js";

type RequestLike = FastifyRequest & {
  requestId?: string;
  auth?: {
    active_project_id?: string | null;
    account_scope_id?: string | null;
    user_id?: string | null;
    user_role?: string | null;
  };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
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
  MetricDefinitionUpsertSchema: ZodTypeAny;
  MetricsIngestSchema: ZodTypeAny;
  MetricsQuerySchema: ZodTypeAny;
  MetricsExportSchema: ZodTypeAny;
  CriteriaEvaluateSchema: ZodTypeAny;
}

/**
 * Versioned metrics and criteria contract routes (Iter 66.3)
 */
export function registerMetricsRoutes(ctx: RouteCtx) {
  const {
    registerGet,
    registerPost,
    pool,
    MetricDefinitionUpsertSchema,
    MetricsIngestSchema,
    MetricsQuerySchema,
    MetricsExportSchema,
    CriteriaEvaluateSchema,
  } = ctx;

  registerPost("/metrics/definitions", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody<MetricDefinitionUpsertInput>(MetricDefinitionUpsertSchema as any, request.body);
    try {
      const result = await upsertMetricDefinition(pool, body);
      return sendOk(
        reply,
        requestIdOf(request),
        {
          schema_version: 1,
          metric: result.metric,
          dimensions: result.dimensions,
          action: result.action,
          scope,
        },
        result.action === "created" ? 201 : 200
      );
    } catch (error) {
      return sendError(reply, requestIdOf(request), error);
    }
  });

  registerPost("/metrics/ingest", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody<MetricsIngestInput>(MetricsIngestSchema as any, request.body);
    const scopedIdempotencyKey = `metrics_ingest:${body.idempotency_key}`;

    const cached = await findCachedResponse(pool, scope.projectId, scopedIdempotencyKey);
    if (cached) {
      return reply.code((cached as any).status_code).send((cached as any).response_body);
    }

    try {
      const result = await ingestMetricObservations(pool, scope, body);
      const responseBody = {
        ok: true,
        schema_version: 1,
        result,
        request_id: requestIdOf(request),
      };
      await storeCachedResponse(
        pool,
        scope.projectId,
        scopedIdempotencyKey,
        "/metrics/ingest",
        201,
        responseBody
      );
      return reply.code(201).send(responseBody);
    } catch (error) {
      return sendError(reply, requestIdOf(request), error);
    }
  });

  registerGet("/metrics/query", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const query = parseBody<MetricsQueryInput>(MetricsQuerySchema as any, request.query || {});
    try {
      const result = await queryMetricObservations(pool, scope, query);
      return sendOk(reply, requestIdOf(request), {
        schema_version: 1,
        ...result,
      });
    } catch (error) {
      return sendError(reply, requestIdOf(request), error);
    }
  });

  registerGet("/metrics/export", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const query = parseBody<MetricsExportInput>(MetricsExportSchema as any, request.query || {});
    try {
      const exported = await exportMetricObservations(pool, scope, query);
      if (exported.format === "csv") {
        return reply
          .code(200)
          .header("content-type", "text/csv; charset=utf-8")
          .header("content-disposition", `attachment; filename="${exported.filename}"`)
          .send(exported.content);
      }
      return sendOk(reply, requestIdOf(request), {
        schema_version: 1,
        format: "json",
        filename: exported.filename,
        row_count: exported.row_count,
        rows: exported.rows,
      });
    } catch (error) {
      return sendError(reply, requestIdOf(request), error);
    }
  });

  registerPost("/criteria/evaluate", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody<CriteriaEvaluateInput>(CriteriaEvaluateSchema as any, request.body);
    const scopedIdempotencyKey = body.idempotency_key
      ? `criteria_evaluate:${body.idempotency_key}`
      : null;
    if (scopedIdempotencyKey) {
      const cached = await findCachedResponse(pool, scope.projectId, scopedIdempotencyKey);
      if (cached) {
        return reply.code((cached as any).status_code).send((cached as any).response_body);
      }
    }
    try {
      const result = await evaluateCriteriaAndStoreRun(
        pool,
        scope,
        request.auth?.user_id || null,
        body
      );
      const responseBody = {
        ok: true,
        schema_version: 1,
        ...result,
        request_id: requestIdOf(request),
      };
      if (scopedIdempotencyKey) {
        await storeCachedResponse(
          pool,
          scope.projectId,
          scopedIdempotencyKey,
          "/criteria/evaluate",
          201,
          responseBody
        );
      }
      return reply.code(201).send(responseBody);
    } catch (error) {
      return sendError(reply, requestIdOf(request), error);
    }
  });

  registerGet("/criteria/runs/:id", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const runId = assertUuid(request.params?.id, "run_id");
    try {
      const result = await getCriteriaRunDetails(pool, scope, runId);
      if (!result) {
        return sendError(
          reply,
          requestIdOf(request),
          new ApiError(404, "criteria_run_not_found", "Criteria run not found")
        );
      }
      return sendOk(reply, requestIdOf(request), { schema_version: 1, ...result });
    } catch (error) {
      return sendError(reply, requestIdOf(request), error);
    }
  });
}
