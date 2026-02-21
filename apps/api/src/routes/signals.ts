import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { assertUuid } from "../infra/utils.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { extractSignalsAndNba, listNba, listSignals, updateNbaStatus, updateSignalStatus } from "../domains/analytics/signals.js";
import { listUpsellRadar, refreshUpsellRadar, updateUpsellStatus } from "../domains/analytics/upsell.js";
import { applyContinuityActions, buildContinuityPreview, listContinuityActions } from "../domains/outbound/continuity.js";
import { applyIdentitySuggestions, listIdentityLinks, listIdentitySuggestions, previewIdentitySuggestions } from "../domains/identity/identity-graph.js";
import type { Pool } from "../types/index.js";
import type { ZodTypeAny } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

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

type Scope = { projectId: string; accountScopeId: string };

interface RouteCtx {
  registerGet: RegisterFn;
  registerPost: RegisterFn;
  pool: Pool;
  SignalStatusSchema: ZodTypeAny;
  NbaStatusSchema: ZodTypeAny;
  UpsellStatusSchema: ZodTypeAny;
  IdentityPreviewSchema: ZodTypeAny;
  IdentitySuggestionApplySchema: ZodTypeAny;
  ContinuityApplySchema: ZodTypeAny;
}

function requestIdOf(request: RequestLike): string {
  return String(request.requestId || request.id);
}

async function recordScopedAudit(
  pool: Pool,
  request: RequestLike,
  scope: Scope,
  payload: Omit<Parameters<typeof writeAuditEvent>[1], "projectId" | "accountScopeId" | "actorUsername" | "requestId">
) {
  await writeAuditEvent(pool, {
    ...payload,
    projectId: scope.projectId,
    accountScopeId: scope.accountScopeId,
    actorUsername: request.auth?.username || null,
    requestId: requestIdOf(request),
  });
}

/**
 * Signals, NBA, upsell, continuity, identity routes.
 */
