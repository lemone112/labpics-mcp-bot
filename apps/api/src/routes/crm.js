import { ApiError, parseBody, parseLimit, sendError, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { normalizeEvidenceRefs, writeAuditEvent } from "../domains/core/audit.js";
import { findCachedResponse, getIdempotencyKey, storeCachedResponse } from "../infra/idempotency.js";

/**
 * @param {object} ctx
 */
export function registerCrmRoutes(ctx) {
  const {
    registerGet, registerPost, pool,
    CreateAccountSchema, CreateOpportunitySchema, UpdateStageSchema,
  } = ctx;

  registerGet("/crm/accounts", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 200, 500);
    const rows = await pool.query(
      `
        SELECT id, name, domain, external_ref, stage, owner_username, created_at, updated_at
        FROM crm_accounts
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      [scope.projectId, scope.accountScopeId, limit]
    );
    return sendOk(reply, request.requestId, { accounts: rows.rows });
  });

  registerPost("/crm/accounts", async (request, reply) => {
    const scope = requireProjectScope(request);
    const idemKey = getIdempotencyKey(request);
    if (idemKey) {
      const cached = await findCachedResponse(pool, scope.projectId, idemKey);
      if (cached) return reply.code(cached.status_code).send(cached.response_body);
    }
    const body = parseBody(CreateAccountSchema, request.body);
    const ownerUsername = body.owner_username || request.auth?.username || null;
    const { rows } = await pool.query(
      `
        INSERT INTO crm_accounts(project_id, account_scope_id, name, domain, external_ref, stage, owner_username, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        RETURNING id, name, domain, external_ref, stage, owner_username, created_at, updated_at
      `,
      [scope.projectId, scope.accountScopeId, body.name, body.domain, body.external_ref || null, body.stage, ownerUsername]
    );
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "crm.account.create",
      entityType: "crm_account",
      entityId: rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: { name: rows[0].name, stage: rows[0].stage },
      evidenceRefs: normalizeEvidenceRefs(body.evidence_refs),
    });
    const responseBody = { ok: true, account: rows[0], request_id: request.requestId };
    if (idemKey) await storeCachedResponse(pool, scope.projectId, idemKey, "/crm/accounts", 201, responseBody);
    return reply.code(201).send(responseBody);
  });

  registerGet("/crm/opportunities", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 200, 500);
    const status = String(request.query?.stage || "").trim().toLowerCase();
    const rows = await pool.query(
      `
        SELECT
          o.id,
          o.account_id,
          a.name AS account_name,
          o.title,
          o.stage,
          o.amount_estimate,
          o.probability,
          o.expected_close_date,
          o.next_step,
          o.owner_username,
          o.evidence_refs,
          o.created_at,
          o.updated_at
        FROM crm_opportunities AS o
        LEFT JOIN crm_accounts AS a ON a.id = o.account_id
        WHERE o.project_id = $1
          AND o.account_scope_id = $2
          AND ($3 = '' OR o.stage = $3)
        ORDER BY o.updated_at DESC
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, status, limit]
    );
    return sendOk(reply, request.requestId, { opportunities: rows.rows });
  });

  registerPost("/crm/opportunities", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(CreateOpportunitySchema, request.body);
    const ownerUsername = body.owner_username || request.auth?.username || null;
    const { rows } = await pool.query(
      `
        INSERT INTO crm_opportunities(
          project_id,
          account_scope_id,
          account_id,
          title,
          stage,
          amount_estimate,
          probability,
          expected_close_date,
          next_step,
          owner_username,
          evidence_refs,
          updated_at
        )
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
        RETURNING id, account_id, title, stage, amount_estimate, probability, expected_close_date, next_step, owner_username, evidence_refs, created_at, updated_at
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        body.account_id,
        body.title,
        body.stage,
        body.amount_estimate,
        body.probability,
        body.expected_close_date,
        body.next_step,
        ownerUsername,
        JSON.stringify(normalizeEvidenceRefs(body.evidence_refs)),
      ]
    );
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "crm.opportunity.create",
      entityType: "crm_opportunity",
      entityId: rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: {
        title: rows[0].title,
        stage: rows[0].stage,
        amount_estimate: rows[0].amount_estimate,
        probability: rows[0].probability,
      },
      evidenceRefs: rows[0].evidence_refs || [],
    });
    return sendOk(reply, request.requestId, { opportunity: rows[0] }, 201);
  });

  registerPost("/crm/opportunities/:id/stage", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = parseBody(UpdateStageSchema, request.body);
    const nextStage = body.stage;
    const reason = body.reason;
    const evidenceRefs = normalizeEvidenceRefs(body.evidence_refs);
    const current = await pool.query(
      `
        SELECT id, stage, title
        FROM crm_opportunities
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
        LIMIT 1
      `,
      [String(request.params?.id || ""), scope.projectId, scope.accountScopeId]
    );
    if (!current.rows[0]) {
      return sendError(reply, request.requestId, new ApiError(404, "opportunity_not_found", "Opportunity not found"));
    }
    const updated = await pool.query(
      `
        UPDATE crm_opportunities
        SET stage = $4,
            updated_at = now()
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
        RETURNING id, title, stage, amount_estimate, probability, expected_close_date, next_step, updated_at, evidence_refs
      `,
      [current.rows[0].id, scope.projectId, scope.accountScopeId, nextStage]
    );
    const audit = await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "crm.opportunity.stage_update",
      entityType: "crm_opportunity",
      entityId: current.rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: { from_stage: current.rows[0].stage, to_stage: nextStage, reason },
      evidenceRefs,
    });
    await pool.query(
      `
        INSERT INTO crm_opportunity_stage_events(
          project_id,
          account_scope_id,
          opportunity_id,
          from_stage,
          to_stage,
          reason,
          actor_username,
          evidence_refs,
          audit_event_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        current.rows[0].id,
        current.rows[0].stage,
        nextStage,
        reason,
        request.auth?.username || null,
        JSON.stringify(evidenceRefs),
        audit.id,
      ]
    );
    return sendOk(reply, request.requestId, { opportunity: updated.rows[0] });
  });

  registerGet("/crm/overview", async (request, reply) => {
    const scope = requireProjectScope(request);
    const [accounts, opportunities, links] = await Promise.all([
      pool.query(
        `
          SELECT count(*)::int AS total_accounts
          FROM crm_accounts
          WHERE project_id = $1
            AND account_scope_id = $2
        `,
        [scope.projectId, scope.accountScopeId]
      ),
      pool.query(
        `
          SELECT stage, count(*)::int AS count
          FROM crm_opportunities
          WHERE project_id = $1
            AND account_scope_id = $2
          GROUP BY stage
        `,
        [scope.projectId, scope.accountScopeId]
      ),
      pool.query(
        `
          SELECT status, count(*)::int AS count
          FROM identity_links
          WHERE project_id = $1
            AND account_scope_id = $2
          GROUP BY status
        `,
        [scope.projectId, scope.accountScopeId]
      ),
    ]);
    return sendOk(reply, request.requestId, {
      accounts: accounts.rows[0]?.total_accounts || 0,
      opportunity_by_stage: opportunities.rows,
      links_by_status: links.rows,
    });
  });
}
