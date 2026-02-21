import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";
import { assertUuid } from "../infra/utils.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { getEffectiveRole, getAccessibleProjectIds, canAccessProject } from "../infra/rbac.js";

const LEGACY_SCOPE_PROJECT_NAME = "__legacy_scope__";

/**
 * @param {object} ctx
 * @param {Function} ctx.registerGet
 * @param {Function} ctx.registerPost
 * @param {object} ctx.pool
 * @param {object} ctx.cache
 * @param {object} ctx.CreateProjectSchema
 */
export function registerProjectRoutes(ctx) {
  const { registerGet, registerPost, pool, cache, CreateProjectSchema } = ctx;

  registerGet("/projects", async (request, reply) => {
    const userId = request.auth?.user_id || null;
    const userRole = getEffectiveRole(request);
    const accessibleIds = await getAccessibleProjectIds(pool, userId, userRole);

    let rows;
    if (accessibleIds === null) {
      // Owner or legacy env var user — return all projects
      const result = await pool.query(
        `
          SELECT id, name, account_scope_id, created_at
          FROM projects
          WHERE lower(btrim(name)) <> $1
          ORDER BY created_at DESC
        `,
        [LEGACY_SCOPE_PROJECT_NAME]
      );
      rows = result.rows;
    } else {
      // PM user — return only assigned projects
      const result = await pool.query(
        `
          SELECT id, name, account_scope_id, created_at
          FROM projects
          WHERE lower(btrim(name)) <> $1
            AND id = ANY($2::uuid[])
          ORDER BY created_at DESC
        `,
        [LEGACY_SCOPE_PROJECT_NAME, accessibleIds]
      );
      rows = result.rows;
    }

    return sendOk(reply, request.requestId, {
      projects: rows,
      active_project_id: request.auth?.active_project_id || null,
      account_scope_id: request.auth?.account_scope_id || null,
    });
  });

  registerPost("/projects", async (request, reply) => {
    // Only owners can create projects
    const userRole = getEffectiveRole(request);
    if (userRole !== "owner") {
      return sendError(reply, request.requestId, new ApiError(403, "forbidden", "Only owners can create projects"));
    }

    const body = parseBody(CreateProjectSchema, request.body);
    const name = body.name;
    if (name.toLowerCase() === LEGACY_SCOPE_PROJECT_NAME) {
      return sendError(reply, request.requestId, new ApiError(400, "reserved_name", "Project name is reserved"));
    }

    const desiredScopeKey = body.account_scope_key ? body.account_scope_key.toLowerCase() : null;
    const scopeName = body.account_scope_name;
    let accountScopeId = null;
    if (desiredScopeKey) {
      const { rows: scopeRows } = await pool.query(
        `
          INSERT INTO account_scopes(scope_key, name)
          VALUES ($1, $2)
          ON CONFLICT (scope_key)
          DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `,
        [desiredScopeKey, scopeName.slice(0, 160)]
      );
      accountScopeId = scopeRows[0]?.id || null;
    } else {
      const { rows: scopeRows } = await pool.query(
        `
          SELECT id
          FROM account_scopes
          WHERE scope_key = 'default'
          LIMIT 1
        `
      );
      accountScopeId = scopeRows[0]?.id || null;
    }
    if (!accountScopeId) {
      return sendError(reply, request.requestId, new ApiError(500, "account_scope_resolve_failed", "Failed to resolve account scope"));
    }

    const { rows } = await pool.query(
      `
        INSERT INTO projects(name, account_scope_id)
        VALUES ($1, $2)
        RETURNING id, name, account_scope_id, created_at
      `,
      [name, accountScopeId]
    );

    await writeAuditEvent(pool, {
      projectId: rows[0].id,
      accountScopeId: rows[0].account_scope_id,
      actorUsername: request.auth?.username || null,
      actorUserId: request.auth?.user_id || null,
      action: "project.create",
      entityType: "project",
      entityId: rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: { name: rows[0].name },
      evidenceRefs: [],
    });

    return sendOk(reply, request.requestId, { project: rows[0] });
  });

  registerPost("/projects/:id/select", async (request, reply) => {
    const projectId = assertUuid(request.params?.id, "project_id");
    const sid = request.auth?.session_id;

    const project = await pool.query(
      "SELECT id, name, account_scope_id FROM projects WHERE id = $1 LIMIT 1",
      [projectId]
    );
    if (!project.rows[0]) {
      return sendError(reply, request.requestId, new ApiError(404, "project_not_found", "Project not found"));
    }
    if (String(project.rows[0].name || "").trim().toLowerCase() === LEGACY_SCOPE_PROJECT_NAME) {
      return sendError(reply, request.requestId, new ApiError(404, "project_not_found", "Project not found"));
    }

    // RBAC: PM users can only select projects they are assigned to
    const userId = request.auth?.user_id || null;
    const userRole = getEffectiveRole(request);
    const hasAccess = await canAccessProject(pool, userId, userRole, projectId);
    if (!hasAccess) {
      return sendError(reply, request.requestId, new ApiError(403, "project_access_denied", "You do not have access to this project"));
    }

    await pool.query("UPDATE sessions SET active_project_id = $2, last_seen_at = now() WHERE session_id = $1", [sid, projectId]);
    await cache.del(`session:${sid}`);
    await writeAuditEvent(pool, {
      projectId,
      accountScopeId: project.rows[0].account_scope_id,
      actorUsername: request.auth?.username || null,
      actorUserId: request.auth?.user_id || null,
      action: "project.select",
      entityType: "project",
      entityId: projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { selected_project_id: projectId },
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, {
      active_project_id: projectId,
      project: project.rows[0],
    });
  });
}
