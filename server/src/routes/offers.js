import { ApiError, parseBody, parseLimit, sendError, sendOk } from "../lib/api-contract.js";
import { requireProjectScope } from "../lib/scope.js";
import { normalizeEvidenceRefs, writeAuditEvent } from "../services/audit.js";
import { findCachedResponse, getIdempotencyKey, storeCachedResponse } from "../lib/idempotency.js";

/**
 * @param {object} ctx
 */
export function registerOfferRoutes(ctx) {
  const { registerGet, registerPost, pool, CreateOfferSchema, ApproveOfferSchema } = ctx;

  registerGet("/offers", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 150, 500);
    const rows = await pool.query(
      `
        SELECT
          id, account_id, opportunity_id, title, currency, subtotal,
          discount_pct, total, status, generated_doc_url, evidence_refs,
          created_by, created_at, updated_at
        FROM offers
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      [scope.projectId, scope.accountScopeId, limit]
    );
    return sendOk(reply, request.requestId, { offers: rows.rows });
  });

  registerPost("/offers", async (request, reply) => {
    const scope = requireProjectScope(request);
    const idemKey = getIdempotencyKey(request);
    if (idemKey) {
      const cached = await findCachedResponse(pool, scope.projectId, idemKey);
      if (cached) return reply.code(cached.status_code).send(cached.response_body);
    }
    const body = parseBody(CreateOfferSchema, request.body);
    const subtotal = body.subtotal;
    const discountPct = body.discount_pct;
    const total = Number((subtotal * (1 - discountPct / 100)).toFixed(2));
    const status = discountPct > 0 ? "draft" : "approved";
    const evidenceRefs = normalizeEvidenceRefs(body.evidence_refs);
    const { rows } = await pool.query(
      `
        INSERT INTO offers(
          project_id, account_scope_id, account_id, opportunity_id,
          title, currency, subtotal, discount_pct, total, status,
          generated_doc_url, evidence_refs, created_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11::jsonb, $12, now())
        RETURNING
          id, account_id, opportunity_id, title, currency, subtotal,
          discount_pct, total, status, generated_doc_url, evidence_refs,
          created_by, created_at, updated_at
      `,
      [
        scope.projectId, scope.accountScopeId,
        body.account_id, body.opportunity_id, body.title, body.currency,
        subtotal, discountPct, total, status,
        JSON.stringify(evidenceRefs), request.auth?.username || null,
      ]
    );
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "offer.create",
      entityType: "offer",
      entityId: rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: { subtotal, discount_pct: discountPct, total, status },
      evidenceRefs,
    });
    const responseBody = { ok: true, offer: rows[0], request_id: request.requestId };
    if (idemKey) await storeCachedResponse(pool, scope.projectId, idemKey, "/offers", 201, responseBody);
    return reply.code(201).send(responseBody);
  });

  registerPost("/offers/:id/approve-discount", async (request, reply) => {
    const scope = requireProjectScope(request);
    const offerId = String(request.params?.id || "");
    const body = parseBody(ApproveOfferSchema, request.body);
    const evidenceRefs = normalizeEvidenceRefs(body.evidence_refs);
    const { rows } = await pool.query(
      `
        UPDATE offers
        SET status = 'approved', updated_at = now()
        WHERE id = $1 AND project_id = $2 AND account_scope_id = $3
          AND status = 'draft'
        RETURNING id, title, discount_pct, status, evidence_refs
      `,
      [offerId, scope.projectId, scope.accountScopeId]
    );
    const offer = rows[0];
    if (!offer) {
      return sendError(reply, request.requestId, new ApiError(404, "offer_not_found", "Offer not found"));
    }
    const audit = await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "offer.approve_discount",
      entityType: "offer",
      entityId: offer.id,
      status: "ok",
      requestId: request.requestId,
      payload: { discount_pct: offer.discount_pct },
      evidenceRefs: evidenceRefs.length ? evidenceRefs : offer.evidence_refs || [],
    });
    await pool.query(
      `
        INSERT INTO offer_approvals(
          project_id, account_scope_id, offer_id, action,
          actor_username, comment, evidence_refs, audit_event_id
        )
        VALUES ($1, $2, $3, 'approve_discount', $4, $5, $6::jsonb, $7)
      `,
      [
        scope.projectId, scope.accountScopeId, offer.id,
        request.auth?.username || null, body.comment,
        JSON.stringify(evidenceRefs), audit.id,
      ]
    );
    return sendOk(reply, request.requestId, { offer });
  });

  registerPost("/offers/:id/approve-send", async (request, reply) => {
    const scope = requireProjectScope(request);
    const offerId = String(request.params?.id || "");
    const body = parseBody(ApproveOfferSchema, request.body);
    const evidenceRefs = normalizeEvidenceRefs(body.evidence_refs);
    const { rows } = await pool.query(
      `
        UPDATE offers
        SET status = 'sent', updated_at = now()
        WHERE id = $1 AND project_id = $2 AND account_scope_id = $3
          AND status = 'approved'
        RETURNING id, title, status, evidence_refs
      `,
      [offerId, scope.projectId, scope.accountScopeId]
    );
    const offer = rows[0];
    if (!offer) {
      return sendError(reply, request.requestId, new ApiError(404, "offer_not_found", "Offer not found"));
    }
    const audit = await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "offer.approve_send",
      entityType: "offer",
      entityId: offer.id,
      status: "ok",
      requestId: request.requestId,
      payload: { status: "sent" },
      evidenceRefs: evidenceRefs.length ? evidenceRefs : offer.evidence_refs || [],
    });
    await pool.query(
      `
        INSERT INTO offer_approvals(
          project_id, account_scope_id, offer_id, action,
          actor_username, comment, evidence_refs, audit_event_id
        )
        VALUES ($1, $2, $3, 'approve_send', $4, $5, $6::jsonb, $7)
      `,
      [
        scope.projectId, scope.accountScopeId, offer.id,
        request.auth?.username || null, body.comment,
        JSON.stringify(evidenceRefs), audit.id,
      ]
    );
    return sendOk(reply, request.requestId, { offer });
  });
}
