import { fail, parseBody, parseLimit, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { assertUuid, requestIdOf } from "../infra/utils.js";
import { listAuditEvents } from "../domains/core/audit.js";
import { approveOutbound, createOutboundDraft, listOutbound, processDueOutbounds, sendOutbound, setOptOut } from "../domains/outbound/outbox.js";
import { findCachedResponse, getIdempotencyKey, storeCachedResponse } from "../infra/idempotency.js";
import { syncLoopsContacts } from "../domains/outbound/loops.js";
import type { Pool } from "../types/index.js";
import type { ZodTypeAny } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

type RequestLike = FastifyRequest & {
  auth?: {
    active_project_id?: string | null;
    account_scope_id?: string | null;
    user_id?: string | null;
    user_role?: string | null;
    username?: string | null;
  };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  requestId?: string;
  headers?: Record<string, unknown>;
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
  CreateOutboundDraftSchema: ZodTypeAny;
  OutboundApproveSchema: ZodTypeAny;
  OptOutSchema: ZodTypeAny;
  OutboundProcessSchema: ZodTypeAny;
  LoopsSyncSchema: ZodTypeAny;
  parseProjectIdsInput: (input: unknown, max?: number) => string[];
}

/**
 * Outbound, audit, evidence, loops routes.
 */
export function registerOutboundRoutes(ctx: RouteCtx) {
  const {
    registerGet,
    registerPost,
    pool,
    CreateOutboundDraftSchema,
    OutboundApproveSchema,
    OptOutSchema,
    OutboundProcessSchema,
    LoopsSyncSchema,
    parseProjectIdsInput,
  } = ctx;

  registerGet("/audit", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listAuditEvents(pool, scope, {
      action: request.query?.action,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });
    return sendOk(reply, requestIdOf(request), { events: rows });
  });

  registerGet("/evidence/search", async (request, reply) => {
    const scope = requireProjectScope(request);
    const q = String(request.query?.q || "").trim();
    const limit = parseLimit(request.query?.limit, 30, 200);
    if (!q) return sendOk(reply, requestIdOf(request), { evidence: [] });
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
    return sendOk(reply, requestIdOf(request), { evidence: rows });
  });

  registerGet("/outbound", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listOutbound(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });
    return sendOk(reply, requestIdOf(request), { outbound: rows });
  });

  registerPost("/outbound/draft", async (request, reply) => {
    const scope = requireProjectScope(request);
    const idemKey = getIdempotencyKey(request as any);
    if (idemKey) {
      const cached = await findCachedResponse(pool, scope.projectId, idemKey);
      if (cached) return reply.code(cached.status_code).send(cached.response_body);
    }
    const body = parseBody(CreateOutboundDraftSchema, request.body);
    const requestId = requestIdOf(request);
    const outbound = await createOutboundDraft(pool, scope, body, (request.auth?.username || null) as any, requestId as any);
    const responseBody = { ok: true, outbound, request_id: requestId };
    if (idemKey) await storeCachedResponse(pool, scope.projectId, idemKey, "/outbound/draft", 201, responseBody);
    return reply.code(201).send(responseBody);
  });

  registerPost("/outbound/:id/approve", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(OutboundApproveSchema, request.body) as { evidence_refs: unknown[] };
    const outboundId = assertUuid(request.params?.id, "outbound_id");
    const outbound = await approveOutbound(
      pool,
      scope,
      outboundId,
      (request.auth?.username || null) as any,
      requestIdOf(request) as any,
      body.evidence_refs
    );
    return sendOk(reply, requestIdOf(request), { outbound });
  });

  registerPost("/outbound/:id/send", async (request, reply) => {
    const scope = requireProjectScope(request);
    const outboundId = assertUuid(request.params?.id, "outbound_id");
    const outbound = await sendOutbound(
      pool,
      scope,
      outboundId,
      (request.auth?.username || null) as any,
      requestIdOf(request) as any
    );
    return sendOk(reply, requestIdOf(request), { outbound });
  });

  registerPost("/outbound/opt-out", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(OptOutSchema, request.body);
    const policy = await setOptOut(pool, scope, body, (request.auth?.username || null) as any, requestIdOf(request) as any);
    return sendOk(reply, requestIdOf(request), { policy });
  });

  registerPost("/outbound/process", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(OutboundProcessSchema, request.body) as { limit: number };
    const result = await processDueOutbounds(
      pool,
      scope,
      (request.auth?.username || "manual_runner") as any,
      requestIdOf(request) as any,
      body.limit
    );
    return sendOk(reply, requestIdOf(request), { result });
  });

  registerPost("/loops/sync", async (request, reply) => {
    const accountScopeId = request.auth?.account_scope_id || null;
    if (!accountScopeId) {
      fail(409, "account_scope_required", "Account scope is required");
    }
    const body = parseBody(LoopsSyncSchema, request.body) as { project_ids?: string[]; limit?: number };
    const result = await syncLoopsContacts(
      pool,
      {
        accountScopeId,
        projectIds: parseProjectIdsInput(body.project_ids, 100),
      },
      {
        actorUsername: request.auth?.username || null,
        requestId: requestIdOf(request),
        limit: body?.limit,
      }
    );
    return sendOk(reply, requestIdOf(request), { loops: result });
  });
}
