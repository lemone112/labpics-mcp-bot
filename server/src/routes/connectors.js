import { ApiError, parseBody, parseLimit, sendError, sendOk } from "../lib/api-contract.js";
import { requireProjectScope } from "../lib/scope.js";
import { writeAuditEvent } from "../services/audit.js";
import {
  listConnectorErrors,
  listConnectorSyncState,
  retryConnectorErrors,
  runAllConnectorsSync,
  runConnectorSync,
} from "../services/connector-sync.js";
import { listDeadLetterErrors, retryDeadLetterError } from "../services/connector-state.js";
import { getCompletenessDiff, listSyncReconciliation, runSyncReconciliation } from "../services/reconciliation.js";

/**
 * @param {object} ctx
 */
export function registerConnectorRoutes(ctx) {
  const { registerGet, registerPost, pool, cache, ConnectorRetrySchema } = ctx;

  registerGet("/connectors/state", async (request, reply) => {
    const scope = requireProjectScope(request);
    const connectors = await listConnectorSyncState(pool, scope);
    return sendOk(reply, request.requestId, { connectors });
  });

  registerGet("/connectors/errors", async (request, reply) => {
    const scope = requireProjectScope(request);
    const errors = await listConnectorErrors(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { errors });
  });

  registerGet("/connectors/reconciliation", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await listSyncReconciliation(pool, scope, {
      days: request.query?.days,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/connectors/reconciliation/diff", async (request, reply) => {
    const scope = requireProjectScope(request);
    const diff = await getCompletenessDiff(pool, scope);
    return sendOk(reply, request.requestId, { diff });
  });

  registerPost("/connectors/reconciliation/run", async (request, reply) => {
    const scope = requireProjectScope(request);
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
      requestId: request.requestId,
      payload: result.summary,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/connectors/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await runAllConnectorsSync(pool, scope, request.log);
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
      status: result.failed > 0 ? "partial" : "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/connectors/:name/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const connectorName = String(request.params?.name || "").trim().toLowerCase();
    try {
      const result = await runConnectorSync(pool, scope, connectorName, request.log);
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "connectors.sync_one",
        entityType: "connector",
        entityId: connectorName,
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      request.log.error({ err: String(error?.message || error), request_id: request.requestId }, "connector sync failed");
      return sendError(reply, request.requestId, new ApiError(500, "connector_sync_failed", "Connector sync failed"));
    }
  });

  registerPost("/connectors/errors/retry", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(ConnectorRetrySchema, request.body);
    const result = await retryConnectorErrors(pool, scope, {
      limit: body.limit,
      logger: request.log,
    });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connectors.retry_errors",
      entityType: "connector_error",
      entityId: scope.projectId,
      status: result.failed > 0 ? "partial" : "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/connectors/errors/dead-letter", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 50, 500);
    const errors = await listDeadLetterErrors(pool, scope, limit);
    return sendOk(reply, request.requestId, { errors });
  });

  registerPost("/connectors/errors/dead-letter/:id/retry", async (request, reply) => {
    const scope = requireProjectScope(request);
    const error = await retryDeadLetterError(pool, scope, String(request.params?.id || ""));
    if (!error) {
      return sendError(reply, request.requestId, new ApiError(404, "error_not_found", "Dead letter error not found"));
    }
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connector_error.dead_letter_retry",
      entityType: "connector_error",
      entityId: String(error.id),
      status: "ok",
      requestId: request.requestId,
      payload: { connector: error.connector, error_kind: error.error_kind },
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { error });
  });
}
