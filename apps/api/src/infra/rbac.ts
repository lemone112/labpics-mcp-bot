import { ApiError } from "./api-contract.js";

type Role = "owner" | "pm";

interface AuthContext {
  session_id?: string;
  user_id?: string | null;
  user_role?: Role | null;
  active_project_id?: string | null;
}

interface ApiKeyContext {
  scopes?: string[];
}

interface RequestLike {
  auth?: AuthContext;
  apiKey?: ApiKeyContext;
}

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

interface PoolLike {
  query: (query: string, params?: unknown[]) => Promise<QueryResult>;
}

/**
 * Role-based access control middleware for multi-user support.
 *
 * Roles:
 *   - owner: full access to all projects
 *   - pm: access only to assigned projects (via project_assignments table)
 *
 * Fallback: sessions without user_id (env var auth) are treated as owner.
 */

/**
 * Returns the effective role for the current request.
 * - If authenticated via API key with admin scope, returns "owner".
 * - If authenticated via API key without admin scope, returns "pm".
 * - If user_role is set from the session JOIN, use that.
 * - If no user_id (legacy env var session), default to "owner".
 */
export function getEffectiveRole(request: RequestLike): Role {
  if (request.apiKey) {
    if (request.auth?.user_role) return request.auth.user_role;
    const scopes = Array.isArray(request.apiKey?.scopes) ? request.apiKey.scopes : [];
    return scopes.includes("admin") ? "owner" : "pm";
  }
  return request.auth?.user_role || "owner";
}

/**
 * Middleware: require a specific role (or higher).
 * Role hierarchy: owner > pm.
 * Usage: requireRole("owner") — only owners can access.
 */
export function requireRole(role: Role) {
  return async function checkRole(request: RequestLike): Promise<void> {
    const effectiveRole = getEffectiveRole(request);
    if (role === "owner" && effectiveRole !== "owner") {
      throw new ApiError(403, "forbidden", "This action requires owner role");
    }
    // "pm" role allows both owner and pm
  };
}

/**
 * Check if a PM user has access to a specific project.
 * Owners always have access. PMs need a project_assignments record.
 */
export async function canAccessProject(
  pool: PoolLike,
  userId: string | null,
  userRole: Role,
  projectId: string
): Promise<boolean> {
  // Owners and legacy env var users (no userId) can access all projects
  if (userRole === "owner" || !userId) return true;
  if (!projectId) return false;

  const { rows } = await pool.query(
    "SELECT 1 FROM project_assignments WHERE user_id = $1 AND project_id = $2 LIMIT 1",
    [userId, projectId]
  );
  return rows.length > 0;
}

/**
 * Middleware: enforce project-level access for the current request.
 * Uses the active_project_id from the session scope.
 * Owners pass through. PMs are checked against project_assignments.
 */
export function requireProjectAccess(pool: PoolLike) {
  return async function checkProjectAccess(request: RequestLike): Promise<void> {
    if (request.apiKey) return; // API keys have their own scope

    const userId = request.auth?.user_id || null;
    const userRole = getEffectiveRole(request);
    const projectId = request.auth?.active_project_id;

    if (!projectId) return; // No project selected yet — other middleware handles this

    const hasAccess = await canAccessProject(pool, userId, userRole, projectId);
    if (!hasAccess) {
      throw new ApiError(403, "project_access_denied", "You do not have access to this project");
    }
  };
}

/**
 * Get the list of project IDs a user can access.
 * Owners get null (meaning all projects). PMs get their assigned project IDs.
 */
export async function getAccessibleProjectIds(
  pool: PoolLike,
  userId: string | null,
  userRole: Role
): Promise<string[] | null> {
  if (userRole === "owner" || !userId) return null; // null = unrestricted

  const { rows } = await pool.query(
    "SELECT project_id::text FROM project_assignments WHERE user_id = $1",
    [userId]
  );
  return rows.map((r) => String(r.project_id));
}
