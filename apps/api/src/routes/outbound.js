import { fail, parseBody, parseLimit, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { listAuditEvents } from "../domains/core/audit.js";
import { approveOutbound, createOutboundDraft, listOutbound, processDueOutbounds, sendOutbound, setOptOut } from "../domains/outbound/outbox.js";
import { findCachedResponse, getIdempotencyKey, storeCachedResponse } from "../infra/idempotency.js";
import { syncLoopsContacts } from "../domains/outbound/loops.js";

/**
 * Outbound, audit, evidence, loops routes.
 * @param {object} ctx
 */
export function registerOutboundRoutes(ctx) {
  const {
    registerGet, registerPost, pool,
    CreateOutboundDraftSchema, OutboundApproveSchema,
    OptOutSchema, OutboundProcessSchema, LoopsSyncSchema,
    parseProjectIdsInput,
  } = ctx;

  registerGet("/audit", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listAuditEvents(pool, scope, {
      action: request.query?.action,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });
    return sendOk(reply, request.requestId, { events: rows });
  });

  registerGet("/evidence/search", async (request, reply) => {
    const scope = requireProjectScope(request);
    const q = String(request.query?.q || "").trim();
    const limit = parseLimit(request.query?.limit, 30, 200);
    if (!q) return sendOk(reply, request.requestId, { evidence: [] });
    const { rows } = await pool.query(
      `
        SELECT
          id, source_type, source_table, source_pk,
          conversation_global_id, message_global_id, contact_global_id,
          snippet, payload, created_at
        FROM evidence_items
        WHERE project_id = $1
          AND account_scope_id = $2
          AND search_text @@ plainto_tsquery('simple', $3)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, q, limit]
    );
    return sendOk(reply, request.requestId, { evidence: rows });
  });

  registerGet("/outbound", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listOutbound(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });
    return sendOk(reply, request.requestId, { outbound: rows });
  });

  registerPost("/outbound/draft", async (request, reply) => {
    const scope = requireProjectScope(request);
    const idemKey = getIdempotencyKey(request);
    if (idemKey) {
      const cached = await findCachedResponse(pool, scope.projectId, idemKey);
      if (cached) return reply.code(cached.status_code).send(cached.response_body);
    }
    const body = parseBody(CreateOutboundDraftSchema, request.body);
    const outbound = await createOutboundDraft(pool, scope, body, request.auth?.username || null, request.requestId);
    const responseBody = { ok: true, outbound, request_id: request.requestId };
    if (idemKey) await storeCachedResponse(pool, scope.projectId, idemKey, "/outbound/draft", 201, responseBody);
    return reply.code(201).send(responseBody);
  });

  registerPost("/outbound/:id/approve", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(OutboundApproveSchema, request.body);
    const outbound = await approveOutbound(
      pool, scope,
      String(request.params?.id || ""),
      request.auth?.username || null,
      request.requestId,
      body.evidence_refs
    );
    return sendOk(reply, request.requestId, { outbound });
  });

  registerPost("/outbound/:id/send", async (request, reply) => {
    const scope = requireProjectScope(request);
    const outbound = await sendOutbound(
      pool, scope,
      String(request.params?.id || ""),
      request.auth?.username || null,
      request.requestId
    );
    return sendOk(reply, request.requestId, { outbound });
  });

  registerPost("/outbound/opt-out", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(OptOutSchema, request.body);
    const policy = await setOptOut(pool, scope, body, request.auth?.username || null, request.requestId);
    return sendOk(reply, request.requestId, { policy });
  });

  registerPost("/outbound/process", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(OutboundProcessSchema, request.body);
    const result = await processDueOutbounds(
      pool, scope,
      request.auth?.username || "manual_runner",
      request.requestId,
      body.limit
    );
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/loops/sync", async (request, reply) => {
    const accountScopeId = request.auth?.account_scope_id || null;
    if (!accountScopeId) {
      fail(409, "account_scope_required", "Account scope is required");
    }
    const body = parseBody(LoopsSyncSchema, request.body);
    const result = await syncLoopsContacts(
      pool,
      {
        accountScopeId,
        projectIds: parseProjectIdsInput(body.project_ids, 100),
      },
      {
        actorUsername: request.auth?.username || null,
        requestId: request.requestId,
        limit: body?.limit,
      }
    );
    return sendOk(reply, request.requestId, { loops: result });
  });
}
