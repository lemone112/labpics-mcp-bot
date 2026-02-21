import { ApiError, parseBody, sendError, sendOk } from "../infra/api-contract.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import { getEffectiveRole, hasPermission } from "../infra/rbac.js";
import { assertUuid, requestIdOf } from "../infra/utils.js";
import { z } from "zod";
import bcrypt from "bcrypt";
import type { Pool } from "../types/index.js";
import type { FastifyReply, FastifyRequest } from "fastify";

const BCRYPT_ROUNDS = 12;

const CreateUserSchema = z.object({
  username: z.string().transform((s) => s.trim().toLowerCase()).pipe(z.string().min(2).max(200)),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z.enum(["owner", "pm", "delivery_lead", "executor", "viewer"]).default("pm"),
  email: z.string().email().max(300).optional().nullable().default(null),
});

const UpdateUserSchema = z.object({
  role: z.enum(["owner", "pm", "delivery_lead", "executor", "viewer"]).optional(),
  email: z.string().email().max(300).optional().nullable(),
  password: z.string().min(8).max(200).optional(),
});

const AssignProjectSchema = z.object({
  user_id: z.string().uuid(),
  project_id: z.string().uuid(),
});

const UnassignProjectSchema = z.object({
  user_id: z.string().uuid(),
  project_id: z.string().uuid(),
});

type RequestLike = FastifyRequest & {
  auth?: {
    active_project_id?: string | null;
    account_scope_id?: string | null;
    user_id?: string | null;
    user_role?: "owner" | "pm" | "delivery_lead" | "executor" | "viewer" | null;
    username?: string | null;
  };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  requestId?: string;
  log?: {
    warn?: (payload: unknown, msg?: string) => void;
  };
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
}

function requireOwner(request: RequestLike, reply: ReplyLike, message: string) {
  const role = getEffectiveRole(request);
  if (!hasPermission(role, "user.manage")) {
    return sendError(reply, requestIdOf(request), new ApiError(403, "forbidden", message));
  }
  return null;
}

function bestEffortAudit(pool: Pool, request: RequestLike, payload: Parameters<typeof writeAuditEvent>[1]) {
  writeAuditEvent(pool, payload).catch((error: unknown) => {
    request.log?.warn?.(
      { action: payload.action, error: String((error as Error)?.message || error), request_id: request.requestId },
      "audit write failed"
    );
  });
}

/**
 * User and project-assignment routes.
 */
