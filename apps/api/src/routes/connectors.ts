import { ApiError, parseBody, parseLimit, sendError, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import {
  listConnectorErrors,
  listConnectorSyncState,
  retryConnectorErrors,
  runAllConnectorsSync,
  runConnectorSync,
} from "../domains/connectors/connector-sync.js";
import { listDeadLetterErrors, retryDeadLetterError } from "../domains/connectors/connector-state.js";
import { getCompletenessDiff, listSyncReconciliation, runSyncReconciliation } from "../domains/connectors/reconciliation.js";
import type { Pool } from "../types/index.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeAny } from "zod";

type RequestLike = FastifyRequest & {
  auth?: {
    active_project_id?: string | null;
    account_scope_id?: string | null;
    user_id?: string | null;
    user_role?: "owner" | "pm" | null;
    username?: string | null;
  };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  requestId?: string;
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
  cache: { invalidateByPrefix: (prefix: string) => void };
  ConnectorRetrySchema: ZodTypeAny;
}

function requestIdOf(request: RequestLike): string {
  return String(request.requestId || request.id);
}

export function registerConnectorRoutes(ctx: RouteCtx) {
  const { registerGet, registerPost, pool, cache, ConnectorRetrySchema } = ctx;

  registerGet("/connectors/state", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const connectors = await listConnectorSyncState(pool, scope);
    return sendOk(reply, requestIdOf(request), { connectors });
  });

  registerGet("/connectors/errors", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const errors = await listConnectorErrors(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, requestIdOf(request), { errors });
  });

  registerGet("/connectors/reconciliation", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await listSyncReconciliation(pool, scope, {
      days: request.query?.days,
      limit: request.query?.limit,
    });
    return sendOk(reply, requestIdOf(request), result as any);
  });

  registerGet("/connectors/reconciliation/diff", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const diff = await getCompletenessDiff(pool, scope);
    return sendOk(reply, requestIdOf(request), { diff });
  });

  registerPost("/connectors/reconciliation/run", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await runSyncReconciliation(pool, scope, {
      source: "manual",
    });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connectors.reconciliation.run",
      entityType: "sync_reconciliation_metrics",
      entityId: scope.projectId,
      status: "ok",
      requestId: requestIdOf(request),
      payload: (result as any).summary,
      evidenceRefs: [],
    });
    return sendOk(reply, requestIdOf(request), { result });
  });

  registerPost("/connectors/sync", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await runAllConnectorsSync(pool, scope, request.log as any);
    cache.invalidateByPrefix(`lightrag:${scope.projectId}`);
    cache.invalidateByPrefix(`ct:${scope.projectId}`);
    if (scope.accountScopeId) cache.invalidateByPrefix(`portfolio:${scope.accountScopeId}`);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connectors.sync_all",
      entityType: "connector",
      entityId: scope.projectId,
      status: (result as any).failed > 0 ? "partial" : "ok",
      requestId: requestIdOf(request),
      payload: result as any,
      evidenceRefs: [],
    });
    return sendOk(reply, requestIdOf(request), { result });
  });

  registerPost("/connectors/:name/sync", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const connectorName = String(request.params?.name || "").trim().toLowerCase();
    try {
      const result = await runConnectorSync(pool, scope, connectorName, request.log as any);
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "connectors.sync_one",
        entityType: "connector",
        entityId: connectorName,
        status: "ok",
        requestId: requestIdOf(request),
        payload: result as any,
        evidenceRefs: [],
      });
      return sendOk(reply, requestIdOf(request), { result });
    } catch (error) {
      request.log.error({ err: String((error as Error)?.message || error), request_id: requestIdOf(request) }, "connector sync failed");
      return sendError(reply, requestIdOf(request), new ApiError(500, "connector_sync_failed", "Connector sync failed"));
    }
  });

  registerPost("/connectors/errors/retry", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody(ConnectorRetrySchema, request.body) as { limit: number };
    const result = await retryConnectorErrors(pool, scope, {
      limit: body.limit,
      logger: request.log as any,
    });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connectors.retry_errors",
      entityType: "connector_error",
      entityId: scope.projectId,
      status: (result as any).failed > 0 ? "partial" : "ok",
      requestId: requestIdOf(request),
      payload: result as any,
      evidenceRefs: [],
    });
    return sendOk(reply, requestIdOf(request), { result });
  });

  registerGet("/connectors/errors/dead-letter", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const limit = parseLimit(request.query?.limit, 50, 500);
    const errors = await listDeadLetterErrors(pool, scope, limit);
    return sendOk(reply, requestIdOf(request), { errors });
  });

  registerPost("/connectors/errors/dead-letter/:id/retry", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const error = await retryDeadLetterError(pool, scope, String(request.params?.id || ""));
    if (!error) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "error_not_found", "Dead letter error not found"));
    }
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connector_error.dead_letter_retry",
      entityType: "connector_error",
      entityId: String((error as any).id),
      status: "ok",
      requestId: requestIdOf(request),
      payload: { connector: (error as any).connector, error_kind: (error as any).error_kind },
      evidenceRefs: [],
    });
    return sendOk(reply, requestIdOf(request), { error });
  });
}