export function registerSignalRoutes(ctx: RouteCtx) {
  const {
    registerGet,
    registerPost,
    pool,
    SignalStatusSchema,
    NbaStatusSchema,
    UpsellStatusSchema,
    IdentityPreviewSchema,
    IdentitySuggestionApplySchema,
    ContinuityApplySchema,
  } = ctx;

  // --- Identity ---
  registerPost("/identity/suggestions/preview", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody(IdentityPreviewSchema, request.body) as { limit: number };
    const result = await previewIdentitySuggestions(pool, scope, body.limit);

    await recordScopedAudit(pool, request, scope, {
      action: "identity.preview",
      entityType: "identity_link_suggestion",
      entityId: scope.projectId,
      status: "ok",
      payload: { generated: result.generated, stored: result.stored },
      evidenceRefs: [],
    });
    return sendOk(reply, requestIdOf(request), result);
  });

  registerGet("/identity/suggestions", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const rows = await listIdentitySuggestions(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, requestIdOf(request), { suggestions: rows });
  });

  registerPost("/identity/suggestions/apply", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody(IdentitySuggestionApplySchema, request.body) as { suggestion_ids: string[] };
    const result = await applyIdentitySuggestions(pool, scope, body.suggestion_ids, (request.auth?.username || null) as any);

    await recordScopedAudit(pool, request, scope, {
      action: "identity.apply",
      entityType: "identity_link",
      entityId: scope.projectId,
      status: "ok",
      payload: { applied: result.applied },
      evidenceRefs: result.links.flatMap((row: any) => row.evidence_refs || []),
    });
    return sendOk(reply, requestIdOf(request), result);
  });

  registerGet("/identity/links", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const rows = await listIdentityLinks(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, requestIdOf(request), { links: rows });
  });

  // --- Signals ---
  registerPost("/signals/extract", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await extractSignalsAndNba(pool, scope);

    await recordScopedAudit(pool, request, scope, {
      action: "signals.extract",
      entityType: "signal",
      entityId: scope.projectId,
      status: "ok",
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, requestIdOf(request), { result });
  });

  registerGet("/signals", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const signals = await listSignals(pool, scope, {
      status: request.query?.status,
      severity_min: request.query?.severity_min,
      limit: request.query?.limit,
    });
    return sendOk(reply, requestIdOf(request), { signals });
  });

  registerPost("/signals/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody(SignalStatusSchema, request.body) as { status: string };
    const signalId = assertUuid(request.params?.id, "signal_id");
    const signal = await updateSignalStatus(pool, scope, signalId, body.status);
    if (!signal) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "signal_not_found", "Signal not found"));
    }

    await recordScopedAudit(pool, request, scope, {
      action: "signals.status_update",
      entityType: "signal",
      entityId: signal.id,
      status: "ok",
      payload: { status: signal.status },
      evidenceRefs: signal.evidence_refs || [],
    });
    return sendOk(reply, requestIdOf(request), { signal });
  });

  // --- NBA ---
  registerGet("/nba", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const items = await listNba(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, requestIdOf(request), { items });
  });

  registerPost("/nba/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody(NbaStatusSchema, request.body) as { status: string };
    const nbaId = assertUuid(request.params?.id, "nba_id");
    const item = await updateNbaStatus(pool, scope, nbaId, body.status);
    if (!item) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "nba_not_found", "NBA item not found"));
    }

    await recordScopedAudit(pool, request, scope, {
      action: "nba.status_update",
      entityType: "next_best_action",
      entityId: item.id,
      status: "ok",
      payload: { status: item.status },
      evidenceRefs: item.evidence_refs || [],
    });
    return sendOk(reply, requestIdOf(request), { item });
  });

  // --- Upsell ---
  registerPost("/upsell/radar/refresh", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await refreshUpsellRadar(pool, scope);

    await recordScopedAudit(pool, request, scope, {
      action: "upsell.refresh",
      entityType: "upsell_opportunity",
      entityId: scope.projectId,
      status: "ok",
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, requestIdOf(request), { result });
  });

  registerGet("/upsell/radar", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const rows = await listUpsellRadar(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, requestIdOf(request), { opportunities: rows });
  });

  registerPost("/upsell/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody(UpsellStatusSchema, request.body) as { status: string };
    const upsellId = assertUuid(request.params?.id, "upsell_id");
    const item = await updateUpsellStatus(pool, scope, upsellId, body.status);
    if (!item) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "upsell_not_found", "Upsell opportunity not found"));
    }

    await recordScopedAudit(pool, request, scope, {
      action: "upsell.status_update",
      entityType: "upsell_opportunity",
      entityId: item.id,
      status: "ok",
      payload: { status: item.status },
      evidenceRefs: item.evidence_refs || [],
    });
    return sendOk(reply, requestIdOf(request), { item });
  });

  // --- Continuity ---
  registerPost("/continuity/preview", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const result = await buildContinuityPreview(pool, scope, (request.auth?.username || null) as any);

    await recordScopedAudit(pool, request, scope, {
      action: "continuity.preview",
      entityType: "continuity_action",
      entityId: scope.projectId,
      status: "ok",
      payload: { touched: result.touched },
      evidenceRefs: result.rows.flatMap((row: any) => row.evidence_refs || []),
    });
    return sendOk(reply, requestIdOf(request), result);
  });

  registerGet("/continuity/actions", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const actions = await listContinuityActions(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, requestIdOf(request), { actions });
  });

  registerPost("/continuity/apply", async (request, reply) => {
    const scope = requireProjectScope(request as any);
    const body = parseBody(ContinuityApplySchema, request.body) as { action_ids: string[] };
    const result = await applyContinuityActions(pool, scope, body.action_ids, (request.auth?.username || null) as any);

    await recordScopedAudit(pool, request, scope, {
      action: "continuity.apply",
      entityType: "continuity_action",
      entityId: scope.projectId,
      status: "ok",
      payload: { applied: result.applied },
      evidenceRefs: result.actions.flatMap((row: any) => row.evidence_refs || []),
    });
    return sendOk(reply, requestIdOf(request), result);
  });
}