export function registerUserRoutes(ctx: RouteCtx) {
  const { registerGet, registerPost, pool } = ctx;

  // --- User CRUD (owner-only) ---
  registerGet("/users", async (request, reply) => {
    const roleErr = requireOwner(request, reply, "Only owners can manage users");
    if (roleErr) return roleErr;

    const { rows } = await pool.query(
      `
        SELECT
          id, username, role, email, created_at, updated_at,
          (SELECT count(*)::int FROM project_assignments pa WHERE pa.user_id = app_users.id) AS project_count
        FROM app_users
        ORDER BY created_at ASC
      `
    );
    return sendOk(reply, requestIdOf(request), { users: rows });
  });

  registerGet("/users/:id", async (request, reply) => {
    const role = getEffectiveRole(request);
    const userId = request.auth?.user_id || null;
    const targetId = assertUuid(request.params?.id, "user_id");

    // Users can view their own profile; owners can view anyone
    if (role !== "owner" && targetId !== userId) {
      return sendError(reply, requestIdOf(request), new ApiError(403, "forbidden", "Access denied"));
    }

    const { rows } = await pool.query(
      `
        SELECT id, username, role, email, created_at, updated_at
        FROM app_users
        WHERE id = $1
        LIMIT 1
      `,
      [targetId]
    );
    if (!rows[0]) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "user_not_found", "User not found"));
    }

    // Include assigned projects
    const { rows: assignments } = await pool.query(
      `
        SELECT
          pa.project_id,
          p.name AS project_name,
          pa.assigned_at
        FROM project_assignments pa
        JOIN projects p ON p.id = pa.project_id
        WHERE pa.user_id = $1
        ORDER BY pa.assigned_at ASC
      `,
      [targetId]
    );

    return sendOk(reply, requestIdOf(request), {
      user: rows[0],
      project_assignments: assignments,
    });
  });

  registerPost("/users", async (request, reply) => {
    const roleErr = requireOwner(request, reply, "Only owners can create users");
    if (roleErr) return roleErr;

    const body = parseBody(CreateUserSchema, request.body);
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    // Check for duplicate username
    const { rows: existing } = await pool.query(
      "SELECT id FROM app_users WHERE lower(username) = $1 LIMIT 1",
      [body.username]
    );
    if (existing.length > 0) {
      return sendError(reply, requestIdOf(request), new ApiError(409, "username_taken", "Username already exists"));
    }

    // Check for duplicate email
    if (body.email) {
      const { rows: emailExists } = await pool.query(
        "SELECT id FROM app_users WHERE lower(email) = lower($1) LIMIT 1",
        [body.email]
      );
      if (emailExists.length > 0) {
        return sendError(reply, requestIdOf(request), new ApiError(409, "email_taken", "Email already in use"));
      }
    }

    const { rows } = await pool.query(
      `
        INSERT INTO app_users(username, password_hash, role, email)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, role, email, created_at, updated_at
      `,
      [body.username, passwordHash, body.role, body.email]
    );

    bestEffortAudit(pool, request, {
      projectId: null,
      accountScopeId: null,
      actorUsername: request.auth?.username || null,
      actorUserId: request.auth?.user_id || null,
      action: "user.create",
      entityType: "user",
      entityId: rows[0].id,
      status: "ok",
      requestId: requestIdOf(request),
      payload: { username: body.username, role: body.role },
      evidenceRefs: [],
    });

    return sendOk(reply, requestIdOf(request), { user: rows[0] }, 201);
  });

  registerPost("/users/:id/update", async (request, reply) => {
    const roleErr = requireOwner(request, reply, "Only owners can update users");
    if (roleErr) return roleErr;

    const targetId = assertUuid(request.params?.id, "user_id");
    const body = parseBody(UpdateUserSchema, request.body);

    // Check user exists
    const { rows: existing } = await pool.query(
      "SELECT id, username, role FROM app_users WHERE id = $1 LIMIT 1",
      [targetId]
    );
    if (!existing[0]) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "user_not_found", "User not found"));
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (body.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(body.role);
    }
    if (body.email !== undefined) {
      // Check for duplicate email
      if (body.email) {
        const { rows: emailExists } = await pool.query(
          "SELECT id FROM app_users WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1",
          [body.email, targetId]
        );
        if (emailExists.length > 0) {
          return sendError(reply, requestIdOf(request), new ApiError(409, "email_taken", "Email already in use"));
        }
      }
      updates.push(`email = $${paramIndex++}`);
      values.push(body.email);
    }
    if (body.password) {
      const hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return sendError(reply, requestIdOf(request), new ApiError(400, "no_changes", "No fields to update"));
    }

    updates.push("updated_at = now()");
    values.push(targetId);

    const { rows } = await pool.query(
      `UPDATE app_users SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING id, username, role, email, created_at, updated_at`,
      values
    );

    bestEffortAudit(pool, request, {
      projectId: null,
      accountScopeId: null,
      actorUsername: request.auth?.username || null,
      actorUserId: request.auth?.user_id || null,
      action: "user.update",
      entityType: "user",
      entityId: targetId,
      status: "ok",
      requestId: requestIdOf(request),
      payload: {
        target_username: existing[0].username,
        changes: Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined && k !== "password"),
      },
      evidenceRefs: [],
    });

    return sendOk(reply, requestIdOf(request), { user: rows[0] });
  });

  registerPost("/users/:id/delete", async (request, reply) => {
    const roleErr = requireOwner(request, reply, "Only owners can delete users");
    if (roleErr) return roleErr;

    const targetId = assertUuid(request.params?.id, "user_id");
    const actorUserId = request.auth?.user_id || null;

    // Prevent self-deletion
    if (actorUserId && targetId === actorUserId) {
      return sendError(reply, requestIdOf(request), new ApiError(400, "self_delete", "Cannot delete your own account"));
    }

    const { rows: existing } = await pool.query(
      "SELECT id, username FROM app_users WHERE id = $1 LIMIT 1",
      [targetId]
    );
    if (!existing[0]) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "user_not_found", "User not found"));
    }

    await pool.query("DELETE FROM app_users WHERE id = $1", [targetId]);

    bestEffortAudit(pool, request, {
      projectId: null,
      accountScopeId: null,
      actorUsername: request.auth?.username || null,
      actorUserId,
      action: "user.delete",
      entityType: "user",
      entityId: targetId,
      status: "ok",
      requestId: requestIdOf(request),
      payload: { deleted_username: existing[0].username },
      evidenceRefs: [],
    });

    return sendOk(reply, requestIdOf(request), { deleted: true });
  });

  // --- Project assignments (owner-only) ---
  registerGet("/project-assignments", async (request, reply) => {
    const roleErr = requireOwner(request, reply, "Only owners can view assignments");
    if (roleErr) return roleErr;

    const projectIdRaw = String(request.query?.project_id || "").trim();
    const userIdRaw = String(request.query?.user_id || "").trim();
    const projectId = projectIdRaw ? assertUuid(projectIdRaw, "project_id") : "";
    const userId = userIdRaw ? assertUuid(userIdRaw, "user_id") : "";

    let query = `
      SELECT
        pa.id, pa.user_id, pa.project_id, pa.assigned_at, pa.assigned_by,
        u.username, u.role AS user_role,
        p.name AS project_name
      FROM project_assignments pa
      JOIN app_users u ON u.id = pa.user_id
      JOIN projects p ON p.id = pa.project_id
    `;
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (projectId) {
      values.push(projectId);
      conditions.push(`pa.project_id = $${values.length}`);
    }
    if (userId) {
      values.push(userId);
      conditions.push(`pa.user_id = $${values.length}`);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY pa.assigned_at ASC";

    const { rows } = await pool.query(query, values);
    return sendOk(reply, requestIdOf(request), { assignments: rows });
  });

  registerPost("/project-assignments", async (request, reply) => {
    const roleErr = requireOwner(request, reply, "Only owners can assign projects");
    if (roleErr) return roleErr;

    const body = parseBody(AssignProjectSchema, request.body);

    // Verify user exists
    const { rows: userRows } = await pool.query(
      "SELECT id, username FROM app_users WHERE id = $1 LIMIT 1",
      [body.user_id]
    );
    if (!userRows[0]) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "user_not_found", "User not found"));
    }

    // Verify project exists
    const { rows: projectRows } = await pool.query(
      "SELECT id, name, account_scope_id FROM projects WHERE id = $1 LIMIT 1",
      [body.project_id]
    );
    if (!projectRows[0]) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "project_not_found", "Project not found"));
    }

    const assignedBy = request.auth?.user_id || null;

    const { rows } = await pool.query(
      `
        INSERT INTO project_assignments(user_id, project_id, assigned_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, project_id) DO NOTHING
        RETURNING id, user_id, project_id, assigned_at, assigned_by
      `,
      [body.user_id, body.project_id, assignedBy]
    );

    // ON CONFLICT returns no rows if already assigned
    if (rows.length === 0) {
      return sendOk(reply, requestIdOf(request), {
        assignment: null,
        already_assigned: true,
      });
    }

    bestEffortAudit(pool, request, {
      projectId: body.project_id,
      accountScopeId: projectRows[0].account_scope_id || null,
      actorUsername: request.auth?.username || null,
      actorUserId: assignedBy,
      action: "project.assign_user",
      entityType: "project_assignment",
      entityId: rows[0].id,
      status: "ok",
      requestId: requestIdOf(request),
      payload: {
        user_id: body.user_id,
        username: userRows[0].username,
        project_name: projectRows[0].name,
      },
      evidenceRefs: [],
    });

    return sendOk(reply, requestIdOf(request), {
      assignment: rows[0],
      already_assigned: false,
    }, 201);
  });

  registerPost("/project-assignments/remove", async (request, reply) => {
    const roleErr = requireOwner(request, reply, "Only owners can unassign projects");
    if (roleErr) return roleErr;

    const body = parseBody(UnassignProjectSchema, request.body);

    const { rows: deleted } = await pool.query(
      "DELETE FROM project_assignments WHERE user_id = $1 AND project_id = $2 RETURNING id",
      [body.user_id, body.project_id]
    );

    if (deleted.length === 0) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "assignment_not_found", "Assignment not found"));
    }

    bestEffortAudit(pool, request, {
      projectId: body.project_id,
      accountScopeId: null,
      actorUsername: request.auth?.username || null,
      actorUserId: request.auth?.user_id || null,
      action: "project.unassign_user",
      entityType: "project_assignment",
      entityId: deleted[0].id,
      status: "ok",
      requestId: requestIdOf(request),
      payload: { user_id: body.user_id, project_id: body.project_id },
      evidenceRefs: [],
    });

    return sendOk(reply, requestIdOf(request), { removed: true });
  });
}
