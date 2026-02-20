import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { extractSignalsAndNba, listNba, listSignals, updateNbaStatus, updateSignalStatus } from "../domains/analytics/signals.js";
import { listUpsellRadar, refreshUpsellRadar, updateUpsellStatus } from "../domains/analytics/upsell.js";
import { applyContinuityActions, buildContinuityPreview, listContinuityActions } from "../domains/outbound/continuity.js";
import { applyIdentitySuggestions, listIdentityLinks, listIdentitySuggestions, previewIdentitySuggestions } from "../domains/identity/identity-graph.js";

/**
 * Signals, NBA, upsell, continuity, identity routes.
 * @param {object} ctx
 */
export function registerSignalRoutes(ctx) {
  const {
    registerGet, registerPost, pool,
    SignalStatusSchema, NbaStatusSchema, UpsellStatusSchema,
    IdentityPreviewSchema, IdentitySuggestionApplySchema,
    ContinuityApplySchema,
  } = ctx;

  // --- Identity ---
  registerPost("/identity/suggestions/preview", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(IdentityPreviewSchema, request.body);
    const limit = body.limit;
    const result = await previewIdentitySuggestions(pool, scope, limit);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "identity.preview",
      entityType: "identity_link_suggestion",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { generated: result.generated, stored: result.stored },
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/identity/suggestions", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listIdentitySuggestions(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { suggestions: rows });
  });

  registerPost("/identity/suggestions/apply", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(IdentitySuggestionApplySchema, request.body);
    const result = await applyIdentitySuggestions(pool, scope, body.suggestion_ids, request.auth?.username || null);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "identity.apply",
      entityType: "identity_link",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { applied: result.applied },
      evidenceRefs: result.links.flatMap((row) => row.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/identity/links", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listIdentityLinks(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { links: rows });
  });

  // --- Signals ---
  registerPost("/signals/extract", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await extractSignalsAndNba(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "signals.extract",
      entityType: "signal",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/signals", async (request, reply) => {
    const scope = requireProjectScope(request);
    const signals = await listSignals(pool, scope, {
      status: request.query?.status,
      severity_min: request.query?.severity_min,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { signals });
  });

  registerPost("/signals/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(SignalStatusSchema, request.body);
    const signal = await updateSignalStatus(pool, scope, String(request.params?.id || ""), body.status);
    if (!signal) {
      return sendError(reply, request.requestId, new ApiError(404, "signal_not_found", "Signal not found"));
    }
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "signals.status_update",
      entityType: "signal",
      entityId: signal.id,
      status: "ok",
      requestId: request.requestId,
      payload: { status: signal.status },
      evidenceRefs: signal.evidence_refs || [],
    });
    return sendOk(reply, request.requestId, { signal });
  });

  // --- NBA ---
  registerGet("/nba", async (request, reply) => {
    const scope = requireProjectScope(request);
    const items = await listNba(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { items });
  });

  registerPost("/nba/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(NbaStatusSchema, request.body);
    const item = await updateNbaStatus(pool, scope, String(request.params?.id || ""), body.status);
    if (!item) {
      return sendError(reply, request.requestId, new ApiError(404, "nba_not_found", "NBA item not found"));
    }
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "nba.status_update",
      entityType: "next_best_action",
      entityId: item.id,
      status: "ok",
      requestId: request.requestId,
      payload: { status: item.status },
      evidenceRefs: item.evidence_refs || [],
    });
    return sendOk(reply, request.requestId, { item });
  });

  // --- Upsell ---
  registerPost("/upsell/radar/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await refreshUpsellRadar(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "upsell.refresh",
      entityType: "upsell_opportunity",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/upsell/radar", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listUpsellRadar(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { opportunities: rows });
  });

  registerPost("/upsell/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(UpsellStatusSchema, request.body);
    const item = await updateUpsellStatus(pool, scope, String(request.params?.id || ""), body.status);
    if (!item) {
      return sendError(reply, request.requestId, new ApiError(404, "upsell_not_found", "Upsell opportunity not found"));
    }
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "upsell.status_update",
      entityType: "upsell_opportunity",
      entityId: item.id,
      status: "ok",
      requestId: request.requestId,
      payload: { status: item.status },
      evidenceRefs: item.evidence_refs || [],
    });
    return sendOk(reply, request.requestId, { item });
  });

  // --- Continuity ---
  registerPost("/continuity/preview", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await buildContinuityPreview(pool, scope, request.auth?.username || null);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "continuity.preview",
      entityType: "continuity_action",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { touched: result.touched },
      evidenceRefs: result.rows.flatMap((row) => row.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/continuity/actions", async (request, reply) => {
    const scope = requireProjectScope(request);
    const actions = await listContinuityActions(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { actions });
  });

  registerPost("/continuity/apply", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(ContinuityApplySchema, request.body);
    const result = await applyContinuityActions(pool, scope, body.action_ids, request.auth?.username || null);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "continuity.apply",
      entityType: "continuity_action",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { applied: result.applied },
      evidenceRefs: result.actions.flatMap((row) => row.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, result);
  });
}
